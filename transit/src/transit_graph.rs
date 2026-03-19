use std::collections::HashMap;

use serde::Deserialize;

use crate::bajs::{BajsStation, IndexedBajsAdjacency};
use crate::geo::{fast_dist_km, WALK_SPEED};
use crate::heap::FlatHeap;
#[allow(dead_code)]
const WALK_MAX_KM: f64 = 1.2;
#[allow(dead_code)]
const TRANSFER_PENALTY: f64 = 120.0; // 2 minutes
#[allow(dead_code)]
const BAJS_PICKUP_SECONDS: f64 = 60.0;
#[allow(dead_code)]
const BAJS_DROPOFF_SECONDS: f64 = 30.0;
#[allow(dead_code)]
const BAJS_BIKE_SPEED: f64 = 14.0; // km/h
/// Grid cell size for stop spatial index (~1.5km, must be >= WALK_MAX_KM in degrees)
const STOP_GRID_CELL: f64 = 0.015; // ~1.5km in degrees

/// Transit mode as u8 for fast comparison instead of String.
#[derive(Clone, Copy, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum Mode {
    #[default]
    Bus = 0,
    Tram = 1,
    Rail = 2,
    Other = 3,
}

impl Mode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "BUS" => Mode::Bus,
            "TRAM" => Mode::Tram,
            "RAIL" => Mode::Rail,
            _ => Mode::Other,
        }
    }
}

/// Pattern reference on a stop: which pattern, which position in that pattern.
#[derive(Deserialize, Clone)]
pub struct StopPattern {
    #[serde(rename = "patternIdx")]
    pub pattern_idx: usize,
    #[serde(rename = "stopIdx")]
    pub stop_idx: usize,
}

/// Nearby stop link with integer index.
#[derive(Deserialize, Clone)]
pub struct NearbyStopIndex {
    pub idx: usize,
    #[serde(rename = "distKm")]
    pub dist_km: f64,
}

/// Transit stop node.
#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct StopNode {
    pub lat: f64,
    pub lon: f64,
    pub key: String,
    #[serde(default)]
    pub name: String,
    pub idx: usize,
    pub patterns: Vec<StopPattern>,
    #[serde(rename = "nearbyStopIndices")]
    pub nearby_stop_indices: Vec<NearbyStopIndex>,
}

/// Transit pattern data (route).
#[derive(Deserialize, Clone)]
pub struct PatternData {
    #[serde(rename = "stopIndices")]
    pub stop_indices: Vec<usize>,
    pub mode: String,
    pub route: String,
    pub departures: Vec<f64>,
    #[serde(rename = "stopOffsets")]
    pub stop_offsets: Vec<f64>,
    /// Pre-computed mode enum (populated by build_mode_enums)
    #[serde(skip)]
    pub mode_enum: Mode,
    /// Encoded polyline geometry from OTP (for route distance calculation)
    #[serde(skip)]
    pub geometry_encoded: Option<String>,
    /// GTFS trip IDs, parallel to departures (for GTFS-RT delay lookup)
    #[serde(skip)]
    #[allow(dead_code)]
    pub trip_ids: Vec<String>,
}

/// Complete transit graph deserialized from JSON.
#[derive(Deserialize)]
pub struct TransitGraphJson {
    pub stops: Vec<StopNode>,
    pub patterns: Vec<PatternData>,
    #[serde(rename = "stopCount")]
    pub stop_count: usize,
    #[serde(rename = "bajsStations")]
    pub bajs_stations: Vec<BajsStation>,
    /// Spatial grid for fast stop lookup within WALK_MAX_KM (built after deser)
    #[serde(skip)]
    pub stop_grid: HashMap<(i32, i32), Vec<usize>>,
}

impl TransitGraphJson {
    /// Build spatial grid for stops and mode enums. Call once after deserialization.
    pub fn build_stop_grid(&mut self) {
        let mut grid: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
        for (si, stop) in self.stops.iter().enumerate() {
            let cx = (stop.lon / STOP_GRID_CELL).floor() as i32;
            let cy = (stop.lat / STOP_GRID_CELL).floor() as i32;
            grid.entry((cx, cy)).or_default().push(si);
        }
        self.stop_grid = grid;

        // Pre-compute mode enums
        for pattern in &mut self.patterns {
            pattern.mode_enum = Mode::from_str(&pattern.mode);
        }
    }
}

/// Compute average headway at a stop for a pattern near the given clock time.
/// Returns headway/2 (average wait) or None if no service.
#[allow(dead_code)]
fn get_avg_wait(departures: &[f64], stop_offset: f64, clock_time: f64) -> Option<f64> {
    if departures.is_empty() {
        return None;
    }

    let target = clock_time - stop_offset;

    // Binary search for first departure >= target
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

    Some(headway.min(1800.0) / 2.0)
}

/// Scoring-optimized transit Dijkstra that uses average wait (headway/2).
/// Writes best travel times into `best_buf` (indexed by stop idx, and BAJS station idx after stop_count).
/// `best_buf` must be pre-filled with INFINITY and will be reset before returning.
/// Returns a Vec with the results (reuses `best_buf` internally but copies out).
#[allow(dead_code, clippy::too_many_arguments)]
pub fn compute_avg_travel_times(
    graph: &TransitGraphJson,
    origin_lat: f64,
    origin_lon: f64,
    departure_time: f64,
    time_cap: f64,
    bajs_adj: Option<&IndexedBajsAdjacency>,
    exclude_modes: Option<&[Mode]>,
    best: &mut Vec<f64>,
    heap: &mut FlatHeap,
    touched: &mut Vec<usize>,
) {
    let stop_count = graph.stop_count;
    let bajs_count = bajs_adj.map_or(0, |a| a.bajs_count);
    let total_nodes = stop_count + bajs_count;

    // Ensure buffer is large enough (no full reset — caller uses reset_touched)
    best.resize(total_nodes, f64::INFINITY);
    heap.clear();

    // Convert exclude_modes to bitmask for O(1) filtering
    let exclude_mask: u8 = exclude_modes.map_or(0, |modes| {
        modes.iter().fold(0u8, |acc, &m| acc | (1u8 << m as u8))
    });

    // Seed: walk from origin to nearby transit stops (spatial grid lookup)
    let cx = (origin_lon / STOP_GRID_CELL).floor() as i32;
    let cy = (origin_lat / STOP_GRID_CELL).floor() as i32;
    for dx in -1..=1 {
        for dy in -1..=1 {
            if let Some(indices) = graph.stop_grid.get(&(cx + dx, cy + dy)) {
                for &si in indices {
                    let stop = &graph.stops[si];
                    let d = fast_dist_km(origin_lat, origin_lon, stop.lat, stop.lon);
                    if d <= WALK_MAX_KM {
                        let walk_time = (d / WALK_SPEED) * 3600.0;
                        touched.push(si);
                        best[si] = walk_time;
                        heap.push(walk_time, si as u32);
                    }
                }
            }
        }
    }

    // Seed: walk to nearby BAJS stations
    if let Some(adj) = bajs_adj {
        for bi in 0..adj.bajs_count {
            let station = &adj.stations[bi];
            let dist_km = fast_dist_km(origin_lat, origin_lon, station.lat, station.lon);
            if dist_km > WALK_MAX_KM {
                continue;
            }
            let walk_time = (dist_km / WALK_SPEED) * 3600.0;
            let idx = stop_count + bi;
            if walk_time < best[idx] {
                touched.push(idx);
                best[idx] = walk_time;
                heap.push(walk_time, idx as u32);
            }
        }
    }

    while !heap.is_empty() {
        let time = heap.peek_time();
        let node_idx = heap.peek_node() as usize;
        heap.pop();

        if time > time_cap {
            break;
        }
        if time > best[node_idx] {
            continue;
        }

        if node_idx < stop_count {
            // Transit stop node
            let stop = &graph.stops[node_idx];

            for sp in &stop.patterns {
                let pattern = &graph.patterns[sp.pattern_idx];
                if (exclude_mask & (1u8 << pattern.mode_enum as u8)) != 0 {
                    continue;
                }

                let clock_time = departure_time + time;
                let avg_wait =
                    match get_avg_wait(&pattern.departures, pattern.stop_offsets[sp.stop_idx], clock_time)
                    {
                        Some(w) => w,
                        None => continue,
                    };

                let board_time = time + avg_wait;
                let board_offset = pattern.stop_offsets[sp.stop_idx];

                for i in (sp.stop_idx + 1)..pattern.stop_indices.len() {
                    let travel_time = board_time + (pattern.stop_offsets[i] - board_offset);
                    let dest_idx = pattern.stop_indices[i];
                    if travel_time < best[dest_idx] {
                        touched.push(dest_idx);
                        best[dest_idx] = travel_time;
                        heap.push(travel_time, dest_idx as u32);
                    }
                }
            }

            // Transfer walks to nearby stops
            for ns in &stop.nearby_stop_indices {
                let transfer_time = time + (ns.dist_km / WALK_SPEED) * 3600.0 + TRANSFER_PENALTY;
                if transfer_time < best[ns.idx] {
                    touched.push(ns.idx);
                    best[ns.idx] = transfer_time;
                    heap.push(transfer_time, ns.idx as u32);
                }
            }

            // Walk to nearby BAJS stations
            if let Some(adj) = bajs_adj {
                if let Some(Some(links)) = adj.stop_to_station_links.get(node_idx) {
                    for link in links {
                        let walk_time = time + (link.dist_km / WALK_SPEED) * 3600.0;
                        if walk_time < best[link.idx] {
                            touched.push(link.idx);
                            best[link.idx] = walk_time;
                            heap.push(walk_time, link.idx as u32);
                        }
                    }
                }
            }
        } else if let Some(adj) = bajs_adj {
            // BAJS station node
            let bi = node_idx - stop_count;

            // Walk to nearby transit stops
            for link in &adj.station_to_stop_links[bi] {
                let walk_time = time + (link.dist_km / WALK_SPEED) * 3600.0;
                if walk_time < best[link.idx] {
                    touched.push(link.idx);
                    best[link.idx] = walk_time;
                    heap.push(walk_time, link.idx as u32);
                }
            }

            // Bike to other stations
            for link in &adj.station_bike_links[bi] {
                let bike_time = time + BAJS_PICKUP_SECONDS + BAJS_DROPOFF_SECONDS + (link.dist_km / BAJS_BIKE_SPEED) * 3600.0;
                if bike_time < best[link.idx] {
                    touched.push(link.idx);
                    best[link.idx] = bike_time;
                    heap.push(bike_time, link.idx as u32);
                }
            }
        }
    }

    // `best` now contains the results — caller reads them directly.
    // Reset touched nodes back to INFINITY for next call.
    // (Deferred until after walk_expand reads the results.)
}

/// Thread-local state for transit Dijkstra.
#[allow(dead_code)]
pub struct TransitState {
    pub best: Vec<f64>,
    pub heap: FlatHeap,
    pub touched: Vec<usize>,
}

#[allow(dead_code)]
impl TransitState {
    pub fn new(capacity: usize) -> Self {
        Self {
            best: vec![f64::INFINITY; capacity],
            heap: FlatHeap::new(),
            touched: Vec::with_capacity(512),
        }
    }

    /// Reset only the nodes touched by the previous transit Dijkstra call.
    pub fn reset_touched(&mut self) {
        for &idx in &self.touched {
            self.best[idx] = f64::INFINITY;
        }
        self.touched.clear();
    }
}
