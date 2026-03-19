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

// --- Minimal GTFS-RT protobuf types (hand-written subset, matches the spec) ---

#[derive(Clone, Message)]
pub struct FeedMessage {
    // tag 1: FeedHeader header (skipped)
    #[prost(message, repeated, tag = "2")]
    pub entity: Vec<FeedEntity>,
}

#[derive(Clone, Message)]
pub struct FeedEntity {
    #[prost(string, tag = "1")]
    pub id: String,
    #[prost(bool, optional, tag = "2")]
    pub is_deleted: Option<bool>,
    #[prost(message, optional, tag = "3")]
    pub trip_update: Option<TripUpdate>,
    // tag 4: VehiclePosition (skipped via prost unknown field handling)
    // tag 5: Alert (skipped)
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
    #[prost(int64, optional, tag = "1")]
    pub time: Option<i64>,
    #[prost(int32, optional, tag = "2")]
    pub delay: Option<i32>,
    #[prost(int32, optional, tag = "3")]
    pub uncertainty: Option<i32>,
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
    let stale_sec = last_refresh
        .read()
        .unwrap()
        .map(|t| t.elapsed().as_secs());
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

/// Fetch and parse the GTFS-RT feed, returning a map of trip_id → TripRT.
fn fetch_and_parse() -> Option<HashMap<String, TripRT>> {
    let resp = match ureq::get(ZET_RT_URL).call() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("GTFS-RT: fetch failed: {}", e);
            return None;
        }
    };
    let mut buf = Vec::new();
    if let Err(e) = resp.into_reader().read_to_end(&mut buf) {
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
    let mut rt = HashMap::new();

    for entity in &feed.entity {
        let tu = match &entity.trip_update {
            Some(tu) => tu,
            None => continue,
        };
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
            .map(|stu| {
                let delay = stu
                    .arrival
                    .as_ref()
                    .and_then(|a| a.delay)
                    .or_else(|| stu.departure.as_ref().and_then(|d| d.delay))
                    .unwrap_or(0);
                StopTimeRT {
                    stop_sequence: stu.stop_sequence.unwrap_or(0) as u16,
                    arrival_delay: delay,
                }
            })
            .collect();
        stop_times.sort_by_key(|s| s.stop_sequence);

        // Strip OTP feed prefix: "1:tripId" → "tripId"
        let raw_id = trip_id
            .find(':')
            .map_or(trip_id.as_str(), |i| &trip_id[i + 1..]);
        rt.insert(raw_id.to_string(), TripRT { stop_times });
    }

    Some(rt)
}

/// Spawn a background task that refreshes RT data every 30 seconds.
pub fn spawn_refresh_task(store: RtStore, last_refresh: RtLastRefresh) {
    tokio::spawn(async move {
        loop {
            let result = tokio::task::spawn_blocking(fetch_and_parse).await;
            match result {
                Ok(Some(data)) => {
                    let count = data.len();
                    *store.write().unwrap() = data;
                    *last_refresh.write().unwrap() = Some(Instant::now());
                    eprintln!("GTFS-RT: refreshed {} trip updates", count);
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
