//! Network centrality analysis: betweenness, closeness, diameter, average path length.
//!
//! Runs all-pairs shortest-path Dijkstra across transit stops, then computes
//! graph-theoretic metrics that reveal the most critical stops in the network.
//!
//! Gated behind `--centrality` flag due to computation cost (~2500 Dijkstra runs).
//! Outputs `data/centrality-stats.json`.

use std::path::Path;
use std::time::Instant;

use rayon::prelude::*;
use serde::Serialize;
use ts_rs::TS;

use crate::geo::WALK_SPEED;
use crate::heap::FlatHeap;
use crate::route_stats::round2;
use crate::transit_graph::{get_avg_wait, Mode, TransitGraphJson, TRANSFER_PENALTY};

// ---------------------------------------------------------------------------
// Output types (exported to TypeScript via ts-rs)
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CentralityStats {
    pub generated_at: String,
    /// Departure time used for Dijkstra
    pub departure_time: String,
    /// Number of transit stops analyzed
    pub stop_count: usize,
    /// Wall-clock computation time
    pub computation_seconds: f64,
    /// Top stops by betweenness centrality
    pub betweenness: Vec<CentralityStop>,
    /// Top stops by closeness centrality
    pub closeness: Vec<CentralityStop>,
    /// Longest shortest path in the network
    pub network_diameter: NetworkDiameter,
    /// Mean of all pairwise shortest paths
    pub average_path_length: AveragePathLength,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CentralityStop {
    pub name: String,
    pub key: String,
    pub lat: f64,
    pub lon: f64,
    pub score: f64,
    pub rank: usize,
    /// Routes serving this stop
    pub routes: Vec<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiameter {
    /// Longest shortest path in minutes
    pub minutes: f64,
    pub from_stop: String,
    pub to_stop: String,
    pub from_lat: f64,
    pub from_lon: f64,
    pub to_lat: f64,
    pub to_lon: f64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AveragePathLength {
    /// Mean travel time in minutes across all reachable pairs
    pub minutes: f64,
    /// Number of reachable stop pairs
    #[ts(type = "number")]
    pub reachable_pairs: u64,
    /// Total possible pairs (n * (n-1))
    #[ts(type = "number")]
    pub total_pairs: u64,
    /// Percentage of pairs that are reachable
    pub reachable_pct: f64,
}

// ---------------------------------------------------------------------------
// Brandes-style Dijkstra: computes distances + shortest-path counts + predecessors
// ---------------------------------------------------------------------------

struct BrandesResult {
    /// Shortest distance from source to each stop (INFINITY if unreachable)
    dist: Vec<f64>,
    /// Number of shortest paths from source to each stop
    sigma: Vec<f64>,
    /// Predecessors on shortest paths (for reverse accumulation)
    pred: Vec<Vec<usize>>,
    /// Stops in order of increasing distance (for reverse processing)
    order: Vec<usize>,
}

fn brandes_dijkstra(
    graph: &TransitGraphJson,
    source: usize,
    departure_time: f64,
    time_cap: f64,
) -> BrandesResult {
    let n = graph.stop_count;
    let mut dist = vec![f64::INFINITY; n];
    let mut sigma = vec![0.0f64; n];
    let mut pred: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut order: Vec<usize> = Vec::with_capacity(n);
    let mut heap = FlatHeap::new();

    dist[source] = 0.0;
    sigma[source] = 1.0;
    heap.push(0.0, source as u32);

    while !heap.is_empty() {
        let time = heap.peek_time();
        let node_idx = heap.peek_node() as usize;
        heap.pop();

        if time > time_cap {
            break;
        }
        if time > dist[node_idx] {
            continue;
        }

        order.push(node_idx);
        let stop = &graph.stops[node_idx];

        // Explore transit patterns
        for sp in &stop.patterns {
            let pattern = &graph.patterns[sp.pattern_idx];
            let clock_time = departure_time + time;
            let avg_wait = match get_avg_wait(
                &pattern.departures,
                pattern.stop_offsets[sp.stop_idx],
                clock_time,
            ) {
                Some(w) => w,
                None => continue,
            };

            let board_time = time + avg_wait;
            let board_offset = pattern.stop_offsets[sp.stop_idx];

            for i in (sp.stop_idx + 1)..pattern.stop_indices.len() {
                let travel_time = board_time + (pattern.stop_offsets[i] - board_offset);
                let dest_idx = pattern.stop_indices[i];

                if travel_time < dist[dest_idx] {
                    // Found a shorter path
                    dist[dest_idx] = travel_time;
                    sigma[dest_idx] = sigma[node_idx];
                    pred[dest_idx] = vec![node_idx];
                    heap.push(travel_time, dest_idx as u32);
                } else if (travel_time - dist[dest_idx]).abs() < 1.0 {
                    // Equal-length path (within 1 second tolerance for floating point)
                    sigma[dest_idx] += sigma[node_idx];
                    if !pred[dest_idx].contains(&node_idx) {
                        pred[dest_idx].push(node_idx);
                    }
                }
            }
        }

        // Transfer walks to nearby stops
        for ns in &stop.nearby_stop_indices {
            let transfer_time = time + (ns.dist_km / WALK_SPEED) * 3600.0 + TRANSFER_PENALTY;
            let dest_idx = ns.idx;

            if transfer_time < dist[dest_idx] {
                dist[dest_idx] = transfer_time;
                sigma[dest_idx] = sigma[node_idx];
                pred[dest_idx] = vec![node_idx];
                heap.push(transfer_time, dest_idx as u32);
            } else if (transfer_time - dist[dest_idx]).abs() < 1.0 {
                sigma[dest_idx] += sigma[node_idx];
                if !pred[dest_idx].contains(&node_idx) {
                    pred[dest_idx].push(node_idx);
                }
            }
        }
    }

    BrandesResult {
        dist,
        sigma,
        pred,
        order,
    }
}

// ---------------------------------------------------------------------------
// Betweenness centrality (Brandes reverse accumulation)
// ---------------------------------------------------------------------------

fn accumulate_betweenness(result: &BrandesResult, n: usize) -> Vec<f64> {
    let mut delta = vec![0.0f64; n];

    // Process nodes in reverse order of distance (farthest first)
    for &w in result.order.iter().rev() {
        for &v in &result.pred[w] {
            if result.sigma[w] > 0.0 {
                delta[v] += (result.sigma[v] / result.sigma[w]) * (1.0 + delta[w]);
            }
        }
    }

    delta
}

// ---------------------------------------------------------------------------
// Get routes serving a stop
// ---------------------------------------------------------------------------

fn stop_routes(graph: &TransitGraphJson, stop_idx: usize) -> Vec<String> {
    let stop = &graph.stops[stop_idx];
    let mut routes: Vec<String> = stop
        .patterns
        .iter()
        .map(|sp| {
            let p = &graph.patterns[sp.pattern_idx];
            let mode_prefix = match p.mode_enum {
                Mode::Tram => "T",
                Mode::Rail => "HŽ ",
                _ => "",
            };
            format!("{}{}", mode_prefix, p.route)
        })
        .collect();
    routes.sort();
    routes.dedup();
    routes
}

// ---------------------------------------------------------------------------
// Deduplicate stops by name (OTP has multiple entries per physical stop)
// ---------------------------------------------------------------------------

fn dedup_top_stops(graph: &TransitGraphJson, scores: &[f64], limit: usize) -> Vec<CentralityStop> {
    use std::collections::HashMap;

    // Group stop indices by name, keeping the one with the highest score
    let mut best_by_name: HashMap<String, (usize, f64)> = HashMap::new();
    for (si, &score) in scores.iter().enumerate() {
        let stop = &graph.stops[si];
        let name = if stop.name.is_empty() {
            stop.key.clone()
        } else {
            stop.name.clone()
        };
        let entry = best_by_name.entry(name).or_insert((si, score));
        if score > entry.1 {
            *entry = (si, score);
        }
    }

    // Sort by score descending, take top N
    let mut ranked: Vec<(String, usize, f64)> = best_by_name
        .into_iter()
        .map(|(name, (si, score))| (name, si, score))
        .collect();
    ranked.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());

    ranked
        .into_iter()
        .take(limit)
        .enumerate()
        .map(|(rank, (_name, si, score))| {
            // Merge routes from ALL stops with this name
            let stop = &graph.stops[si];
            let target_name = if stop.name.is_empty() {
                &stop.key
            } else {
                &stop.name
            };
            let mut all_routes: Vec<String> = Vec::new();
            for (other_si, other_stop) in graph.stops.iter().enumerate() {
                let other_name = if other_stop.name.is_empty() {
                    &other_stop.key
                } else {
                    &other_stop.name
                };
                if other_name == target_name {
                    all_routes.extend(stop_routes(graph, other_si));
                }
            }
            all_routes.sort();
            all_routes.dedup();

            CentralityStop {
                name: target_name.to_string(),
                key: stop.key.clone(),
                lat: stop.lat,
                lon: stop.lon,
                score: round2(score),
                rank: rank + 1,
                routes: all_routes,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

pub fn compute_and_write(graph: &TransitGraphJson, out_path: &Path) {
    let n = graph.stop_count;
    let departure_time = 8.0 * 3600.0; // 08:00
    let time_cap = 3600.0; // 60 minutes

    eprintln!("Computing network centrality ({} stops)...", n);
    let t0 = Instant::now();

    // Phase 1: Run all-pairs Dijkstra in parallel, collect distances + betweenness
    let results: Vec<BrandesResult> = (0..n)
        .into_par_iter()
        .map(|source| brandes_dijkstra(graph, source, departure_time, time_cap))
        .collect();

    // Phase 2: Compute betweenness centrality
    let mut betweenness = vec![0.0f64; n];
    for result in &results {
        let delta = accumulate_betweenness(result, n);
        for (i, &d) in delta.iter().enumerate() {
            betweenness[i] += d;
        }
    }
    // Normalize: undirected graph, divide by 2
    let norm = if n > 2 {
        ((n - 1) * (n - 2)) as f64
    } else {
        1.0
    };
    for b in &mut betweenness {
        *b /= norm;
    }

    // Phase 3: Compute closeness centrality
    let mut closeness = vec![0.0f64; n];
    for (source, result) in results.iter().enumerate() {
        let mut sum_dist = 0.0f64;
        let mut reachable = 0usize;
        for (dest, &d) in result.dist.iter().enumerate() {
            if dest != source && d < f64::INFINITY {
                sum_dist += d;
                reachable += 1;
            }
        }
        if reachable > 0 && sum_dist > 0.0 {
            // Wasserman-Faust normalization for disconnected graphs
            closeness[source] =
                (reachable as f64 / (n - 1) as f64) * (reachable as f64 / sum_dist) * 3600.0;
            // Scale to per-hour for readability
        }
    }

    // Phase 4: Network diameter and average path length
    let mut diameter_val = 0.0f64;
    let mut diameter_from = 0usize;
    let mut diameter_to = 0usize;
    let mut total_dist = 0.0f64;
    let mut total_pairs = 0u64;

    for (source, result) in results.iter().enumerate() {
        for (dest, &d) in result.dist.iter().enumerate() {
            if dest != source && d < f64::INFINITY {
                total_dist += d;
                total_pairs += 1;
                if d > diameter_val {
                    diameter_val = d;
                    diameter_from = source;
                    diameter_to = dest;
                }
            }
        }
    }

    let avg_path = if total_pairs > 0 {
        total_dist / total_pairs as f64
    } else {
        0.0
    };

    let computation_seconds = t0.elapsed().as_secs_f64();
    eprintln!("  Centrality computed in {:.1}s", computation_seconds);

    // Build top-20 betweenness stops (deduplicated by name - OTP has multiple
    // entries per physical stop for different directions/platforms)
    let top_betweenness = dedup_top_stops(graph, &betweenness, 20);
    let top_closeness = dedup_top_stops(graph, &closeness, 20);

    // Network diameter
    let from_stop = &graph.stops[diameter_from];
    let to_stop = &graph.stops[diameter_to];
    let network_diameter = NetworkDiameter {
        minutes: round2(diameter_val / 60.0),
        from_stop: if from_stop.name.is_empty() {
            from_stop.key.clone()
        } else {
            from_stop.name.clone()
        },
        to_stop: if to_stop.name.is_empty() {
            to_stop.key.clone()
        } else {
            to_stop.name.clone()
        },
        from_lat: from_stop.lat,
        from_lon: from_stop.lon,
        to_lat: to_stop.lat,
        to_lon: to_stop.lon,
    };

    // Average path length
    let all_pairs = (n as u64) * (n as u64 - 1);
    let average_path_length = AveragePathLength {
        minutes: round2(avg_path / 60.0),
        reachable_pairs: total_pairs,
        total_pairs: all_pairs,
        reachable_pct: round2(total_pairs as f64 / all_pairs as f64 * 100.0),
    };

    eprintln!(
        "  Top betweenness: {} (score: {:.4})",
        top_betweenness
            .first()
            .map(|s| s.name.as_str())
            .unwrap_or("-"),
        top_betweenness.first().map(|s| s.score).unwrap_or(0.0),
    );
    eprintln!(
        "  Diameter: {:.1} min ({} → {})",
        network_diameter.minutes, network_diameter.from_stop, network_diameter.to_stop,
    );
    eprintln!(
        "  Avg path: {:.1} min, {:.1}% pairs reachable",
        average_path_length.minutes, average_path_length.reachable_pct,
    );

    let output = CentralityStats {
        generated_at: crate::chrono_now_iso(),
        departure_time: "08:00".to_string(),
        stop_count: n,
        computation_seconds: round2(computation_seconds),
        betweenness: top_betweenness,
        closeness: top_closeness,
        network_diameter,
        average_path_length,
    };

    let json = serde_json::to_string_pretty(&output).expect("JSON serialization failed");
    std::fs::write(out_path, json).expect("Cannot write centrality-stats.json");
    eprintln!("  Written to {}", out_path.display());
}
