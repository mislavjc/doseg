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

            -- Measured ride events, diffed from per-bike GBFS snapshots.
            -- starts/returns are counted events, not inferences. gap_sec is
            -- the distance to the previous poll: rows with a large gap span
            -- more than their own minute and must be filtered, not read as
            -- quiet minutes.
            CREATE TABLE IF NOT EXISTS bajs_flow_minute (
                ts        INTEGER NOT NULL PRIMARY KEY,
                starts    INTEGER NOT NULL,
                returns   INTEGER NOT NULL,
                bulk_out  INTEGER NOT NULL,
                bulk_in   INTEGER NOT NULL,
                docked    INTEGER NOT NULL,
                -- stations holding at least one bike, not network size
                stations  INTEGER NOT NULL,
                gap_sec   INTEGER NOT NULL
            ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS bajs_station_hourly (
                hour_ts       INTEGER NOT NULL,
                station_id    TEXT    NOT NULL,
                starts        INTEGER NOT NULL,
                returns       INTEGER NOT NULL,
                bulk_out      INTEGER NOT NULL,
                bulk_in       INTEGER NOT NULL,
                sum_bikes     INTEGER NOT NULL,
                min_bikes     INTEGER NOT NULL,
                max_bikes     INTEGER NOT NULL,
                empty_samples INTEGER NOT NULL,
                samples       INTEGER NOT NULL,
                PRIMARY KEY (hour_ts, station_id)
            ) WITHOUT ROWID;

            -- Rides whose bike kept its id across the trip, so both ends are
            -- known. A subset of all rides, never a total.
            CREATE TABLE IF NOT EXISTS bajs_trip (
                departed_ts  INTEGER NOT NULL,
                arrived_ts   INTEGER NOT NULL,
                from_station TEXT    NOT NULL,
                to_station   TEXT    NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_bajs_station_hour ON bajs_station_hourly(station_id, hour_ts);
            CREATE INDEX IF NOT EXISTS idx_bajs_trip_arrived ON bajs_trip(arrived_ts);
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
                    let latest_time = trip.stop_times.iter().filter_map(|st| st.time).max();
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
                    ts,
                    route_id,
                    avg,
                    max_delay,
                    pct,
                    count,
                    headway_sec,
                    headway_cv,
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

        // Minute-level bike flow folds into the hourly table, so only the
        // hourly aggregates and trips are worth keeping for a full year.
        match self.cleanup_old_bajs_flow(one_year_ago) {
            Ok(0) => {}
            Ok(n) => eprintln!("RT DB: cleaned {} old bajs flow rows", n),
            Err(e) => eprintln!("RT DB: bajs flow cleanup failed: {}", e),
        }
    }

    fn cleanup_old_bajs_flow(&self, cutoff: i64) -> rusqlite::Result<usize> {
        let minutes = self.conn.execute(
            "DELETE FROM bajs_flow_minute WHERE ts < ?1",
            params![cutoff],
        )?;
        let hourly = self.conn.execute(
            "DELETE FROM bajs_station_hourly WHERE hour_ts < ?1",
            params![cutoff],
        )?;
        let trips = self.conn.execute(
            "DELETE FROM bajs_trip WHERE arrived_ts < ?1",
            params![cutoff],
        )?;
        Ok(minutes + hourly + trips)
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
    v.sort_by_key(|lc| std::cmp::Reverse(lc.count));
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

// --- Route health aggregation ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteHealthRow {
    pub route_id: String,
    pub avg_delay: f64,
    pub on_time_pct: f64,
    pub headway_cv: Option<f64>,
    pub headway_sec: Option<f64>,
    pub samples: i32,
}

/// Aggregate last N hours of snapshots per route for system-wide health overview.
pub fn query_route_health(
    conn: &Connection,
    from: i64,
    to: i64,
) -> rusqlite::Result<Vec<RouteHealthRow>> {
    let mut stmt = conn.prepare_cached(
        "SELECT route_id,
                AVG(avg_delay),
                SUM(on_time_pct * trip_count) / NULLIF(SUM(trip_count), 0),
                AVG(CASE WHEN headway_cv IS NOT NULL THEN headway_cv END),
                AVG(CASE WHEN headway_sec IS NOT NULL THEN headway_sec END),
                COUNT(*)
         FROM snapshots
         WHERE ts >= ?1 AND ts < ?2
         GROUP BY route_id
         HAVING SUM(trip_count) > 0",
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(RouteHealthRow {
            route_id: row.get(0)?,
            avg_delay: row.get::<_, f64>(1).unwrap_or(0.0),
            on_time_pct: row.get::<_, f64>(2).unwrap_or(0.0),
            headway_cv: row.get(3)?,
            headway_sec: row.get(4)?,
            samples: row.get(5)?,
        })
    })?;
    rows.collect()
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

/// Rolling 24h peak of bikes at stations (effective fleet size).
pub fn query_bajs_peak_available(conn: &Connection, cutoff: i64) -> Option<i32> {
    conn.query_row(
        "SELECT MAX(available) FROM bajs_usage WHERE ts >= ?1",
        params![cutoff],
        |row| row.get::<_, Option<i32>>(0),
    )
    .ok()
    .flatten()
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

// --- BAJS measured ride flow ---

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BajsFlowPoint {
    pub ts: i64,
    pub starts: i64,
    pub returns: i64,
    pub bulk_out: i64,
    pub bulk_in: i64,
    pub docked: i64,
    /// Seconds since the previous poll. Anything well above 60 means this row
    /// covers more than its own minute.
    pub gap_sec: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BajsStationRank {
    pub station_id: String,
    pub starts: i64,
    pub returns: i64,
    pub bulk_out: i64,
    pub bulk_in: i64,
    pub avg_bikes: f64,
    pub empty_share: f64,
    pub samples: i64,
}

pub fn insert_bajs_flow_minute(
    conn: &Connection,
    delta: &crate::bajs_flow::PollDelta,
) -> rusqlite::Result<()> {
    let ts = delta.ts - delta.ts.rem_euclid(60);
    conn.execute(
        "INSERT INTO bajs_flow_minute (ts, starts, returns, bulk_out, bulk_in, docked, stations, gap_sec)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(ts) DO UPDATE SET
             starts   = starts + excluded.starts,
             returns  = returns + excluded.returns,
             bulk_out = bulk_out + excluded.bulk_out,
             bulk_in  = bulk_in + excluded.bulk_in,
             docked   = excluded.docked,
             stations = excluded.stations,
             gap_sec  = MAX(gap_sec, excluded.gap_sec)",
        params![
            ts,
            delta.starts,
            delta.returns,
            delta.bulk_out,
            delta.bulk_in,
            delta.docked,
            delta.stations,
            delta.gap_sec,
        ],
    )?;
    Ok(())
}

/// Write a completed hour. Accumulates on conflict so a restart mid-hour adds
/// to the partial hour instead of replacing it.
pub fn upsert_bajs_station_hourly(
    conn: &mut Connection,
    flush: &crate::bajs_flow::HourFlush,
) -> rusqlite::Result<usize> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO bajs_station_hourly
                 (hour_ts, station_id, starts, returns, bulk_out, bulk_in,
                  sum_bikes, min_bikes, max_bikes, empty_samples, samples)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(hour_ts, station_id) DO UPDATE SET
                 starts        = starts + excluded.starts,
                 returns       = returns + excluded.returns,
                 bulk_out      = bulk_out + excluded.bulk_out,
                 bulk_in       = bulk_in + excluded.bulk_in,
                 sum_bikes     = sum_bikes + excluded.sum_bikes,
                 min_bikes     = MIN(min_bikes, excluded.min_bikes),
                 max_bikes     = MAX(max_bikes, excluded.max_bikes),
                 empty_samples = empty_samples + excluded.empty_samples,
                 samples       = samples + excluded.samples",
        )?;
        for (station_id, hour) in &flush.stations {
            stmt.execute(params![
                flush.hour_ts,
                station_id,
                hour.starts,
                hour.returns,
                hour.bulk_out,
                hour.bulk_in,
                hour.sum_bikes,
                hour.min_bikes,
                hour.max_bikes,
                hour.empty_samples,
                hour.samples,
            ])?;
        }
    }
    tx.commit()?;
    Ok(flush.stations.len())
}

/// Take back starts that a later poll disproved.
///
/// Each retraction is dated to the poll that recorded the start, so it lands in
/// the minute and hour the miscount went into rather than in the current one.
/// Dropouts run from three polls to over an hour, so correcting the current
/// bucket instead would leave one hour short and another over.
///
/// Only rows already written are touched: `bajs_flow_minute` and the hour
/// buckets still in memory are handled by the tracker itself. `MAX(0, ...)`
/// guards the case where the start was reclassified as a bulk move, which
/// leaves nothing to subtract.
pub fn apply_bajs_start_retractions(
    conn: &mut Connection,
    retractions: &[crate::bajs_flow::StartRetraction],
) -> rusqlite::Result<()> {
    if retractions.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    {
        let mut minute =
            tx.prepare("UPDATE bajs_flow_minute SET starts = MAX(0, starts - 1) WHERE ts = ?1")?;
        let mut hourly = tx.prepare(
            "UPDATE bajs_station_hourly SET starts = MAX(0, starts - 1)
             WHERE hour_ts = ?1 AND station_id = ?2",
        )?;
        for r in retractions {
            minute.execute(params![r.counted_ts - r.counted_ts.rem_euclid(60)])?;
            hourly.execute(params![
                r.counted_ts - r.counted_ts.rem_euclid(3600),
                r.station_id
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn insert_bajs_trips(
    conn: &mut Connection,
    trips: &[crate::bajs_flow::MatchedTrip],
) -> rusqlite::Result<()> {
    if trips.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO bajs_trip (departed_ts, arrived_ts, from_station, to_station)
             VALUES (?1, ?2, ?3, ?4)",
        )?;
        for trip in trips {
            stmt.execute(params![
                trip.departed_ts,
                trip.arrived_ts,
                trip.from_station,
                trip.to_station,
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Minute-level ride flow. `max_gap_sec` drops intervals where polling
/// stalled, so a feed outage reads as missing rather than as zero rides.
pub fn query_bajs_flow(
    conn: &Connection,
    from: i64,
    to: i64,
    max_gap_sec: i64,
) -> rusqlite::Result<Vec<BajsFlowPoint>> {
    let mut stmt = conn.prepare(
        "SELECT ts, starts, returns, bulk_out, bulk_in, docked, gap_sec
         FROM bajs_flow_minute
         WHERE ts >= ?1 AND ts <= ?2 AND gap_sec <= ?3
         ORDER BY ts",
    )?;
    let rows = stmt.query_map(params![from, to, max_gap_sec], |row| {
        Ok(BajsFlowPoint {
            ts: row.get(0)?,
            starts: row.get(1)?,
            returns: row.get(2)?,
            bulk_out: row.get(3)?,
            bulk_in: row.get(4)?,
            docked: row.get(5)?,
            gap_sec: row.get(6)?,
        })
    })?;
    rows.collect()
}

/// Network-wide ride totals per clock hour, plus how much of each hour was
/// actually observed. Minutes whose poll gap exceeded `max_gap_sec` are left
/// out of both the counts and `minutes`, so a feed outage reads as a shorter
/// observed hour rather than as an hour with few rides.
///
/// Hours are UTC buckets. Zagreb is always a whole number of hours off UTC, so
/// callers can shift these into local hours without re-bucketing.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BajsHourTotals {
    pub hour_ts: i64,
    pub starts: i64,
    pub returns: i64,
    pub bulk_out: i64,
    pub bulk_in: i64,
    pub avg_docked: f64,
    pub min_docked: i64,
    pub max_docked: i64,
    /// Reliable minutes observed in this hour, out of 60.
    pub minutes: i64,
    pub worst_gap_sec: i64,
}

pub fn query_bajs_hourly_totals(
    conn: &Connection,
    from: i64,
    to: i64,
    max_gap_sec: i64,
) -> rusqlite::Result<Vec<BajsHourTotals>> {
    let mut stmt = conn.prepare(
        "SELECT (ts / 3600) * 3600 AS h,
                SUM(starts), SUM(returns), SUM(bulk_out), SUM(bulk_in),
                AVG(docked), MIN(docked), MAX(docked),
                COUNT(*), MAX(gap_sec)
         FROM bajs_flow_minute
         WHERE ts >= ?1 AND ts <= ?2 AND gap_sec <= ?3
         GROUP BY h
         ORDER BY h",
    )?;
    let rows = stmt.query_map(params![from, to, max_gap_sec], |row| {
        Ok(BajsHourTotals {
            hour_ts: row.get(0)?,
            starts: row.get(1)?,
            returns: row.get(2)?,
            bulk_out: row.get(3)?,
            bulk_in: row.get(4)?,
            avg_docked: row.get(5)?,
            min_docked: row.get(6)?,
            max_docked: row.get(7)?,
            minutes: row.get(8)?,
            worst_gap_sec: row.get(9)?,
        })
    })?;
    rows.collect()
}

/// First and last minute ever recorded, so a page can state honestly since
/// when the measurement runs. `None` before the first poll lands.
pub fn query_bajs_measured_span(conn: &Connection) -> Option<(i64, i64)> {
    conn.query_row("SELECT MIN(ts), MAX(ts) FROM bajs_flow_minute", [], |row| {
        Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?))
    })
    .ok()
    .and_then(|(min, max)| Some((min?, max?)))
}

/// Stations ranked by measured rides started, busiest first.
pub fn query_bajs_station_ranking(
    conn: &Connection,
    from: i64,
    to: i64,
) -> rusqlite::Result<Vec<BajsStationRank>> {
    let mut stmt = conn.prepare(
        "SELECT station_id,
                SUM(starts), SUM(returns), SUM(bulk_out), SUM(bulk_in),
                SUM(sum_bikes), SUM(empty_samples), SUM(samples)
         FROM bajs_station_hourly
         WHERE hour_ts >= ?1 AND hour_ts <= ?2
         GROUP BY station_id
         HAVING SUM(samples) > 0
         ORDER BY SUM(starts) DESC",
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        let sum_bikes: i64 = row.get(5)?;
        let empty_samples: i64 = row.get(6)?;
        let samples: i64 = row.get(7)?;
        Ok(BajsStationRank {
            station_id: row.get(0)?,
            starts: row.get(1)?,
            returns: row.get(2)?,
            bulk_out: row.get(3)?,
            bulk_in: row.get(4)?,
            avg_bikes: sum_bikes as f64 / samples as f64,
            empty_share: empty_samples as f64 / samples as f64,
            samples,
        })
    })?;
    rows.collect()
}

/// One station's flow in one clock hour, for reading demand direction.
///
/// Kept at the stored grain rather than folded here: hours are UTC buckets and
/// only the caller knows Zagreb's offset on that date.
pub struct BajsStationHourRow {
    pub station_id: String,
    pub hour_ts: i64,
    pub starts: i64,
    pub returns: i64,
}

/// Per-station starts and returns per hour, over well-observed hours only.
///
/// `min_samples` drops hours the collector only partly saw, so a restart reads
/// as a missing hour rather than as an hour when nobody rode.
pub fn query_bajs_station_hours(
    conn: &Connection,
    from: i64,
    to: i64,
    min_samples: i64,
) -> rusqlite::Result<Vec<BajsStationHourRow>> {
    let mut stmt = conn.prepare(
        "SELECT station_id, hour_ts, starts, returns
         FROM bajs_station_hourly
         WHERE hour_ts >= ?1 AND hour_ts <= ?2 AND samples >= ?3
         ORDER BY hour_ts",
    )?;
    let rows = stmt.query_map(params![from, to, min_samples], |row| {
        Ok(BajsStationHourRow {
            station_id: row.get(0)?,
            hour_ts: row.get(1)?,
            starts: row.get(2)?,
            returns: row.get(3)?,
        })
    })?;
    rows.collect()
}

/// A bike that moved between two stations without its id rotating.
///
/// GBFS rotates `bike_id` on rental, so a bike that arrives somewhere else
/// still carrying the id it left with was never rented: it was carried. These
/// are the operator's rebalancing moves, not anybody's ride. Same-station rows
/// are excluded because those are feed dropouts, not moves.
pub struct BajsRelocation {
    pub departed_ts: i64,
    pub arrived_ts: i64,
    pub from_station: String,
    pub to_station: String,
}

pub fn query_bajs_relocations(
    conn: &Connection,
    from: i64,
    to: i64,
) -> rusqlite::Result<Vec<BajsRelocation>> {
    let mut stmt = conn.prepare(
        "SELECT departed_ts, arrived_ts, from_station, to_station
         FROM bajs_trip
         WHERE arrived_ts >= ?1 AND arrived_ts <= ?2 AND from_station <> to_station
         ORDER BY departed_ts",
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(BajsRelocation {
            departed_ts: row.get(0)?,
            arrived_ts: row.get(1)?,
            from_station: row.get(2)?,
            to_station: row.get(3)?,
        })
    })?;
    rows.collect()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gtfs_rt::{RtSnapshot, SnapshotAlert, SnapshotStopTime, SnapshotTrip};

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

    fn station_hour(
        starts: i64,
        sum_bikes: i64,
        empty: i64,
        samples: i64,
    ) -> crate::bajs_flow::StationHour {
        crate::bajs_flow::StationHour {
            starts,
            returns: starts,
            sum_bikes,
            min_bikes: 0,
            max_bikes: 5,
            empty_samples: empty,
            samples,
            ..Default::default()
        }
    }

    #[test]
    fn test_bajs_flow_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = RtDb::open(&dir.path().join("test-rt.db")).unwrap();
        let hour = 1710720000;

        let flush = crate::bajs_flow::HourFlush {
            hour_ts: hour,
            stations: vec![
                ("quiet".to_string(), station_hour(2, 300, 0, 60)),
                ("busy".to_string(), station_hour(9, 60, 30, 60)),
            ],
        };
        upsert_bajs_station_hourly(&mut db.conn, &flush).unwrap();

        let ranking = query_bajs_station_ranking(&db.conn, hour, hour).unwrap();
        assert_eq!(ranking.len(), 2);
        assert_eq!(ranking[0].station_id, "busy", "ranked by measured rides");
        assert_eq!(ranking[0].starts, 9);
        assert_eq!(ranking[0].empty_share, 0.5);
        assert_eq!(ranking[1].avg_bikes, 5.0);

        // A second flush for the same hour accumulates rather than replaces.
        upsert_bajs_station_hourly(&mut db.conn, &flush).unwrap();
        let ranking = query_bajs_station_ranking(&db.conn, hour, hour).unwrap();
        assert_eq!(ranking[0].starts, 18);
        assert_eq!(ranking[0].samples, 120);
    }

    #[test]
    fn test_bajs_start_retraction_lands_on_the_dated_bucket() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = RtDb::open(&dir.path().join("test-rt.db")).unwrap();
        let hour = 1710720000;
        let counted_ts = hour + 1830; // 30 min 30 s into the hour

        insert_bajs_flow_minute(
            &db.conn,
            &crate::bajs_flow::PollDelta {
                ts: counted_ts,
                gap_sec: 60,
                starts: 3,
                returns: 1,
                docked: 1700,
                stations: 190,
                ..Default::default()
            },
        )
        .unwrap();
        upsert_bajs_station_hourly(
            &mut db.conn,
            &crate::bajs_flow::HourFlush {
                hour_ts: hour,
                stations: vec![
                    ("busy".to_string(), station_hour(3, 60, 0, 60)),
                    ("quiet".to_string(), station_hour(1, 60, 0, 60)),
                ],
            },
        )
        .unwrap();

        let retraction = crate::bajs_flow::StartRetraction {
            station_id: "busy".to_string(),
            counted_ts,
        };
        apply_bajs_start_retractions(&mut db.conn, std::slice::from_ref(&retraction)).unwrap();

        let flow = query_bajs_flow(&db.conn, hour, hour + 3600, 180).unwrap();
        assert_eq!(
            flow[0].starts, 2,
            "one start came off the minute it went in"
        );
        assert_eq!(flow[0].returns, 1, "returns are untouched");

        let ranked: HashMap<String, i64> = query_bajs_station_ranking(&db.conn, hour, hour)
            .unwrap()
            .into_iter()
            .map(|s| (s.station_id, s.starts))
            .collect();
        assert_eq!(ranked["busy"], 2, "and off the station that recorded it");
        assert_eq!(ranked["quiet"], 1, "other stations are left alone");

        // A start already reclassified as a bulk move leaves nothing to undo.
        for _ in 0..5 {
            apply_bajs_start_retractions(&mut db.conn, std::slice::from_ref(&retraction)).unwrap();
        }
        let flow = query_bajs_flow(&db.conn, hour, hour + 3600, 180).unwrap();
        assert_eq!(flow[0].starts, 0, "never goes negative");
    }

    #[test]
    fn test_bajs_flow_minute_filters_stalled_polls() {
        let dir = tempfile::tempdir().unwrap();
        let db = RtDb::open(&dir.path().join("test-rt.db")).unwrap();
        let ts = 1710720000;

        let fresh = crate::bajs_flow::PollDelta {
            ts,
            gap_sec: 60,
            starts: 4,
            returns: 3,
            docked: 1700,
            stations: 190,
            ..Default::default()
        };
        let stalled = crate::bajs_flow::PollDelta {
            ts: ts + 3600,
            gap_sec: 3600,
            starts: 240,
            docked: 1500,
            stations: 190,
            ..Default::default()
        };
        insert_bajs_flow_minute(&db.conn, &fresh).unwrap();
        insert_bajs_flow_minute(&db.conn, &stalled).unwrap();

        let all = query_bajs_flow(&db.conn, ts, ts + 7200, 86400).unwrap();
        assert_eq!(all.len(), 2, "both rows are stored");

        let usable = query_bajs_flow(&db.conn, ts, ts + 7200, 180).unwrap();
        assert_eq!(usable.len(), 1, "the stalled interval is excluded");
        assert_eq!(usable[0].starts, 4);
    }

    #[test]
    fn test_bajs_hourly_totals_report_observed_minutes() {
        let dir = tempfile::tempdir().unwrap();
        let db = RtDb::open(&dir.path().join("test-rt.db")).unwrap();
        let hour = 1710720000; // exactly on an hour boundary

        // 40 good minutes in the first hour, one of them stalled.
        for i in 0..40 {
            insert_bajs_flow_minute(
                &db.conn,
                &crate::bajs_flow::PollDelta {
                    ts: hour + i * 60,
                    gap_sec: if i == 7 { 900 } else { 60 },
                    starts: 2,
                    returns: 1,
                    docked: 1000 + i,
                    stations: 190,
                    ..Default::default()
                },
            )
            .unwrap();
        }
        // One minute in the next hour, so bucketing is exercised.
        insert_bajs_flow_minute(
            &db.conn,
            &crate::bajs_flow::PollDelta {
                ts: hour + 3600,
                gap_sec: 60,
                starts: 5,
                docked: 900,
                stations: 190,
                ..Default::default()
            },
        )
        .unwrap();

        let hours = query_bajs_hourly_totals(&db.conn, hour, hour + 7200, 180).unwrap();
        assert_eq!(hours.len(), 2, "one bucket per clock hour");
        assert_eq!(hours[0].hour_ts, hour);
        assert_eq!(hours[0].minutes, 39, "the stalled minute is not observed");
        assert_eq!(hours[0].starts, 78, "and its rides are not counted");
        assert_eq!(hours[0].returns, 39);
        assert_eq!(hours[0].min_docked, 1000);
        assert_eq!(hours[1].hour_ts, hour + 3600);
        assert_eq!(hours[1].starts, 5);

        assert_eq!(
            query_bajs_measured_span(&db.conn),
            Some((hour, hour + 3600))
        );
    }

    #[test]
    fn test_bajs_retention_drops_old_rows() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = RtDb::open(&dir.path().join("test-rt.db")).unwrap();
        let now = 1710720000;
        let ancient = now - 400 * 86400;

        insert_bajs_flow_minute(
            &db.conn,
            &crate::bajs_flow::PollDelta {
                ts: ancient,
                gap_sec: 60,
                starts: 1,
                ..Default::default()
            },
        )
        .unwrap();
        upsert_bajs_station_hourly(
            &mut db.conn,
            &crate::bajs_flow::HourFlush {
                hour_ts: ancient,
                stations: vec![("old".to_string(), station_hour(1, 10, 0, 10))],
            },
        )
        .unwrap();
        insert_bajs_trips(
            &mut db.conn,
            &[crate::bajs_flow::MatchedTrip {
                departed_ts: ancient,
                arrived_ts: ancient + 600,
                from_station: "a".into(),
                to_station: "b".into(),
            }],
        )
        .unwrap();

        assert_eq!(db.cleanup_old_bajs_flow(now - 365 * 86400).unwrap(), 3);
        assert!(query_bajs_flow(&db.conn, 0, now, 86400).unwrap().is_empty());
        assert!(query_bajs_station_ranking(&db.conn, 0, now)
            .unwrap()
            .is_empty());
    }
}
