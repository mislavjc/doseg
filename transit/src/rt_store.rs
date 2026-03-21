//! GTFS-RT persistence to SQLite.
//!
//! Receives RtSnapshot messages from the GTFS-RT refresh task and writes
//! aggregated route-level and stop-level data to a local SQLite database.
//!
//! Retention policy:
//! - `snapshots` (route-level, every 60s): kept 1 year, then compacted to `hourly_agg`
//! - `stop_delays` (per-stop, every 5 min): kept 6 months, then deleted
//! - `hourly_agg`: kept forever
//! - `alerts`: kept forever

use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::gtfs_rt::RtSnapshot;

/// "On time" = no more than 1 min early, no more than 5 min late.
/// Matches the TCQSM industry standard used by most transit agencies.
const ON_TIME_EARLY: i32 = -60;
const ON_TIME_LATE: i32 = 300;

/// Grace period for stale-trip filtering: if the latest predicted stop time
/// for a trip is more than this many seconds in the past, skip the trip.
const STALE_GRACE_SEC: i64 = 120;

/// Compute mean headway and coefficient of variation from a set of arrival times.
/// Returns (mean_headway_sec, cv) or (None, None) if fewer than 3 vehicles.
fn compute_headway(times: &mut Vec<i64>) -> (Option<f64>, Option<f64>) {
    if times.len() < 3 {
        return (None, None);
    }
    times.sort_unstable();
    times.dedup();

    let headways: Vec<f64> = times
        .windows(2)
        .map(|w| (w[1] - w[0]) as f64)
        .filter(|&h| h > 30.0 && h < 3600.0) // skip <30s (duplicates) and >1h (gaps)
        .collect();

    if headways.len() < 2 {
        return (None, None);
    }

    let n = headways.len() as f64;
    let mean = headways.iter().sum::<f64>() / n;
    let variance = headways.iter().map(|h| (h - mean).powi(2)).sum::<f64>() / n;
    let cv = variance.sqrt() / mean;

    (Some(mean), Some(cv))
}

pub struct RtDb {
    conn: Connection,
    last_written_ts: i64,
}

impl RtDb {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;

        conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA busy_timeout=5000;
            PRAGMA cache_size=-64000;
        ",
        )?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS snapshots (
                ts          INTEGER NOT NULL,
                route_id    TEXT    NOT NULL,
                avg_delay   REAL    NOT NULL,
                max_delay   INTEGER NOT NULL,
                on_time_pct REAL    NOT NULL,
                trip_count  INTEGER NOT NULL,
                headway_sec REAL,
                headway_cv  REAL,
                PRIMARY KEY (ts, route_id)
            ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS stop_delays (
                ts            INTEGER NOT NULL,
                trip_id       TEXT    NOT NULL,
                route_id      TEXT    NOT NULL,
                stop_sequence INTEGER NOT NULL,
                delay         INTEGER NOT NULL,
                PRIMARY KEY (ts, trip_id, stop_sequence)
            ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS hourly_agg (
                hour_ts     INTEGER NOT NULL,
                route_id    TEXT    NOT NULL,
                avg_delay   REAL    NOT NULL,
                max_delay   INTEGER NOT NULL,
                on_time_pct REAL    NOT NULL,
                samples     INTEGER NOT NULL,
                PRIMARY KEY (hour_ts, route_id)
            ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS alerts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                first_seen  INTEGER NOT NULL,
                cause       TEXT    NOT NULL,
                effect      TEXT    NOT NULL,
                header      TEXT,
                description TEXT,
                route_ids   TEXT,
                stop_ids    TEXT,
                hash        TEXT    NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS speed_snapshots (
                ts          INTEGER NOT NULL,
                route_id    TEXT    NOT NULL,
                avg_speed_mps REAL  NOT NULL,
                sample_count INTEGER NOT NULL,
                PRIMARY KEY (ts, route_id)
            ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS occupancy_snapshots (
                ts              INTEGER NOT NULL,
                route_id        TEXT    NOT NULL,
                occupancy_level INTEGER NOT NULL,
                count           INTEGER NOT NULL,
                PRIMARY KEY (ts, route_id, occupancy_level)
            ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS bajs_usage (
                ts          INTEGER NOT NULL PRIMARY KEY,
                bikes_in_use INTEGER NOT NULL,
                available   INTEGER NOT NULL,
                known_fleet INTEGER NOT NULL
            ) WITHOUT ROWID;

            CREATE INDEX IF NOT EXISTS idx_snapshots_route ON snapshots(route_id, ts);
            CREATE INDEX IF NOT EXISTS idx_stop_delays_route ON stop_delays(route_id, ts);
            CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(first_seen);
            CREATE INDEX IF NOT EXISTS idx_speed_route ON speed_snapshots(route_id, ts);
            CREATE INDEX IF NOT EXISTS idx_occupancy_route ON occupancy_snapshots(route_id, ts);
        ",
        )?;

        // Migrate existing databases: add columns that were introduced after initial schema
        let has_headway: bool = conn
            .prepare("SELECT headway_sec FROM snapshots LIMIT 0")
            .is_ok();
        if !has_headway {
            conn.execute_batch(
                "ALTER TABLE snapshots ADD COLUMN headway_sec REAL;
                 ALTER TABLE snapshots ADD COLUMN headway_cv  REAL;",
            )?;
        }

        Ok(RtDb {
            conn,
            last_written_ts: 0,
        })
    }

    /// Ingest a snapshot. Deduplicates to one write per 60s window.
    ///
    /// Stale trips (all stop times in the past) are filtered out.
    /// Delay is clamped: negatives → 0 (schedule padding makes "early" meaningless).
    /// On-time uses asymmetric threshold: -1 min to +5 min (TCQSM standard).
    pub fn ingest(&mut self, snap: &RtSnapshot) {
        let ts = (snap.timestamp / 60) * 60;

        if ts == self.last_written_ts {
            return;
        }
        self.last_written_ts = ts;

        let write_stops = ts % 300 == 0;

        if let Err(e) = self.ingest_inner(ts, snap, write_stops) {
            eprintln!("RT DB: ingest error: {}", e);
        }
    }

    fn ingest_inner(&self, ts: i64, snap: &RtSnapshot, write_stops: bool) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;

        // Group trips by route_id
        let mut by_route: HashMap<&str, Vec<&crate::gtfs_rt::SnapshotTrip>> = HashMap::new();
        for trip in &snap.trips {
            if !trip.route_id.is_empty() {
                by_route.entry(&trip.route_id).or_default().push(trip);
            }
        }

        // Route-level snapshots
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO snapshots (ts, route_id, avg_delay, max_delay, on_time_pct, trip_count, headway_sec, headway_cv)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;

            for (route_id, trips) in &by_route {
                let mut total_delay: i64 = 0;
                let mut max_delay: i32 = 0;
                let mut on_time: u32 = 0;
                let mut count: u32 = 0;
                // Collect arrival times for headway computation
                let mut arrival_times: Vec<i64> = Vec::new();

                for trip in trips {
                    // Use first stop_time_update: nearest to vehicle's
                    // current position, most reliable delay value.
                    let first = match trip.stop_times.first() {
                        Some(st) => st,
                        None => continue,
                    };

                    // Filter stale/completed trips: if the latest predicted
                    // time for this trip is well in the past, skip it.
                    let latest_time = trip
                        .stop_times
                        .iter()
                        .filter_map(|st| st.time)
                        .max();
                    if let Some(lt) = latest_time {
                        if lt < ts - STALE_GRACE_SEC {
                            continue;
                        }
                    }

                    let d = first.delay;

                    // avg_delay: clamp negatives to 0 — schedule padding
                    // makes raw negative delays meaningless to passengers.
                    // Only lateness (positive delay) is shown.
                    total_delay += d.max(0) as i64;

                    if d.abs() > max_delay.abs() {
                        max_delay = d;
                    }

                    // Asymmetric on-time: -1 min to +5 min (TCQSM standard).
                    // Early departures hurt passengers (missed vehicle).
                    if (ON_TIME_EARLY..=ON_TIME_LATE).contains(&d) {
                        on_time += 1;
                    }

                    count += 1;

                    // Collect arrival time for headway computation
                    if let Some(t) = first.time {
                        arrival_times.push(t);
                    }
                }

                if count == 0 {
                    continue;
                }

                let avg = total_delay as f64 / count as f64;
                let pct = on_time as f64 / count as f64;

                // Headway: compute mean and CV from inter-vehicle time gaps.
                // Sort arrival times and compute intervals between consecutive
                // vehicles on the same route.
                let (headway_sec, headway_cv) = compute_headway(&mut arrival_times);

                stmt.execute(params![
                    ts, route_id, avg, max_delay, pct, count, headway_sec, headway_cv,
                ])?;
            }
        }

        // Stop-level delays (every 5 min only)
        if write_stops {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO stop_delays (ts, trip_id, route_id, stop_sequence, delay)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;

            for trip in &snap.trips {
                if trip.route_id.is_empty() {
                    continue;
                }
                for st in &trip.stop_times {
                    stmt.execute(params![
                        ts,
                        &trip.trip_id,
                        &trip.route_id,
                        st.stop_sequence as i32,
                        st.delay,
                    ])?;
                }
            }
        }

        // Alerts (deduped by hash)
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO alerts (first_seen, cause, effect, header, description, route_ids, stop_ids, hash)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;

            for alert in &snap.alerts {
                let route_ids = alert.route_ids.join(",");
                let stop_ids = alert.stop_ids.join(",");
                let hash = format!(
                    "{}|{}|{}|{}",
                    alert.cause,
                    alert.effect,
                    alert.header.as_deref().unwrap_or(""),
                    route_ids,
                );
                stmt.execute(params![
                    ts,
                    &alert.cause,
                    &alert.effect,
                    &alert.header,
                    &alert.description,
                    &route_ids,
                    &stop_ids,
                    &hash,
                ])?;
            }
        }

        // Vehicle speed snapshots (every 60s, same as route snapshots)
        {
            let mut by_route: HashMap<&str, Vec<f32>> = HashMap::new();
            for v in &snap.vehicles {
                if let Some(speed) = v.speed_mps {
                    if speed >= 0.0 && !v.route_id.is_empty() {
                        by_route.entry(&v.route_id).or_default().push(speed);
                    }
                }
            }
            if !by_route.is_empty() {
                let mut stmt = tx.prepare_cached(
                    "INSERT OR IGNORE INTO speed_snapshots (ts, route_id, avg_speed_mps, sample_count)
                     VALUES (?1, ?2, ?3, ?4)",
                )?;
                for (route_id, speeds) in &by_route {
                    let avg = speeds.iter().sum::<f32>() / speeds.len() as f32;
                    stmt.execute(params![ts, route_id, avg as f64, speeds.len() as i32])?;
                }
            }
        }

        // Occupancy snapshots (every 5 min, same cadence as stop_delays)
        if write_stops {
            let mut counts: HashMap<(&str, i32), i64> = HashMap::new();
            for v in &snap.vehicles {
                if let Some(occ) = v.occupancy_status {
                    if !v.route_id.is_empty() {
                        *counts.entry((&v.route_id, occ)).or_insert(0) += 1;
                    }
                }
            }
            if !counts.is_empty() {
                let mut stmt = tx.prepare_cached(
                    "INSERT OR IGNORE INTO occupancy_snapshots (ts, route_id, occupancy_level, count)
                     VALUES (?1, ?2, ?3, ?4)",
                )?;
                for ((route_id, level), count) in &counts {
                    stmt.execute(params![ts, route_id, level, count])?;
                }
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// Delete stop_delays older than cutoff.
    fn cleanup_old_stops(&self, cutoff_ts: i64) -> rusqlite::Result<usize> {
        self.conn
            .execute("DELETE FROM stop_delays WHERE ts < ?1", params![cutoff_ts])
    }

    /// Compact snapshots older than cutoff into hourly_agg, then delete raw rows.
    fn compact(&self, cutoff_ts: i64) -> rusqlite::Result<usize> {
        let tx = self.conn.unchecked_transaction()?;

        let min_ts: Option<i64> = tx.query_row(
            "SELECT MIN(ts) FROM snapshots WHERE ts < ?1",
            params![cutoff_ts],
            |row| row.get(0),
        )?;

        let min_ts = match min_ts {
            Some(ts) => ts,
            None => return Ok(0),
        };

        let mut hour = (min_ts / 3600) * 3600;
        let mut compacted = 0usize;

        while hour < cutoff_ts {
            let next_hour = hour + 3600;

            tx.execute(
                "INSERT OR IGNORE INTO hourly_agg (hour_ts, route_id, avg_delay, max_delay, on_time_pct, samples)
                 SELECT ?1, route_id, AVG(avg_delay), MAX(max_delay), AVG(on_time_pct), COUNT(*)
                 FROM snapshots WHERE ts >= ?1 AND ts < ?2
                 GROUP BY route_id",
                params![hour, next_hour],
            )?;

            compacted += tx.execute(
                "DELETE FROM snapshots WHERE ts >= ?1 AND ts < ?2",
                params![hour, next_hour],
            )?;

            tx.execute(
                "DELETE FROM stop_delays WHERE ts >= ?1 AND ts < ?2",
                params![hour, next_hour],
            )?;

            hour = next_hour;
        }

        tx.commit()?;
        Ok(compacted)
    }

    /// Delete speed_snapshots and occupancy_snapshots older than cutoff.
    fn cleanup_old_vehicle_data(&self, cutoff_ts: i64) -> rusqlite::Result<usize> {
        let a = self.conn.execute(
            "DELETE FROM speed_snapshots WHERE ts < ?1",
            params![cutoff_ts],
        )?;
        let b = self.conn.execute(
            "DELETE FROM occupancy_snapshots WHERE ts < ?1",
            params![cutoff_ts],
        )?;
        Ok(a + b)
    }

    /// Run periodic maintenance: clean old stop data, compact old snapshots.
    fn maintain(&self, now_ts: i64) {
        let six_months_ago = now_ts - 180 * 86400;
        match self.cleanup_old_stops(six_months_ago) {
            Ok(0) => {}
            Ok(n) => eprintln!("RT DB: cleaned {} old stop delay rows", n),
            Err(e) => eprintln!("RT DB: stop cleanup failed: {}", e),
        }
        match self.cleanup_old_vehicle_data(six_months_ago) {
            Ok(0) => {}
            Ok(n) => eprintln!("RT DB: cleaned {} old speed/occupancy rows", n),
            Err(e) => eprintln!("RT DB: vehicle data cleanup failed: {}", e),
        }

        let one_year_ago = now_ts - 365 * 86400;
        match self.compact(one_year_ago) {
            Ok(0) => {}
            Ok(n) => eprintln!("RT DB: compacted {} old snapshot rows", n),
            Err(e) => eprintln!("RT DB: compaction failed: {}", e),
        }
    }
}

/// Open a connection for API queries.
/// Uses read-write mode because read-only connections cannot see WAL data.
pub fn open_reader(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA busy_timeout=5000;
        PRAGMA cache_size=-64000;
        PRAGMA query_only=ON;
    ",
    )?;
    Ok(conn)
}

// --- Query functions for API endpoints ---

use serde::Serialize;

#[derive(Serialize)]
pub struct HistoryPoint {
    pub ts: i64,
    #[serde(rename = "avgDelay")]
    pub avg_delay: f64,
    #[serde(rename = "maxDelay")]
    pub max_delay: i32,
    #[serde(rename = "onTimePct")]
    pub on_time_pct: f64,
    #[serde(rename = "tripCount")]
    pub trip_count: i32,
    /// Mean headway in seconds between consecutive vehicles (None if < 3 vehicles).
    #[serde(rename = "headwaySec", skip_serializing_if = "Option::is_none")]
    pub headway_sec: Option<f64>,
    /// Headway coefficient of variation: 0 = perfectly regular, >0.5 = severe bunching.
    #[serde(rename = "headwayCv", skip_serializing_if = "Option::is_none")]
    pub headway_cv: Option<f64>,
}

#[derive(Serialize)]
pub struct HistoryResponse {
    pub route: String,
    pub from: i64,
    pub to: i64,
    pub points: Vec<HistoryPoint>,
}

#[derive(Serialize)]
pub struct StopDelay {
    pub seq: i32,
    pub delay: i32,
}

#[derive(Serialize)]
pub struct TripStops {
    #[serde(rename = "tripId")]
    pub trip_id: String,
    pub stops: Vec<StopDelay>,
}

#[derive(Serialize)]
pub struct StopsResponse {
    pub route: String,
    pub ts: i64,
    pub trips: Vec<TripStops>,
}

#[derive(Serialize)]
pub struct AlertRecord {
    #[serde(rename = "firstSeen")]
    pub first_seen: i64,
    pub cause: String,
    pub effect: String,
    pub header: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "routeIds")]
    pub route_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct AlertsResponse {
    pub alerts: Vec<AlertRecord>,
}

#[derive(Serialize)]
pub struct SummaryResponse {
    #[serde(rename = "snapshotCount")]
    pub snapshot_count: i64,
    #[serde(rename = "routeCount")]
    pub route_count: i64,
    #[serde(rename = "firstTs")]
    pub first_ts: Option<i64>,
    #[serde(rename = "lastTs")]
    pub last_ts: Option<i64>,
    #[serde(rename = "alertCount")]
    pub alert_count: i64,
}

pub fn query_history(
    conn: &Connection,
    route: &str,
    from: i64,
    to: i64,
) -> rusqlite::Result<HistoryResponse> {
    // Try raw snapshots first, fall back to hourly_agg for old data
    let mut points = Vec::new();

    let mut stmt = conn.prepare_cached(
        "SELECT ts, avg_delay, max_delay, on_time_pct, trip_count, headway_sec, headway_cv
         FROM snapshots WHERE route_id = ?1 AND ts >= ?2 AND ts < ?3
         ORDER BY ts",
    )?;
    let rows = stmt.query_map(params![route, from, to], |row| {
        Ok(HistoryPoint {
            ts: row.get(0)?,
            avg_delay: row.get(1)?,
            max_delay: row.get(2)?,
            on_time_pct: row.get(3)?,
            trip_count: row.get(4)?,
            headway_sec: row.get(5)?,
            headway_cv: row.get(6)?,
        })
    })?;
    for row in rows {
        points.push(row?);
    }

    // Also check hourly_agg for data that's been compacted
    let mut stmt = conn.prepare_cached(
        "SELECT hour_ts, avg_delay, max_delay, on_time_pct, samples
         FROM hourly_agg WHERE route_id = ?1 AND hour_ts >= ?2 AND hour_ts < ?3
         ORDER BY hour_ts",
    )?;
    let rows = stmt.query_map(params![route, from, to], |row| {
        Ok(HistoryPoint {
            ts: row.get(0)?,
            avg_delay: row.get(1)?,
            max_delay: row.get(2)?,
            on_time_pct: row.get(3)?,
            trip_count: row.get(4)?,
            headway_sec: None,
            headway_cv: None,
        })
    })?;
    for row in rows {
        points.push(row?);
    }

    // Sort by timestamp (mix of raw + compacted)
    points.sort_by_key(|p| p.ts);

    Ok(HistoryResponse {
        route: route.to_string(),
        from,
        to,
        points,
    })
}

pub fn query_stops(conn: &Connection, route: &str, ts: i64) -> rusqlite::Result<StopsResponse> {
    // Find the nearest 5-min boundary
    let snap_ts = (ts / 300) * 300;

    let mut stmt = conn.prepare_cached(
        "SELECT trip_id, stop_sequence, delay
         FROM stop_delays WHERE route_id = ?1 AND ts = ?2
         ORDER BY trip_id, stop_sequence",
    )?;

    let mut trips: Vec<TripStops> = Vec::new();
    let mut current_trip: Option<TripStops> = None;

    let rows = stmt.query_map(params![route, snap_ts], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, i32>(2)?,
        ))
    })?;

    for row in rows {
        let (trip_id, seq, delay) = row?;
        match current_trip {
            Some(ref mut t) if t.trip_id == trip_id => {
                t.stops.push(StopDelay { seq, delay });
            }
            _ => {
                if let Some(t) = current_trip.take() {
                    trips.push(t);
                }
                current_trip = Some(TripStops {
                    trip_id,
                    stops: vec![StopDelay { seq, delay }],
                });
            }
        }
    }
    if let Some(t) = current_trip {
        trips.push(t);
    }

    Ok(StopsResponse {
        route: route.to_string(),
        ts: snap_ts,
        trips,
    })
}

pub fn query_alerts(conn: &Connection, from: i64, to: i64) -> rusqlite::Result<AlertsResponse> {
    let mut stmt = conn.prepare_cached(
        "SELECT first_seen, cause, effect, header, description, route_ids
         FROM alerts WHERE first_seen >= ?1 AND first_seen < ?2
         ORDER BY first_seen DESC",
    )?;

    let mut alerts = Vec::new();
    let rows = stmt.query_map(params![from, to], |row| {
        let route_ids_str: String = row.get::<_, Option<String>>(5)?.unwrap_or_default();
        Ok(AlertRecord {
            first_seen: row.get(0)?,
            cause: row.get(1)?,
            effect: row.get(2)?,
            header: row.get(3)?,
            description: row.get(4)?,
            route_ids: route_ids_str
                .split(',')
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect(),
        })
    })?;

    for row in rows {
        alerts.push(row?);
    }

    Ok(AlertsResponse { alerts })
}

// --- Alert stats (feature 2.5) ---

fn sorted_label_counts(counts: HashMap<String, i64>) -> Vec<LabelCount> {
    let mut v: Vec<LabelCount> = counts
        .into_iter()
        .map(|(label, count)| LabelCount { label, count })
        .collect();
    v.sort_by(|a, b| b.count.cmp(&a.count));
    v
}

#[derive(Serialize)]
pub struct LabelCount {
    pub label: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertStatsResponse {
    pub by_route: Vec<LabelCount>,
    pub by_cause: Vec<LabelCount>,
    pub by_effect: Vec<LabelCount>,
    pub total: i64,
}

pub fn query_alert_stats(
    conn: &Connection,
    from: i64,
    to: i64,
) -> rusqlite::Result<AlertStatsResponse> {
    let mut stmt = conn.prepare_cached(
        "SELECT cause, effect, route_ids FROM alerts
         WHERE first_seen >= ?1 AND first_seen < ?2",
    )?;

    let mut route_counts: HashMap<String, i64> = HashMap::new();
    let mut cause_counts: HashMap<String, i64> = HashMap::new();
    let mut effect_counts: HashMap<String, i64> = HashMap::new();
    let mut total: i64 = 0;

    let rows = stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;

    for row in rows {
        let (cause, effect, route_ids_str) = row?;
        total += 1;

        *cause_counts.entry(cause).or_insert(0) += 1;
        *effect_counts.entry(effect).or_insert(0) += 1;

        if let Some(ids) = route_ids_str {
            for rid in ids.split(',').filter(|s| !s.is_empty()) {
                *route_counts.entry(rid.to_string()).or_insert(0) += 1;
            }
        }
    }

    let by_route = sorted_label_counts(route_counts);
    let by_cause = sorted_label_counts(cause_counts);
    let by_effect = sorted_label_counts(effect_counts);

    Ok(AlertStatsResponse {
        by_route,
        by_cause,
        by_effect,
        total,
    })
}

// --- Delay profile (feature 2.9) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DelayProfilePoint {
    pub seq: i32,
    pub avg_delay: f64,
    pub p90_delay: i32,
    pub samples: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DelayProfileResponse {
    pub route: String,
    pub points: Vec<DelayProfilePoint>,
}

pub fn query_delay_profile(
    conn: &Connection,
    route: &str,
    from: i64,
    to: i64,
) -> rusqlite::Result<Vec<DelayProfilePoint>> {
    let mut stmt = conn.prepare_cached(
        "SELECT stop_sequence, delay FROM stop_delays
         WHERE route_id = ?1 AND ts >= ?2 AND ts < ?3
         ORDER BY stop_sequence",
    )?;

    let mut by_seq: HashMap<i32, Vec<i32>> = HashMap::new();

    let rows = stmt.query_map(params![route, from, to], |row| {
        Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?))
    })?;

    for row in rows {
        let (seq, delay) = row?;
        by_seq.entry(seq).or_default().push(delay);
    }

    let mut points: Vec<DelayProfilePoint> = by_seq
        .into_iter()
        .map(|(seq, mut delays)| {
            delays.sort_unstable();
            let samples = delays.len() as i64;
            let avg_delay = delays.iter().map(|&d| d as f64).sum::<f64>() / samples as f64;
            let p90_idx = ((samples as f64 * 0.9).ceil() as usize)
                .min(delays.len())
                .saturating_sub(1);
            let p90_delay = delays[p90_idx];
            DelayProfilePoint {
                seq,
                avg_delay,
                p90_delay,
                samples,
            }
        })
        .collect();

    points.sort_by_key(|p| p.seq);

    Ok(points)
}

pub fn query_summary(conn: &Connection) -> rusqlite::Result<SummaryResponse> {
    let snapshot_count: i64 = conn.query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))?;
    let route_count: i64 =
        conn.query_row("SELECT COUNT(DISTINCT route_id) FROM snapshots", [], |r| {
            r.get(0)
        })?;
    let first_ts: Option<i64> =
        conn.query_row("SELECT MIN(ts) FROM snapshots", [], |r| r.get(0))?;
    let last_ts: Option<i64> = conn.query_row("SELECT MAX(ts) FROM snapshots", [], |r| r.get(0))?;
    let alert_count: i64 = conn.query_row("SELECT COUNT(*) FROM alerts", [], |r| r.get(0))?;

    Ok(SummaryResponse {
        snapshot_count,
        route_count,
        first_ts,
        last_ts,
        alert_count,
    })
}

// --- Speed comparison query (feature 2.2) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSnapshotPoint {
    pub ts: i64,
    pub avg_speed_kmh: f64,
    pub sample_count: i32,
}

pub fn query_speed_history(
    conn: &Connection,
    route: &str,
    from: i64,
    to: i64,
) -> rusqlite::Result<Vec<SpeedSnapshotPoint>> {
    let mut stmt = conn.prepare_cached(
        "SELECT ts, avg_speed_mps, sample_count
         FROM speed_snapshots WHERE route_id = ?1 AND ts >= ?2 AND ts < ?3
         ORDER BY ts",
    )?;
    let mut points = Vec::new();
    let rows = stmt.query_map(params![route, from, to], |row| {
        let avg_mps: f64 = row.get(1)?;
        Ok(SpeedSnapshotPoint {
            ts: row.get(0)?,
            avg_speed_kmh: (avg_mps * 3.6 * 10.0).round() / 10.0,
            sample_count: row.get(2)?,
        })
    })?;
    for row in rows {
        points.push(row?);
    }
    Ok(points)
}

// --- Occupancy query (feature 2.4) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OccupancyBucket {
    pub route_id: String,
    pub hour: i32,
    pub level: i32,
    pub count: i64,
}

pub fn query_occupancy(
    conn: &Connection,
    from: i64,
    to: i64,
    tz_offset: i64,
) -> rusqlite::Result<Vec<OccupancyBucket>> {
    // Group by route, local hour-of-day, and occupancy level
    let mut stmt = conn.prepare_cached(
        "SELECT route_id, (((ts + ?3) % 86400) / 3600) AS hour, occupancy_level, SUM(count)
         FROM occupancy_snapshots WHERE ts >= ?1 AND ts < ?2
         GROUP BY route_id, hour, occupancy_level
         ORDER BY route_id, hour, occupancy_level",
    )?;
    let mut buckets = Vec::new();
    let rows = stmt.query_map(params![from, to, tz_offset], |row| {
        Ok(OccupancyBucket {
            route_id: row.get(0)?,
            hour: row.get(1)?,
            level: row.get(2)?,
            count: row.get(3)?,
        })
    })?;
    for row in rows {
        buckets.push(row?);
    }
    Ok(buckets)
}

pub fn has_occupancy_data(conn: &Connection) -> rusqlite::Result<bool> {
    let exists: bool = conn
        .prepare_cached("SELECT 1 FROM occupancy_snapshots LIMIT 1")?
        .exists([])?;
    Ok(exists)
}

// --- BAJS usage history ---

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BajsUsagePoint {
    pub ts: i64,
    pub bikes_in_use: i32,
    pub available: i32,
    pub known_fleet: i32,
}

pub fn query_bajs_usage(
    conn: &Connection,
    from: i64,
    to: i64,
) -> rusqlite::Result<Vec<BajsUsagePoint>> {
    let mut stmt = conn.prepare(
        "SELECT ts, bikes_in_use, available, known_fleet
         FROM bajs_usage WHERE ts >= ?1 AND ts <= ?2
         ORDER BY ts",
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(BajsUsagePoint {
            ts: row.get(0)?,
            bikes_in_use: row.get(1)?,
            available: row.get(2)?,
            known_fleet: row.get(3)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gtfs_rt::{
        RtSnapshot, SnapshotAlert, SnapshotStopTime, SnapshotTrip, SnapshotVehicle,
    };

    fn make_snapshot(ts: i64) -> RtSnapshot {
        RtSnapshot {
            timestamp: ts,
            trips: vec![
                SnapshotTrip {
                    trip_id: "trip_1".into(),
                    route_id: "6".into(),
                    stop_times: vec![
                        SnapshotStopTime {
                            stop_sequence: 1,
                            delay: 30,
                            time: Some(ts + 30),
                        },
                        SnapshotStopTime {
                            stop_sequence: 5,
                            delay: 120,
                            time: Some(ts + 300),
                        },
                        SnapshotStopTime {
                            stop_sequence: 10,
                            delay: 60,
                            time: Some(ts + 600),
                        },
                    ],
                },
                SnapshotTrip {
                    trip_id: "trip_2".into(),
                    route_id: "6".into(),
                    stop_times: vec![SnapshotStopTime {
                        stop_sequence: 3,
                        delay: -30,
                        time: Some(ts + 100),
                    }],
                },
                SnapshotTrip {
                    trip_id: "trip_3".into(),
                    route_id: "11".into(),
                    stop_times: vec![SnapshotStopTime {
                        stop_sequence: 1,
                        delay: 400,
                        time: Some(ts + 400),
                    }],
                },
            ],
            alerts: vec![SnapshotAlert {
                cause: "TECHNICAL_PROBLEM".into(),
                effect: "REDUCED_SERVICE".into(),
                header: Some("Tram 6 delayed".into()),
                description: None,
                route_ids: vec!["6".into()],
                stop_ids: vec![],
            }],
            vehicles: vec![],
        }
    }

    #[test]
    fn test_ingest_and_query() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test-rt.db");
        let mut db = RtDb::open(&db_path).unwrap();

        // Ingest a snapshot at a 5-min boundary (writes both route + stop level)
        let ts = 1710720000; // divisible by 300
        db.ingest(&make_snapshot(ts));

        // Check route-level snapshots
        let count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2, "should have 2 routes (6 and 11)");

        // Check route 6 aggregation (2 trips: delays 60 and -30)
        let (avg, max, pct, trips): (f64, i32, f64, i64) = db
            .conn
            .query_row(
                "SELECT avg_delay, max_delay, on_time_pct, trip_count FROM snapshots WHERE route_id = '6'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(trips, 2);
        // first() delays: trip_1=30 (clamped 30), trip_2=-30 (clamped 0) → avg=15
        assert!((avg - 15.0).abs() < 0.1, "avg should be (30 + 0)/2 = 15");
        assert_eq!(max, 30);
        assert!((pct - 1.0).abs() < 0.01, "both within 300s threshold");

        // Check stop-level (should be written since ts % 300 == 0)
        let stop_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM stop_delays", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stop_count, 5, "3 + 1 + 1 stop time entries");

        // Check alerts
        let alert_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM alerts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(alert_count, 1);

        // Ingest at non-5-min boundary — no stop_delays written
        db.ingest(&make_snapshot(ts + 60));
        let stop_count2: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM stop_delays", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stop_count2, 5, "stop_delays should not grow at 60s offset");

        // Same 60s window — should be deduped
        db.ingest(&make_snapshot(ts + 90));
        let snap_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(snap_count, 4, "2 routes × 2 timestamps");
    }

    #[test]
    fn test_compaction() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test-compact.db");
        let mut db = RtDb::open(&db_path).unwrap();

        // Insert snapshots across 2 hours
        for i in 0..120 {
            db.ingest(&make_snapshot(1710720000 + i * 60));
        }

        let before: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))
            .unwrap();
        assert!(before > 0);

        // Compact everything before the end
        let compacted = db.compact(1710720000 + 120 * 60).unwrap();
        assert!(compacted > 0);

        // Hourly aggregates should exist
        let agg_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM hourly_agg", [], |r| r.get(0))
            .unwrap();
        assert!(agg_count > 0, "should have hourly aggregates");

        // Raw snapshots should be gone
        let after: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(after, 0);
    }
}

/// Spawn a dedicated OS thread that receives snapshots and writes to SQLite.
pub fn spawn_writer_thread(db_path: std::path::PathBuf, rx: std::sync::mpsc::Receiver<RtSnapshot>) {
    std::thread::spawn(move || {
        let mut db = match RtDb::open(&db_path) {
            Ok(db) => db,
            Err(e) => {
                eprintln!("RT DB: failed to open {}: {}", db_path.display(), e);
                return;
            }
        };

        eprintln!("RT DB: writer started, storing to {}", db_path.display());

        let mut ingest_count = 0u64;

        for snapshot in rx.iter() {
            db.ingest(&snapshot);
            ingest_count += 1;

            // Run maintenance every ~1000 ingests (~16 hours at 60s intervals)
            if ingest_count.is_multiple_of(1000) {
                db.maintain(snapshot.timestamp);
            }
        }

        eprintln!("RT DB: writer stopped");
    });
}
