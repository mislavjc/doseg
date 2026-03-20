mod bajs;
#[allow(dead_code)]
mod districts;
mod geo;
mod gtfs_rt;
mod heap;
#[allow(dead_code)]
mod rt_store;
#[allow(dead_code)]
mod osm;
mod otp;
#[allow(dead_code)]
mod route_stats;
mod transit_graph;
mod walk_expand;
mod walk_graph;

// Stub needed by route_stats module
pub fn chrono_now_iso() -> String {
    String::new()
}

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use axum::extract::{Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use tower_http::compression::CompressionLayer;
use ts_rs::TS;

use crate::geo::{fast_dist_km, WALK_SPEED};
use crate::heap::FlatHeap;
use crate::transit_graph::{Mode, TransitGraphJson};
use crate::walk_expand::{find_nearest_node, snap_stops, StopSnap};
use crate::walk_graph::WalkGraph;

// --- Constants matching the TS implementation ---

const MAX_SECONDS: f64 = 45.0 * 60.0;
const RENDER_CAP_SECONDS: f64 = MAX_SECONDS - 60.0;
const MIN_RENDER_EDGE_METERS: f64 = 40.0;
const CM_TO_SECONDS: f64 = 0.0072;
const BUCKET_SECONDS: f64 = 60.0;
const TRANSIT_COORD_SCALE: f64 = 10_000.0; // 10^4

const WALK_MAX_KM: f64 = 1.2;
const MAX_WAIT: f64 = 3600.0;

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
    rt_last_refresh: gtfs_rt::RtLastRefresh,
    /// Decoded polyline geometries per pattern: Vec<Vec<[lon, lat]>>
    pattern_geometries: Vec<Vec<[f64; 2]>>,
    /// Pre-built BAJS adjacency for the idealized stations
    bajs_adjacency: Option<BajsAdjacency>,
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

fn get_next_wait(departures: &[f64], stop_offset: f64, clock_time: f64) -> Option<(f64, usize)> {
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
        Some((wait, lo))
    } else {
        None
    }
}

struct TravelTimeResult {
    times: HashMap<String, f64>,
    preds: HashMap<String, Predecessor>,
}

fn compute_travel_times(
    graph: &TransitGraphJson,
    origin_lat: f64,
    origin_lon: f64,
    departure_time: f64,
    use_bajs: bool,
    bajs_adj: Option<&BajsAdjacency>,
    rt_data: &HashMap<String, gtfs_rt::TripRT>,
) -> TravelTimeResult {
    let time_cap = 3600.0; // 1 hour
    let mut best: HashMap<String, f64> = HashMap::new();
    let mut preds: HashMap<String, Predecessor> = HashMap::new();
    let mut heap = FlatHeap::new();
    // Map heap node indices back to keys
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

    // Seed: walk from origin to all stops within walking distance
    for stop in &graph.stops {
        let d = fast_dist_km(origin_lat, origin_lon, stop.lat, stop.lon);
        if d <= WALK_MAX_KM {
            let walk_time = (d / WALK_SPEED) * 3600.0;
            best.insert(stop.key.clone(), walk_time);
            let node_idx = get_or_insert_node(&stop.key, &mut node_keys, &mut key_to_node);
            heap.push(walk_time, node_idx);
        }
    }

    // Seed: walk to nearby BAJS stations
    if use_bajs {
        if let Some(adj) = bajs_adj {
            for station in adj.stations_by_key.values() {
                let dist_km = fast_dist_km(origin_lat, origin_lon, station.lat, station.lon);
                if dist_km > WALK_MAX_KM {
                    continue;
                }
                let walk_time = (dist_km / WALK_SPEED) * 3600.0;
                let existing = best.get(&station.key).copied().unwrap_or(f64::INFINITY);
                if walk_time < existing {
                    best.insert(station.key.clone(), walk_time);
                    let node_idx =
                        get_or_insert_node(&station.key, &mut node_keys, &mut key_to_node);
                    heap.push(walk_time, node_idx);
                }
            }
        }
    }

    // Build stop key lookup for fast access
    let stop_by_key: HashMap<&str, &transit_graph::StopNode> =
        graph.stops.iter().map(|s| (s.key.as_str(), s)).collect();

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

        let is_stop = stop_by_key.contains_key(key.as_str());
        let is_station =
            use_bajs && bajs_adj.is_some_and(|adj| adj.stations_by_key.contains_key(key.as_str()));

        if is_stop {
            let stop = stop_by_key[key.as_str()];

            // Try all patterns serving this stop
            for sp in &stop.patterns {
                let pattern = &graph.patterns[sp.pattern_idx];
                let clock_time = departure_time + time;

                let (wait_seconds, trip_index) = match get_next_wait(
                    &pattern.departures,
                    pattern.stop_offsets[sp.stop_idx],
                    clock_time,
                ) {
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

                    // Apply real-time delay adjustment
                    if let Some(rt) = trip_rt {
                        travel_time += gtfs_rt::get_stop_delay(rt, i) as f64 - board_delay;
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
                let walk_time = time + (ns.dist_km / WALK_SPEED) * 3600.0;
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
                            let walk_time = time + (link.dist_km / WALK_SPEED) * 3600.0;
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
                        let walk_time = time + (link.dist_km / WALK_SPEED) * 3600.0;
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

fn generate_transit_features(
    graph: &TransitGraphJson,
    travel_times: &HashMap<String, f64>,
    pattern_geometries: &[Vec<[f64; 2]>],
) -> Vec<GeoJsonFeature> {
    let mut buckets: HashMap<i64, Vec<Vec<[f64; 2]>>> = HashMap::new();

    for (pi, pattern) in graph.patterns.iter().enumerate() {
        if pattern.mode_enum == Mode::Rail {
            continue;
        }

        let geo = &pattern_geometries[pi];
        let num_stops = pattern.stop_indices.len();
        let num_pts = geo.len();
        if num_stops < 2 || num_pts < 2 {
            continue;
        }

        for i in 0..(num_stops - 1) {
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

            let time = t1.min(t2);
            let start_idx = (i * (num_pts - 1)) / (num_stops - 1);
            let end_idx = ((i + 1) * (num_pts - 1)) / (num_stops - 1);
            if end_idx <= start_idx {
                continue;
            }

            let coords = quantize_transit_line(&geo[start_idx..=end_idx]);
            if coords.len() < 2 {
                continue;
            }

            let bucket = ((time / BUCKET_SECONDS).floor() * BUCKET_SECONDS) as i64;
            buckets.entry(bucket).or_default().push(coords);
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

fn generate_walk_features(
    walk_graph: &WalkGraph,
    transit_times: &HashMap<String, f64>,
    stop_snaps: &[Option<StopSnap>],
    stops: &[transit_graph::StopNode],
    origin_lat: f64,
    origin_lon: f64,
) -> Vec<GeoJsonFeature> {
    let node_count = walk_graph.node_count as usize;
    let mut best = vec![f64::INFINITY; node_count];
    let mut touched: Vec<u32> = Vec::with_capacity(32000);
    let mut heap = FlatHeap::new();

    // Seed 1: Origin point
    if let Some(origin_node) = find_nearest_node(walk_graph, origin_lat, origin_lon, 0.25) {
        let olat = walk_graph.lat(origin_node);
        let olon = walk_graph.lon(origin_node);
        let walk_time = (fast_dist_km(origin_lat, origin_lon, olat, olon) / WALK_SPEED) * 3600.0;
        if walk_time < MAX_SECONDS {
            touched.push(origin_node);
            best[origin_node as usize] = walk_time;
            heap.push(walk_time, origin_node);
        }
    }

    // Seed 2: Each reachable transit stop → nearest walk node
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
            touched.push(snap.node_idx);
            best[snap.node_idx as usize] = total_time;
            heap.push(total_time, snap.node_idx);
        }
    }

    // Dijkstra on walking graph
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
                touched.push(to_idx);
                best[to_idx as usize] = arrival_time;
                heap.push(arrival_time, to_idx);
            }
        }
    }

    // Generate features from reached nodes
    let mut buckets: HashMap<i64, Vec<Vec<[f64; 2]>>> = HashMap::new();

    for &node_idx in &reached {
        let node_time = best[node_idx as usize];
        let ni2 = node_idx as usize * 2;
        let from_lat = coords[ni2];
        let from_lon = coords[ni2 + 1];

        let es = offsets[node_idx as usize] as usize;
        let ee = offsets[node_idx as usize + 1] as usize;

        for e in es..ee {
            let to_idx = edge_targets[e];
            let to_time = best[to_idx as usize];
            if to_time == f64::INFINITY || to_idx <= node_idx {
                continue;
            }
            if node_time > RENDER_CAP_SECONDS || to_time > RENDER_CAP_SECONDS {
                continue;
            }
            if (edge_dist_cm[e] as f64) < MIN_RENDER_EDGE_METERS * 100.0 {
                continue;
            }

            let ti2 = to_idx as usize * 2;
            let bucket =
                ((node_time.min(to_time) / BUCKET_SECONDS).floor() * BUCKET_SECONDS) as i64;

            let from = [
                (from_lon * 10000.0).round() / 10000.0,
                (from_lat * 10000.0).round() / 10000.0,
            ];
            let to = [
                (coords[ti2 + 1] * 10000.0).round() / 10000.0,
                (coords[ti2] * 10000.0).round() / 10000.0,
            ];

            buckets.entry(bucket).or_default().push(vec![from, to]);
        }
    }

    // No need to reset best — it's stack-allocated per request

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
    #[serde(rename = "patternIdx", skip_serializing_if = "Option::is_none")]
    #[ts(rename = "patternIdx")]
    pattern_idx: Option<usize>,
    #[serde(rename = "boardIdx", skip_serializing_if = "Option::is_none")]
    #[ts(rename = "boardIdx")]
    board_idx: Option<usize>,
    #[serde(rename = "alightIdx", skip_serializing_if = "Option::is_none")]
    #[ts(rename = "alightIdx")]
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

    let stop_by_key: HashMap<&str, &transit_graph::StopNode> =
        graph.stops.iter().map(|s| (s.key.as_str(), s)).collect();

    let mut routing_nodes = Vec::new();
    for (key, &time) in travel_times {
        let (kind, lat, lon, name) = if let Some(stop) = stop_by_key.get(key.as_str()) {
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
    #[serde(rename = "walkRing", skip_serializing_if = "Option::is_none")]
    #[ts(rename = "walkRing")]
    walk_ring: Option<WalkRingResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    routing: Option<RoutingPayload>,
    realtime: bool,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
struct WalkRingResponse {
    #[serde(rename = "type")]
    #[ts(rename = "type", type = "\"FeatureCollection\"")]
    kind: &'static str,
    features: Vec<GeoJsonFeature>,
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
        // Default to current Zagreb time (UTC+1/+2)
        8.0 * 3600.0
    };

    // Snap coordinates to 3 decimal places (~100m) for Cloudflare cache hits
    let lat = (params.lat * 1000.0).round() / 1000.0;
    let lon = (params.lon * 1000.0).round() / 1000.0;

    // Snap departure time to 5-minute intervals for better cache hits
    let departure_time = (departure_time / 300.0).round() * 300.0;

    let use_bajs = params.bajs.as_deref() == Some("1");
    let routing_mode = params.routing.as_deref().unwrap_or("full");

    // 1. Compute travel times
    let rt_data = state.rt_store.read().unwrap();
    let result = compute_travel_times(
        &state.transit_graph,
        lat,
        lon,
        departure_time,
        use_bajs,
        state.bajs_adjacency.as_ref(),
        &rt_data,
    );
    let has_realtime = !rt_data.is_empty();
    drop(rt_data);
    let t_state = Instant::now();

    // 2. Generate features
    let mut features = Vec::new();
    let mut walk_ring_features = Vec::new();
    let t_walk;

    if routing_mode != "only" {
        let transit_features = generate_transit_features(
            &state.transit_graph,
            &result.times,
            &state.pattern_geometries,
        );
        let walk_features = generate_walk_features(
            &state.walk_graph,
            &result.times,
            &state.stop_snaps,
            &state.transit_graph.stops,
            lat,
            lon,
        );
        features.extend(transit_features);
        features.extend(walk_features);

        // Walk-only ring (no transit times)
        let empty_times = HashMap::new();
        walk_ring_features = generate_walk_features(
            &state.walk_graph,
            &empty_times,
            &state.stop_snaps,
            &state.transit_graph.stops,
            lat,
            lon,
        );
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
        ))
    } else {
        None
    };
    let t_payload = Instant::now();

    let walk_ring = if !walk_ring_features.is_empty() {
        Some(WalkRingResponse {
            kind: "FeatureCollection",
            features: walk_ring_features,
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
            walk_ring,
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
    let body = match health.stale_sec {
        Some(sec) => format!(
            r#"{{"status":"ok","gtfsRt":{{"tripCount":{},"staleSec":{}}}}}"#,
            health.trip_count, sec
        ),
        None => format!(
            r#"{{"status":"ok","gtfsRt":{{"tripCount":{},"staleSec":null}}}}"#,
            health.trip_count
        ),
    };
    ([(header::CONTENT_TYPE, "application/json")], body).into_response()
}

#[tokio::main]
async fn main() {
    let otp_url = std::env::var("OTP_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse()
        .unwrap_or(3001);

    println!("Loading transit graph from OTP at {}...", otp_url);
    let t0 = Instant::now();
    let mut transit_graph = otp::fetch_and_build_graph(&otp_url, None);
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

    // Build BAJS adjacency
    let bajs_adjacency = build_bajs_adjacency(&transit_graph);
    if let Some(ref adj) = bajs_adjacency {
        println!(
            "BAJS adjacency built: {} stations",
            adj.stations_by_key.len()
        );
    }

    // Start GTFS-RT background refresh + SQLite persistence
    let rt_store = gtfs_rt::new_rt_store();
    let rt_last_refresh = gtfs_rt::new_rt_last_refresh();

    let rt_db_dir = std::env::var("RT_DB_DIR").unwrap_or_else(|_| data_dir.clone());
    let db_path = std::path::Path::new(&rt_db_dir).join("gtfs-rt.db");
    let (db_tx, db_rx) = std::sync::mpsc::sync_channel::<gtfs_rt::RtSnapshot>(4);
    rt_store::spawn_writer_thread(db_path, db_rx);

    gtfs_rt::spawn_refresh_task(rt_store.clone(), rt_last_refresh.clone(), Some(db_tx));
    println!("GTFS-RT background refresh started (30s interval, persisting to SQLite)");

    let state = Arc::new(AppState {
        transit_graph,
        walk_graph,
        stop_snaps,
        rt_store,
        rt_last_refresh,
        pattern_geometries,
        bajs_adjacency,
    });

    let app = Router::new()
        .route("/api/isochrone", get(handle_isochrone))
        .route("/isochrone", get(handle_isochrone))
        .route("/health", get(handle_health))
        .layer(CompressionLayer::new())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();
    println!("Isochrone server listening on port {}", port);
    axum::serve(listener, app).await.unwrap();
}
