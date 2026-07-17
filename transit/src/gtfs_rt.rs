//! GTFS-RT (realtime) trip delay data — fetched from ZET's protobuf feed.
//!
//! The background task fetches every 30 seconds and stores parsed delay data
//! in a shared HashMap<tripId, TripRT> behind an RwLock.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use prost::Message;

const ZET_RT_URL: &str = "https://www.zet.hr/gtfs-rt-protobuf";
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);

/// Plausibility bounds for RT delay values fed to the isochrone. ZET's feed
/// intermittently emits garbage after trip reassignments (observed live:
/// -2846s "early", +5628s "late"); such values corrupt travel times far more
/// than they inform, so out-of-bounds entries are dropped and the static
/// schedule wins.
const MIN_PLAUSIBLE_DELAY: i32 = -300;
const MAX_PLAUSIBLE_DELAY: i32 = 1800;

// --- Minimal GTFS-RT protobuf types (hand-written subset, matches the spec) ---

#[derive(Clone, Message)]
pub struct FeedMessage {
    #[prost(message, optional, tag = "1")]
    pub header: Option<FeedHeader>,
    #[prost(message, repeated, tag = "2")]
    pub entity: Vec<FeedEntity>,
}

#[derive(Clone, Message)]
pub struct FeedHeader {
    #[prost(string, tag = "1")]
    pub gtfs_realtime_version: String,
    // tag 2: Incrementality enum (skipped)
    #[prost(uint64, optional, tag = "3")]
    pub timestamp: Option<u64>,
}

#[derive(Clone, Message)]
pub struct FeedEntity {
    #[prost(string, tag = "1")]
    pub id: String,
    #[prost(bool, optional, tag = "2")]
    pub is_deleted: Option<bool>,
    #[prost(message, optional, tag = "3")]
    pub trip_update: Option<TripUpdate>,
    #[prost(message, optional, tag = "4")]
    pub vehicle: Option<VehiclePosition>,
    #[prost(message, optional, tag = "5")]
    pub alert: Option<Alert>,
}

#[derive(Clone, Message)]
pub struct VehiclePosition {
    #[prost(message, optional, tag = "1")]
    pub trip: Option<TripDescriptor>,
    #[prost(message, optional, tag = "2")]
    pub position: Option<Position>,
    #[prost(int32, optional, tag = "9")]
    pub occupancy_status: Option<i32>,
}

#[derive(Clone, Message)]
pub struct Position {
    #[prost(float, tag = "1")]
    pub latitude: f32,
    #[prost(float, tag = "2")]
    pub longitude: f32,
    #[prost(float, optional, tag = "3")]
    pub bearing: Option<f32>,
    #[prost(float, optional, tag = "5")]
    pub speed: Option<f32>,
}

#[derive(Clone, Message)]
pub struct TripUpdate {
    #[prost(message, optional, tag = "1")]
    pub trip: Option<TripDescriptor>,
    #[prost(message, repeated, tag = "2")]
    pub stop_time_update: Vec<StopTimeUpdate>,
    // tag 3: uint64 timestamp (skipped)
    // tag 4: StopTimeUpdate delay (skipped)
}

#[derive(Clone, Message)]
pub struct TripDescriptor {
    #[prost(string, optional, tag = "1")]
    pub trip_id: Option<String>,
    #[prost(string, optional, tag = "5")]
    pub route_id: Option<String>,
    // tag 2: string route_id, tag 3: uint32 direction_id, tag 4: string start_time, etc.
}

#[derive(Clone, Message)]
pub struct StopTimeUpdate {
    #[prost(uint32, optional, tag = "1")]
    pub stop_sequence: Option<u32>,
    #[prost(message, optional, tag = "2")]
    pub arrival: Option<StopTimeEvent>,
    #[prost(message, optional, tag = "3")]
    pub departure: Option<StopTimeEvent>,
    #[prost(string, optional, tag = "4")]
    pub stop_id: Option<String>,
}

#[derive(Clone, Message)]
pub struct StopTimeEvent {
    #[prost(int32, optional, tag = "1")]
    pub delay: Option<i32>,
    #[prost(int64, optional, tag = "2")]
    pub time: Option<i64>,
    #[prost(int32, optional, tag = "3")]
    pub uncertainty: Option<i32>,
}

#[derive(Clone, Message)]
pub struct Alert {
    #[prost(message, repeated, tag = "1")]
    pub active_period: Vec<TimeRange>,
    #[prost(message, repeated, tag = "5")]
    pub informed_entity: Vec<EntitySelector>,
    #[prost(int32, optional, tag = "6")]
    pub cause: Option<i32>,
    #[prost(int32, optional, tag = "7")]
    pub effect: Option<i32>,
    #[prost(message, optional, tag = "10")]
    pub header_text: Option<TranslatedString>,
    #[prost(message, optional, tag = "11")]
    pub description_text: Option<TranslatedString>,
}

#[derive(Clone, Message)]
pub struct TimeRange {
    #[prost(uint64, optional, tag = "1")]
    pub start: Option<u64>,
    #[prost(uint64, optional, tag = "2")]
    pub end: Option<u64>,
}

#[derive(Clone, Message)]
pub struct EntitySelector {
    #[prost(string, optional, tag = "1")]
    pub agency_id: Option<String>,
    #[prost(string, optional, tag = "2")]
    pub route_id: Option<String>,
    #[prost(int32, optional, tag = "3")]
    pub route_type: Option<i32>,
    #[prost(message, optional, tag = "4")]
    pub trip: Option<TripDescriptor>,
    #[prost(string, optional, tag = "5")]
    pub stop_id: Option<String>,
}

#[derive(Clone, Message)]
pub struct TranslatedString {
    #[prost(message, repeated, tag = "1")]
    pub translation: Vec<Translation>,
}

#[derive(Clone, Message)]
pub struct Translation {
    #[prost(string, tag = "1")]
    pub text: String,
    #[prost(string, optional, tag = "2")]
    pub language: Option<String>,
}

// --- Snapshot types for SQLite persistence ---

pub struct RtSnapshot {
    pub timestamp: i64,
    pub trips: Vec<SnapshotTrip>,
    pub alerts: Vec<SnapshotAlert>,
    pub vehicles: Vec<SnapshotVehicle>,
}

pub struct SnapshotVehicle {
    pub route_id: String,
    pub speed_mps: Option<f32>,
    pub occupancy_status: Option<i32>,
}

pub struct SnapshotTrip {
    pub trip_id: String,
    pub route_id: String,
    pub stop_times: Vec<SnapshotStopTime>,
}

pub struct SnapshotStopTime {
    pub stop_sequence: u16,
    pub delay: i32,
    /// Absolute predicted arrival/departure time (Unix seconds).
    /// Used for stale-trip detection and headway computation.
    pub time: Option<i64>,
}

pub struct SnapshotAlert {
    pub cause: String,
    pub effect: String,
    pub header: Option<String>,
    pub description: Option<String>,
    pub route_ids: Vec<String>,
    pub stop_ids: Vec<String>,
}

pub struct FeedParseResult {
    pub trips: HashMap<String, TripRT>,
    pub vehicles: HashMap<String, VehicleRT>,
    pub snapshot: RtSnapshot,
}

// --- Parsed trip RT data ---

#[derive(Clone)]
pub struct StopTimeRT {
    pub stop_sequence: u16,
    pub arrival_delay: i32,
}

#[derive(Clone)]
pub struct TripRT {
    pub stop_times: Vec<StopTimeRT>, // sorted by stop_sequence
}

/// Shared realtime data store.
pub type RtStore = Arc<RwLock<HashMap<String, TripRT>>>;

pub fn new_rt_store() -> RtStore {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Live vehicle data for speed/occupancy queries.
#[derive(Clone)]
pub struct VehicleRT {
    pub route_id: String,
    pub speed_mps: Option<f32>,
    pub occupancy_status: Option<i32>,
}

/// Shared vehicle position store.
pub type VehicleStore = Arc<RwLock<HashMap<String, VehicleRT>>>;

pub fn new_vehicle_store() -> VehicleStore {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Shared timestamp of last successful GTFS-RT refresh.
pub type RtLastRefresh = Arc<RwLock<Option<Instant>>>;

pub fn new_rt_last_refresh() -> RtLastRefresh {
    Arc::new(RwLock::new(None))
}

/// Health information about the GTFS-RT feed.
pub struct RtHealth {
    pub trip_count: usize,
    pub stale_sec: Option<u64>,
}

/// Get health info: trip count + seconds since last successful refresh.
pub fn get_rt_health(store: &RtStore, last_refresh: &RtLastRefresh) -> RtHealth {
    let trip_count = store.read().unwrap().len();
    let stale_sec = last_refresh.read().unwrap().map(|t| t.elapsed().as_secs());
    RtHealth {
        trip_count,
        stale_sec,
    }
}

/// Find the delay for a given stop index in a trip's RT data.
/// GTFS-RT stop_sequence is 1-based; pattern stopIdx is 0-based.
/// Per spec, delays propagate forward until overridden.
pub fn get_stop_delay(trip: &TripRT, stop_idx: usize) -> i32 {
    let seq = (stop_idx + 1) as u16; // 0-based → 1-based
    let mut delay = 0i32;
    for st in &trip.stop_times {
        if st.stop_sequence > seq {
            break;
        }
        delay = st.arrival_delay;
    }
    delay
}

/// Strip OTP feed prefix: "1:something" → "something"
fn strip_prefix(s: &str) -> &str {
    s.find(':').map_or(s, |i| &s[i + 1..])
}

fn cause_str(v: i32) -> &'static str {
    match v {
        2 => "OTHER_CAUSE",
        3 => "TECHNICAL_PROBLEM",
        4 => "STRIKE",
        5 => "DEMONSTRATION",
        6 => "ACCIDENT",
        7 => "HOLIDAY",
        8 => "WEATHER",
        9 => "MAINTENANCE",
        10 => "CONSTRUCTION",
        11 => "POLICE_ACTIVITY",
        12 => "MEDICAL_EMERGENCY",
        _ => "UNKNOWN_CAUSE",
    }
}

fn effect_str(v: i32) -> &'static str {
    match v {
        1 => "NO_SERVICE",
        2 => "REDUCED_SERVICE",
        3 => "SIGNIFICANT_DELAYS",
        4 => "DETOUR",
        5 => "ADDITIONAL_SERVICE",
        6 => "MODIFIED_SERVICE",
        7 => "OTHER_EFFECT",
        9 => "STOP_MOVED",
        10 => "NO_EFFECT",
        11 => "ACCESSIBILITY_ISSUE",
        _ => "UNKNOWN_EFFECT",
    }
}

/// Fetch and parse the GTFS-RT feed.
fn fetch_and_parse() -> Option<FeedParseResult> {
    let mut resp = match ureq::get(ZET_RT_URL).call() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("GTFS-RT: fetch failed: {}", e);
            return None;
        }
    };
    let mut buf = Vec::new();
    if let Err(e) = resp.body_mut().as_reader().read_to_end(&mut buf) {
        eprintln!("GTFS-RT: read failed: {}", e);
        return None;
    }
    let feed = match FeedMessage::decode(buf.as_slice()) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("GTFS-RT: protobuf decode failed: {}", e);
            return None;
        }
    };

    let timestamp = feed
        .header
        .as_ref()
        .and_then(|h| h.timestamp)
        .map(|t| t as i64)
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
        });

    let mut rt = HashMap::new();
    let mut snapshot_trips = Vec::new();
    let mut snapshot_alerts = Vec::new();
    let mut snapshot_vehicles = Vec::new();
    let mut vehicles = HashMap::new();

    for entity in &feed.entity {
        // Parse vehicle positions (speed + occupancy)
        if let Some(vp) = &entity.vehicle {
            let trip_id = vp.trip.as_ref().and_then(|t| t.trip_id.as_ref());
            let route_id = vp.trip.as_ref().and_then(|t| t.route_id.as_ref());
            if let (Some(tid), Some(rid)) = (trip_id, route_id) {
                let raw_tid = strip_prefix(tid).to_string();
                let raw_rid = strip_prefix(rid).to_string();
                let speed_mps = vp.position.as_ref().and_then(|p| p.speed);
                let occupancy = vp.occupancy_status;

                vehicles.insert(
                    raw_tid,
                    VehicleRT {
                        route_id: raw_rid.clone(),
                        speed_mps,
                        occupancy_status: occupancy,
                    },
                );

                snapshot_vehicles.push(SnapshotVehicle {
                    route_id: raw_rid,
                    speed_mps,
                    occupancy_status: occupancy,
                });
            }
        }

        // Parse trip updates
        if let Some(tu) = &entity.trip_update {
            let trip_id = match tu.trip.as_ref().and_then(|t| t.trip_id.as_ref()) {
                Some(id) => id,
                None => continue,
            };
            if tu.stop_time_update.is_empty() {
                continue;
            }

            let mut stop_times: Vec<StopTimeRT> = tu
                .stop_time_update
                .iter()
                .filter_map(|stu| {
                    let delay = stu
                        .arrival
                        .as_ref()
                        .and_then(|a| a.delay)
                        .or_else(|| stu.departure.as_ref().and_then(|d| d.delay))
                        .unwrap_or(0);
                    if !(MIN_PLAUSIBLE_DELAY..=MAX_PLAUSIBLE_DELAY).contains(&delay) {
                        return None;
                    }
                    Some(StopTimeRT {
                        stop_sequence: stu.stop_sequence.unwrap_or(0) as u16,
                        arrival_delay: delay,
                    })
                })
                .collect();
            stop_times.sort_by_key(|s| s.stop_sequence);

            let raw_id = strip_prefix(trip_id);
            if !stop_times.is_empty() {
                rt.insert(raw_id.to_string(), TripRT { stop_times });
            }

            // Build snapshot trip
            let route_id = tu
                .trip
                .as_ref()
                .and_then(|t| t.route_id.as_ref())
                .map(|r| strip_prefix(r).to_string())
                .unwrap_or_default();

            snapshot_trips.push(SnapshotTrip {
                trip_id: raw_id.to_string(),
                route_id,
                stop_times: tu
                    .stop_time_update
                    .iter()
                    .map(|stu| {
                        let delay = stu
                            .arrival
                            .as_ref()
                            .and_then(|a| a.delay)
                            .or_else(|| stu.departure.as_ref().and_then(|d| d.delay))
                            .unwrap_or(0);
                        let time = stu
                            .arrival
                            .as_ref()
                            .and_then(|a| a.time)
                            .filter(|&t| t != 0)
                            .or_else(|| {
                                stu.departure
                                    .as_ref()
                                    .and_then(|d| d.time)
                                    .filter(|&t| t != 0)
                            });
                        SnapshotStopTime {
                            stop_sequence: stu.stop_sequence.unwrap_or(0) as u16,
                            delay,
                            time,
                        }
                    })
                    .collect(),
            });
        }

        // Parse alerts
        if let Some(alert) = &entity.alert {
            let mut route_ids = Vec::new();
            let mut stop_ids = Vec::new();
            for ie in &alert.informed_entity {
                if let Some(ref rid) = ie.route_id {
                    route_ids.push(strip_prefix(rid).to_string());
                }
                if let Some(ref sid) = ie.stop_id {
                    stop_ids.push(strip_prefix(sid).to_string());
                }
            }

            snapshot_alerts.push(SnapshotAlert {
                cause: cause_str(alert.cause.unwrap_or(1)).to_string(),
                effect: effect_str(alert.effect.unwrap_or(8)).to_string(),
                header: alert
                    .header_text
                    .as_ref()
                    .and_then(|t| t.translation.first())
                    .map(|t| t.text.clone()),
                description: alert
                    .description_text
                    .as_ref()
                    .and_then(|t| t.translation.first())
                    .map(|t| t.text.clone()),
                route_ids,
                stop_ids,
            });
        }
    }

    Some(FeedParseResult {
        trips: rt,
        vehicles,
        snapshot: RtSnapshot {
            timestamp,
            trips: snapshot_trips,
            alerts: snapshot_alerts,
            vehicles: snapshot_vehicles,
        },
    })
}

/// Spawn a background task that refreshes RT data every 30 seconds.
/// If `db_tx` is provided, snapshots are sent to the SQLite writer thread.
pub fn spawn_refresh_task(
    store: RtStore,
    vehicle_store: VehicleStore,
    last_refresh: RtLastRefresh,
    db_tx: Option<std::sync::mpsc::SyncSender<RtSnapshot>>,
) {
    tokio::spawn(async move {
        loop {
            let result = tokio::task::spawn_blocking(fetch_and_parse).await;
            match result {
                Ok(Some(feed_result)) => {
                    let trip_count = feed_result.trips.len();
                    let vehicle_count = feed_result.vehicles.len();
                    *store.write().unwrap() = feed_result.trips;
                    *vehicle_store.write().unwrap() = feed_result.vehicles;
                    *last_refresh.write().unwrap() = Some(Instant::now());
                    eprintln!(
                        "GTFS-RT: refreshed {} trip updates, {} vehicle positions",
                        trip_count, vehicle_count
                    );

                    if let Some(ref tx) = db_tx {
                        let _ = tx.try_send(feed_result.snapshot);
                    }
                }
                Ok(None) => {
                    // Error already logged in fetch_and_parse
                }
                Err(e) => {
                    eprintln!("GTFS-RT: spawn_blocking failed: {}", e);
                }
            }
            tokio::time::sleep(REFRESH_INTERVAL).await;
        }
    });
}

use std::io::Read;
