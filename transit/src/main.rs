//! Transit reachability scoring for Zagreb districts.
//!
//! Pipeline: OSM building footprints -> walk graph, OTP (OpenTripPlanner) -> transit graph,
//! 4 scoring passes (bus+tram, +train, +BAJS, evening off-peak), JSON output per district.
//! BAJS refers to the Zagreb bike-share system (NextBike HD).

mod bajs;
mod centrality;
mod districts;
mod geo;
mod heap;
mod network_stats;
mod osm;
mod otp;
mod route_stats;
mod transit_graph;
mod walk_expand;
mod walk_graph;

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use serde::Serialize;
use ts_rs::TS;

use crate::bajs::{build_bajs_adjacency_indexed, BAJS_TRANSFER_MAX_KM};
use crate::districts::{
    generate_sample_points, load_districts, point_in_polygon, polygon_area_km2, SamplePoint,
};
use crate::geo::{fast_dist_km, WALK_SPEED};
use crate::osm::{extract_populated_cells, POP_CELL};
use crate::transit_graph::{compute_avg_travel_times, TransitGraphJson, TransitState};
use crate::walk_expand::{count_reachable_cells, snap_stops};
use crate::walk_graph::WalkGraph;

/// Morning departure times: 07:30, 07:45, 08:00, 08:15, 08:30
const MORNING_DEPARTURES: [f64; 5] = [
    7.0 * 3600.0 + 30.0 * 60.0,
    7.0 * 3600.0 + 45.0 * 60.0,
    8.0 * 3600.0,
    8.0 * 3600.0 + 15.0 * 60.0,
    8.0 * 3600.0 + 30.0 * 60.0,
];

/// Evening departure times: 20:30, 20:45, 21:00, 21:15, 21:30
const EVENING_DEPARTURES: [f64; 5] = [
    20.0 * 3600.0 + 30.0 * 60.0,
    20.0 * 3600.0 + 45.0 * 60.0,
    21.0 * 3600.0,
    21.0 * 3600.0 + 15.0 * 60.0,
    21.0 * 3600.0 + 30.0 * 60.0,
];

const DETOUR_FACTOR: f64 = 1.3;
const DESERT_THRESHOLD_KM: f64 = 0.5 / DETOUR_FACTOR;

const VALID_DAYS: &[&str] = &[
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];

struct Args {
    grid_m: f64,
    minutes: f64,
    workers: usize,
    day: Option<String>,
    service_date: Option<String>,
    otp_url: String,
    centrality: bool,
}

/// Convert days since Unix epoch (1970-01-01) to (year, month 1-based, day 1-based).
fn days_to_ymd(days: i64) -> (i64, usize, i64) {
    let mut y = 1970i64;
    let mut remaining = days;
    loop {
        let yd = if is_leap(y) { 366 } else { 365 };
        if remaining < yd {
            break;
        }
        remaining -= yd;
        y += 1;
    }
    let leap = is_leap(y);
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
    let mut month = 0;
    for (mi, &md) in mdays.iter().enumerate() {
        if remaining < md {
            month = mi + 1;
            break;
        }
        remaining -= md;
    }
    (y, month, remaining + 1)
}

/// Find the next occurrence of the given day of the week from today. Returns YYYY-MM-DD.
fn next_date_for_day(day: &str) -> String {
    let target_idx = VALID_DAYS.iter().position(|&d| d == day).unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // day of week: Thursday 1970-01-01 was day 4
    let today_idx = ((now / 86400 + 4) % 7) as usize;
    let mut days_ahead = (target_idx as i32 - today_idx as i32) as i64;
    if days_ahead <= 0 {
        days_ahead += 7;
    }
    let target_secs = now as i64 + days_ahead * 86400;
    let (y, month, day_num) = days_to_ymd(target_secs / 86400);
    format!("{:04}-{:02}-{:02}", y, month, day_num)
}

fn parse_args() -> Args {
    let args: Vec<String> = std::env::args().collect();
    let mut grid_m = 200.0;
    let mut minutes = 30.0;
    let mut workers = num_cpus().saturating_sub(1).max(1);
    let mut day: Option<String> = None;
    let mut otp_url = std::env::var("OTP_URL").unwrap_or_else(|_| "http://localhost:8080".into());
    let mut centrality = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--grid" if i + 1 < args.len() => {
                grid_m = args[i + 1].parse().unwrap_or(200.0);
                i += 2;
            }
            "--minutes" if i + 1 < args.len() => {
                minutes = args[i + 1].parse().unwrap_or(30.0);
                i += 2;
            }
            "--workers" if i + 1 < args.len() => {
                workers = args[i + 1].parse().unwrap_or(workers);
                i += 2;
            }
            "--day" if i + 1 < args.len() => {
                let val = args[i + 1].to_lowercase();
                if !VALID_DAYS.contains(&val.as_str()) {
                    eprintln!(
                        "Invalid --day value: \"{}\". Expected one of: {}",
                        val,
                        VALID_DAYS.join(", ")
                    );
                    std::process::exit(1);
                }
                day = Some(val);
                i += 2;
            }
            "--otp-url" if i + 1 < args.len() => {
                otp_url = args[i + 1].clone();
                i += 2;
            }
            "--centrality" => {
                centrality = true;
                i += 1;
            }
            _ => {
                i += 1;
            }
        }
    }

    let service_date = day.as_ref().map(|d| next_date_for_day(d));

    Args {
        grid_m,
        minutes,
        workers,
        day,
        service_date,
        otp_url,
        centrality,
    }
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

/// Run one scoring pass: for each point, average reachable cell count across departures.
#[allow(clippy::too_many_arguments)]
fn scoring_pass(
    label: &str,
    points: &[SamplePoint],
    departures: &[f64],
    max_seconds: f64,
    graph: &TransitGraphJson,
    walk_graph: &WalkGraph,
    stop_snaps: &[Option<walk_expand::StopSnap>],
    use_bajs: bool,
    exclude_modes: Option<&[transit_graph::Mode]>,
) -> Vec<i64> {
    let t = Instant::now();
    let n_deps = departures.len() as f64;
    eprintln!(
        "{} ({} departures × {} points)",
        label,
        departures.len(),
        points.len()
    );

    let bajs_adj = if use_bajs && !graph.bajs_stations.is_empty() {
        let stop_coords: Vec<(f64, f64)> = graph.stops.iter().map(|s| (s.lat, s.lon)).collect();
        Some(Arc::new(build_bajs_adjacency_indexed(
            &stop_coords,
            graph.stop_count,
            &graph.bajs_stations,
        )))
    } else {
        None
    };

    // Build extended stop snaps that include BAJS station snaps
    let extended_snaps: Vec<Option<walk_expand::StopSnap>> = if use_bajs
        && !graph.bajs_stations.is_empty()
    {
        let mut snaps = stop_snaps.to_vec();
        for station in &graph.bajs_stations {
            let snap = walk_expand::find_nearest_node(walk_graph, station.lat, station.lon, 0.09)
                .map(|node_idx| {
                    let nlat = walk_graph.lat(node_idx);
                    let nlon = walk_graph.lon(node_idx);
                    walk_expand::StopSnap {
                        node_idx,
                        walk_seconds: (fast_dist_km(station.lat, station.lon, nlat, nlon)
                            / WALK_SPEED)
                            * 3600.0,
                    }
                });
            snaps.push(snap);
        }
        snaps
    } else {
        stop_snaps.to_vec()
    };
    let extended_snaps = Arc::new(extended_snaps);

    let node_count = walk_graph.node_count as usize;
    let transit_capacity = graph.stop_count + bajs_adj.as_ref().map_or(0, |a| a.bajs_count);

    let scores: Vec<i64> = points
        .par_iter()
        .map(|point| {
            // Thread-local state for walk + transit Dijkstra
            thread_local! {
                static WALK_STATE: std::cell::RefCell<Option<walk_expand::WalkExpandState>> = const { std::cell::RefCell::new(None) };
                static TRANSIT_STATE: std::cell::RefCell<Option<TransitState>> = const { std::cell::RefCell::new(None) };
            }

            WALK_STATE.with(|state_cell| {
                TRANSIT_STATE.with(|tstate_cell| {
                    let mut state_opt = state_cell.borrow_mut();
                    let state = state_opt.get_or_insert_with(|| {
                        walk_expand::WalkExpandState::new(node_count)
                    });
                    let mut tstate_opt = tstate_cell.borrow_mut();
                    let tstate = tstate_opt.get_or_insert_with(|| {
                        TransitState::new(transit_capacity)
                    });

                    let mut total = 0u64;
                    for &dep in departures {
                        compute_avg_travel_times(
                            graph,
                            point.lat,
                            point.lon,
                            dep,
                            max_seconds,
                            bajs_adj.as_deref(),
                            exclude_modes,
                            &mut tstate.best,
                            &mut tstate.heap,
                            &mut tstate.touched,
                        );
                        total += count_reachable_cells(
                            walk_graph,
                            &tstate.best,
                            &extended_snaps,
                            point.lat,
                            point.lon,
                            max_seconds,
                            state,
                        ) as u64;
                        tstate.reset_touched();
                    }

                    // Match JS: Math.round(total / departureTimes.length)
                    ((total as f64 / n_deps) + 0.5).floor() as i64
                })
            })
        })
        .collect();

    eprintln!("  done in {:.1}s", t.elapsed().as_secs_f64());
    scores
}

fn avg(v: &[f64]) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.iter().sum::<f64>() / v.len() as f64
}

fn stddev(v: &[f64], mean: f64) -> f64 {
    if v.len() < 2 {
        return 0.0;
    }
    let variance = v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / v.len() as f64;
    variance.sqrt()
}

fn median(sorted: &[f64]) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 1 {
        sorted[mid]
    } else {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    }
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = (p / 100.0) * (sorted.len() - 1) as f64;
    let lo = idx.floor() as usize;
    let hi = idx.ceil() as usize;
    if lo == hi {
        return sorted[lo];
    }
    sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo as f64)
}

fn boost_pct(base: f64, boosted: f64) -> i64 {
    if base > 0.0 {
        ((boosted - base) / base * 100.0 + 0.5).floor() as i64
    } else {
        0
    }
}

fn js_round(x: f64) -> i64 {
    (x + 0.5).floor() as i64
}

// ---------------------------------------------------------------------------
// Output types (exported to TypeScript via ts-rs)
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DistrictScoresOutput {
    pub generated_at: String,
    pub departure_window: String,
    pub evening_window: String,
    pub departure_count: usize,
    #[ts(type = "number")]
    pub grid_spacing_m: i64,
    #[ts(type = "number")]
    pub max_minutes: i64,
    pub total_sample_points: usize,
    pub total_grid_cells: usize,
    pub bajs_total_stations: usize,
    pub bajs_covered_stops: usize,
    #[ts(type = "number")]
    pub bajs_stop_coverage_pct: i64,
    #[ts(type = "number")]
    pub city_desert_pct: i64,
    pub districts: Vec<District>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub day: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub service_date: Option<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub name: String,
    #[ts(type = "number")]
    pub osm_id: i64,
    #[ts(type = "number | null")]
    pub population: Option<i64>,
    pub sample_count: usize,
    #[ts(type = "number")]
    pub avg_reachable_cells: i64,
    #[ts(type = "number")]
    pub min_reachable_cells: i64,
    #[ts(type = "number")]
    pub max_reachable_cells: i64,
    #[ts(type = "number")]
    pub stddev_reachable_cells: i64,
    #[ts(type = "number")]
    pub median_reachable_cells: i64,
    #[ts(type = "number")]
    pub p25_reachable_cells: i64,
    #[ts(type = "number")]
    pub p75_reachable_cells: i64,
    #[ts(type = "number")]
    pub evening_avg_reachable_cells: i64,
    #[ts(type = "number")]
    pub peak_offpeak_drop: i64,
    #[ts(type = "number")]
    pub train_avg_reachable_cells: i64,
    #[ts(type = "number")]
    pub train_boost_pct: i64,
    #[ts(type = "number")]
    pub bajs_avg_reachable_cells: i64,
    #[ts(type = "number")]
    pub bajs_boost_pct: i64,
    #[ts(type = "number")]
    pub bajs_stations: i64,
    pub area_km2: f64,
    pub bajs_density_per_km2: f64,
    pub bajs_per_10k: f64,
    #[ts(type = "number")]
    pub bajs_stop_coverage_pct: i64,
    #[ts(type = "number")]
    pub desert_pct: i64,
    #[ts(type = "number")]
    pub avg_nearest_stop_m: i64,
    pub best_point: BestPoint,
    pub tram_lines: Vec<String>,
    pub bus_lines: Vec<String>,
    pub train_lines: Vec<String>,
    #[ts(type = "number")]
    pub stops: i64,
    #[ts(type = "number")]
    pub median_headway_min: i64,
    #[ts(type = "number")]
    pub rank: i64,
    #[ts(type = "number")]
    pub score: i64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
pub struct BestPoint {
    pub lat: f64,
    pub lon: f64,
}

fn main() {
    let args = parse_args();
    let max_seconds = args.minutes * 60.0;

    // Configure rayon thread pool
    rayon::ThreadPoolBuilder::new()
        .num_threads(args.workers)
        .build_global()
        .unwrap();

    if let Some(ref day) = args.day {
        eprintln!(
            "Day: {} (service date: {})",
            day,
            args.service_date.as_ref().unwrap()
        );
    }

    let data_dir = Path::new("../data");
    let osm_path = data_dir.join("osm/croatia.osm.pbf");
    let walk_graph_path = data_dir.join("walk-graph.bin");
    let districts_path = data_dir.join("districts.geojson");

    // Load all data
    eprintln!("Extracting building footprints from OSM...");
    let populated_cells = extract_populated_cells(&osm_path);
    eprintln!("  {} populated grid cells", populated_cells.len());

    eprintln!("Loading walk graph...");
    let walk_graph = WalkGraph::load(&walk_graph_path);
    eprintln!(
        "  {} nodes, {} edges",
        walk_graph.node_count, walk_graph.edge_count
    );

    eprintln!("Building transit graph from OTP...");
    let mut graph = otp::fetch_and_build_graph(&args.otp_url, args.service_date.as_deref());
    eprintln!(
        "  {} patterns, {} stops",
        graph.patterns.len(),
        graph.stops.len()
    );

    eprintln!("Fetching BAJS station locations...");
    graph.bajs_stations = otp::fetch_bajs_stations();
    eprintln!(
        "  {} stations (idealized: 1 bike, 1 dock each)",
        graph.bajs_stations.len()
    );

    // Compute route-level stats (before heavy scoring passes)
    route_stats::compute_and_write(
        &graph,
        &data_dir.join("route-stats.json"),
        args.service_date.is_some(),
    );

    // Compute network-wide stats (hourly heatmap, fleet, dead-ends, etc.)
    network_stats::compute_and_write(
        &graph,
        data_dir,
        &data_dir.join("network-stats.json"),
        args.service_date.is_some(),
    );

    // Compute centrality metrics (if requested — heavy computation)
    if args.centrality {
        centrality::compute_and_write(&graph, &data_dir.join("centrality-stats.json"));
    }

    eprintln!("Loading districts...");
    let districts = load_districts(&districts_path);
    eprintln!("  {} districts", districts.len());

    // Compute district areas
    let district_areas: Vec<f64> = districts
        .iter()
        .map(|d| {
            let a = polygon_area_km2(&d.ring);
            (a * 10.0).round() / 10.0 // 1 decimal place
        })
        .collect();

    // Count BAJS stations per district
    let mut district_bajs_count: Vec<i64> = vec![0; districts.len()];
    for station in &graph.bajs_stations {
        for (i, d) in districts.iter().enumerate() {
            if point_in_polygon(station.lon, station.lat, &d.ring) {
                district_bajs_count[i] += 1;
                break;
            }
        }
    }

    // Compute per-district transit metadata
    eprintln!("Computing transit info per district...");
    let departure_seconds: f64 = 8.0 * 3600.0; // 08:00 for headway computation

    struct TransitInfo {
        tram_lines: Vec<String>,
        bus_lines: Vec<String>,
        train_lines: Vec<String>,
        stops: i64,
        median_headway_min: i64,
    }

    let mut stop_to_district: Vec<Option<usize>> = vec![None; graph.stop_count];
    for (si, stop) in graph.stops.iter().enumerate() {
        for (di, d) in districts.iter().enumerate() {
            if point_in_polygon(stop.lon, stop.lat, &d.ring) {
                stop_to_district[si] = Some(di);
                break;
            }
        }
    }

    // Count stops with BAJS coverage per district (within 350m)
    let mut district_stops_with_bajs: Vec<usize> = vec![0; districts.len()];
    let mut total_stops_with_bajs: usize = 0;
    if !graph.bajs_stations.is_empty() {
        for (si, stop) in graph.stops.iter().enumerate() {
            let has_bajs = graph
                .bajs_stations
                .iter()
                .any(|st| fast_dist_km(stop.lat, stop.lon, st.lat, st.lon) <= BAJS_TRANSFER_MAX_KM);
            if has_bajs {
                total_stops_with_bajs += 1;
                if let Some(di) = stop_to_district[si] {
                    district_stops_with_bajs[di] += 1;
                }
            }
        }
    }
    let system_bajs_coverage_pct =
        js_round(total_stops_with_bajs as f64 / graph.stop_count.max(1) as f64 * 100.0);

    let mut district_transit: Vec<TransitInfo> = (0..districts.len())
        .map(|_| TransitInfo {
            tram_lines: Vec::new(),
            bus_lines: Vec::new(),
            train_lines: Vec::new(),
            stops: 0,
            median_headway_min: 0,
        })
        .collect();

    for (di, dt) in district_transit.iter_mut().enumerate() {
        let mut tram_routes: HashSet<String> = HashSet::new();
        let mut bus_routes: HashSet<String> = HashSet::new();
        let mut train_routes: HashSet<String> = HashSet::new();
        let mut headways: Vec<f64> = Vec::new();
        let mut stop_count = 0i64;

        for (si, d_opt) in stop_to_district.iter().enumerate() {
            if *d_opt != Some(di) {
                continue;
            }
            stop_count += 1;

            let stop = &graph.stops[si];
            let mut seen_patterns: HashSet<usize> = HashSet::new();

            for sp in &stop.patterns {
                let pattern = &graph.patterns[sp.pattern_idx];
                match pattern.mode_enum {
                    transit_graph::Mode::Tram => {
                        tram_routes.insert(pattern.route.clone());
                    }
                    transit_graph::Mode::Rail => {
                        train_routes.insert(pattern.route.clone());
                    }
                    _ => {
                        bus_routes.insert(pattern.route.clone());
                    }
                }

                if seen_patterns.insert(sp.pattern_idx) {
                    let offset = pattern.stop_offsets[sp.stop_idx];
                    let target = departure_seconds - offset;
                    let window_deps: Vec<f64> = pattern
                        .departures
                        .iter()
                        .filter(|&&dep| dep >= target - 1800.0 && dep <= target + 1800.0)
                        .copied()
                        .collect();
                    if window_deps.len() >= 2 {
                        let hw = (window_deps.last().unwrap() - window_deps.first().unwrap())
                            / (window_deps.len() - 1) as f64;
                        headways.push(hw);
                    }
                }
            }
        }

        headways.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median_hw = if !headways.is_empty() {
            headways[headways.len() / 2]
        } else {
            0.0
        };

        let mut tram_vec: Vec<String> = tram_routes.into_iter().collect();
        tram_vec.sort_by_key(|a| a.parse::<i32>().unwrap_or(999));
        let mut bus_vec: Vec<String> = bus_routes.into_iter().collect();
        bus_vec.sort_by_key(|a| a.parse::<i32>().unwrap_or(999));
        let mut train_vec: Vec<String> = train_routes.into_iter().collect();
        train_vec.sort();

        *dt = TransitInfo {
            tram_lines: tram_vec,
            bus_lines: bus_vec,
            train_lines: train_vec,
            stops: stop_count,
            median_headway_min: (median_hw / 60.0 + 0.5).floor() as i64,
        };
    }

    let assigned_count: usize = stop_to_district.iter().filter(|d| d.is_some()).count();
    eprintln!("  {} stops assigned to districts", assigned_count);

    // Generate sample points
    eprintln!("Generating sample grid...");
    let points =
        generate_sample_points(&districts, args.grid_m / 1000.0, &populated_cells, POP_CELL);
    eprintln!("  {} sample points in populated areas", points.len());

    // Transit desert metrics (spatial grid for fast nearest-stop lookup)
    eprintln!("Computing transit desert metrics...");
    let stop_coords: Vec<(f64, f64)> = graph.stops.iter().map(|s| (s.lat, s.lon)).collect();
    let mut district_desert_count: Vec<i64> = vec![0; districts.len()];
    let mut district_nearest_sum: Vec<f64> = vec![0.0; districts.len()];
    let mut district_point_count: Vec<i64> = vec![0; districts.len()];

    // Build spatial grid for stops (~1km cells)
    let desert_grid_cell = 0.01; // ~1.1km in degrees
    let mut stop_grid: HashMap<(i32, i32), Vec<(f64, f64)>> = HashMap::new();
    for &(slat, slon) in &stop_coords {
        let cx = (slon / desert_grid_cell).floor() as i32;
        let cy = (slat / desert_grid_cell).floor() as i32;
        stop_grid.entry((cx, cy)).or_default().push((slat, slon));
    }

    for point in &points {
        let cx = (point.lon / desert_grid_cell).floor() as i32;
        let cy = (point.lat / desert_grid_cell).floor() as i32;
        let mut min_dist_km = f64::INFINITY;

        // Check nearby cells (expanding radius covers DESERT_THRESHOLD_KM)
        for dx in -1..=1 {
            for dy in -1..=1 {
                if let Some(nearby) = stop_grid.get(&(cx + dx, cy + dy)) {
                    for &(slat, slon) in nearby {
                        let d = fast_dist_km(point.lat, point.lon, slat, slon);
                        if d < min_dist_km {
                            min_dist_km = d;
                        }
                    }
                }
            }
        }

        // If no stop found in nearby cells, check all (rare — only for remote points)
        if min_dist_km == f64::INFINITY {
            for &(slat, slon) in &stop_coords {
                let d = fast_dist_km(point.lat, point.lon, slat, slon);
                if d < min_dist_km {
                    min_dist_km = d;
                }
            }
        }

        district_point_count[point.district_idx] += 1;
        district_nearest_sum[point.district_idx] += min_dist_km * 1000.0;
        if min_dist_km > DESERT_THRESHOLD_KM {
            district_desert_count[point.district_idx] += 1;
        }
    }

    let total_desert: i64 = district_desert_count.iter().sum();
    eprintln!(
        "  {} of {} points ({}%) are >500m from nearest stop",
        total_desert,
        points.len(),
        (total_desert as f64 / points.len() as f64 * 100.0 + 0.5).floor() as i64
    );

    // Snap transit stops to walk graph
    eprintln!("Snapping transit stops to walk graph...");
    let stop_snaps = snap_stops(&walk_graph, &stop_coords);
    let snapped = stop_snaps.iter().filter(|s| s.is_some()).count();
    eprintln!("  {}/{} stops snapped", snapped, stop_coords.len());

    let t0 = Instant::now();

    let rail_modes = vec![transit_graph::Mode::Rail];

    // Pass 1: Bus+tram only (exclude RAIL, no BAJS)
    let pass1_scores = scoring_pass(
        "Pass 1/4: Scoring bus+tram only...",
        &points,
        &MORNING_DEPARTURES,
        max_seconds,
        &graph,
        &walk_graph,
        &stop_snaps,
        false,
        Some(&rail_modes),
    );

    // Pass 2: Bus+tram+train (no BAJS)
    let pass2_scores = scoring_pass(
        "Pass 2/4: Scoring bus+tram+train...",
        &points,
        &MORNING_DEPARTURES,
        max_seconds,
        &graph,
        &walk_graph,
        &stop_snaps,
        false,
        None,
    );

    // Pass 3: Bus+tram+train+BAJS
    let pass3_scores = scoring_pass(
        "Pass 3/4: Scoring bus+tram+train+BAJS...",
        &points,
        &MORNING_DEPARTURES,
        max_seconds,
        &graph,
        &walk_graph,
        &stop_snaps,
        true,
        None,
    );

    // Pass 4: Evening off-peak bus+tram only
    let pass4_scores = scoring_pass(
        "Pass 4/4: Scoring evening off-peak...",
        &points,
        &EVENING_DEPARTURES,
        max_seconds,
        &graph,
        &walk_graph,
        &stop_snaps,
        false,
        Some(&rail_modes),
    );

    // Aggregate per district
    let n_districts = districts.len();

    struct DistrictScores {
        base: Vec<f64>,
        train: Vec<f64>,
        bajs: Vec<f64>,
        evening: Vec<f64>,
        best_lat: f64,
        best_lon: f64,
        best_reached: i64,
    }

    let mut ds: Vec<DistrictScores> = (0..n_districts)
        .map(|_| DistrictScores {
            base: Vec::new(),
            train: Vec::new(),
            bajs: Vec::new(),
            evening: Vec::new(),
            best_lat: 0.0,
            best_lon: 0.0,
            best_reached: -1,
        })
        .collect();

    for (pi, point) in points.iter().enumerate() {
        let di = point.district_idx;
        ds[di].base.push(pass1_scores[pi] as f64);
        ds[di].train.push(pass2_scores[pi] as f64);
        ds[di].bajs.push(pass3_scores[pi] as f64);
        ds[di].evening.push(pass4_scores[pi] as f64);
        // Best point from pass 2 (full transit with trains)
        if pass2_scores[pi] > ds[di].best_reached {
            ds[di].best_reached = pass2_scores[pi];
            ds[di].best_lat = point.lat;
            ds[di].best_lon = point.lon;
        }
    }

    // Build result objects
    struct DistrictResult {
        name: String,
        osm_id: i64,
        population: Option<i64>,
        sample_count: usize,
        avg_reachable_cells: i64,
        min_reachable_cells: i64,
        max_reachable_cells: i64,
        stddev_reachable_cells: i64,
        median_reachable_cells: i64,
        p25_reachable_cells: i64,
        p75_reachable_cells: i64,
        evening_avg_reachable_cells: i64,
        peak_offpeak_drop: i64,
        train_avg_reachable_cells: i64,
        train_boost_pct: i64,
        bajs_avg_reachable_cells: i64,
        bajs_boost_pct: i64,
        bajs_stations: i64,
        area_km2: f64,
        bajs_density_per_km2: f64,
        bajs_per_10k: f64,
        bajs_stop_coverage_pct: i64,
        desert_pct: i64,
        avg_nearest_stop_m: i64,
        best_lat: f64,
        best_lon: f64,
        tram_lines: Vec<String>,
        bus_lines: Vec<String>,
        train_lines: Vec<String>,
        transit_stops: i64,
        median_headway_min: i64,
        rank: i64,
        score: i64,
    }

    let mut results: Vec<DistrictResult> = Vec::new();

    for (i, d) in districts.iter().enumerate() {
        let base_avg = avg(&ds[i].base);
        let train_avg = avg(&ds[i].train);
        let bajs_avg = avg(&ds[i].bajs);
        let evening_avg = avg(&ds[i].evening);

        let mut sorted_base = ds[i].base.clone();
        sorted_base.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let peak_offpeak_drop = if base_avg > 0.0 {
            js_round((base_avg - evening_avg) / base_avg * 100.0)
        } else {
            0
        };

        let desert_pct = if district_point_count[i] > 0 {
            js_round(district_desert_count[i] as f64 / district_point_count[i] as f64 * 100.0)
        } else {
            0
        };

        let avg_nearest_stop_m = if district_point_count[i] > 0 {
            js_round(district_nearest_sum[i] / district_point_count[i] as f64)
        } else {
            0
        };

        let min_cells = if ds[i].base.is_empty() {
            0
        } else {
            ds[i].base.iter().cloned().fold(f64::INFINITY, f64::min) as i64
        };
        let max_cells = if ds[i].base.is_empty() {
            0
        } else {
            ds[i].base.iter().cloned().fold(f64::NEG_INFINITY, f64::max) as i64
        };

        let transit = &district_transit[i];

        // Round bestPoint to 4 decimal places: multiply by 10000, round, divide back
        let best_lat_rounded = (ds[i].best_lat * 10000.0 + 0.5).floor() / 10000.0;
        let best_lon_rounded = (ds[i].best_lon * 10000.0 + 0.5).floor() / 10000.0;

        results.push(DistrictResult {
            name: d.name.clone(),
            osm_id: d.osm_id,
            population: d.population,
            sample_count: ds[i].base.len(),
            avg_reachable_cells: js_round(base_avg),
            min_reachable_cells: min_cells,
            max_reachable_cells: max_cells,
            stddev_reachable_cells: js_round(stddev(&ds[i].base, base_avg)),
            median_reachable_cells: js_round(median(&sorted_base)),
            p25_reachable_cells: js_round(percentile(&sorted_base, 25.0)),
            p75_reachable_cells: js_round(percentile(&sorted_base, 75.0)),
            evening_avg_reachable_cells: js_round(evening_avg),
            peak_offpeak_drop,
            train_avg_reachable_cells: js_round(train_avg),
            train_boost_pct: boost_pct(base_avg, train_avg),
            bajs_avg_reachable_cells: js_round(bajs_avg),
            bajs_boost_pct: boost_pct(train_avg, bajs_avg),
            bajs_stations: district_bajs_count[i],
            area_km2: district_areas[i],
            bajs_density_per_km2: if district_areas[i] > 0.0 {
                (district_bajs_count[i] as f64 / district_areas[i] * 100.0).round() / 100.0
            } else {
                0.0
            },
            bajs_per_10k: d.population.map_or(0.0, |pop| {
                if pop > 0 {
                    let raw = district_bajs_count[i] as f64 / pop as f64 * 10000.0;
                    (raw * 10.0).round() / 10.0 // 1 decimal place
                } else {
                    0.0
                }
            }),
            bajs_stop_coverage_pct: if transit.stops > 0 {
                js_round(district_stops_with_bajs[i] as f64 / transit.stops as f64 * 100.0)
            } else {
                0
            },
            desert_pct,
            avg_nearest_stop_m,
            best_lat: best_lat_rounded,
            best_lon: best_lon_rounded,
            tram_lines: transit.tram_lines.clone(),
            bus_lines: transit.bus_lines.clone(),
            train_lines: transit.train_lines.clone(),
            transit_stops: transit.stops,
            median_headway_min: transit.median_headway_min,
            rank: 0,
            score: 0,
        });
    }

    // Sort descending by base score
    results.sort_by(|a, b| b.avg_reachable_cells.cmp(&a.avg_reachable_cells));

    // Assign ranks and normalize to 0-100
    let max_score = results.first().map_or(1, |r| r.avg_reachable_cells.max(1));
    for (i, r) in results.iter_mut().enumerate() {
        r.rank = (i + 1) as i64;
        r.score = js_round(r.avg_reachable_cells as f64 / max_score as f64 * 100.0);
    }

    // Build typed output
    let district_json: Vec<District> = results
        .iter()
        .map(|r| District {
            name: r.name.clone(),
            osm_id: r.osm_id,
            population: r.population,
            sample_count: r.sample_count,
            avg_reachable_cells: r.avg_reachable_cells,
            min_reachable_cells: r.min_reachable_cells,
            max_reachable_cells: r.max_reachable_cells,
            stddev_reachable_cells: r.stddev_reachable_cells,
            median_reachable_cells: r.median_reachable_cells,
            p25_reachable_cells: r.p25_reachable_cells,
            p75_reachable_cells: r.p75_reachable_cells,
            evening_avg_reachable_cells: r.evening_avg_reachable_cells,
            peak_offpeak_drop: r.peak_offpeak_drop,
            train_avg_reachable_cells: r.train_avg_reachable_cells,
            train_boost_pct: r.train_boost_pct,
            bajs_avg_reachable_cells: r.bajs_avg_reachable_cells,
            bajs_boost_pct: r.bajs_boost_pct,
            bajs_stations: r.bajs_stations,
            area_km2: r.area_km2,
            bajs_density_per_km2: r.bajs_density_per_km2,
            bajs_per_10k: r.bajs_per_10k,
            bajs_stop_coverage_pct: r.bajs_stop_coverage_pct,
            desert_pct: r.desert_pct,
            avg_nearest_stop_m: r.avg_nearest_stop_m,
            best_point: BestPoint {
                lat: r.best_lat,
                lon: r.best_lon,
            },
            tram_lines: r.tram_lines.clone(),
            bus_lines: r.bus_lines.clone(),
            train_lines: r.train_lines.clone(),
            stops: r.transit_stops,
            median_headway_min: r.median_headway_min,
            rank: r.rank,
            score: r.score,
        })
        .collect();

    let output = DistrictScoresOutput {
        generated_at: chrono_now_iso(),
        departure_window: "07:30-08:30".to_string(),
        evening_window: "20:30-21:30".to_string(),
        departure_count: MORNING_DEPARTURES.len(),
        grid_spacing_m: args.grid_m as i64,
        max_minutes: args.minutes as i64,
        total_sample_points: points.len(),
        total_grid_cells: walk_graph.grid.len(),
        bajs_total_stations: graph.bajs_stations.len(),
        bajs_covered_stops: total_stops_with_bajs,
        bajs_stop_coverage_pct: system_bajs_coverage_pct,
        city_desert_pct: js_round(total_desert as f64 / points.len() as f64 * 100.0),
        districts: district_json,
        day: args.day.clone(),
        service_date: args.service_date.clone(),
    };

    let out_file = if let Some(ref day) = args.day {
        format!("district-scores-{}.json", day)
    } else {
        "district-scores.json".to_string()
    };
    let out_path = data_dir.join(out_file);
    let json_str = serde_json::to_string_pretty(&output).expect("JSON serialization failed");
    std::fs::write(&out_path, json_str).expect("Cannot write output JSON");

    let elapsed = t0.elapsed().as_secs_f64();
    eprintln!("\nDone in {:.1}s → {}", elapsed, out_path.display());

    // Summary table
    eprintln!(
        "\n{:>3}  {:<28} {:>5}  {:>5}  {:>4}  {:>4}  {:>4}  {:>5}",
        "#", "District", "Score", "Cells", "±Std", "Eve", "Drop", "Desert"
    );
    eprintln!("{}", "─".repeat(88));
    for r in &results {
        let drop_str = if r.peak_offpeak_drop > 0 {
            format!("-{}%", r.peak_offpeak_drop)
        } else {
            "—".to_string()
        };
        let desert_str = if r.desert_pct > 0 {
            format!("{}%", r.desert_pct)
        } else {
            "—".to_string()
        };
        eprintln!(
            "{:>3}  {:<28} {:>5}  {:>5}  {:>4}  {:>4}  {:>4}  {:>5}",
            r.rank,
            r.name,
            r.score,
            r.avg_reachable_cells,
            r.stddev_reachable_cells,
            r.evening_avg_reachable_cells,
            drop_str,
            desert_str,
        );
    }

    // 24-hour accessibility profile (uses best_point as centroid per district)
    let centroids: Vec<(f64, f64)> = (0..n_districts)
        .map(|di| (ds[di].best_lat, ds[di].best_lon))
        .collect();

    compute_accessibility_profile(
        &districts,
        &centroids,
        max_seconds,
        &graph,
        &walk_graph,
        &stop_snaps,
        data_dir,
    );
}

// ---------------------------------------------------------------------------
// 24-Hour Accessibility Profile
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityProfileOutput {
    pub generated_at: String,
    #[ts(type = "number")]
    pub max_minutes: i64,
    pub mode: String,
    pub districts: Vec<DistrictHourlyProfile>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DistrictHourlyProfile {
    pub name: String,
    pub key: String,
    pub hours: Vec<u8>,
    pub reachable_cells: Vec<f64>,
    #[ts(type = "number")]
    pub peak_hour: u8,
    pub peak_cells: f64,
    #[ts(type = "number")]
    pub trough_hour: u8,
    pub trough_cells: f64,
    pub service_drop_pct: f64,
}

fn slugify(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'č' | 'ć' => 'c',
            'š' => 's',
            'ž' => 'z',
            'đ' => 'd',
            ' ' => '-',
            c => c,
        })
        .collect()
}

/// Compute the 24-hour accessibility profile for each district using centroids only.
/// Uses bus+tram mode (excludes rail, no BAJS) with 19 hourly windows (05:00-23:00),
/// 3 departure samples per hour.
///
/// `centroids` is a slice of (lat, lon) per district, indexed by district order.
fn compute_accessibility_profile(
    districts: &[crate::districts::District],
    centroids: &[(f64, f64)],
    max_seconds: f64,
    graph: &TransitGraphJson,
    walk_graph: &WalkGraph,
    stop_snaps: &[Option<walk_expand::StopSnap>],
    data_dir: &Path,
) {
    let t = Instant::now();
    let hours: Vec<u8> = (5..=23).collect();
    let n_hours = hours.len();

    // Build centroid points: one per district using best_point from scoring results
    let centroid_points: Vec<SamplePoint> = centroids
        .iter()
        .enumerate()
        .map(|(i, &(lat, lon))| SamplePoint {
            lat,
            lon,
            district_idx: i,
        })
        .collect();

    let n_districts = districts.len();
    let rail_modes = vec![transit_graph::Mode::Rail];

    eprintln!(
        "Computing 24-hour accessibility profile ({} districts × {} hours × 3 departures = {} Dijkstra runs)...",
        n_districts, n_hours, n_districts * n_hours * 3
    );

    // For each hour, build 3 departure times: hour-15min, hour, hour+15min
    // Then run scoring_pass with those departures for the centroid points
    let mut hourly_scores: Vec<Vec<f64>> = vec![Vec::new(); n_districts]; // [district][hour] = avg cells

    for &hour in &hours {
        let h = hour as f64 * 3600.0;
        let departures = [h - 15.0 * 60.0, h, h + 15.0 * 60.0];
        let label = format!("  {:02}:00", hour);

        let scores = scoring_pass(
            &label,
            &centroid_points,
            &departures,
            max_seconds,
            graph,
            walk_graph,
            stop_snaps,
            false,
            Some(&rail_modes),
        );

        for (di, &score) in scores.iter().enumerate() {
            hourly_scores[di].push(score as f64);
        }
    }

    // Build output profiles
    let mut profiles: Vec<DistrictHourlyProfile> = Vec::new();

    for (di, d) in districts.iter().enumerate() {
        let cells = &hourly_scores[di];

        let mut peak_idx = 0usize;
        let mut trough_idx = 0usize;
        let mut peak_val = f64::NEG_INFINITY;
        let mut trough_val = f64::INFINITY;

        for (hi, &c) in cells.iter().enumerate() {
            if c > peak_val {
                peak_val = c;
                peak_idx = hi;
            }
            if c < trough_val {
                trough_val = c;
                trough_idx = hi;
            }
        }

        let service_drop_pct = if peak_val > 0.0 {
            ((peak_val - trough_val) / peak_val * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        };

        let key = slugify(&d.name);

        profiles.push(DistrictHourlyProfile {
            name: d.name.clone(),
            key,
            hours: hours.clone(),
            reachable_cells: cells.iter().map(|c| (c * 10.0).round() / 10.0).collect(),
            peak_hour: hours[peak_idx],
            peak_cells: (peak_val * 10.0).round() / 10.0,
            trough_hour: hours[trough_idx],
            trough_cells: (trough_val * 10.0).round() / 10.0,
            service_drop_pct,
        });
    }

    let output = AccessibilityProfileOutput {
        generated_at: chrono_now_iso(),
        max_minutes: (max_seconds / 60.0) as i64,
        mode: "bus+tram".to_string(),
        districts: profiles,
    };

    let out_path = data_dir.join("accessibility-profile.json");
    let json_str = serde_json::to_string_pretty(&output).expect("JSON serialization failed");
    std::fs::write(&out_path, json_str).expect("Cannot write accessibility profile JSON");

    eprintln!(
        "Accessibility profile done in {:.1}s → {}",
        t.elapsed().as_secs_f64(),
        out_path.display()
    );
}

/// Simple ISO 8601 timestamp without pulling in chrono.
pub fn chrono_now_iso() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap();
    let secs = dur.as_secs();
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    let (y, month, day) = days_to_ymd((secs / 86400) as i64);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        y, month, day, h, m, s
    )
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
