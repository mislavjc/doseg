mod bajs;
#[allow(dead_code)]
mod districts;
mod geo;
mod gtfs_rt;
mod heap;
#[allow(dead_code)]
mod osm;
mod otp;
#[allow(dead_code)]
mod route_stats;
#[allow(dead_code)]
mod rt_store;
mod transit_graph;
mod walk_expand;
mod walk_graph;

// Stub needed by route_stats module
pub fn chrono_now_iso() -> String {
    String::new()
}

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use axum::extract::{Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tower_http::compression::CompressionLayer;
use ts_rs::TS;

use crate::geo::{fast_dist_km, WALK_SPEED};
use crate::heap::FlatHeap;
use crate::transit_graph::{Mode, TransitGraphJson};
use crate::walk_expand::{find_nearest_node, snap_stops, StopSnap};
use crate::walk_graph::WalkGraph;

// --- Constants matching the TS implementation ---

const MAX_SECONDS: f64 = 30.0 * 60.0;
const CM_TO_SECONDS: f64 = 0.0072;
const BUCKET_SECONDS: f64 = 60.0;
const TRANSIT_COORD_SCALE: f64 = 1_000_000.0; // 6 decimals — finer alignment with map tiles
/// Max distance² (km²) for snapping GTFS vertices to walk graph (~80m).
const TRANSIT_SNAP_MAX_KM2: f64 = 0.0064;

/// Grid cell size for edge-rasterized isochrone contours (~100m).
const WALK_AREA_CELL_SIZE: f64 = 0.001;
/// Small buffer (seconds) subtracted from each threshold to account for grid
/// discretization (~100m cells), morphological closing, and smoothing. Was
/// 120s to also paper over exact-departure phase noise; now that boarding
/// uses expected waits (shared with the route panel), a large buffer just
/// makes the painted edge contradict the panel time at the same spot.
const THRESHOLD_BUFFER: f64 = 30.0;

const WALK_MAX_KM: f64 = 1.2;
const MAX_WAIT: f64 = 3600.0;
/// Bounds on the applied RT adjustment (delay at destination minus delay at
/// boarding). The adjustment is relative, so legitimate values are small even
/// for badly delayed trips; clamping keeps a single garbage RT entry from
/// teleporting or stranding an entire pattern (see MIN/MAX_PLAUSIBLE_DELAY in
/// gtfs_rt.rs for the first line of defense).
const RT_ADJUSTMENT_MIN: f64 = -300.0;
const RT_ADJUSTMENT_MAX: f64 = 900.0;
/// Straight-line → road distance multiplier (urban street grid detour).
const WALK_DETOUR: f64 = 1.35;

/// Convert straight-line distance (km) to walking time (seconds), accounting for detour.
fn walk_seconds(dist_km: f64) -> f64 {
    (dist_km * WALK_DETOUR / WALK_SPEED) * 3600.0
}

const BAJS_TRANSFER_MAX_KM: f64 = 0.35;
const BAJS_BIKE_MAX_KM: f64 = 6.0;
const BAJS_SPEED: f64 = 14.0;
const BAJS_PICKUP_SECONDS: f64 = 60.0;
const BAJS_DROPOFF_SECONDS: f64 = 30.0;

// --- App state ---

struct AppState {
    transit_graph: TransitGraphJson,
    walk_graph: WalkGraph,
    stop_snaps: Vec<Option<StopSnap>>,
    rt_store: gtfs_rt::RtStore,
    vehicle_store: gtfs_rt::VehicleStore,
    rt_last_refresh: gtfs_rt::RtLastRefresh,
    /// Pre-snapped polyline segments: [pattern][stop_pair] → coords
    snapped_segments: Vec<Vec<Vec<[f64; 2]>>>,
    /// Pre-built BAJS adjacency for the idealized stations
    bajs_adjacency: Option<BajsAdjacency>,
    /// Read-only SQLite connection for RT history queries
    rt_db_reader: Option<tokio::sync::Mutex<rusqlite::Connection>>,
    /// Scheduled speeds from route-stats.json (route name → km/h)
    scheduled_speeds: HashMap<String, f64>,
    /// Route name → mode ("TRAM", "BUS", etc.), precomputed from transit graph
    route_mode_map: HashMap<String, String>,
    /// Stop key → index into transit_graph.stops, precomputed for O(1) lookup
    stop_key_to_idx: HashMap<String, usize>,
    /// Live BAJS station status (refreshed every 60s)
    bajs_status_store: BajsStatusStore,
    /// BAJS fleet tracking state (shared with background poll task)
    bajs_fleet: Arc<BajsFleetState>,
    /// GTFS service date the graph was built for (YYYY-MM-DD). Equals today
    /// unless the feed lapsed and we fell back to an earlier service day.
    feed_service_date: String,
    /// True when the graph was built for a day other than today because today
    /// had no scheduled service — i.e. the feed is stale right now.
    feed_fallback: bool,
    /// Days until the loaded feed's last service date (negative = already
    /// expired). None if OTP didn't report a service range. Surfaced on
    /// /health so monitoring can alert before the feed runs dry.
    feed_runway_days: Option<i64>,
}

/// Shared BAJS station status store.
type BajsStatusStore = Arc<RwLock<Vec<otp::GbfsStationStatus>>>;

/// BAJS station-based availability tracking.
struct BajsFleetState {
    /// Rolling 24h max of total bikes at stations — effective fleet size
    peak_station_bikes: std::sync::atomic::AtomicI32,
}

// --- BAJS adjacency (string-keyed, matching TS interactive Dijkstra) ---

struct NearbyNode {
    key: String,
    dist_km: f64,
}

struct BajsAdjacency {
    stations_by_key: HashMap<String, IdealisedBajsStation>,
    stop_walk_links: HashMap<String, Vec<NearbyNode>>,
    station_walk_links: HashMap<String, Vec<NearbyNode>>,
    station_bike_links: HashMap<String, Vec<NearbyNode>>,
}

struct IdealisedBajsStation {
    key: String,
    name: String,
    lat: f64,
    lon: f64,
}

fn build_bajs_adjacency(graph: &TransitGraphJson) -> Option<BajsAdjacency> {
    if graph.bajs_stations.is_empty() {
        return None;
    }

    let mut stations_by_key = HashMap::new();
    let mut station_walk_links: HashMap<String, Vec<NearbyNode>> = HashMap::new();
    let mut station_bike_links: HashMap<String, Vec<NearbyNode>> = HashMap::new();
    let mut stop_walk_links: HashMap<String, Vec<NearbyNode>> = HashMap::new();

    let stations = &graph.bajs_stations;
    for s in stations {
        stations_by_key.insert(
            s.key.clone(),
            IdealisedBajsStation {
                key: s.key.clone(),
                name: s.name.clone(),
                lat: s.lat,
                lon: s.lon,
            },
        );
        station_walk_links.insert(s.key.clone(), Vec::new());
        station_bike_links.insert(s.key.clone(), Vec::new());
    }

    for stop in &graph.stops {
        let mut walk_links = Vec::new();
        for station in stations {
            let dist_km = fast_dist_km(stop.lat, stop.lon, station.lat, station.lon);
            if dist_km > BAJS_TRANSFER_MAX_KM {
                continue;
            }
            walk_links.push(NearbyNode {
                key: station.key.clone(),
                dist_km,
            });
            station_walk_links
                .get_mut(&station.key)
                .unwrap()
                .push(NearbyNode {
                    key: stop.key.clone(),
                    dist_km,
                });
        }
        if !walk_links.is_empty() {
            stop_walk_links.insert(stop.key.clone(), walk_links);
        }
    }

    for i in 0..stations.len() {
        for j in (i + 1)..stations.len() {
            let dist_km = fast_dist_km(
                stations[i].lat,
                stations[i].lon,
                stations[j].lat,
                stations[j].lon,
            );
            if dist_km > BAJS_BIKE_MAX_KM {
                continue;
            }
            // Idealized: all stations always have bikes and docks
            station_bike_links
                .get_mut(&stations[i].key)
                .unwrap()
                .push(NearbyNode {
                    key: stations[j].key.clone(),
                    dist_km,
                });
            station_bike_links
                .get_mut(&stations[j].key)
                .unwrap()
                .push(NearbyNode {
                    key: stations[i].key.clone(),
                    dist_km,
                });
        }
    }

    Some(BajsAdjacency {
        stations_by_key,
        stop_walk_links,
        station_walk_links,
        station_bike_links,
    })
}

// --- Polyline decoder ---

fn decode_polyline(encoded: &str) -> Vec<[f64; 2]> {
    let mut points = Vec::new();
    let bytes = encoded.as_bytes();
    let mut index = 0;
    let mut lat: i64 = 0;
    let mut lng: i64 = 0;

    while index < bytes.len() {
        let mut shift = 0;
        let mut result: i64 = 0;
        loop {
            let b = (bytes[index] as i64) - 63;
            index += 1;
            result |= (b & 0x1f) << shift;
            shift += 5;
            if b < 0x20 {
                break;
            }
        }
        lat += if result & 1 != 0 {
            !(result >> 1)
        } else {
            result >> 1
        };

        shift = 0;
        result = 0;
        loop {
            let b = (bytes[index] as i64) - 63;
            index += 1;
            result |= (b & 0x1f) << shift;
            shift += 5;
            if b < 0x20 {
                break;
            }
        }
        lng += if result & 1 != 0 {
            !(result >> 1)
        } else {
            result >> 1
        };

        points.push([lng as f64 / 1e5, lat as f64 / 1e5]); // [lon, lat] GeoJSON order
    }

    points
}

// --- Single-departure Dijkstra with predecessor tracking ---

#[derive(Clone)]
enum PredKind {
    Walk,
    Transit,
    Bike,
}

#[derive(Clone)]
struct Predecessor {
    from_key: String,
    kind: PredKind,
    pattern_idx: Option<usize>,
    board_idx: Option<usize>,
    alight_idx: Option<usize>,
}

/// A rider times their departure from home to the first vehicle, arriving at
/// the stop a couple of minutes early — so the first boarding costs at most
/// this access buffer, regardless of the line's headway. Charging headway/2
/// on the first leg gutted sparse-feeder suburbs (Dubec: engine said 36 min
/// to Vidovec, real timed departure 22), while charging the exact wait made
/// reach flicker ±50% between 5-minute buckets there.
const FIRST_BOARDING_WAIT: f64 = 120.0;

/// Wait for the FIRST boarding of a journey: the exact next-departure wait,
/// capped by the access buffer (the rider re-times their departure rather
/// than stand at the stop). None when the line has no departure within
/// MAX_WAIT — a line that isn't running can't be timed.
fn get_first_wait(departures: &[f64], stop_offset: f64, clock_time: f64) -> Option<(f64, usize)> {
    if departures.is_empty() {
        return None;
    }
    let target = clock_time - stop_offset;
    let lo = departures.partition_point(|&d| d < target);
    if lo >= departures.len() {
        return None;
    }
    let wait = departures[lo] + stop_offset - clock_time;
    if wait <= MAX_WAIT {
        Some((wait.min(FIRST_BOARDING_WAIT), lo))
    } else {
        None
    }
}

/// Expected boarding wait (headway/2 around the clock time) plus the index of
/// the next departing trip (kept for the GTFS-RT delay lookup). Used for
/// TRANSFER boardings.
///
/// The graph's minute precision is fake at transfers — stop offsets are
/// medians over sampled trips and connections carry no buffer — so boarding
/// the *exact* next departure turned that noise into a lottery: reach swung
/// ±40% between adjacent 5-minute buckets (07:00 = 53 km², 07:30 = 30 km²)
/// while the real schedule was flat. Expected wait keeps genuine time-of-day
/// service levels (night vs peak headways) without the fake-tight-connection
/// luck. The first boarding of a journey uses get_next_wait instead.
fn get_expected_wait(
    departures: &[f64],
    stop_offset: f64,
    clock_time: f64,
) -> Option<(f64, usize)> {
    if departures.is_empty() {
        return None;
    }
    let target = clock_time - stop_offset;
    let lo = departures.partition_point(|&d| d < target);
    if lo >= departures.len() {
        return None;
    }
    let headway = if lo > 0 {
        departures[lo] - departures[lo - 1]
    } else if lo + 1 < departures.len() {
        departures[lo + 1] - departures[lo]
    } else {
        3600.0
    };
    let wait = (headway.min(1800.0) / 2.0).min(MAX_WAIT);
    Some((wait, lo))
}

struct TravelTimeResult {
    times: HashMap<String, f64>,
    preds: HashMap<String, Predecessor>,
}

#[allow(clippy::too_many_arguments)]
fn compute_travel_times(
    graph: &TransitGraphJson,
    origin_lat: f64,
    origin_lon: f64,
    departure_time: f64,
    use_bajs: bool,
    bajs_adj: Option<&BajsAdjacency>,
    rt_data: &HashMap<String, gtfs_rt::TripRT>,
    walk_graph: &WalkGraph,
    stop_snaps: &[Option<StopSnap>],
    stop_key_to_idx: &HashMap<String, usize>,
) -> TravelTimeResult {
    let time_cap = 3600.0; // 1 hour
    let mut best: HashMap<String, f64> = HashMap::new();
    let mut preds: HashMap<String, Predecessor> = HashMap::new();
    let mut heap = FlatHeap::new();
    let mut node_keys: Vec<String> = Vec::new();
    let mut key_to_node: HashMap<String, u32> = HashMap::new();

    let get_or_insert_node =
        |key: &str, keys: &mut Vec<String>, k2n: &mut HashMap<String, u32>| -> u32 {
            if let Some(&idx) = k2n.get(key) {
                idx
            } else {
                let idx = keys.len() as u32;
                keys.push(key.to_string());
                k2n.insert(key.to_string(), idx);
                idx
            }
        };

    // Walk-graph Dijkstra from origin for accurate walking times
    let walk_cap = (WALK_MAX_KM / WALK_SPEED) * 3600.0;
    let wg_node_count = walk_graph.node_count as usize;
    let mut wg_best = vec![f64::INFINITY; wg_node_count];
    let mut wg_heap = FlatHeap::new();

    if let Some(origin_node) = find_nearest_node(walk_graph, origin_lat, origin_lon, 0.25) {
        let olat = walk_graph.lat(origin_node);
        let olon = walk_graph.lon(origin_node);
        let snap_time = walk_seconds(fast_dist_km(origin_lat, origin_lon, olat, olon));
        wg_best[origin_node as usize] = snap_time;
        wg_heap.push(snap_time, origin_node);
    }

    let wg_offsets = walk_graph.offsets.as_slice();
    let wg_targets = walk_graph.edge_targets.as_slice();
    let wg_dist = walk_graph.edge_dist_cm.as_slice();

    while !wg_heap.is_empty() {
        let time = wg_heap.peek_time();
        let node = wg_heap.peek_node();
        wg_heap.pop();
        if time > wg_best[node as usize] {
            continue;
        }
        if time > walk_cap {
            break;
        }
        let es = wg_offsets[node as usize] as usize;
        let ee = wg_offsets[node as usize + 1] as usize;
        for e in es..ee {
            let to = wg_targets[e];
            let arr = time + wg_dist[e] as f64 * CM_TO_SECONDS;
            if arr < walk_cap && arr < wg_best[to as usize] {
                wg_best[to as usize] = arr;
                wg_heap.push(arr, to);
            }
        }
    }

    // Seed transit stops using real walk-graph times (via stop_snaps)
    for (si, stop) in graph.stops.iter().enumerate() {
        let snap = match &stop_snaps[si] {
            Some(s) => s,
            None => continue,
        };
        let walk_time = wg_best[snap.node_idx as usize];
        if walk_time < f64::INFINITY {
            let total = walk_time + snap.walk_seconds;
            let existing = best
                .get(stop.key.as_str())
                .copied()
                .unwrap_or(f64::INFINITY);
            if total < existing {
                best.insert(stop.key.clone(), total);
                let ni = get_or_insert_node(&stop.key, &mut node_keys, &mut key_to_node);
                heap.push(total, ni);
            }
        }
    }

    // Seed BAJS stations using real walk-graph times
    if use_bajs {
        if let Some(adj) = bajs_adj {
            for station in adj.stations_by_key.values() {
                // BAJS stations aren't in stop_snaps — use straight-line with detour
                let dist_km = fast_dist_km(origin_lat, origin_lon, station.lat, station.lon);
                if dist_km > WALK_MAX_KM {
                    continue;
                }
                let wt = walk_seconds(dist_km);
                let existing = best.get(&station.key).copied().unwrap_or(f64::INFINITY);
                if wt < existing {
                    best.insert(station.key.clone(), wt);
                    let node_idx =
                        get_or_insert_node(&station.key, &mut node_keys, &mut key_to_node);
                    heap.push(wt, node_idx);
                }
            }
        }
    }

    // Snapshot of the walk-only seed times: a stop popped at exactly its seed
    // time is still in the "walked here from the origin" state, so boarding
    // there is the journey's first — it gets the exact timetable wait, while
    // later (transfer) boardings get the expected wait. If transit reached a
    // stop faster than walking, its label is below the seed and boarding
    // counts as a transfer.
    let seed_times = best.clone();

    while !heap.is_empty() {
        let time = heap.peek_time();
        let node_idx = heap.peek_node();
        heap.pop();

        if time > time_cap {
            break;
        }

        let key = node_keys[node_idx as usize].clone();
        let best_time = best.get(key.as_str()).copied().unwrap_or(f64::INFINITY);
        if time > best_time {
            continue;
        }

        let stop_idx = stop_key_to_idx.get(key.as_str()).copied();
        let is_station =
            use_bajs && bajs_adj.is_some_and(|adj| adj.stations_by_key.contains_key(key.as_str()));

        if let Some(si) = stop_idx {
            let stop = &graph.stops[si];

            // Try all patterns serving this stop
            for sp in &stop.patterns {
                let pattern = &graph.patterns[sp.pattern_idx];
                let clock_time = departure_time + time;

                let first_boarding = seed_times
                    .get(key.as_str())
                    .is_some_and(|&seed| time >= seed - 1e-6);
                let wait_lookup = if first_boarding {
                    get_first_wait(
                        &pattern.departures,
                        pattern.stop_offsets[sp.stop_idx],
                        clock_time,
                    )
                } else {
                    get_expected_wait(
                        &pattern.departures,
                        pattern.stop_offsets[sp.stop_idx],
                        clock_time,
                    )
                };
                let (wait_seconds, trip_index) = match wait_lookup {
                    Some(r) => r,
                    None => continue,
                };

                let board_time = time + wait_seconds;
                let board_offset = pattern.stop_offsets[sp.stop_idx];

                // GTFS-RT: look up delay data for this trip (or recent trips as fallback)
                let trip_rt = if !rt_data.is_empty() && !pattern.trip_ids.is_empty() {
                    let mut found = None;
                    let start = trip_index.min(pattern.trip_ids.len().saturating_sub(1));
                    for ti in (start.saturating_sub(3)..=start).rev() {
                        if let Some(rt) = rt_data.get(&pattern.trip_ids[ti]) {
                            found = Some(rt);
                            break;
                        }
                    }
                    found
                } else {
                    None
                };

                let board_delay = trip_rt
                    .map(|rt| gtfs_rt::get_stop_delay(rt, sp.stop_idx) as f64)
                    .unwrap_or(0.0);

                // Use stop_indices to get destination stop keys
                for i in (sp.stop_idx + 1)..pattern.stop_indices.len() {
                    let dest_idx = pattern.stop_indices[i];
                    let dest_key = &graph.stops[dest_idx].key;
                    let mut travel_time = board_time + (pattern.stop_offsets[i] - board_offset);

                    // Apply real-time delay adjustment; clamped, and never
                    // earlier than the boarding itself.
                    if let Some(rt) = trip_rt {
                        let adjustment = (gtfs_rt::get_stop_delay(rt, i) as f64 - board_delay)
                            .clamp(RT_ADJUSTMENT_MIN, RT_ADJUSTMENT_MAX);
                        travel_time = (travel_time + adjustment).max(board_time);
                    }

                    let existing = best
                        .get(dest_key.as_str())
                        .copied()
                        .unwrap_or(f64::INFINITY);
                    if travel_time < existing {
                        best.insert(dest_key.clone(), travel_time);
                        preds.insert(
                            dest_key.clone(),
                            Predecessor {
                                from_key: key.clone(),
                                kind: PredKind::Transit,
                                pattern_idx: Some(sp.pattern_idx),
                                board_idx: Some(sp.stop_idx),
                                alight_idx: Some(i),
                            },
                        );
                        let ni = get_or_insert_node(dest_key, &mut node_keys, &mut key_to_node);
                        heap.push(travel_time, ni);
                    }
                }
            }

            // Transfer walks to nearby stops
            for ns in &stop.nearby_stop_indices {
                let nearby_key = &graph.stops[ns.idx].key;
                let walk_time = time + walk_seconds(ns.dist_km);
                let existing = best
                    .get(nearby_key.as_str())
                    .copied()
                    .unwrap_or(f64::INFINITY);
                if walk_time < existing {
                    best.insert(nearby_key.clone(), walk_time);
                    preds.insert(
                        nearby_key.clone(),
                        Predecessor {
                            from_key: key.clone(),
                            kind: PredKind::Walk,
                            pattern_idx: None,
                            board_idx: None,
                            alight_idx: None,
                        },
                    );
                    let ni = get_or_insert_node(nearby_key, &mut node_keys, &mut key_to_node);
                    heap.push(walk_time, ni);
                }
            }

            // Walk to nearby BAJS stations
            if use_bajs {
                if let Some(adj) = bajs_adj {
                    if let Some(links) = adj.stop_walk_links.get(key.as_str()) {
                        for link in links {
                            let walk_time = time + walk_seconds(link.dist_km);
                            let existing = best.get(&link.key).copied().unwrap_or(f64::INFINITY);
                            if walk_time < existing {
                                best.insert(link.key.clone(), walk_time);
                                preds.insert(
                                    link.key.clone(),
                                    Predecessor {
                                        from_key: key.clone(),
                                        kind: PredKind::Walk,
                                        pattern_idx: None,
                                        board_idx: None,
                                        alight_idx: None,
                                    },
                                );
                                let ni =
                                    get_or_insert_node(&link.key, &mut node_keys, &mut key_to_node);
                                heap.push(walk_time, ni);
                            }
                        }
                    }
                }
            }
        }

        if is_station {
            if let Some(adj) = bajs_adj {
                // Walk to nearby transit stops
                if let Some(links) = adj.station_walk_links.get(key.as_str()) {
                    for link in links {
                        let walk_time = time + walk_seconds(link.dist_km);
                        let existing = best.get(&link.key).copied().unwrap_or(f64::INFINITY);
                        if walk_time < existing {
                            best.insert(link.key.clone(), walk_time);
                            preds.insert(
                                link.key.clone(),
                                Predecessor {
                                    from_key: key.clone(),
                                    kind: PredKind::Walk,
                                    pattern_idx: None,
                                    board_idx: None,
                                    alight_idx: None,
                                },
                            );
                            let ni =
                                get_or_insert_node(&link.key, &mut node_keys, &mut key_to_node);
                            heap.push(walk_time, ni);
                        }
                    }
                }

                // Bike to other stations
                if let Some(links) = adj.station_bike_links.get(key.as_str()) {
                    for link in links {
                        let bike_time = time
                            + BAJS_PICKUP_SECONDS
                            + BAJS_DROPOFF_SECONDS
                            + (link.dist_km / BAJS_SPEED) * 3600.0;
                        let existing = best.get(&link.key).copied().unwrap_or(f64::INFINITY);
                        if bike_time < existing {
                            best.insert(link.key.clone(), bike_time);
                            preds.insert(
                                link.key.clone(),
                                Predecessor {
                                    from_key: key.clone(),
                                    kind: PredKind::Bike,
                                    pattern_idx: None,
                                    board_idx: None,
                                    alight_idx: None,
                                },
                            );
                            let ni =
                                get_or_insert_node(&link.key, &mut node_keys, &mut key_to_node);
                            heap.push(bike_time, ni);
                        }
                    }
                }
            }
        }
    }

    TravelTimeResult { times: best, preds }
}

// --- GeoJSON feature generation ---

/// Snap GTFS polyline vertices onto OSM walk-graph nodes.
fn snap_polyline_to_walk_graph(graph: &WalkGraph, line: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
    let mut out: Vec<[f64; 2]> = Vec::with_capacity(line.len());
    for [lon, lat] in line {
        let (plon, plat) = if let Some(n) = find_nearest_node(graph, lat, lon, TRANSIT_SNAP_MAX_KM2)
        {
            (graph.lon(n), graph.lat(n))
        } else {
            (lon, lat)
        };
        if !out
            .last()
            .is_some_and(|p: &[f64; 2]| p[0] == plon && p[1] == plat)
        {
            out.push([plon, plat]);
        }
    }
    if out.len() < 2 {
        vec![]
    } else {
        out
    }
}

fn round_coord(value: f64) -> f64 {
    (value * TRANSIT_COORD_SCALE).round() / TRANSIT_COORD_SCALE
}

fn quantize_transit_line(coords: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut quantized = Vec::new();
    let mut last_lon = f64::NAN;
    let mut last_lat = f64::NAN;

    for &[lon, lat] in coords {
        let q_lon = round_coord(lon);
        let q_lat = round_coord(lat);
        if q_lon == last_lon && q_lat == last_lat {
            continue;
        }
        quantized.push([q_lon, q_lat]);
        last_lon = q_lon;
        last_lat = q_lat;
    }

    if quantized.len() >= 2 {
        quantized
    } else {
        Vec::new()
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct GeoJsonFeature {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"Feature\"")]
    kind: &'static str,
    properties: FeatureProperties,
    geometry: FeatureGeometry,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct FeatureProperties {
    time: f64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct FeatureGeometry {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"MultiLineString\"")]
    kind: &'static str,
    coordinates: Vec<Vec<[f64; 2]>>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct WalkAreaFeature {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"Feature\"")]
    kind: &'static str,
    properties: FeatureProperties,
    geometry: WalkAreaGeometry,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct WalkAreaGeometry {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"MultiPolygon\"")]
    kind: &'static str,
    coordinates: Vec<Vec<Vec<[f64; 2]>>>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct WalkAreaResponse {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"FeatureCollection\"")]
    kind: &'static str,
    features: Vec<WalkAreaFeature>,
}

fn generate_transit_features(
    graph: &TransitGraphJson,
    travel_times: &HashMap<String, f64>,
    snapped_segments: &[Vec<Vec<[f64; 2]>>],
) -> Vec<GeoJsonFeature> {
    let mut buckets: HashMap<i64, Vec<Vec<[f64; 2]>>> = HashMap::new();

    for (pi, pattern) in graph.patterns.iter().enumerate() {
        if pattern.mode_enum == Mode::Rail {
            continue;
        }

        let segments = &snapped_segments[pi];
        let num_stops = pattern.stop_indices.len();
        if num_stops < 2 || segments.is_empty() {
            continue;
        }

        for (i, seg_coords) in segments.iter().enumerate().take(num_stops - 1) {
            let key1 = &graph.stops[pattern.stop_indices[i]].key;
            let key2 = &graph.stops[pattern.stop_indices[i + 1]].key;
            let t1 = match travel_times.get(key1.as_str()) {
                Some(&t) if t <= MAX_SECONDS => t,
                _ => continue,
            };
            let t2 = match travel_times.get(key2.as_str()) {
                Some(&t) if t <= MAX_SECONDS => t,
                _ => continue,
            };

            if seg_coords.len() < 2 {
                continue;
            }

            let time = t1.min(t2);
            let bucket = ((time / BUCKET_SECONDS).floor() * BUCKET_SECONDS) as i64;
            buckets.entry(bucket).or_default().push(seg_coords.clone());
        }
    }

    buckets
        .into_iter()
        .map(|(time, lines)| GeoJsonFeature {
            kind: "Feature",
            properties: FeatureProperties { time: time as f64 },
            geometry: FeatureGeometry {
                kind: "MultiLineString",
                coordinates: lines,
            },
        })
        .collect()
}

/// Trace the boundary of a set of grid cells into closed polygon rings.
/// Returns MultiPolygon coordinates: Vec<polygon>, each polygon = Vec<ring>,
/// each ring = Vec<[lon, lat]>.
fn trace_grid_boundary(cells: &HashSet<(i32, i32)>, cell_size: f64) -> Vec<Vec<Vec<[f64; 2]>>> {
    // Build directed boundary edges (oriented so inside is on the right → CCW exterior)
    let mut edge_map: HashMap<(i32, i32), Vec<(i32, i32)>> = HashMap::new();

    for &(cx, cy) in cells {
        if !cells.contains(&(cx - 1, cy)) {
            edge_map.entry((cx, cy)).or_default().push((cx, cy + 1));
        }
        if !cells.contains(&(cx + 1, cy)) {
            edge_map
                .entry((cx + 1, cy + 1))
                .or_default()
                .push((cx + 1, cy));
        }
        if !cells.contains(&(cx, cy - 1)) {
            edge_map.entry((cx + 1, cy)).or_default().push((cx, cy));
        }
        if !cells.contains(&(cx, cy + 1)) {
            edge_map
                .entry((cx, cy + 1))
                .or_default()
                .push((cx + 1, cy + 1));
        }
    }

    // Trace closed rings by following directed edges
    let mut visited: HashSet<((i32, i32), (i32, i32))> = HashSet::new();
    let mut rings: Vec<Vec<[f64; 2]>> = Vec::new();

    let corners: Vec<(i32, i32)> = edge_map.keys().cloned().collect();
    for start in corners {
        let dests = match edge_map.get(&start) {
            Some(d) => d,
            None => continue,
        };
        for &first_dest in dests {
            if visited.contains(&(start, first_dest)) {
                continue;
            }

            let mut ring: Vec<[f64; 2]> = Vec::new();
            let mut current = start;
            let mut next = first_dest;

            loop {
                visited.insert((current, next));
                ring.push([current.0 as f64 * cell_size, current.1 as f64 * cell_size]);

                let dir = (next.0 - current.0, next.1 - current.1);
                current = next;

                if current == start {
                    break;
                }

                let outgoing = match edge_map.get(&current) {
                    Some(o) => o,
                    None => break,
                };

                // Prefer right turns to stay on exterior boundary (CCW winding)
                let right = (current.0 + dir.1, current.1 - dir.0);
                let straight = (current.0 + dir.0, current.1 + dir.1);
                let left = (current.0 - dir.1, current.1 + dir.0);
                let back = (current.0 - dir.0, current.1 - dir.1);

                next = if outgoing.contains(&right) && !visited.contains(&(current, right)) {
                    right
                } else if outgoing.contains(&straight) && !visited.contains(&(current, straight)) {
                    straight
                } else if outgoing.contains(&left) && !visited.contains(&(current, left)) {
                    left
                } else if outgoing.contains(&back) && !visited.contains(&(current, back)) {
                    back
                } else {
                    break;
                };

                if ring.len() > 500_000 {
                    break;
                }
            }

            if ring.len() >= 3 {
                ring.push(ring[0]); // close the ring
                rings.push(ring);
            }
        }
    }

    // Each ring becomes a separate polygon; drop tiny fragments
    rings
        .into_iter()
        .filter(|ring| ring.len() >= 10)
        .map(|ring| vec![ring])
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn chaikin_smooth(
    ring: &[[f64; 2]],
    iterations: usize,
    grid: &[bool],
    ox: i32,
    oy: i32,
    w: usize,
    h: usize,
    cell_size: f64,
) -> Vec<[f64; 2]> {
    let mut current = ring.to_vec();
    for _ in 0..iterations {
        let n = current.len() - 1; // last == first (closed)
        if n < 2 {
            break;
        }
        let mut smoothed = Vec::with_capacity(n * 2 + 1);
        for i in 0..n {
            let p0 = current[i];
            let p1 = current[i + 1];
            smoothed.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
            smoothed.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
        }
        smoothed.push(smoothed[0]);
        current = smoothed;
    }
    // Clamp points outside the cell grid to the nearest cell edge
    let inv = 1.0 / cell_size;
    let w_i = w as i32;
    let h_i = h as i32;
    for pt in &mut current {
        let cx = pt[0] * inv;
        let cy = pt[1] * inv;
        let gx = cx.floor() as i32 - ox;
        let gy = cy.floor() as i32 - oy;
        if gx >= 0 && gx < w_i && gy >= 0 && gy < h_i && grid[gx as usize * h + gy as usize] {
            continue; // already inside a valid cell
        }
        let mut best_cx = 0.0_f64;
        let mut best_cy = 0.0_f64;
        let mut best_dist = f64::INFINITY;
        for ddx in -1..=1_i32 {
            for ddy in -1..=1_i32 {
                let nx = gx + ddx;
                let ny = gy + ddy;
                if nx >= 0 && nx < w_i && ny >= 0 && ny < h_i && grid[nx as usize * h + ny as usize]
                {
                    let abs_nx = (nx + ox) as f64;
                    let abs_ny = (ny + oy) as f64;
                    let clamped_x = cx.max(abs_nx).min(abs_nx + 1.0);
                    let clamped_y = cy.max(abs_ny).min(abs_ny + 1.0);
                    let d = (clamped_x - cx).powi(2) + (clamped_y - cy).powi(2);
                    if d < best_dist {
                        best_dist = d;
                        best_cx = clamped_x;
                        best_cy = clamped_y;
                    }
                }
            }
        }
        if best_dist < f64::INFINITY {
            pt[0] = best_cx * cell_size;
            pt[1] = best_cy * cell_size;
        }
    }
    current
}

#[allow(clippy::too_many_arguments)]
fn rasterize_edge_timed_grid(
    x0: i32,
    y0: i32,
    x1: i32,
    y1: i32,
    time0: f64,
    time1: f64,
    grid: &mut [f64],
    ox: i32,
    oy: i32,
    h: usize,
) {
    let dx = (x1 - x0).abs();
    let dy = (y1 - y0).abs();
    let total_steps = dx.max(dy);
    let inv_steps = if total_steps > 0 {
        1.0 / total_steps as f64
    } else {
        0.0
    };
    let sx = if x0 < x1 { 1 } else { -1 };
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx - dy;
    let mut x = x0;
    let mut y = y0;
    let mut step = 0;
    loop {
        let t = step as f64 * inv_steps;
        let time = time0 + (time1 - time0) * t;
        let idx = (x - ox) as usize * h + (y - oy) as usize;
        if time < grid[idx] {
            grid[idx] = time;
        }
        if x == x1 && y == y1 {
            break;
        }
        let e2 = 2 * err;
        if e2 > -dy {
            err -= dy;
            x += sx;
        }
        if e2 < dx {
            err += dx;
            y += sy;
        }
        step += 1;
    }
}

fn grid_dilate(src: &[bool], dst: &mut [bool], w: usize, h: usize) {
    dst.iter_mut().for_each(|b| *b = false);
    for x in 0..w {
        for y in 0..h {
            if src[x * h + y] {
                let x0 = if x > 0 { x - 1 } else { 0 };
                let y0 = if y > 0 { y - 1 } else { 0 };
                let x1 = (x + 1).min(w - 1);
                let y1 = (y + 1).min(h - 1);
                for nx in x0..=x1 {
                    for ny in y0..=y1 {
                        dst[nx * h + ny] = true;
                    }
                }
            }
        }
    }
}

fn grid_erode(src: &[bool], dst: &mut [bool], w: usize, h: usize) {
    dst.iter_mut().for_each(|b| *b = false);
    for x in 1..w.saturating_sub(1) {
        for y in 1..h.saturating_sub(1) {
            if !src[x * h + y] {
                continue;
            }
            let mut keep = true;
            'check: for nx in x - 1..=x + 1 {
                for ny in y - 1..=y + 1 {
                    if !src[nx * h + ny] {
                        keep = false;
                        break 'check;
                    }
                }
            }
            dst[x * h + y] = keep;
        }
    }
}

/// Generate isochrone polygons by rasterizing reached walk-graph edges onto a
/// grid, then morphological closing + boundary tracing + smoothing.
fn generate_walk_area(
    walk_graph: &WalkGraph,
    transit_times: &HashMap<String, f64>,
    stop_snaps: &[Option<StopSnap>],
    stops: &[transit_graph::StopNode],
    origin_lat: f64,
    origin_lon: f64,
) -> Vec<WalkAreaFeature> {
    let node_count = walk_graph.node_count as usize;
    let mut best = vec![f64::INFINITY; node_count];
    let mut heap = FlatHeap::new();

    if let Some(origin_node) = find_nearest_node(walk_graph, origin_lat, origin_lon, 0.25) {
        let olat = walk_graph.lat(origin_node);
        let olon = walk_graph.lon(origin_node);
        let walk_time = walk_seconds(fast_dist_km(origin_lat, origin_lon, olat, olon));
        if walk_time < MAX_SECONDS {
            best[origin_node as usize] = walk_time;
            heap.push(walk_time, origin_node);
        }
    }

    for (si, stop) in stops.iter().enumerate() {
        let time = match transit_times.get(stop.key.as_str()) {
            Some(&t) if t < MAX_SECONDS => t,
            _ => continue,
        };
        let snap = match &stop_snaps[si] {
            Some(s) => s,
            None => continue,
        };
        let total_time = time + snap.walk_seconds;
        if total_time < MAX_SECONDS && total_time < best[snap.node_idx as usize] {
            best[snap.node_idx as usize] = total_time;
            heap.push(total_time, snap.node_idx);
        }
    }

    let mut reached: Vec<u32> = Vec::with_capacity(32000);
    let coords = walk_graph.coords.as_slice();
    let offsets = walk_graph.offsets.as_slice();
    let edge_targets = walk_graph.edge_targets.as_slice();
    let edge_dist_cm = walk_graph.edge_dist_cm.as_slice();

    while !heap.is_empty() {
        let time = heap.peek_time();
        let node_idx = heap.peek_node();
        heap.pop();
        if time > best[node_idx as usize] {
            continue;
        }
        if time > MAX_SECONDS {
            break;
        }
        reached.push(node_idx);
        let es = offsets[node_idx as usize] as usize;
        let ee = offsets[node_idx as usize + 1] as usize;
        for e in es..ee {
            let to_idx = edge_targets[e];
            let arrival_time = time + edge_dist_cm[e] as f64 * CM_TO_SECONDS;
            if arrival_time < MAX_SECONDS && arrival_time < best[to_idx as usize] {
                best[to_idx as usize] = arrival_time;
                heap.push(arrival_time, to_idx);
            }
        }
    }

    // Rasterize all reached edges ONCE into a cell -> min_time map, then threshold per band.
    // This avoids re-rasterizing every edge for each of the 5 thresholds.
    let inv_cell = 1.0 / WALK_AREA_CELL_SIZE;
    let thresholds: &[(f64, f64)] = &[
        (300.0, 300.0 - THRESHOLD_BUFFER),
        (600.0, 600.0 - THRESHOLD_BUFFER),
        (900.0, 900.0 - THRESHOLD_BUFFER),
        (1200.0, 1200.0 - THRESHOLD_BUFFER),
        (1800.0, 1800.0 - THRESHOLD_BUFFER),
    ];
    let mut features = Vec::new();

    // Compute grid bounds from reached nodes (avoids HashMap entirely)
    let mut min_x = i32::MAX;
    let mut max_x = i32::MIN;
    let mut min_y = i32::MAX;
    let mut max_y = i32::MIN;
    for &node_idx in &reached {
        let ni2 = node_idx as usize * 2;
        let cx = (coords[ni2 + 1] * inv_cell).floor() as i32;
        let cy = (coords[ni2] * inv_cell).floor() as i32;
        min_x = min_x.min(cx);
        max_x = max_x.max(cx);
        min_y = min_y.min(cy);
        max_y = max_y.max(cy);
    }

    if !reached.is_empty() {
        let pad = 2_i32;
        let ox = min_x - pad;
        let oy = min_y - pad;
        let w = (max_x - ox + pad + 1) as usize;
        let h = (max_y - oy + pad + 1) as usize;
        let wh = w * h;

        // Rasterize directly into flat grid (no HashMap)
        let mut time_grid = vec![f64::INFINITY; wh];
        for &node_idx in &reached {
            let node_time = best[node_idx as usize];
            let ni2 = node_idx as usize * 2;
            let ax = (coords[ni2 + 1] * inv_cell).floor() as i32;
            let ay = (coords[ni2] * inv_cell).floor() as i32;

            let es = offsets[node_idx as usize] as usize;
            let ee = offsets[node_idx as usize + 1] as usize;
            for &to_idx in &edge_targets[es..ee] {
                if to_idx <= node_idx {
                    continue;
                }
                let to_time = best[to_idx as usize];
                if to_time == f64::INFINITY {
                    continue;
                }
                let ti2 = to_idx as usize * 2;
                let bx = (coords[ti2 + 1] * inv_cell).floor() as i32;
                let by = (coords[ti2] * inv_cell).floor() as i32;
                rasterize_edge_timed_grid(
                    ax,
                    ay,
                    bx,
                    by,
                    node_time,
                    to_time,
                    &mut time_grid,
                    ox,
                    oy,
                    h,
                );
            }
        }

        let mut buf_a = vec![false; wh];
        let mut buf_b = vec![false; wh];

        for &(nominal, effective) in thresholds {
            for i in 0..wh {
                buf_a[i] = time_grid[i] <= effective;
            }

            // 1 round of closing: fills city blocks without expanding too far
            grid_dilate(&buf_a, &mut buf_b, w, h);
            grid_erode(&buf_b, &mut buf_a, w, h);

            // Build HashSet for boundary tracing (trace_grid_boundary needs it)
            let mut cells: HashSet<(i32, i32)> = HashSet::new();
            for x in 0..w {
                for y in 0..h {
                    if buf_a[x * h + y] {
                        cells.insert((x as i32 + ox, y as i32 + oy));
                    }
                }
            }

            if cells.len() < 3 {
                continue;
            }

            let raw_polygons = trace_grid_boundary(&cells, WALK_AREA_CELL_SIZE);
            if raw_polygons.is_empty() {
                continue;
            }

            let smoothed: Vec<Vec<Vec<[f64; 2]>>> = raw_polygons
                .into_iter()
                .map(|polygon| {
                    polygon
                        .into_iter()
                        .map(|ring| {
                            chaikin_smooth(&ring, 3, &buf_a, ox, oy, w, h, WALK_AREA_CELL_SIZE)
                        })
                        .collect()
                })
                .collect();

            features.push(WalkAreaFeature {
                kind: "Feature",
                properties: FeatureProperties { time: nominal },
                geometry: WalkAreaGeometry {
                    kind: "MultiPolygon",
                    coordinates: smoothed,
                },
            });
        }
    }

    features
}

// --- Routing payload ---

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct RoutingPayload {
    nodes: Vec<RoutingNode>,
    patterns: Vec<RoutingPattern>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct RoutingNode {
    key: String,
    #[ts(type = "\"STOP\" | \"BAJS\"")]
    kind: String,
    lat: f64,
    lon: f64,
    name: String,
    time: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pred: Option<RoutingPred>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct RoutingPred {
    #[serde(rename = "fromKey")]
    #[ts(rename = "fromKey")]
    from_key: String,
    #[ts(type = "\"WALK\" | \"TRANSIT\" | \"BIKE\"")]
    kind: String,
    #[serde(rename = "patternIdx")]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(rename = "patternIdx", optional)]
    pattern_idx: Option<usize>,
    #[serde(rename = "boardIdx")]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(rename = "boardIdx", optional)]
    board_idx: Option<usize>,
    #[serde(rename = "alightIdx")]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(rename = "alightIdx", optional)]
    alight_idx: Option<usize>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct RoutingPattern {
    #[serde(rename = "stopKeys")]
    #[ts(rename = "stopKeys")]
    stop_keys: Vec<String>,
    mode: String,
    route: String,
}

fn build_routing_payload(
    graph: &TransitGraphJson,
    travel_times: &HashMap<String, f64>,
    preds: &HashMap<String, Predecessor>,
    bajs_adj: Option<&BajsAdjacency>,
    stop_key_to_idx: &HashMap<String, usize>,
) -> RoutingPayload {
    let mut used_patterns = std::collections::HashSet::new();
    for pred in preds.values() {
        if let PredKind::Transit = pred.kind {
            if let Some(pi) = pred.pattern_idx {
                used_patterns.insert(pi);
            }
        }
    }

    let mut pattern_map: HashMap<usize, usize> = HashMap::new();
    let mut routing_patterns = Vec::new();
    for &orig_idx in &used_patterns {
        let p = &graph.patterns[orig_idx];
        pattern_map.insert(orig_idx, routing_patterns.len());
        routing_patterns.push(RoutingPattern {
            stop_keys: p
                .stop_indices
                .iter()
                .map(|&si| graph.stops[si].key.clone())
                .collect(),
            mode: p.mode.clone(),
            route: p.route.clone(),
        });
    }

    let mut routing_nodes = Vec::new();
    for (key, &time) in travel_times {
        let (kind, lat, lon, name) = if let Some(&si) = stop_key_to_idx.get(key.as_str()) {
            let stop = &graph.stops[si];
            ("STOP", stop.lat, stop.lon, stop.name.clone())
        } else if let Some(adj) = bajs_adj {
            if let Some(station) = adj.stations_by_key.get(key.as_str()) {
                ("BAJS", station.lat, station.lon, station.name.clone())
            } else {
                continue;
            }
        } else {
            continue;
        };

        let pred = preds.get(key.as_str());
        let routing_pred = pred.map(|p| {
            let (kind_str, mapped_pi, bi, ai) = match p.kind {
                PredKind::Transit => {
                    let mapped = p.pattern_idx.and_then(|pi| pattern_map.get(&pi).copied());
                    ("TRANSIT".to_string(), mapped, p.board_idx, p.alight_idx)
                }
                PredKind::Walk => ("WALK".to_string(), None, None, None),
                PredKind::Bike => ("BIKE".to_string(), None, None, None),
            };
            RoutingPred {
                from_key: p.from_key.clone(),
                kind: kind_str,
                pattern_idx: mapped_pi,
                board_idx: bi,
                alight_idx: ai,
            }
        });

        routing_nodes.push(RoutingNode {
            key: key.clone(),
            kind: kind.to_string(),
            lat,
            lon,
            name,
            time: time.round(),
            pred: routing_pred,
        });
    }

    RoutingPayload {
        nodes: routing_nodes,
        patterns: routing_patterns,
    }
}

// --- Response types ---

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct IsochroneResponse {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"FeatureCollection\"")]
    kind: &'static str,
    features: Vec<GeoJsonFeature>,
    #[serde(rename = "walkArea")]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(rename = "walkArea", optional)]
    walk_area: Option<WalkAreaResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    routing: Option<RoutingPayload>,
    realtime: bool,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct RoutingOnlyResponse {
    routing: Option<RoutingPayload>,
    realtime: bool,
}

// --- Request params ---

#[derive(Deserialize)]
struct IsochroneParams {
    lat: f64,
    lon: f64,
    time: Option<String>,
    bajs: Option<String>,
    routing: Option<String>,
    /// `realtime=0` disables the live GTFS-RT overlay so the result is a pure
    /// function of the static schedule (used by the page-data generator).
    realtime: Option<String>,
}

// --- Handler ---

async fn handle_isochrone(
    State(state): State<Arc<AppState>>,
    Query(params): Query<IsochroneParams>,
) -> Response {
    let t0 = Instant::now();

    // Validate inputs
    if params.lat < -90.0 || params.lat > 90.0 || params.lon < -180.0 || params.lon > 180.0 {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"lat must be [-90,90], lon must be [-180,180]"}"#.to_string(),
        )
            .into_response();
    }

    let departure_time = if let Some(ref time_str) = params.time {
        let parts: Vec<&str> = time_str.split(':').collect();
        if parts.len() == 2 {
            let h: f64 = parts[0].parse().unwrap_or(8.0);
            let m: f64 = parts[1].parse().unwrap_or(0.0);
            h * 3600.0 + m * 60.0
        } else {
            8.0 * 3600.0
        }
    } else {
        // No explicit time: use the actual current Zagreb wall clock, so a
        // time-less request means "now" (it gets snapped to the same 5-minute
        // buckets as explicit times below). Clients should still send `time`
        // explicitly — a time-less URL is an ambiguous CDN cache key.
        let now = unix_now();
        ((now + zagreb_offset(now)) % 86400) as f64
    };

    // Snap coordinates to 3 decimal places (~100m) for Cloudflare cache hits
    let lat = (params.lat * 1000.0).round() / 1000.0;
    let lon = (params.lon * 1000.0).round() / 1000.0;

    // Snap departure time to 5-minute intervals for better cache hits
    let departure_time = (departure_time / 300.0).round() * 300.0;

    let use_bajs = params.bajs.as_deref() == Some("1");
    let routing_mode = params.routing.as_deref().unwrap_or("full");

    // Schedule-only mode: skip the live GTFS-RT overlay so reach is a pure
    // function of the static feed. The page-data generator requests this so
    // committed reach values are deterministic run-to-run (not perturbed by
    // whatever delays happen to be live at generation time).
    let rt_disabled = params.realtime.as_deref() == Some("0");

    // 1. Compute travel times
    let rt_data = state.rt_store.read().unwrap();
    let empty_rt: HashMap<String, gtfs_rt::TripRT> = HashMap::new();
    let rt_view = if rt_disabled { &empty_rt } else { &*rt_data };
    let result = compute_travel_times(
        &state.transit_graph,
        lat,
        lon,
        departure_time,
        use_bajs,
        state.bajs_adjacency.as_ref(),
        rt_view,
        &state.walk_graph,
        &state.stop_snaps,
        &state.stop_key_to_idx,
    );
    let has_realtime = !rt_disabled && !rt_data.is_empty();
    drop(rt_data);
    let t_state = Instant::now();

    // 2. Generate features
    let mut features = Vec::new();
    let mut walk_area_features = Vec::new();
    let t_walk;

    if routing_mode != "only" {
        let transit_features =
            generate_transit_features(&state.transit_graph, &result.times, &state.snapped_segments);
        walk_area_features = generate_walk_area(
            &state.walk_graph,
            &result.times,
            &state.stop_snaps,
            &state.transit_graph.stops,
            lat,
            lon,
        );
        features.extend(transit_features);
        t_walk = Instant::now();
    } else {
        t_walk = Instant::now();
    }

    // 3. Build routing payload
    let routing = if routing_mode != "0" {
        Some(build_routing_payload(
            &state.transit_graph,
            &result.times,
            &result.preds,
            state.bajs_adjacency.as_ref(),
            &state.stop_key_to_idx,
        ))
    } else {
        None
    };
    let t_payload = Instant::now();

    let walk_area = if !walk_area_features.is_empty() {
        Some(WalkAreaResponse {
            kind: "FeatureCollection",
            features: walk_area_features,
        })
    } else {
        None
    };

    let json = if routing_mode == "only" {
        serde_json::to_string(&RoutingOnlyResponse {
            routing,
            realtime: has_realtime,
        })
        .unwrap()
    } else {
        let response = IsochroneResponse {
            kind: "FeatureCollection",
            features,
            walk_area,
            routing,
            realtime: has_realtime,
        };
        serde_json::to_string(&response).unwrap()
    };
    let t_serial = Instant::now();

    let state_ms = t_state.duration_since(t0).as_millis();
    let walk_ms = t_walk.duration_since(t_state).as_millis();
    let payload_ms = t_payload.duration_since(t_walk).as_millis();
    let serial_ms = t_serial.duration_since(t_payload).as_millis();
    let total_ms = t_serial.duration_since(t0).as_millis();

    let timing = format!(
        "state;dur={}, walk;dur={}, payload;dur={}, serial;dur={}, total;dur={}",
        state_ms, walk_ms, payload_ms, serial_ms, total_ms
    );

    let mut response = (
        [
            (header::CONTENT_TYPE, "application/json"),
            (
                header::CACHE_CONTROL,
                "public, max-age=300, stale-while-revalidate=600",
            ),
        ],
        json,
    )
        .into_response();
    response.headers_mut().insert(
        header::HeaderName::from_static("server-timing"),
        header::HeaderValue::from_str(&timing).unwrap(),
    );
    response
}

async fn handle_health(State(state): State<Arc<AppState>>) -> Response {
    let health = gtfs_rt::get_rt_health(&state.rt_store, &state.rt_last_refresh);
    let stale = match health.stale_sec {
        Some(sec) => sec.to_string(),
        None => "null".to_string(),
    };
    let runway = match state.feed_runway_days {
        Some(d) => d.to_string(),
        None => "null".to_string(),
    };
    let body = format!(
        r#"{{"status":"ok","gtfsRt":{{"tripCount":{},"staleSec":{}}},"feed":{{"serviceDate":"{}","fallback":{},"runwayDays":{}}}}}"#,
        health.trip_count, stale, state.feed_service_date, state.feed_fallback, runway
    );
    ([(header::CONTENT_TYPE, "application/json")], body).into_response()
}

// --- RT helpers ---

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Zagreb timezone offset in seconds: CET (UTC+1) or CEST (UTC+2).
/// EU DST: last Sunday of March 01:00 UTC → +2, last Sunday of October 01:00 UTC → +1.
fn zagreb_offset(epoch: i64) -> i64 {
    let days = epoch / 86400;
    let (_y, m, d) = days_to_ymd(days as u64);
    // Day of week: 0=Thu for 1970-01-01, so (days+4)%7: 0=Sun
    let dow = ((days + 4) % 7) as u64;
    // Last Sunday of a month: start from day 31 (or 30/28), walk back to Sunday
    let last_sunday = |month_days: u64, first_dow_of_month: u64| -> u64 {
        let last_day_dow = (first_dow_of_month + month_days - 1) % 7;
        month_days - ((last_day_dow + 7) % 7)
    };
    // Day of week of the 1st of current month
    let first_dow = (dow + 700 - ((d - 1) % 7)) % 7;
    let march_days = 31u64;
    let october_days = 31u64;
    let time_of_day = epoch % 86400;

    let is_summer = match m {
        1..=2 => false,
        4..=9 => true,
        3 => {
            let switch_day = last_sunday(march_days, first_dow);
            d > switch_day || (d == switch_day && time_of_day >= 3600)
        }
        10 => {
            let switch_day = last_sunday(october_days, first_dow);
            d < switch_day || (d == switch_day && time_of_day < 3600)
        }
        _ => false, // Nov-Dec
    };
    if is_summer {
        7200
    } else {
        3600
    }
}

fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    let mut y = 1970u64;
    let mut rem = days;
    loop {
        let yd = if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
            366
        } else {
            365
        };
        if rem < yd {
            break;
        }
        rem -= yd;
        y += 1;
    }
    let leap = y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400));
    let mdays = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut m = 1u64;
    for &md in &mdays {
        if rem < md {
            break;
        }
        rem -= md;
        m += 1;
    }
    (y, m, rem + 1)
}

#[allow(clippy::result_large_err)]
fn require_db(state: &AppState) -> Result<&tokio::sync::Mutex<rusqlite::Connection>, Response> {
    state.rt_db_reader.as_ref().ok_or_else(|| {
        (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"RT database not available"}"#.to_string(),
        )
            .into_response()
    })
}

// --- RT history API handlers ---

#[derive(Deserialize)]
struct RtHistoryParams {
    route: String,
    from: Option<i64>,
    to: Option<i64>,
}

async fn handle_rt_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RtHistoryParams>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let now = unix_now();
    let to = params.to.unwrap_or(now);
    let from = params.from.unwrap_or(to - 86400); // default: last 24h

    let conn = db.lock().await;
    let result = rt_store::query_history(&conn, &params.route, from, to);
    drop(conn);

    match result {
        Ok(resp) => (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=60"),
            ],
            serde_json::to_string(&resp).unwrap(),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct RtStopsParams {
    route: String,
    ts: i64,
}

async fn handle_rt_stops(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RtStopsParams>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let conn = db.lock().await;
    let result = rt_store::query_stops(&conn, &params.route, params.ts);
    drop(conn);

    match result {
        Ok(resp) => (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=300"),
            ],
            serde_json::to_string(&resp).unwrap(),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct RtAlertsParams {
    from: Option<i64>,
    to: Option<i64>,
}

async fn handle_rt_alerts(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RtAlertsParams>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let now = unix_now();
    let to = params.to.unwrap_or(now);
    let from = params.from.unwrap_or(to - 7 * 86400); // default: last 7 days

    let conn = db.lock().await;
    let result = rt_store::query_alerts(&conn, from, to);
    drop(conn);

    match result {
        Ok(resp) => (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=60"),
            ],
            serde_json::to_string(&resp).unwrap(),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

// --- Fleet deployment (feature 2.3) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FleetRouteDeployment {
    route_id: String,
    mode: String,
    scheduled_trips: usize,
    active_trips: usize,
    deployment_pct: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FleetDeploymentResponse {
    routes: Vec<FleetRouteDeployment>,
    total_scheduled: usize,
    total_active: usize,
    total_deployment_pct: f64,
}

async fn handle_fleet_deployment(State(state): State<Arc<AppState>>) -> Response {
    // Get current time-of-day in seconds since midnight (Zagreb = UTC+1, or UTC+2 in summer)
    let now_epoch = unix_now();
    let now_seconds = ((now_epoch + zagreb_offset(now_epoch)) % 86400) as f64;

    // Collect active trip IDs from RT store — clone keys and drop lock immediately
    let rt_trip_ids: HashSet<String> = {
        let rt_data = state.rt_store.read().unwrap();
        rt_data.keys().cloned().collect()
    };

    // For each pattern, determine scheduled trips and active trips
    let mut route_scheduled: HashMap<String, usize> = HashMap::new();
    let mut route_active: HashMap<String, usize> = HashMap::new();
    let mut route_mode: HashMap<String, String> = HashMap::new();

    for pattern in &state.transit_graph.patterns {
        let route_id = &pattern.route;
        let mode = &pattern.mode;
        route_mode
            .entry(route_id.clone())
            .or_insert_with(|| mode.clone());

        let last_offset = pattern.stop_offsets.last().copied().unwrap_or(0.0);

        for (di, dep) in pattern.departures.iter().enumerate() {
            let trip_start = dep + pattern.stop_offsets[0];
            let trip_end = dep + last_offset;

            if trip_start <= now_seconds && now_seconds <= trip_end {
                *route_scheduled.entry(route_id.clone()).or_insert(0) += 1;

                // Check if this trip has RT data
                if di < pattern.trip_ids.len() && rt_trip_ids.contains(&pattern.trip_ids[di]) {
                    *route_active.entry(route_id.clone()).or_insert(0) += 1;
                }
            }
        }
    }

    let mut routes: Vec<FleetRouteDeployment> = Vec::new();
    let mut total_scheduled = 0usize;
    let mut total_active = 0usize;

    for (route_id, scheduled) in &route_scheduled {
        let active = route_active.get(route_id).copied().unwrap_or(0);
        let pct = if *scheduled > 0 {
            (active as f64 / *scheduled as f64) * 100.0
        } else {
            0.0
        };
        total_scheduled += scheduled;
        total_active += active;
        routes.push(FleetRouteDeployment {
            route_id: route_id.clone(),
            mode: route_mode.get(route_id).cloned().unwrap_or_default(),
            scheduled_trips: *scheduled,
            active_trips: active,
            deployment_pct: (pct * 10.0).round() / 10.0,
        });
    }

    routes.sort_by(|a, b| {
        a.deployment_pct
            .partial_cmp(&b.deployment_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let total_deployment_pct = if total_scheduled > 0 {
        let pct = (total_active as f64 / total_scheduled as f64) * 100.0;
        (pct * 10.0).round() / 10.0
    } else {
        0.0
    };

    let resp = FleetDeploymentResponse {
        routes,
        total_scheduled,
        total_active,
        total_deployment_pct,
    };

    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=15"),
        ],
        serde_json::to_string(&resp).unwrap(),
    )
        .into_response()
}

// --- Alert stats (feature 2.5) ---

#[derive(Deserialize)]
struct AlertStatsParams {
    from: Option<i64>,
    to: Option<i64>,
}

async fn handle_alert_stats(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AlertStatsParams>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let now = unix_now();
    let to = params.to.unwrap_or(now);
    let from = params.from.unwrap_or(to - 30 * 86400); // default: last 30 days

    let conn = db.lock().await;
    let result = rt_store::query_alert_stats(&conn, from, to);
    drop(conn);

    match result {
        Ok(resp) => (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=60"),
            ],
            serde_json::to_string(&resp).unwrap(),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

// --- Delay profile (feature 2.9) ---

#[derive(Deserialize)]
struct DelayProfileParams {
    route: String,
    from: Option<i64>,
    to: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DelayProfileApiPoint {
    seq: i32,
    stop_name: String,
    avg_delay: f64,
    p90_delay: i32,
    samples: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DelayProfileApiResponse {
    route: String,
    points: Vec<DelayProfileApiPoint>,
}

async fn handle_delay_profile(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DelayProfileParams>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let now = unix_now();
    let to = params.to.unwrap_or(now);
    let from = params.from.unwrap_or(to - 86400); // default: last 24h

    let conn = db.lock().await;
    let result = rt_store::query_delay_profile(&conn, &params.route, from, to);
    drop(conn);

    match result {
        Ok(raw_points) => {
            // Build stop_sequence → stop_name mapping from transit graph patterns
            let mut seq_to_name: HashMap<i32, String> = HashMap::new();
            for pattern in &state.transit_graph.patterns {
                if pattern.route == params.route {
                    for (i, &stop_idx) in pattern.stop_indices.iter().enumerate() {
                        let seq = (i + 1) as i32; // 1-based stop_sequence
                        seq_to_name.entry(seq).or_insert_with(|| {
                            state
                                .transit_graph
                                .stops
                                .get(stop_idx)
                                .map(|s| s.name.clone())
                                .unwrap_or_default()
                        });
                    }
                    break; // Use first matching pattern
                }
            }

            let points: Vec<DelayProfileApiPoint> = raw_points
                .into_iter()
                .map(|p| {
                    let stop_name = seq_to_name
                        .get(&p.seq)
                        .cloned()
                        .unwrap_or_else(|| format!("Stop {}", p.seq));
                    DelayProfileApiPoint {
                        seq: p.seq,
                        stop_name,
                        avg_delay: (p.avg_delay * 10.0).round() / 10.0,
                        p90_delay: p.p90_delay,
                        samples: p.samples,
                    }
                })
                .collect();

            let resp = DelayProfileApiResponse {
                route: params.route,
                points,
            };
            (
                [
                    (header::CONTENT_TYPE, "application/json"),
                    (header::CACHE_CONTROL, "public, max-age=60"),
                ],
                serde_json::to_string(&resp).unwrap(),
            )
                .into_response()
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

async fn handle_rt_summary(State(state): State<Arc<AppState>>) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let conn = db.lock().await;
    let result = rt_store::query_summary(&conn);
    drop(conn);

    match result {
        Ok(resp) => (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=30"),
            ],
            serde_json::to_string(&resp).unwrap(),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

// --- Route health overview (insights endpoint) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteHealthEntry {
    route_id: String,
    mode: String,
    avg_delay: f64,
    on_time_pct: f64,
    headway_cv: Option<f64>,
    headway_sec: Option<f64>,
    scheduled_speed_kmh: Option<f64>,
    severity_score: f64,
    label: String,
    samples: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteHealthResponse {
    generated_at: i64,
    routes: Vec<RouteHealthEntry>,
}

async fn handle_route_health(State(state): State<Arc<AppState>>) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let now = unix_now();
    let from = now - 86400;

    let conn = db.lock().await;
    let health_rows = match rt_store::query_route_health(&conn, from, now) {
        Ok(rows) => rows,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "application/json")],
                format!(r#"{{"error":"{}"}}"#, e),
            )
                .into_response();
        }
    };
    drop(conn);

    let mut routes: Vec<RouteHealthEntry> = Vec::new();
    for row in health_rows {
        let mode = state
            .route_mode_map
            .get(&row.route_id)
            .cloned()
            .unwrap_or_default();
        let scheduled_speed = state.scheduled_speeds.get(&row.route_id).copied();

        // Severity score: 0-100, higher = worse
        let mut score: f64 = 0.0;
        // On-time penalty: 0% → +40, 80% → +8, 100% → 0
        score += (1.0 - row.on_time_pct) * 40.0;
        // Headway CV penalty: CV>0.3 starts adding, CV 1.0 → +30
        if let Some(cv) = row.headway_cv {
            score += ((cv - 0.3).max(0.0) / 0.7) * 30.0;
        }
        // Delay penalty: every 60s of avg delay → +10 (capped at 30)
        score += (row.avg_delay.max(0.0) / 60.0).min(3.0) * 10.0;
        score = score.clamp(0.0, 100.0);

        let label = if score < 20.0 {
            "stable"
        } else if score < 45.0 {
            "moderate"
        } else if score < 70.0 {
            "unreliable"
        } else {
            "critical"
        };

        routes.push(RouteHealthEntry {
            route_id: row.route_id,
            mode,
            avg_delay: (row.avg_delay * 10.0).round() / 10.0,
            on_time_pct: (row.on_time_pct * 1000.0).round() / 1000.0,
            headway_cv: row.headway_cv.map(|v| (v * 100.0).round() / 100.0),
            headway_sec: row.headway_sec.map(|v| v.round()),
            scheduled_speed_kmh: scheduled_speed,
            severity_score: (score * 10.0).round() / 10.0,
            label: label.to_string(),
            samples: row.samples,
        });
    }

    // Sort by severity (worst first)
    routes.sort_by(|a, b| {
        b.severity_score
            .partial_cmp(&a.severity_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let resp = RouteHealthResponse {
        generated_at: now,
        routes,
    };

    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=60"),
        ],
        serde_json::to_string(&resp).unwrap(),
    )
        .into_response()
}

// --- BAJS utilization (feature 2.8) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BajsStationBrief {
    name: String,
    station_id: String,
    capacity: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BajsUtilizationResponse {
    total_stations: usize,
    active_stations: usize,
    total_capacity: i32,
    total_bikes_available: i32,
    total_docks_available: i32,
    bikes_in_use: i32,
    utilization_pct: f64,
    known_fleet: i32,
    empty_stations: Vec<BajsStationBrief>,
    full_stations: Vec<BajsStationBrief>,
}

async fn handle_bajs_utilization(State(state): State<Arc<AppState>>) -> Response {
    let statuses = state.bajs_status_store.read().unwrap().clone();
    if statuses.is_empty() {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"BAJS status not yet available"}"#.to_string(),
        )
            .into_response();
    }

    // Build station_id → info lookup from transit graph
    let info_map: HashMap<&str, &crate::bajs::BajsStation> = state
        .transit_graph
        .bajs_stations
        .iter()
        .map(|s| (s.station_id.as_str(), s))
        .collect();

    let total_stations = statuses.len();
    let active: Vec<_> = statuses
        .iter()
        .filter(|s| s.is_installed && s.is_renting)
        .collect();

    let active_stations = active.len();
    let mut total_capacity = 0i32;
    let mut total_bikes = 0i32;
    let mut total_docks = 0i32;
    let mut empty = Vec::new();
    let mut full = Vec::new();

    for s in &active {
        let cap = info_map
            .get(s.station_id.as_str())
            .map(|i| i.capacity)
            .unwrap_or(s.num_bikes_available + s.num_docks_available);
        let name = info_map
            .get(s.station_id.as_str())
            .map(|i| i.name.clone())
            .unwrap_or_else(|| s.station_id.clone());

        total_capacity += cap;
        total_bikes += s.num_bikes_available;
        total_docks += s.num_docks_available;

        if s.num_bikes_available == 0 {
            empty.push(BajsStationBrief {
                name,
                station_id: s.station_id.clone(),
                capacity: cap,
            });
        } else if s.num_docks_available == 0 {
            full.push(BajsStationBrief {
                name,
                station_id: s.station_id.clone(),
                capacity: cap,
            });
        }
    }

    // bikes_in_use = rolling 24h peak minus current total (from this snapshot).
    let peak = state
        .bajs_fleet
        .peak_station_bikes
        .load(std::sync::atomic::Ordering::Relaxed);
    let bikes_in_use = if peak > 0 {
        (peak - total_bikes).max(0)
    } else {
        0
    };
    let utilization_denom = if peak > 0 {
        peak
    } else {
        total_capacity.max(1)
    };
    let utilization_pct = (bikes_in_use as f64 / utilization_denom as f64 * 1000.0).round() / 10.0;

    let resp = BajsUtilizationResponse {
        total_stations,
        active_stations,
        total_capacity,
        total_bikes_available: total_bikes,
        total_docks_available: total_docks,
        bikes_in_use,
        utilization_pct,
        known_fleet: peak,
        empty_stations: empty,
        full_stations: full,
    };

    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=30"),
        ],
        serde_json::to_string(&resp).unwrap(),
    )
        .into_response()
}

// --- BAJS usage history ---

#[derive(Deserialize)]
struct BajsUsageParams {
    from: Option<i64>,
    to: Option<i64>,
}

async fn handle_bajs_usage_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BajsUsageParams>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(resp) => return resp,
    };

    let now = unix_now();
    let to = params.to.unwrap_or(now);
    let from = params.from.unwrap_or(to - 86400);

    let conn = db.lock().await;
    let result = rt_store::query_bajs_usage(&conn, from, to);
    drop(conn);

    match result {
        Ok(points) => (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "public, max-age=60"),
            ],
            serde_json::to_string(&points).unwrap(),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

// --- BAJS status polling ---

struct BajsTaskConfig {
    store: BajsStatusStore,
    fleet: Arc<BajsFleetState>,
    db_conn: Option<std::sync::Mutex<rusqlite::Connection>>,
}

fn spawn_bajs_status_task(config: BajsTaskConfig) {
    tokio::spawn(async move {
        loop {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();

            let status_result = tokio::task::spawn_blocking(otp::fetch_station_status).await;

            if let Ok(Some(statuses)) = status_result {
                let count = statuses.len();

                let total_at_stations: i32 = statuses
                    .iter()
                    .filter(|s| s.is_installed && s.is_renting)
                    .map(|s| s.num_bikes_available)
                    .sum();

                *config.store.write().unwrap() = statuses;

                // Query rolling 24h peak + write snapshot in a single lock.
                let peak = if let Some(ref db) = config.db_conn {
                    if let Ok(conn) = db.lock() {
                        let cutoff = now as i64 - 86400;
                        let peak = rt_store::query_bajs_peak_available(&conn, cutoff)
                            .unwrap_or(total_at_stations)
                            .max(total_at_stations);
                        let ts = (now / 60) * 60;
                        let bikes_in_use = (peak - total_at_stations).max(0);
                        let _ = conn.execute(
                            "INSERT OR REPLACE INTO bajs_usage (ts, bikes_in_use, available, known_fleet) VALUES (?1, ?2, ?3, ?4)",
                            rusqlite::params![ts as i64, bikes_in_use, total_at_stations, peak],
                        );
                        peak
                    } else {
                        total_at_stations
                    }
                } else {
                    total_at_stations
                };

                config
                    .fleet
                    .peak_station_bikes
                    .store(peak, std::sync::atomic::Ordering::Relaxed);

                let bikes_in_use = (peak - total_at_stations).max(0);
                eprintln!(
                    "BAJS status: {} stations, {} bikes at stations, ~{} in use (peak {})",
                    count, total_at_stations, bikes_in_use, peak
                );
            }

            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

// --- Load scheduled speeds from route-stats.json ---

fn load_scheduled_speeds(path: &Path) -> HashMap<String, f64> {
    #[derive(Deserialize)]
    struct RouteStatsFile {
        routes: Vec<RouteStatsEntry>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RouteStatsEntry {
        name: String,
        commercial_speed_kmh: f64,
    }

    let data = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!(
                "Warning: could not read route-stats.json ({}): {}",
                path.display(),
                e
            );
            return HashMap::new();
        }
    };
    let parsed: RouteStatsFile = match serde_json::from_str(&data) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Warning: could not parse route-stats.json: {}", e);
            return HashMap::new();
        }
    };
    parsed
        .routes
        .into_iter()
        .map(|r| (r.name, r.commercial_speed_kmh))
        .collect()
}

// --- Speed comparison (feature 2.2) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeedRouteComparison {
    route_id: String,
    mode: String,
    scheduled_speed_kmh: f64,
    actual_speed_kmh: Option<f64>,
    speed_ratio: Option<f64>,
    sample_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeedComparisonResponse {
    routes: Vec<SpeedRouteComparison>,
    has_data: bool,
}

async fn handle_speed_comparison(State(state): State<Arc<AppState>>) -> Response {
    // Aggregate vehicle speeds by route from live store
    let vehicle_data = state.vehicle_store.read().unwrap().clone();
    let mut route_speeds: HashMap<String, Vec<f32>> = HashMap::new();

    for v in vehicle_data.values() {
        if let Some(speed) = v.speed_mps {
            if speed >= 0.0 {
                route_speeds
                    .entry(v.route_id.clone())
                    .or_default()
                    .push(speed);
            }
        }
    }

    let has_data = !route_speeds.is_empty();

    // Build comparison for all routes that have scheduled speed
    let mut routes: Vec<SpeedRouteComparison> = state
        .scheduled_speeds
        .iter()
        .map(|(route_name, &sched_speed)| {
            let speeds = route_speeds.get(route_name);
            let (actual, ratio, count) = match speeds {
                Some(s) if !s.is_empty() => {
                    let avg_mps = s.iter().sum::<f32>() / s.len() as f32;
                    let avg_kmh = (avg_mps as f64) * 3.6;
                    let avg_kmh_rounded = (avg_kmh * 10.0).round() / 10.0;
                    let ratio = if sched_speed > 0.0 {
                        Some((avg_kmh_rounded / sched_speed * 100.0).round() / 100.0)
                    } else {
                        None
                    };
                    (Some(avg_kmh_rounded), ratio, s.len())
                }
                _ => (None, None, 0),
            };
            SpeedRouteComparison {
                route_id: route_name.clone(),
                mode: state
                    .route_mode_map
                    .get(route_name)
                    .cloned()
                    .unwrap_or_default(),
                scheduled_speed_kmh: sched_speed,
                actual_speed_kmh: actual,
                speed_ratio: ratio,
                sample_count: count,
            }
        })
        .collect();

    routes.sort_by(|a, b| {
        a.route_id
            .parse::<i32>()
            .unwrap_or(999)
            .cmp(&b.route_id.parse::<i32>().unwrap_or(999))
    });

    let resp = SpeedComparisonResponse { routes, has_data };
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=15"),
        ],
        serde_json::to_string(&resp).unwrap(),
    )
        .into_response()
}

// --- Occupancy (feature 2.4) ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OccupancyRouteHour {
    hour: i32,
    empty: i64,
    few_seats: i64,
    standing: i64,
    full: i64,
    total: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OccupancyRoute {
    route_id: String,
    mode: String,
    hours: Vec<OccupancyRouteHour>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OccupancyResponse {
    has_data: bool,
    routes: Vec<OccupancyRoute>,
}

#[derive(Deserialize)]
struct OccupancyParams {
    from: Option<i64>,
    to: Option<i64>,
}

async fn handle_occupancy(
    State(state): State<Arc<AppState>>,
    Query(params): Query<OccupancyParams>,
) -> Response {
    // First check live data for any occupancy info
    let has_live = {
        let vehicles = state.vehicle_store.read().unwrap();
        vehicles
            .values()
            .any(|v| v.occupancy_status.is_some() && v.occupancy_status != Some(0))
    };

    let db = match require_db(&state) {
        Ok(db) => db,
        Err(_) => {
            // No DB — return hasData: false (occupancy needs historical data)
            let resp = OccupancyResponse {
                has_data: false,
                routes: vec![],
            };
            return (
                [
                    (header::CONTENT_TYPE, "application/json"),
                    (header::CACHE_CONTROL, "public, max-age=60"),
                ],
                serde_json::to_string(&resp).unwrap(),
            )
                .into_response();
        }
    };

    let now = unix_now();
    let to = params.to.unwrap_or(now);
    let from = params.from.unwrap_or(to - 86400);

    let conn = db.lock().await;
    let has_historical = rt_store::has_occupancy_data(&conn).unwrap_or(false);
    let tz_offset = zagreb_offset(now);
    let buckets = rt_store::query_occupancy(&conn, from, to, tz_offset).unwrap_or_default();
    drop(conn);

    let has_data = has_live || has_historical;

    // Group buckets into routes → hours
    let mut route_hours: HashMap<String, HashMap<i32, OccupancyRouteHour>> = HashMap::new();
    for b in &buckets {
        let hour_entry = route_hours
            .entry(b.route_id.clone())
            .or_default()
            .entry(b.hour)
            .or_insert_with(|| OccupancyRouteHour {
                hour: b.hour,
                empty: 0,
                few_seats: 0,
                standing: 0,
                full: 0,
                total: 0,
            });
        // GTFS-RT OccupancyStatus: 0=EMPTY, 1=MANY_SEATS, 2=FEW_SEATS,
        // 3=STANDING_ROOM_ONLY, 4=CRUSHED_STANDING, 5=FULL
        match b.level {
            0 | 1 => hour_entry.empty += b.count,
            2 => hour_entry.few_seats += b.count,
            3 | 4 => hour_entry.standing += b.count,
            5 => hour_entry.full += b.count,
            _ => {}
        }
        hour_entry.total += b.count;
    }

    let mut routes: Vec<OccupancyRoute> = route_hours
        .into_iter()
        .map(|(route_id, hours_map)| {
            let mut hours: Vec<OccupancyRouteHour> = hours_map.into_values().collect();
            hours.sort_by_key(|h| h.hour);
            OccupancyRoute {
                mode: state
                    .route_mode_map
                    .get(&route_id)
                    .cloned()
                    .unwrap_or_default(),
                route_id,
                hours,
            }
        })
        .collect();
    routes.sort_by(|a, b| {
        a.route_id
            .parse::<i32>()
            .unwrap_or(999)
            .cmp(&b.route_id.parse::<i32>().unwrap_or(999))
    });

    let resp = OccupancyResponse { has_data, routes };
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=60"),
        ],
        serde_json::to_string(&resp).unwrap(),
    )
        .into_response()
}

/// Last service date of the loaded feed, as a Unix epoch (seconds), from OTP's
/// `serviceTimeRange`. Used to compute how many days of schedule remain before
/// isochrones would go walk-only. Returns None on any error — runway is a
/// best-effort signal, never a startup blocker.
fn fetch_feed_end_epoch(otp_url: &str) -> Option<i64> {
    let body = serde_json::json!({ "query": "{ serviceTimeRange { end } }" });
    let resp: serde_json::Value = ureq::post(&format!("{}/otp/gtfs/v1", otp_url))
        .header("Content-Type", "application/json")
        .send_json(&body)
        .ok()?
        .body_mut()
        .read_json()
        .ok()?;
    resp.get("data")?
        .get("serviceTimeRange")?
        .get("end")?
        .as_i64()
}

#[tokio::main]
async fn main() {
    let otp_url = std::env::var("OTP_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse()
        .unwrap_or(3001);

    // Service day (CET/CEST) for OTP departure filtering. Normally today, but
    // if the loaded GTFS feed has lapsed — today is past its last service date,
    // or the GTFS refresh lagged — OTP returns zero departures and every
    // isochrone silently collapses to a walk-only blob (the reach area reads
    // "wildly less than it should be"). Guard against that by stepping back one
    // week at a time (same weekday → same service level) until we hit a day
    // with real scheduled service.
    let today_days = {
        let now = unix_now();
        ((now + zagreb_offset(now)) as u64) / 86400
    };
    let t0 = Instant::now();
    let mut transit_graph;
    let mut svc_days = today_days;
    loop {
        let (y, m, d) = days_to_ymd(svc_days);
        let date = format!("{:04}-{:02}-{:02}", y, m, d);
        println!(
            "Loading transit graph from OTP at {} for {}...",
            otp_url, date
        );
        transit_graph = otp::fetch_and_build_graph(&otp_url, Some(&date));
        let departures: usize = transit_graph
            .patterns
            .iter()
            .map(|p| p.departures.len())
            .sum();
        if departures > 0 {
            if svc_days != today_days {
                println!(
                    "  today has no scheduled service — fell back to {} ({} departures). Refresh the GTFS feed.",
                    date, departures
                );
            }
            break;
        }
        // Cap the walk-back so a genuinely empty feed fails loudly instead of
        // hammering OTP forever.
        if today_days - svc_days >= 7 * 8 {
            eprintln!(
                "Warning: no scheduled service found within 8 weeks before today — transit reach will be empty (stale/missing GTFS feed?)"
            );
            break;
        }
        svc_days -= 7;
    }
    // Freshness signals for /health: the date actually used, whether it's a
    // fallback, and how many days of schedule the feed still has.
    let (sy, sm, sd) = days_to_ymd(svc_days);
    let feed_service_date = format!("{:04}-{:02}-{:02}", sy, sm, sd);
    let feed_fallback = svc_days != today_days;
    let feed_runway_days = fetch_feed_end_epoch(&otp_url).map(|end| (end - unix_now()) / 86400);
    if let Some(days) = feed_runway_days {
        if days < 14 {
            eprintln!(
                "Warning: GTFS feed has only {} day(s) of schedule left — refresh it before isochrones go walk-only",
                days
            );
        } else {
            println!("GTFS feed runway: {} days", days);
        }
    }
    transit_graph.bajs_stations = otp::fetch_bajs_stations();
    transit_graph.build_stop_grid();
    println!(
        "Transit graph loaded in {:.1}s: {} stops, {} patterns, {} BAJS stations",
        t0.elapsed().as_secs_f64(),
        transit_graph.stop_count,
        transit_graph.patterns.len(),
        transit_graph.bajs_stations.len(),
    );

    // Decode all pattern geometries
    let pattern_geometries: Vec<Vec<[f64; 2]>> = transit_graph
        .patterns
        .iter()
        .map(|p| {
            p.geometry_encoded
                .as_deref()
                .map(decode_polyline)
                .unwrap_or_default()
        })
        .collect();

    println!("Loading walk graph...");
    let walk_graph_path = Path::new(&data_dir).join("walk-graph.bin");
    let walk_graph = WalkGraph::load(&walk_graph_path);
    println!(
        "Walk graph loaded: {} nodes, {} edges",
        walk_graph.node_count, walk_graph.edge_count
    );

    // Snap transit stops to walk graph
    let stop_coords: Vec<(f64, f64)> = transit_graph.stops.iter().map(|s| (s.lat, s.lon)).collect();
    let stop_snaps = snap_stops(&walk_graph, &stop_coords);
    let snapped_count = stop_snaps.iter().filter(|s| s.is_some()).count();
    println!(
        "Snapped {}/{} transit stops to walk graph",
        snapped_count, transit_graph.stop_count
    );

    // Pre-snap transit polyline segments to walk graph (avoids per-request cost)
    let t_snap = Instant::now();
    let snapped_segments: Vec<Vec<Vec<[f64; 2]>>> = transit_graph
        .patterns
        .par_iter()
        .enumerate()
        .map(|(pi, pattern)| {
            let geo = &pattern_geometries[pi];
            let num_stops = pattern.stop_indices.len();
            let num_pts = geo.len();
            if num_stops < 2 || num_pts < 2 {
                return vec![];
            }
            (0..num_stops - 1)
                .map(|i| {
                    let start_idx = (i * (num_pts - 1)) / (num_stops - 1);
                    let end_idx = ((i + 1) * (num_pts - 1)) / (num_stops - 1);
                    if end_idx <= start_idx {
                        return vec![];
                    }
                    let coords = quantize_transit_line(&geo[start_idx..=end_idx]);
                    if coords.len() < 2 {
                        return vec![];
                    }
                    snap_polyline_to_walk_graph(&walk_graph, coords)
                })
                .collect()
        })
        .collect();
    println!(
        "Pre-snapped {} pattern segment groups in {:?}",
        snapped_segments.len(),
        t_snap.elapsed()
    );

    // Build BAJS adjacency
    let bajs_adjacency = build_bajs_adjacency(&transit_graph);
    if let Some(ref adj) = bajs_adjacency {
        println!(
            "BAJS adjacency built: {} stations",
            adj.stations_by_key.len()
        );
    }

    // Load scheduled speeds from route-stats.json
    let scheduled_speeds = {
        let stats_path = Path::new(&data_dir).join("route-stats.json");
        load_scheduled_speeds(&stats_path)
    };
    println!(
        "Loaded scheduled speeds for {} routes",
        scheduled_speeds.len()
    );

    // Start GTFS-RT background refresh + SQLite persistence
    let rt_store = gtfs_rt::new_rt_store();
    let vehicle_store = gtfs_rt::new_vehicle_store();
    let rt_last_refresh = gtfs_rt::new_rt_last_refresh();

    let rt_db_dir = std::env::var("RT_DB_DIR").unwrap_or_else(|_| data_dir.clone());
    let db_path = std::path::Path::new(&rt_db_dir).join("gtfs-rt.db");
    let (db_tx, db_rx) = std::sync::mpsc::sync_channel::<gtfs_rt::RtSnapshot>(4);
    rt_store::spawn_writer_thread(db_path.clone(), db_rx);

    gtfs_rt::spawn_refresh_task(
        rt_store.clone(),
        vehicle_store.clone(),
        rt_last_refresh.clone(),
        Some(db_tx),
    );
    println!("GTFS-RT background refresh started (30s interval, persisting to SQLite)");

    // Open read-only DB connection for API queries (may fail on first startup)
    let rt_db_reader = rt_store::open_reader(&db_path)
        .map(|conn| {
            println!("RT DB: reader connection opened");
            tokio::sync::Mutex::new(conn)
        })
        .ok();

    // Start BAJS station status polling (60s interval)
    let bajs_status_store: BajsStatusStore = Arc::new(RwLock::new(Vec::new()));
    // Open a write connection for BAJS usage logging (table created by RtDb::open)
    let bajs_db_conn = rusqlite::Connection::open(&db_path)
        .map(|conn| {
            let _ = conn.execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;",
            );
            std::sync::Mutex::new(conn)
        })
        .ok();
    // Seed rolling peak from DB so restarts don't lose calibration
    let initial_peak = bajs_db_conn
        .as_ref()
        .and_then(|db| {
            let cutoff = unix_now() - 86400;
            db.lock()
                .ok()
                .and_then(|conn| rt_store::query_bajs_peak_available(&conn, cutoff))
        })
        .unwrap_or(0);
    let bajs_fleet = Arc::new(BajsFleetState {
        peak_station_bikes: std::sync::atomic::AtomicI32::new(initial_peak),
    });
    spawn_bajs_status_task(BajsTaskConfig {
        store: bajs_status_store.clone(),
        fleet: bajs_fleet.clone(),
        db_conn: bajs_db_conn,
    });
    println!("BAJS station status polling started (60s interval)");

    // Precompute route→mode map from transit graph
    let route_mode_map: HashMap<String, String> = {
        let mut m = HashMap::new();
        for p in &transit_graph.patterns {
            m.entry(p.route.clone()).or_insert_with(|| p.mode.clone());
        }
        m
    };

    let stop_key_to_idx: HashMap<String, usize> = transit_graph
        .stops
        .iter()
        .enumerate()
        .map(|(i, s)| (s.key.clone(), i))
        .collect();

    let state = Arc::new(AppState {
        transit_graph,
        walk_graph,
        stop_snaps,
        rt_store,
        vehicle_store,
        rt_last_refresh,
        snapped_segments,
        bajs_adjacency,
        rt_db_reader,
        scheduled_speeds,
        route_mode_map,
        stop_key_to_idx,
        bajs_status_store,
        bajs_fleet,
        feed_service_date,
        feed_fallback,
        feed_runway_days,
    });

    let app = Router::new()
        .route("/api/isochrone", get(handle_isochrone))
        .route("/isochrone", get(handle_isochrone))
        .route("/api/rt/history", get(handle_rt_history))
        .route("/api/rt/stops", get(handle_rt_stops))
        .route("/api/rt/alerts", get(handle_rt_alerts))
        .route("/api/rt/summary", get(handle_rt_summary))
        .route("/api/rt/fleet-deployment", get(handle_fleet_deployment))
        .route("/api/rt/alert-stats", get(handle_alert_stats))
        .route("/api/rt/delay-profile", get(handle_delay_profile))
        .route("/api/rt/speed-comparison", get(handle_speed_comparison))
        .route("/api/rt/occupancy", get(handle_occupancy))
        .route("/api/rt/route-health", get(handle_route_health))
        .route("/api/rt/bajs-utilization", get(handle_bajs_utilization))
        .route("/api/rt/bajs-usage-history", get(handle_bajs_usage_history))
        .route("/health", get(handle_health))
        .layer(CompressionLayer::new())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap_or_else(|_| {
            panic!(
                "Failed to bind to port {} — is another instance already running?",
                port
            )
        });
    println!("Isochrone server listening on port {}", port);
    axum::serve(listener, app).await.unwrap();
}
