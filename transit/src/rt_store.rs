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

/// Delay threshold for "on time" classification (5 minutes).
const ON_TIME_THRESHOLD: i32 = 300;

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

            CREATE INDEX IF NOT EXISTS idx_snapshots_route ON snapshots(route_id, ts);
            CREATE INDEX IF NOT EXISTS idx_stop_delays_route ON stop_delays(route_id, ts);
            CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(first_seen);
        ",
        )?;

        Ok(RtDb {
            conn,
            last_written_ts: 0,
        })
    }

    /// Ingest a snapshot. Deduplicates to one write per 60s window.
    pub fn ingest(&mut self, snap: &RtSnapshot) {
        let ts = (snap.timestamp / 60) * 60;

        if ts == self.last_written_ts {
            return;
        }
        self.last_written_ts = ts;

        let write_stops = ts % 300 == 0;

        match self.ingest_inner(ts, snap, write_stops) {
            Ok(()) => {
                if self.last_written_ts <= ts + 300 {
                    eprintln!(
                        "RT DB: wrote ts={} routes={}",
                        ts,
                        snap.trips.iter().filter(|t| !t.route_id.is_empty()).count()
                    );
                }
            }
            Err(e) => eprintln!("RT DB: ingest error: {}", e),
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
                "INSERT OR IGNORE INTO snapshots (ts, route_id, avg_delay, max_delay, on_time_pct, trip_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;

            for (route_id, trips) in &by_route {
                let mut total_delay: i64 = 0;
                let mut max_delay: i32 = 0;
                let mut on_time: u32 = 0;
                let mut count: u32 = 0;

                for trip in trips {
                    if let Some(last) = trip.stop_times.last() {
                        let d = last.delay;
                        total_delay += d as i64;
                        if d.abs() > max_delay.abs() {
                            max_delay = d;
                        }
                        if d.abs() <= ON_TIME_THRESHOLD {
                            on_time += 1;
                        }
                        count += 1;
                    }
                }

                if count > 0 {
                    let avg = total_delay as f64 / count as f64;
                    let pct = on_time as f64 / count as f64;
                    stmt.execute(params![ts, route_id, avg, max_delay, pct, count])?;
                }
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

    /// Run periodic maintenance: clean old stop data, compact old snapshots.
    fn maintain(&self, now_ts: i64) {
        let six_months_ago = now_ts - 180 * 86400;
        match self.cleanup_old_stops(six_months_ago) {
            Ok(0) => {}
            Ok(n) => eprintln!("RT DB: cleaned {} old stop delay rows", n),
            Err(e) => eprintln!("RT DB: stop cleanup failed: {}", e),
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
        "SELECT ts, avg_delay, max_delay, on_time_pct, trip_count
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
                        },
                        SnapshotStopTime {
                            stop_sequence: 5,
                            delay: 120,
                        },
                        SnapshotStopTime {
                            stop_sequence: 10,
                            delay: 60,
                        },
                    ],
                },
                SnapshotTrip {
                    trip_id: "trip_2".into(),
                    route_id: "6".into(),
                    stop_times: vec![SnapshotStopTime {
                        stop_sequence: 3,
                        delay: -30,
                    }],
                },
                SnapshotTrip {
                    trip_id: "trip_3".into(),
                    route_id: "11".into(),
                    stop_times: vec![SnapshotStopTime {
                        stop_sequence: 1,
                        delay: 400,
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
        assert!((avg - 15.0).abs() < 0.1, "avg should be (60 + -30)/2 = 15");
        assert_eq!(max, 60);
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
            if ingest_count < 5 {
                eprintln!(
                    "RT DB: received snapshot ts={} trips={} alerts={}",
                    snapshot.timestamp,
                    snapshot.trips.len(),
                    snapshot.alerts.len()
                );
            }
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
