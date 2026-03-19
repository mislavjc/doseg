use std::collections::HashMap;

use graphql_client::GraphQLQuery;

use crate::geo::fast_dist_km;
use crate::transit_graph::{
    Mode, NearbyStopIndex, PatternData, StopNode, StopPattern, TransitGraphJson,
};

const TRANSFER_MAX_KM: f64 = 0.3;

/// OTP's Polyline scalar — we just need it as a String for the "has geometry" check.
type Polyline = String;

// --- GraphQL codegen: two queries (with/without serviceDate) ---

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "schema.json",
    query_path = "src/queries/patterns.graphql",
    response_derives = "Debug"
)]
pub struct GetPatterns;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "schema.json",
    query_path = "src/queries/patterns_for_date.graphql",
    response_derives = "Debug"
)]
pub struct GetPatternsForDate;

/// A raw pattern from either query variant (unified for processing).
struct RawPattern {
    route_mode: String,
    route_short_name: String,
    route_long_name: String,
    has_geometry: bool,
    stops: Vec<RawStop>,
    trips: Vec<RawTrip>,
}

#[allow(dead_code)]
struct RawStop {
    name: String,
    lat: f64,
    lon: f64,
}

struct RawTrip {
    gtfs_id: String,
    stoptimes: Vec<Option<i64>>, // scheduledDeparture (seconds), None if missing
}

fn mode_speed(mode: &str) -> f64 {
    match mode {
        "BUS" => 16.0,
        "TRAM" => 18.0,
        "RAIL" => 40.0,
        "SUBWAY" => 35.0,
        "FERRY" => 15.0,
        _ => 16.0,
    }
}

/// Fetch patterns from OTP and build the transit graph.
pub fn fetch_and_build_graph(otp_url: &str, service_date: Option<&str>) -> TransitGraphJson {
    let raw_patterns = if let Some(date) = service_date {
        fetch_patterns_for_date(otp_url, date)
    } else {
        fetch_patterns(otp_url)
    };

    build_graph(raw_patterns)
}

/// Build a RawPattern from extracted common fields.
fn build_raw_pattern(
    route_mode: Option<String>,
    route_short_name: Option<String>,
    route_long_name: Option<String>,
    has_geometry: bool,
    stops: Vec<RawStop>,
    trips: Vec<RawTrip>,
) -> RawPattern {
    RawPattern {
        route_mode: route_mode.unwrap_or_else(|| "BUS".into()),
        route_short_name: route_short_name.unwrap_or_default(),
        route_long_name: route_long_name.unwrap_or_default(),
        has_geometry,
        stops,
        trips,
    }
}

fn fetch_patterns(otp_url: &str) -> Vec<RawPattern> {
    let body = GetPatterns::build_query(get_patterns::Variables {});
    let resp: graphql_client::Response<get_patterns::ResponseData> =
        ureq::post(&format!("{}/otp/gtfs/v1", otp_url))
            .set("Content-Type", "application/json")
            .send_json(&body)
            .unwrap_or_else(|e| panic!("OTP request failed: {}", e))
            .into_json()
            .expect("Failed to parse OTP response");

    let data = resp.data.expect("OTP returned no data");

    data.patterns
        .unwrap_or_default()
        .into_iter()
        .flatten()
        .map(|p| {
            let route = p.route;
            build_raw_pattern(
                route.mode.map(|m| format!("{:?}", m)),
                route.short_name,
                route.long_name,
                p.pattern_geometry.map_or(false, |g| g.points.is_some()),
                p.stops
                    .unwrap_or_default()
                    .into_iter()
                    .map(|s| RawStop {
                        name: s.name,
                        lat: s.lat.unwrap_or(0.0),
                        lon: s.lon.unwrap_or(0.0),
                    })
                    .collect(),
                p.trips
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| RawTrip {
                        gtfs_id: t.gtfs_id,
                        stoptimes: t
                            .stoptimes
                            .unwrap_or_default()
                            .into_iter()
                            .map(|st| st.and_then(|s| s.scheduled_departure))
                            .collect(),
                    })
                    .collect(),
            )
        })
        .collect()
}

fn fetch_patterns_for_date(otp_url: &str, service_date: &str) -> Vec<RawPattern> {
    let body = GetPatternsForDate::build_query(get_patterns_for_date::Variables {
        service_date: service_date.to_string(),
    });
    let resp: graphql_client::Response<get_patterns_for_date::ResponseData> =
        ureq::post(&format!("{}/otp/gtfs/v1", otp_url))
            .set("Content-Type", "application/json")
            .send_json(&body)
            .unwrap_or_else(|e| panic!("OTP request failed: {}", e))
            .into_json()
            .expect("Failed to parse OTP response");

    let data = resp.data.expect("OTP returned no data");

    data.patterns
        .unwrap_or_default()
        .into_iter()
        .flatten()
        .map(|p| {
            let route = p.route;
            build_raw_pattern(
                route.mode.map(|m| format!("{:?}", m)),
                route.short_name,
                route.long_name,
                p.pattern_geometry.map_or(false, |g| g.points.is_some()),
                p.stops
                    .unwrap_or_default()
                    .into_iter()
                    .map(|s| RawStop {
                        name: s.name,
                        lat: s.lat.unwrap_or(0.0),
                        lon: s.lon.unwrap_or(0.0),
                    })
                    .collect(),
                p.trips_for_date
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| RawTrip {
                        gtfs_id: t.gtfs_id,
                        stoptimes: t
                            .stoptimes
                            .unwrap_or_default()
                            .into_iter()
                            .map(|st| st.and_then(|s| s.scheduled_departure))
                            .collect(),
                    })
                    .collect(),
            )
        })
        .collect()
}

/// Build the transit graph from raw OTP patterns — 1:1 port of TS buildGraph.
fn build_graph(raw_patterns: Vec<RawPattern>) -> TransitGraphJson {
    let mut patterns: Vec<PatternData> = Vec::new();
    // Ordered map preserving insertion order (like JS Map)
    let mut stops_map: indexmap::IndexMap<String, StopNode> = indexmap::IndexMap::new();
    // Store stop keys per pattern for later index assignment
    let mut pattern_stop_keys: Vec<Vec<String>> = Vec::new();

    for p in &raw_patterns {
        if !p.has_geometry || p.stops.len() < 2 {
            continue;
        }

        let pattern_idx = patterns.len();
        let mut stop_keys: Vec<String> = Vec::new();

        for (stop_idx, s) in p.stops.iter().enumerate() {
            let key = format!("{:.5},{:.5}", s.lat, s.lon);
            stop_keys.push(key.clone());

            let entry = stops_map.entry(key.clone()).or_insert_with(|| StopNode {
                lat: s.lat,
                lon: s.lon,
                key,
                idx: 0,
                patterns: Vec::new(),
                nearby_stop_indices: Vec::new(),
            });
            entry.patterns.push(StopPattern {
                pattern_idx,
                stop_idx,
            });
        }

        // Extract departures from first stoptime of each trip
        let mut trip_deps: Vec<(f64, String)> = Vec::new();
        for trip in &p.trips {
            if let Some(Some(dep)) = trip.stoptimes.first() {
                // Strip OTP feed prefix: "1:tripId" → "tripId"
                let raw_id = trip
                    .gtfs_id
                    .find(':')
                    .map_or(trip.gtfs_id.as_str(), |i| &trip.gtfs_id[i + 1..]);
                trip_deps.push((*dep as f64, raw_id.to_string()));
            }
        }
        trip_deps.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let departures: Vec<f64> = trip_deps.iter().map(|(d, _)| *d).collect();

        // Compute cumulative stop offsets (median of sampled trip stoptimes)
        let n_stops = p.stops.len();
        let mode_str = &p.route_mode;
        let speed = mode_speed(mode_str);
        let mut stop_offsets = vec![0.0f64];

        let mut offset_samples: Vec<Vec<f64>> = (0..n_stops).map(|_| Vec::new()).collect();
        let sample_count = p.trips.len().min(5);
        let trip_sample: Vec<&RawTrip> = if sample_count == p.trips.len() {
            p.trips.iter().collect()
        } else {
            (0..sample_count)
                .map(|i| &p.trips[i * p.trips.len() / sample_count])
                .collect()
        };

        for trip in &trip_sample {
            if trip.stoptimes.len() != n_stops {
                continue;
            }
            let base = match trip.stoptimes[0] {
                Some(v) => v as f64,
                None => continue,
            };
            for si in 1..n_stops {
                if let Some(dep) = trip.stoptimes[si] {
                    let offset = dep as f64 - base;
                    if offset >= 0.0 {
                        offset_samples[si].push(offset);
                    }
                }
            }
        }

        for i in 1..n_stops {
            let samples = &mut offset_samples[i];
            if !samples.is_empty() {
                samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let mid = samples.len() / 2;
                let median = if samples.len() % 2 == 1 {
                    samples[mid]
                } else {
                    (samples[mid - 1] + samples[mid]) / 2.0
                };
                stop_offsets.push(median);
            } else {
                // Fallback: distance-based estimate
                let prev = &p.stops[i - 1];
                let curr = &p.stops[i];
                let d = fast_dist_km(prev.lat, prev.lon, curr.lat, curr.lon);
                stop_offsets.push(stop_offsets[i - 1] + (d / speed) * 3600.0);
            }
        }

        let route = if !p.route_short_name.is_empty() {
            p.route_short_name.clone()
        } else {
            p.route_long_name.clone()
        };

        patterns.push(PatternData {
            stop_indices: Vec::new(),
            mode: mode_str.clone(),
            mode_enum: Mode::from_str(mode_str),
            route,
            departures,
            stop_offsets,
        });
        pattern_stop_keys.push(stop_keys);
    }

    // Pre-compute nearby stops using spatial grid
    let cell_size = TRANSFER_MAX_KM / crate::geo::KM_PER_DEG_LAT;
    let stop_keys: Vec<String> = stops_map.keys().cloned().collect();
    let mut grid: HashMap<(i32, i32), Vec<usize>> = HashMap::new();

    for (si, key) in stop_keys.iter().enumerate() {
        let stop = &stops_map[key];
        let cx = (stop.lon / cell_size).floor() as i32;
        let cy = (stop.lat / cell_size).floor() as i32;
        grid.entry((cx, cy)).or_default().push(si);
    }

    let mut nearby_by_key: Vec<Vec<(String, f64)>> = vec![Vec::new(); stop_keys.len()];

    for (si, key) in stop_keys.iter().enumerate() {
        let stop = &stops_map[key];
        let cx = (stop.lon / cell_size).floor() as i32;
        let cy = (stop.lat / cell_size).floor() as i32;

        for dx in -1..=1 {
            for dy in -1..=1 {
                if let Some(neighbors) = grid.get(&(cx + dx, cy + dy)) {
                    for &other_si in neighbors {
                        if other_si == si {
                            continue;
                        }
                        let other = &stops_map[&stop_keys[other_si]];
                        let d = fast_dist_km(stop.lat, stop.lon, other.lat, other.lon);
                        if d <= TRANSFER_MAX_KM {
                            nearby_by_key[si].push((stop_keys[other_si].clone(), d));
                        }
                    }
                }
            }
        }
    }

    // Build integer index for stops
    let stop_index: HashMap<String, usize> = stop_keys
        .iter()
        .enumerate()
        .map(|(i, k)| (k.clone(), i))
        .collect();

    for (i, key) in stop_keys.iter().enumerate() {
        stops_map.get_mut(key).unwrap().idx = i;
    }

    // Add numeric stop indices to patterns
    for (pi, keys) in pattern_stop_keys.iter().enumerate() {
        patterns[pi].stop_indices = keys.iter().map(|k| *stop_index.get(k).unwrap()).collect();
    }

    // Build index-based nearby stop links
    for (si, key) in stop_keys.iter().enumerate() {
        let nearby: Vec<NearbyStopIndex> = nearby_by_key[si]
            .iter()
            .map(|(k, d)| NearbyStopIndex {
                idx: *stop_index.get(k).unwrap(),
                dist_km: *d,
            })
            .collect();
        stops_map.get_mut(key).unwrap().nearby_stop_indices = nearby;
    }

    let stop_count = stops_map.len();
    let stops: Vec<StopNode> = stops_map.into_values().collect();

    let mut graph = TransitGraphJson {
        stops,
        patterns,
        stop_count,
        bajs_stations: Vec::new(),
        stop_grid: HashMap::new(),
    };
    graph.build_stop_grid();
    graph
}

// --- BAJS station fetching ---

#[derive(serde::Deserialize)]
struct GbfsStationInfoFeed {
    data: Option<GbfsStationInfoData>,
}

#[derive(serde::Deserialize)]
struct GbfsStationInfoData {
    stations: Option<Vec<GbfsStationInfo>>,
}

#[derive(serde::Deserialize)]
struct GbfsStationInfo {
    station_id: String,
    name: String,
    short_name: Option<String>,
    lat: f64,
    lon: f64,
    is_virtual_station: Option<bool>,
    capacity: Option<i32>,
}

const STATION_INFORMATION_URL: &str =
    "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json";

/// Fetch BAJS stations and return idealized BajsStations (1 bike, 1 dock each).
pub fn fetch_bajs_stations() -> Vec<crate::bajs::BajsStation> {
    let feed: GbfsStationInfoFeed = ureq::get(STATION_INFORMATION_URL)
        .call()
        .unwrap_or_else(|e| panic!("BAJS feed request failed: {}", e))
        .into_json()
        .expect("Failed to parse BAJS feed");

    let stations = feed
        .data
        .and_then(|d| d.stations)
        .expect("BAJS feed returned no station data");

    stations
        .into_iter()
        .filter(|s| !s.is_virtual_station.unwrap_or(false))
        .map(|s| crate::bajs::BajsStation {
            key: format!("bajs:{}", s.station_id),
            station_id: s.station_id,
            short_name: s.short_name.unwrap_or_default(),
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            capacity: s.capacity.unwrap_or(10),
        })
        .collect()
}
