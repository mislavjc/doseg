//! Per-route statistics: distance, stops, departures, speed, transfer hubs.
//!
//! Distance is computed from the OTP polyline geometry (actual path), falling
//! back to stop-to-stop haversine when geometry is unavailable.
//! Departures = max across patterns of the same route (busiest single variant),
//! not summed across all patterns.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use ts_rs::TS;

use crate::geo::fast_dist_km;
use crate::transit_graph::{Mode, PatternData, TransitGraphJson};

// ---------------------------------------------------------------------------
// Output types (exported to TypeScript via ts-rs)
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RouteStatsOutput {
    pub generated_at: String,
    pub summary: RouteStatsSummary,
    pub routes: Vec<RouteStatsRoute>,
    pub transfer_hubs: Vec<TransferHub>,
    pub multimodal_connections: MultimodalConnections,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RouteStatsSummary {
    pub total_routes: usize,
    pub tram_routes: usize,
    pub bus_routes: usize,
    pub rail_routes: usize,
    pub total_stops: usize,
    pub total_daily_departures: u64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RouteStatsRoute {
    pub name: String,
    pub mode: String,
    pub distance_km: f64,
    pub stops: usize,
    pub daily_departures: usize,
    pub first_departure: String,
    pub last_departure: String,
    pub service_hours: f64,
    pub dep_per_hour: f64,
    pub travel_time_min: f64,
    pub commercial_speed_kmh: f64,
    pub peak_headway_min: Option<f64>,
    pub avg_headway_min: Option<f64>,
    pub patterns: usize,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TransferHub {
    pub name: String,
    pub key: String,
    pub lat: f64,
    pub lon: f64,
    pub route_count: usize,
    pub tram_routes: Vec<String>,
    pub bus_routes: Vec<String>,
    pub rail_routes: Vec<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MultimodalConnections {
    pub tram_bus: u32,
    pub tram_rail: u32,
    pub bus_rail: u32,
    pub three_mode: u32,
}

/// Per-route aggregate built from the busiest pattern.
struct RouteAgg {
    mode_str: String,
    max_dist_km: f64,
    max_stops: usize,
    max_travel_time_sec: f64,
    /// Departures from the single busiest pattern (not summed).
    best_departures: Vec<f64>,
    pattern_count: usize,
}

/// Decode a Google Encoded Polyline into (lat, lon) pairs.
pub(crate) fn decode_polyline(encoded: &str) -> Vec<(f64, f64)> {
    let mut points = Vec::new();
    let bytes = encoded.as_bytes();
    let mut idx = 0;
    let mut lat = 0i64;
    let mut lng = 0i64;

    while idx < bytes.len() {
        // Decode latitude
        let mut shift = 0u32;
        let mut result = 0i64;
        loop {
            let b = (bytes[idx] as i64) - 63;
            idx += 1;
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

        // Decode longitude
        shift = 0;
        result = 0;
        loop {
            let b = (bytes[idx] as i64) - 63;
            idx += 1;
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

        points.push((lat as f64 / 1e5, lng as f64 / 1e5));
    }
    points
}

/// Compute path distance from encoded polyline geometry.
pub(crate) fn polyline_distance_km(encoded: &str) -> f64 {
    let points = decode_polyline(encoded);
    let mut dist = 0.0;
    for i in 1..points.len() {
        dist += fast_dist_km(points[i - 1].0, points[i - 1].1, points[i].0, points[i].1);
    }
    dist
}

/// Compute route distance from stop-to-stop haversine (fallback).
pub(crate) fn stop_distance_km(pattern: &PatternData, graph: &TransitGraphJson) -> f64 {
    let mut dist = 0.0;
    for i in 1..pattern.stop_indices.len() {
        let a = &graph.stops[pattern.stop_indices[i - 1]];
        let b = &graph.stops[pattern.stop_indices[i]];
        dist += fast_dist_km(a.lat, a.lon, b.lat, b.lon);
    }
    dist
}

/// Compute route statistics and write `route-stats.json`.
/// `day_filtered`: true when graph was built with a specific service date (departures are for one day).
/// When false (all trips loaded), departure counts are divided by 7 to approximate a single weekday.
pub fn compute_and_write(graph: &TransitGraphJson, out_path: &std::path::Path, day_filtered: bool) {
    eprintln!("Computing route statistics...");

    // Group patterns by (mode, route)
    let mut route_map: HashMap<String, RouteAgg> = HashMap::new();

    for pattern in &graph.patterns {
        let key = format!("{}:{}", pattern.mode, pattern.route);
        let agg = route_map.entry(key).or_insert_with(|| RouteAgg {
            mode_str: pattern.mode.clone(),
            max_dist_km: 0.0,
            max_stops: 0,
            max_travel_time_sec: 0.0,
            best_departures: Vec::new(),
            pattern_count: 0,
        });

        // Route distance: prefer polyline geometry, fall back to stop haversine
        let dist = if let Some(ref encoded) = pattern.geometry_encoded {
            polyline_distance_km(encoded)
        } else {
            stop_distance_km(pattern, graph)
        };
        if dist > agg.max_dist_km {
            agg.max_dist_km = dist;
        }
        if pattern.stop_indices.len() > agg.max_stops {
            agg.max_stops = pattern.stop_indices.len();
        }
        let travel_time = pattern.stop_offsets.last().copied().unwrap_or(0.0);
        if travel_time > agg.max_travel_time_sec {
            agg.max_travel_time_sec = travel_time;
        }
        // Keep the pattern with the most departures as representative
        if pattern.departures.len() > agg.best_departures.len() {
            agg.best_departures = pattern.departures.clone();
        }
        agg.pattern_count += 1;
    }

    // Build route info list
    let mut routes: Vec<RouteStatsRoute> = Vec::new();

    for (key, agg) in &route_map {
        let travel_time_min = agg.max_travel_time_sec / 60.0;
        let commercial_speed = if agg.max_travel_time_sec > 0.0 {
            (agg.max_dist_km / agg.max_travel_time_sec) * 3600.0
        } else {
            0.0
        };

        // When all days are loaded, headway between consecutive departures is ~7x shorter
        // than reality since trips from different days interleave at the same time-of-day.
        // Multiply by 7 to approximate single-day headway.
        let hw_factor = if day_filtered { 1.0 } else { 7.0 };
        let peak_headway =
            compute_headway(&agg.best_departures, Some(7.0 * 3600.0), Some(9.0 * 3600.0))
                .map(|h| h * hw_factor);
        let avg_headway = compute_headway(&agg.best_departures, None, None).map(|h| h * hw_factor);

        // When graph includes all service days, normalize to single-day estimate
        let daily_dep = if day_filtered {
            agg.best_departures.len()
        } else {
            (agg.best_departures.len() + 3) / 7 // round to nearest
        };

        // Service window: first and last departure of the busiest pattern
        let first_dep_sec = agg.best_departures.first().copied().unwrap_or(0.0);
        let last_dep_sec = agg.best_departures.last().copied().unwrap_or(0.0);
        let service_hours = (last_dep_sec - first_dep_sec) / 3600.0;
        let dep_per_hour = if service_hours > 0.1 {
            daily_dep as f64 / service_hours
        } else {
            0.0
        };

        let name = key.split(':').nth(1).unwrap_or(key).to_string();

        routes.push(RouteStatsRoute {
            name,
            mode: agg.mode_str.clone(),
            distance_km: round2(agg.max_dist_km),
            stops: agg.max_stops,
            daily_departures: daily_dep,
            first_departure: format_time(first_dep_sec),
            last_departure: format_time(last_dep_sec),
            service_hours: round1(service_hours),
            dep_per_hour: round1(dep_per_hour),
            travel_time_min: round1(travel_time_min),
            commercial_speed_kmh: round1(commercial_speed),
            peak_headway_min: peak_headway.map(round1),
            avg_headway_min: avg_headway.map(round1),
            patterns: agg.pattern_count,
        });
    }

    // Sort by daily departures descending
    routes.sort_by_key(|r| std::cmp::Reverse(r.daily_departures));

    // Transfer hub analysis
    let mut stop_routes: Vec<(HashSet<String>, HashSet<String>, HashSet<String>)> =
        vec![(HashSet::new(), HashSet::new(), HashSet::new()); graph.stops.len()];

    for (si, stop) in graph.stops.iter().enumerate() {
        for sp in &stop.patterns {
            let p = &graph.patterns[sp.pattern_idx];
            match p.mode_enum {
                Mode::Tram => {
                    stop_routes[si].0.insert(p.route.clone());
                }
                Mode::Bus | Mode::Other => {
                    stop_routes[si].1.insert(p.route.clone());
                }
                Mode::Rail => {
                    stop_routes[si].2.insert(p.route.clone());
                }
            }
        }
    }

    // Cluster nearby stops (within 200m) into hubs
    let mut assigned: HashSet<usize> = HashSet::new();
    let mut hubs: Vec<TransferHub> = Vec::new();
    let mut multimodal = [0u32; 4]; // tram-bus, tram-rail, bus-rail, three-mode

    let mut stop_order: Vec<usize> = (0..graph.stops.len()).collect();
    stop_order.sort_by(|&a, &b| {
        let ca = stop_routes[a].0.len() + stop_routes[a].1.len() + stop_routes[a].2.len();
        let cb = stop_routes[b].0.len() + stop_routes[b].1.len() + stop_routes[b].2.len();
        cb.cmp(&ca)
    });

    for &si in &stop_order {
        if assigned.contains(&si) {
            continue;
        }
        let total = stop_routes[si].0.len() + stop_routes[si].1.len() + stop_routes[si].2.len();
        if total < 2 {
            continue;
        }

        let mut cluster_tram = stop_routes[si].0.clone();
        let mut cluster_bus = stop_routes[si].1.clone();
        let mut cluster_rail = stop_routes[si].2.clone();
        assigned.insert(si);

        for ns in &graph.stops[si].nearby_stop_indices {
            if ns.dist_km > 0.2 || assigned.contains(&ns.idx) {
                continue;
            }
            let ns_total = stop_routes[ns.idx].0.len()
                + stop_routes[ns.idx].1.len()
                + stop_routes[ns.idx].2.len();
            if ns_total == 0 {
                continue;
            }
            for r in &stop_routes[ns.idx].0 {
                cluster_tram.insert(r.clone());
            }
            for r in &stop_routes[ns.idx].1 {
                cluster_bus.insert(r.clone());
            }
            for r in &stop_routes[ns.idx].2 {
                cluster_rail.insert(r.clone());
            }
            assigned.insert(ns.idx);
        }

        let route_count = cluster_tram.len() + cluster_bus.len() + cluster_rail.len();
        let has_tram = !cluster_tram.is_empty();
        let has_bus = !cluster_bus.is_empty();
        let has_rail = !cluster_rail.is_empty();

        if has_tram && has_bus {
            multimodal[0] += 1;
        }
        if has_tram && has_rail {
            multimodal[1] += 1;
        }
        if has_bus && has_rail {
            multimodal[2] += 1;
        }
        if has_tram && has_bus && has_rail {
            multimodal[3] += 1;
        }

        let mut tram_vec: Vec<String> = cluster_tram.into_iter().collect();
        tram_vec.sort();
        let mut bus_vec: Vec<String> = cluster_bus.into_iter().collect();
        bus_vec.sort();
        let mut rail_vec: Vec<String> = cluster_rail.into_iter().collect();
        rail_vec.sort();

        let stop = &graph.stops[si];
        hubs.push(TransferHub {
            name: find_stop_name(graph, si).to_string(),
            key: stop.key.clone(),
            lat: stop.lat,
            lon: stop.lon,
            route_count,
            tram_routes: tram_vec,
            bus_routes: bus_vec,
            rail_routes: rail_vec,
        });
    }

    hubs.sort_by_key(|h| std::cmp::Reverse(h.route_count));
    hubs.truncate(30);

    // Summary
    let tram_count = routes.iter().filter(|r| r.mode == "TRAM").count();
    let bus_count = routes.iter().filter(|r| r.mode == "BUS").count();
    let rail_count = routes.iter().filter(|r| r.mode == "RAIL").count();
    let total_departures: u64 = routes.iter().map(|r| r.daily_departures as u64).sum();

    let output = RouteStatsOutput {
        generated_at: crate::chrono_now_iso(),
        summary: RouteStatsSummary {
            total_routes: routes.len(),
            tram_routes: tram_count,
            bus_routes: bus_count,
            rail_routes: rail_count,
            total_stops: graph.stops.len(),
            total_daily_departures: total_departures,
        },
        routes,
        transfer_hubs: hubs,
        multimodal_connections: MultimodalConnections {
            tram_bus: multimodal[0],
            tram_rail: multimodal[1],
            bus_rail: multimodal[2],
            three_mode: multimodal[3],
        },
    };

    let json_str = serde_json::to_string_pretty(&output).expect("JSON serialization failed");
    std::fs::write(out_path, json_str).expect("Cannot write route-stats.json");

    eprintln!(
        "  {} routes ({} tram, {} bus, {} rail), {} stops, {} daily departures",
        output.summary.total_routes,
        tram_count,
        bus_count,
        rail_count,
        output.summary.total_stops,
        total_departures,
    );
    eprintln!(
        "  Top hub: {} ({} routes)",
        output.transfer_hubs.first().map_or("-", |h| &h.name),
        output.transfer_hubs.first().map_or(0, |h| h.route_count),
    );
    eprintln!(
        "  Multimodal: {} tram-bus, {} tram-rail, {} three-mode",
        output.multimodal_connections.tram_bus,
        output.multimodal_connections.tram_rail,
        output.multimodal_connections.three_mode,
    );
    eprintln!("  Written to {}", out_path.display());
}

fn find_stop_name(graph: &TransitGraphJson, si: usize) -> &str {
    let name = &graph.stops[si].name;
    if name.is_empty() {
        &graph.stops[si].key
    } else {
        name
    }
}

/// Compute the mean headway (in minutes) between departures inside an optional
/// time window `[start_sec, end_sec]`.
///
/// Returns `None` when fewer than 2 departures fall inside the window.
/// This is the expected source of `peakHeadwayMin: null` values published on
/// stop and line pages: sparse lines and services that don't run during the
/// peak window produce no gap data, and the frontend renders `null` as an
/// explicit "no data" placeholder (see `app/stanice/copy.ts` `lineHeadway`).
pub(crate) fn compute_headway(
    departures: &[f64],
    start_sec: Option<f64>,
    end_sec: Option<f64>,
) -> Option<f64> {
    let filtered: Vec<f64> = match (start_sec, end_sec) {
        (Some(s), Some(e)) => departures
            .iter()
            .filter(|&&d| d >= s && d <= e)
            .copied()
            .collect(),
        _ => departures.to_vec(),
    };
    if filtered.len() < 2 {
        return None;
    }
    let total_gap: f64 = filtered.windows(2).map(|w| w[1] - w[0]).sum();
    Some(total_gap / (filtered.len() - 1) as f64 / 60.0)
}

pub fn format_time(seconds: f64) -> String {
    let total = seconds as u32;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    format!("{:02}:{:02}", h, m)
}

pub(crate) fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

pub(crate) fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── compute_headway ───────────────────────────────────────────────────────

    #[test]
    fn headway_fewer_than_2_departures_returns_none() {
        // A single departure in the window: no gap to measure.
        assert_eq!(compute_headway(&[500.0], Some(0.0), Some(3600.0)), None);
    }

    #[test]
    fn headway_no_departures_in_window_returns_none() {
        // Departures exist but none fall inside the window.
        assert_eq!(
            compute_headway(&[100.0, 200.0], Some(1000.0), Some(2000.0)),
            None
        );
    }

    #[test]
    fn headway_three_departures_no_window_returns_10_minutes() {
        // 0s, 600s, 1200s → two gaps of 600s each → mean gap 600s = 10 min.
        let result = compute_headway(&[0.0, 600.0, 1200.0], None, None);
        assert_eq!(result, Some(10.0));
    }
}
