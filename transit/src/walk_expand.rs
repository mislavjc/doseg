use rustc_hash::FxHashSet;

use crate::geo::{fast_dist_km, WALK_SPEED};
use crate::heap::FlatHeap;
use crate::walk_graph::{WalkGraph, GRID_CELL_SIZE};
/// cm → seconds: 3600 / (100_000 * 5) = 0.0072
#[allow(dead_code)]
const CM_TO_SECONDS: f64 = 0.0072;

/// Snap info: a transit stop snapped to the nearest walk graph node.
#[derive(Clone)]
pub struct StopSnap {
    pub node_idx: u32,
    pub walk_seconds: f64,
}

/// Find the nearest walking graph node to a given coordinate.
pub fn find_nearest_node(graph: &WalkGraph, lat: f64, lon: f64, max_km_sq: f64) -> Option<u32> {
    let cx = (lon / GRID_CELL_SIZE).floor() as i32;
    let cy = (lat / GRID_CELL_SIZE).floor() as i32;

    let mut best_idx: Option<u32> = None;
    let mut best_dist_sq = max_km_sq;

    for dx in -2..=2 {
        for dy in -2..=2 {
            if let Some(cell) = graph.grid.get(&(cx + dx, cy + dy)) {
                for &node_idx in cell {
                    let dlat = (graph.lat(node_idx) - lat) * crate::geo::KM_PER_DEG_LAT;
                    let dlon = (graph.lon(node_idx) - lon) * crate::geo::KM_PER_DEG_LON;
                    let d_sq = dlat * dlat + dlon * dlon;
                    if d_sq < best_dist_sq {
                        best_dist_sq = d_sq;
                        best_idx = Some(node_idx);
                    }
                }
            }
        }
    }

    best_idx
}

/// Snap all transit stops to the walk graph. Returns a Vec indexed by stop idx.
pub fn snap_stops(
    graph: &WalkGraph,
    stop_coords: &[(f64, f64)], // (lat, lon) indexed by stop idx
) -> Vec<Option<StopSnap>> {
    stop_coords
        .iter()
        .map(|&(lat, lon)| {
            find_nearest_node(graph, lat, lon, 0.09).map(|node_idx| {
                let nlat = graph.lat(node_idx);
                let nlon = graph.lon(node_idx);
                StopSnap {
                    node_idx,
                    walk_seconds: (fast_dist_km(lat, lon, nlat, nlon) / WALK_SPEED) * 3600.0,
                }
            })
        })
        .collect()
}

/// Thread-local state for walk Dijkstra. Allocated once per thread, reused across calls.
#[allow(dead_code)]
pub struct WalkExpandState {
    pub best_buf: Vec<f64>,
    pub heap: FlatHeap,
    pub cells: FxHashSet<i64>,
    pub touched: Vec<u32>,
}

#[allow(dead_code)]
impl WalkExpandState {
    pub fn new(node_count: usize) -> Self {
        Self {
            best_buf: vec![f64::INFINITY; node_count],
            heap: FlatHeap::new(),
            cells: FxHashSet::default(),
            touched: Vec::with_capacity(32000),
        }
    }
}

/// Count unique reachable grid cells via walk Dijkstra expansion.
///
/// `transit_times` is indexed by stop idx (and optionally BAJS station idx after stop_count).
/// Uses thread-local WalkExpandState for zero-allocation reuse.
#[allow(dead_code)]
pub fn count_reachable_cells(
    graph: &WalkGraph,
    transit_times: &[f64],
    stop_snaps: &[Option<StopSnap>],
    origin_lat: f64,
    origin_lon: f64,
    max_seconds: f64,
    state: &mut WalkExpandState,
) -> u32 {
    let best_buf = &mut state.best_buf;
    let heap = &mut state.heap;
    let cells = &mut state.cells;
    let touched = &mut state.touched;
    heap.clear();
    cells.clear();
    touched.clear();

    // Seed 1: Origin point → nearest walk node
    if let Some(origin_node) = find_nearest_node(graph, origin_lat, origin_lon, 0.25) {
        let olat = graph.lat(origin_node);
        let olon = graph.lon(origin_node);
        let walk_time = (fast_dist_km(origin_lat, origin_lon, olat, olon) / WALK_SPEED) * 3600.0;
        if walk_time < max_seconds {
            touched.push(origin_node);
            best_buf[origin_node as usize] = walk_time;
            heap.push(walk_time, origin_node);
        }
    }

    // Seed 2: Each reachable transit stop → nearest walk node
    for (si, snap_opt) in stop_snaps.iter().enumerate() {
        if si >= transit_times.len() {
            break;
        }
        let time = transit_times[si];
        if time >= max_seconds {
            continue;
        }
        let snap = match snap_opt {
            Some(s) => s,
            None => continue,
        };

        let total_time = time + snap.walk_seconds;
        if total_time < max_seconds && total_time < best_buf[snap.node_idx as usize] {
            touched.push(snap.node_idx);
            best_buf[snap.node_idx as usize] = total_time;
            heap.push(total_time, snap.node_idx);
        }
    }

    // Dijkstra on walking graph — count unique grid cells
    // Take direct slice refs for the hot loop — helps compiler prove no aliasing with best_buf
    let coords = graph.coords.as_slice();
    let offsets = graph.offsets.as_slice();
    let edge_targets = graph.edge_targets.as_slice();
    let edge_dist_cm = graph.edge_dist_cm.as_slice();
    let inv_cell = 1.0 / GRID_CELL_SIZE; // multiply is faster than divide

    while !heap.is_empty() {
        let time = heap.peek_time();
        let node_idx = heap.peek_node();
        heap.pop();

        if time > best_buf[node_idx as usize] {
            continue;
        }
        if time > max_seconds {
            break;
        }

        // Compute cell key as single integer (coords always positive, use fast truncation)
        let ni2 = node_idx as usize * 2;
        let cx = (coords[ni2 + 1] * inv_cell) as i64; // lon — always positive
        let cy = (coords[ni2] * inv_cell) as i64; // lat — always positive
        cells.insert(cx * 100000 + cy);

        let es = offsets[node_idx as usize] as usize;
        let ee = offsets[node_idx as usize + 1] as usize;
        for e in es..ee {
            let to_idx = edge_targets[e];
            let arrival_time = time + edge_dist_cm[e] as f64 * CM_TO_SECONDS;

            if arrival_time < max_seconds && arrival_time < best_buf[to_idx as usize] {
                touched.push(to_idx);
                best_buf[to_idx as usize] = arrival_time;
                heap.push(arrival_time, to_idx);
            }
        }
    }

    let count = cells.len() as u32;

    // Reset only touched nodes back to INFINITY
    for &idx in touched.iter() {
        best_buf[idx as usize] = f64::INFINITY;
    }

    count
}
