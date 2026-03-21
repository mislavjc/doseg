//! Network-wide transit statistics beyond per-route basics.
//!
//! Computes: hourly frequency heatmap, headway regularity (CV), vehicle-km/day,
//! route tortuosity, stop spacing, dead-end stops, peak-to-base ratio,
//! fleet size from GTFS block_id, weekend service ratios, directional asymmetry.
//!
//! Outputs `data/network-stats.json`.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Serialize;
use ts_rs::TS;

use crate::geo::fast_dist_km;
use crate::route_stats::{polyline_distance_km, stop_distance_km};
use crate::transit_graph::{Mode, TransitGraphJson};

// ---------------------------------------------------------------------------
// Output types (exported to TypeScript via ts-rs)
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatsOutput {
    pub generated_at: String,
    pub vehicle_km: VehicleKm,
    pub routes: Vec<NetworkRoute>,
    pub dead_end_stops: DeadEndStops,
    pub fleet: Option<Fleet>,
    pub weekend_service: Option<WeekendService>,
    pub directional_asymmetry: Option<Vec<DirectionalAsymmetryEntry>>,
    pub service_span: Option<ServiceSpan>,
    pub pulse_hubs: Vec<PulseHub>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
pub struct VehicleKm {
    #[ts(type = "number")]
    pub tram: i64,
    #[ts(type = "number")]
    pub bus: i64,
    #[ts(type = "number")]
    pub rail: i64,
    #[ts(type = "number")]
    pub total: i64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NetworkRoute {
    pub name: String,
    pub mode: String,
    pub hourly_departures: Vec<u32>,
    pub headway_cv: Option<f64>,
    pub peak_headway_cv: Option<f64>,
    pub tortuosity: Option<f64>,
    pub straight_line_km: Option<f64>,
    pub stop_spacing: Option<StopSpacing>,
    pub peak_dep_per_hour: f64,
    pub base_dep_per_hour: f64,
    pub peak_to_base_ratio: Option<f64>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopSpacing {
    #[ts(type = "number")]
    pub avg_m: i64,
    #[ts(type = "number")]
    pub min_m: i64,
    #[ts(type = "number")]
    pub max_m: i64,
    pub cv: f64,
    pub count: usize,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DeadEndStops {
    pub total: usize,
    pub by_mode: HashMap<String, usize>,
    pub stops: Vec<DeadEndStop>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
pub struct DeadEndStop {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub route: String,
    pub mode: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Fleet {
    pub tram_blocks: usize,
    pub bus_blocks: usize,
    pub rail_blocks: usize,
    pub total_blocks: usize,
    pub interlined_blocks: usize,
    pub interlined_examples: Vec<InterlinedBlock>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct InterlinedBlock {
    pub block_id: String,
    pub routes: Vec<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WeekendService {
    pub weekday_only_routes: Vec<String>,
    pub weekday_only_count: usize,
    pub routes: Vec<WeekendRoute>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WeekendRoute {
    pub name: String,
    pub mode: String,
    pub weekday_trips: usize,
    pub saturday_trips: usize,
    pub sunday_trips: usize,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DirectionalAsymmetryEntry {
    pub name: String,
    pub mode: String,
    pub outbound_trips: usize,
    pub inbound_trips: usize,
    pub ratio: f64,
}

// ---------------------------------------------------------------------------
// 1.3 + 1.4 Service span: first/last service + night gap
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ServiceSpan {
    /// System-wide earliest departure (raw, may be post-midnight night owl)
    pub earliest_departure: String,
    /// System-wide latest departure (raw, may wrap past 24h)
    pub latest_departure: String,
    /// First morning departure (04:00-10:00 range) - "when does the city wake up"
    pub first_morning_departure: String,
    /// Last evening departure from origin stops (18:00+) - "when does service end"
    pub last_evening_departure: String,
    /// Histogram: when stops get their first service (30-min buckets)
    pub first_service_histogram: Vec<ServiceBucket>,
    /// Histogram: when stops lose their last service (30-min buckets)
    pub last_service_histogram: Vec<ServiceBucket>,
    /// Per-mode breakdown
    pub by_mode: Vec<ServiceSpanByMode>,
    /// Whether any rail departures exist
    pub has_rail: bool,
    /// Night service gap analysis
    pub night_gap: NightGap,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ServiceBucket {
    /// Bucket label, e.g. "04:30"
    pub label: String,
    pub stop_count: usize,
    pub tram_stops: usize,
    pub bus_stops: usize,
    pub rail_stops: usize,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ServiceSpanByMode {
    pub mode: String,
    pub earliest_departure: String,
    pub latest_departure: String,
    pub routes_before_5am: usize,
    pub routes_after_midnight: usize,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NightGap {
    /// Stops with no service after 22:00
    pub stops_dark_by_22: usize,
    /// Stops with no service after 23:00
    pub stops_dark_by_23: usize,
    /// Total stops analyzed
    pub total_stops: usize,
    /// Percentage of stops dark by 23:00
    pub pct_dark_by_23: f64,
    /// Routes with last departure before 22:00
    pub routes_ending_before_22: Vec<String>,
    /// Routes with last departure before 23:00
    pub routes_ending_before_23: Vec<String>,
    /// Routes running past midnight
    pub routes_past_midnight: Vec<String>,
}

// ---------------------------------------------------------------------------
// 2.10 Pulse scheduling detection
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PulseHub {
    pub stop_name: String,
    pub stop_key: String,
    pub lat: f64,
    pub lon: f64,
    pub route_count: usize,
    pub routes: Vec<String>,
    pub avg_transfer_wait_min: f64,
    pub best_hour: u8,
    pub best_hour_wait_min: f64,
    pub hourly_wait: Vec<f64>,
}

// ---------------------------------------------------------------------------
// Route grouping (shared logic)
// ---------------------------------------------------------------------------

struct RouteGroup {
    #[allow(dead_code)]
    mode: Mode,
    mode_str: String,
    /// Indices into graph.patterns
    pattern_indices: Vec<usize>,
}

fn group_routes(graph: &TransitGraphJson) -> Vec<(String, RouteGroup)> {
    let mut map: indexmap::IndexMap<String, RouteGroup> = indexmap::IndexMap::new();
    for (pi, p) in graph.patterns.iter().enumerate() {
        let key = format!("{}:{}", p.mode, p.route);
        map.entry(key)
            .or_insert_with(|| RouteGroup {
                mode: p.mode_enum,
                mode_str: p.mode.clone(),
                pattern_indices: Vec::new(),
            })
            .pattern_indices
            .push(pi);
    }
    map.into_iter().collect()
}

/// Find the pattern index with the longest distance (representative pattern).
fn longest_pattern(graph: &TransitGraphJson, group: &RouteGroup) -> usize {
    let mut best_pi = group.pattern_indices[0];
    let mut best_dist = 0.0f64;
    for &pi in &group.pattern_indices {
        let p = &graph.patterns[pi];
        let dist = if let Some(ref enc) = p.geometry_encoded {
            polyline_distance_km(enc)
        } else {
            stop_distance_km(p, graph)
        };
        if dist > best_dist {
            best_dist = dist;
            best_pi = pi;
        }
    }
    best_pi
}

/// Find the pattern with the most departures.
fn busiest_pattern(graph: &TransitGraphJson, group: &RouteGroup) -> usize {
    let mut best_pi = group.pattern_indices[0];
    let mut best_count = 0;
    for &pi in &group.pattern_indices {
        let count = graph.patterns[pi].departures.len();
        if count > best_count {
            best_count = count;
            best_pi = pi;
        }
    }
    best_pi
}

// ---------------------------------------------------------------------------
// 1.1 Hourly departure counts (24 buckets, summed across all patterns)
// ---------------------------------------------------------------------------

fn compute_hourly_departures(
    graph: &TransitGraphJson,
    group: &RouteGroup,
    divisor: f64,
) -> Vec<u32> {
    let mut hours = [0u64; 24];
    for &pi in &group.pattern_indices {
        for &dep in &graph.patterns[pi].departures {
            let h = ((dep / 3600.0).floor() as usize).min(23);
            hours[h] += 1;
        }
    }
    hours
        .iter()
        .map(|&c| ((c as f64 / divisor) + 0.5) as u32)
        .collect()
}

// ---------------------------------------------------------------------------
// 1.2 Headway regularity — coefficient of variation
// ---------------------------------------------------------------------------

fn headway_cv(departures: &[f64], start_sec: Option<f64>, end_sec: Option<f64>) -> Option<f64> {
    let filtered: Vec<f64> = match (start_sec, end_sec) {
        (Some(s), Some(e)) => departures
            .iter()
            .filter(|&&d| d >= s && d <= e)
            .copied()
            .collect(),
        _ => departures.to_vec(),
    };
    if filtered.len() < 3 {
        return None;
    }
    let gaps: Vec<f64> = filtered.windows(2).map(|w| w[1] - w[0]).collect();
    let n = gaps.len() as f64;
    let mean = gaps.iter().sum::<f64>() / n;
    if mean < 1.0 {
        return None;
    }
    let variance = gaps.iter().map(|g| (g - mean).powi(2)).sum::<f64>() / n;
    Some(variance.sqrt() / mean)
}

fn compute_headway_cvs(
    graph: &TransitGraphJson,
    group: &RouteGroup,
    hw_factor: f64,
) -> (Option<f64>, Option<f64>) {
    let bp = busiest_pattern(graph, group);
    let deps = &graph.patterns[bp].departures;
    // When not day-filtered, departures from multiple days are interleaved.
    // Headways are artificially short — scale factor handled by caller for display,
    // but CV (ratio) is scale-invariant, so we can compute it directly.
    let overall = headway_cv(deps, None, None);
    let peak = headway_cv(deps, Some(7.0 * 3600.0), Some(9.0 * 3600.0));
    // If not day-filtered, the CV is still valid because CV is dimensionless
    let _ = hw_factor;
    (overall, peak)
}

// ---------------------------------------------------------------------------
// 1.5 Vehicle-km per day
// ---------------------------------------------------------------------------

fn pattern_distance_km(graph: &TransitGraphJson, pi: usize) -> f64 {
    let p = &graph.patterns[pi];
    if let Some(ref enc) = p.geometry_encoded {
        polyline_distance_km(enc)
    } else {
        stop_distance_km(p, graph)
    }
}

// ---------------------------------------------------------------------------
// 1.8 Route tortuosity (circuity ratio)
// ---------------------------------------------------------------------------

fn compute_tortuosity(graph: &TransitGraphJson, group: &RouteGroup) -> (Option<f64>, Option<f64>) {
    let lp = longest_pattern(graph, group);
    let p = &graph.patterns[lp];
    if p.stop_indices.len() < 2 {
        return (None, None);
    }
    let first = &graph.stops[p.stop_indices[0]];
    let last = &graph.stops[*p.stop_indices.last().unwrap()];
    let straight = fast_dist_km(first.lat, first.lon, last.lat, last.lon);
    if straight < 0.1 {
        // Loop route — straight-line distance is ~0, tortuosity undefined
        return (None, Some(round2(straight)));
    }
    let actual = pattern_distance_km(graph, lp);
    let ratio = round2(actual / straight);
    (Some(ratio), Some(round2(straight)))
}

// ---------------------------------------------------------------------------
// 1.10 Stop spacing statistics
// ---------------------------------------------------------------------------

fn compute_stop_spacing(graph: &TransitGraphJson, group: &RouteGroup) -> Option<StopSpacing> {
    let lp = longest_pattern(graph, group);
    let p = &graph.patterns[lp];
    if p.stop_indices.len() < 2 {
        return None;
    }
    let mut gaps: Vec<f64> = Vec::with_capacity(p.stop_indices.len() - 1);
    for i in 1..p.stop_indices.len() {
        let a = &graph.stops[p.stop_indices[i - 1]];
        let b = &graph.stops[p.stop_indices[i]];
        gaps.push(fast_dist_km(a.lat, a.lon, b.lat, b.lon) * 1000.0); // meters
    }
    let n = gaps.len() as f64;
    let avg = gaps.iter().sum::<f64>() / n;
    let min = gaps.iter().copied().fold(f64::INFINITY, f64::min);
    let max = gaps.iter().copied().fold(0.0f64, f64::max);
    let variance = gaps.iter().map(|g| (g - avg).powi(2)).sum::<f64>() / n;
    let cv = if avg > 0.0 {
        variance.sqrt() / avg
    } else {
        0.0
    };

    Some(StopSpacing {
        avg_m: avg.round() as i64,
        min_m: min.round() as i64,
        max_m: max.round() as i64,
        cv: round2(cv),
        count: p.stop_indices.len(),
    })
}

// ---------------------------------------------------------------------------
// 1.15 Dead-end stops (served by exactly 1 route)
// ---------------------------------------------------------------------------

fn compute_dead_end_stops(graph: &TransitGraphJson) -> DeadEndStops {
    // For each stop, collect unique route keys
    let mut stop_routes: Vec<HashSet<String>> = vec![HashSet::new(); graph.stops.len()];
    for (si, stop) in graph.stops.iter().enumerate() {
        for sp in &stop.patterns {
            let p = &graph.patterns[sp.pattern_idx];
            stop_routes[si].insert(format!("{}:{}", p.mode, p.route));
        }
    }

    let mut by_mode: HashMap<String, usize> = HashMap::new();
    let mut stops: Vec<DeadEndStop> = Vec::new();

    for (si, routes) in stop_routes.iter().enumerate() {
        if routes.len() != 1 {
            continue;
        }
        let route_key = routes.iter().next().unwrap();
        let (mode, route) = route_key.split_once(':').unwrap_or(("BUS", route_key));
        *by_mode.entry(mode.to_string()).or_default() += 1;

        let stop = &graph.stops[si];
        stops.push(DeadEndStop {
            name: if stop.name.is_empty() {
                stop.key.clone()
            } else {
                stop.name.clone()
            },
            lat: stop.lat,
            lon: stop.lon,
            route: route.to_string(),
            mode: mode.to_string(),
        });
    }

    // Sort by mode then route name
    stops.sort_by(|a, b| a.mode.cmp(&b.mode).then_with(|| a.route.cmp(&b.route)));

    let total = stops.len();
    DeadEndStops {
        total,
        by_mode,
        stops,
    }
}

// ---------------------------------------------------------------------------
// 1.20 Peak-to-base ratio
// ---------------------------------------------------------------------------

fn compute_peak_to_base(hourly: &[u32]) -> (f64, f64, Option<f64>) {
    // Peak: max of hours 7-8 (AM rush)
    let peak = hourly[7..=8].iter().copied().max().unwrap_or(0) as f64;
    // Base: average of hours 10-14 (midday off-peak)
    let base_hours = &hourly[10..=14];
    let base: f64 = if base_hours.is_empty() {
        0.0
    } else {
        base_hours.iter().sum::<u32>() as f64 / base_hours.len() as f64
    };
    let ratio = if base > 0.5 {
        Some(round2(peak / base))
    } else {
        None
    };
    (peak, round1(base), ratio)
}

// ---------------------------------------------------------------------------
// GTFS zip parsing: fleet (block_id), weekend service, direction
// ---------------------------------------------------------------------------

/// A GTFS trip record (only the fields we need).
struct GtfsTrip {
    route_id: String,
    service_id: String,
    direction_id: Option<u8>,
    block_id: Option<String>,
}

/// A GTFS calendar record — which days of the week this service runs.
struct GtfsCalendar {
    monday: bool,
    tuesday: bool,
    wednesday: bool,
    thursday: bool,
    friday: bool,
    saturday: bool,
    sunday: bool,
}

impl GtfsCalendar {
    fn any_weekday(&self) -> bool {
        self.monday || self.tuesday || self.wednesday || self.thursday || self.friday
    }
    fn has_any_day(&self) -> bool {
        self.any_weekday() || self.saturday || self.sunday
    }
}

/// A GTFS route record (route_id → short name + type).
struct GtfsRoute {
    short_name: String,
    route_type: u16, // 0=Tram, 2=Rail, 3=Bus
}

fn gtfs_mode_str(route_type: u16) -> &'static str {
    match route_type {
        0 => "TRAM",
        2 => "RAIL",
        _ => "BUS",
    }
}

struct GtfsParsed {
    trips: Vec<GtfsTrip>,
    calendar: HashMap<String, GtfsCalendar>,
    routes: HashMap<String, GtfsRoute>,
}

fn parse_gtfs_zip(zip_path: &Path) -> Option<GtfsParsed> {
    let file = std::fs::File::open(zip_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    // Parse routes.txt
    let mut routes = HashMap::new();
    if let Ok(entry) = archive.by_name("routes.txt") {
        let mut rdr = csv::ReaderBuilder::new().flexible(true).from_reader(entry);
        let headers = rdr.headers().ok()?.clone();
        let id_col = headers.iter().position(|h| h == "route_id")?;
        let name_col = headers.iter().position(|h| h == "route_short_name");
        let type_col = headers.iter().position(|h| h == "route_type");

        for result in rdr.records() {
            let record = match result {
                Ok(r) => r,
                Err(_) => continue,
            };
            let route_id = record.get(id_col).unwrap_or("").to_string();
            let short_name = name_col
                .and_then(|c| record.get(c))
                .unwrap_or("")
                .to_string();
            let route_type: u16 = type_col
                .and_then(|c| record.get(c))
                .and_then(|v| v.parse().ok())
                .unwrap_or(3);
            routes.insert(
                route_id,
                GtfsRoute {
                    short_name,
                    route_type,
                },
            );
        }
    }

    // Parse calendar.txt
    let mut calendar = HashMap::new();
    if let Ok(entry) = archive.by_name("calendar.txt") {
        let mut rdr = csv::ReaderBuilder::new().flexible(true).from_reader(entry);
        let headers = rdr.headers().ok()?.clone();
        let sid_col = headers.iter().position(|h| h == "service_id")?;
        let day_cols: Vec<Option<usize>> = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
        .iter()
        .map(|d| headers.iter().position(|h| h == *d))
        .collect();

        for result in rdr.records() {
            let record = match result {
                Ok(r) => r,
                Err(_) => continue,
            };
            let sid = record.get(sid_col).unwrap_or("").to_string();
            let day_val = |idx: usize| -> bool {
                day_cols[idx]
                    .and_then(|c| record.get(c))
                    .map(|v| v == "1")
                    .unwrap_or(false)
            };
            calendar.insert(
                sid,
                GtfsCalendar {
                    monday: day_val(0),
                    tuesday: day_val(1),
                    wednesday: day_val(2),
                    thursday: day_val(3),
                    friday: day_val(4),
                    saturday: day_val(5),
                    sunday: day_val(6),
                },
            );
        }
    }

    // Parse calendar_dates.txt to handle feeds where calendar.txt has all-zero
    // day columns (ZET uses exception_type=1 additions exclusively).
    let calendar_needs_dates = calendar.values().all(|c| !c.has_any_day());
    if calendar_needs_dates {
        if let Ok(entry) = archive.by_name("calendar_dates.txt") {
            let mut rdr = csv::ReaderBuilder::new().flexible(true).from_reader(entry);
            if let Ok(headers) = rdr.headers().cloned() {
                let sid_col = headers.iter().position(|h| h == "service_id");
                let date_col = headers.iter().position(|h| h == "date");
                let etype_col = headers.iter().position(|h| h == "exception_type");

                if let (Some(sc), Some(dc)) = (sid_col, date_col) {
                    for result in rdr.records() {
                        let record = match result {
                            Ok(r) => r,
                            Err(_) => continue,
                        };
                        // Only process additions (exception_type=1)
                        let etype = etype_col.and_then(|c| record.get(c)).unwrap_or("1");
                        if etype != "1" {
                            continue;
                        }
                        let sid = record.get(sc).unwrap_or("").to_string();
                        let date_str = record.get(dc).unwrap_or("");
                        if date_str.len() != 8 {
                            continue;
                        }
                        // Parse YYYYMMDD and compute day of week
                        if let Some(dow) = date_to_day_of_week(date_str) {
                            let cal = calendar.entry(sid).or_insert(GtfsCalendar {
                                monday: false,
                                tuesday: false,
                                wednesday: false,
                                thursday: false,
                                friday: false,
                                saturday: false,
                                sunday: false,
                            });
                            match dow {
                                0 => cal.sunday = true,
                                1 => cal.monday = true,
                                2 => cal.tuesday = true,
                                3 => cal.wednesday = true,
                                4 => cal.thursday = true,
                                5 => cal.friday = true,
                                6 => cal.saturday = true,
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    // Parse trips.txt
    let mut trips = Vec::new();
    if let Ok(entry) = archive.by_name("trips.txt") {
        let mut rdr = csv::ReaderBuilder::new().flexible(true).from_reader(entry);
        let headers = rdr.headers().ok()?.clone();
        let rid_col = headers.iter().position(|h| h == "route_id")?;
        let sid_col = headers.iter().position(|h| h == "service_id")?;
        let dir_col = headers.iter().position(|h| h == "direction_id");
        let block_col = headers.iter().position(|h| h == "block_id");

        for result in rdr.records() {
            let record = match result {
                Ok(r) => r,
                Err(_) => continue,
            };
            let route_id = record.get(rid_col).unwrap_or("").to_string();
            let service_id = record.get(sid_col).unwrap_or("").to_string();
            let direction_id = dir_col
                .and_then(|c| record.get(c))
                .and_then(|v| v.parse::<u8>().ok());
            let block_id = block_col
                .and_then(|c| record.get(c))
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string());

            trips.push(GtfsTrip {
                route_id,
                service_id,
                direction_id,
                block_id,
            });
        }
    }

    Some(GtfsParsed {
        trips,
        calendar,
        routes,
    })
}

// ---------------------------------------------------------------------------
// 1.6 + 1.7 Fleet size and interlining from block_id
// ---------------------------------------------------------------------------

fn compute_fleet(parsed: &GtfsParsed) -> Fleet {
    // Only count weekday blocks (trips running on a weekday service)
    let weekday_sids: HashSet<&str> = parsed
        .calendar
        .iter()
        .filter(|(_, cal)| cal.monday || cal.tuesday || cal.wednesday || cal.thursday || cal.friday)
        .map(|(sid, _)| sid.as_str())
        .collect();

    // block_id → set of route short names
    let mut block_routes: HashMap<String, HashSet<String>> = HashMap::new();
    let mut block_mode: HashMap<String, Mode> = HashMap::new();

    for trip in &parsed.trips {
        if !weekday_sids.contains(trip.service_id.as_str()) {
            continue;
        }
        let block = match &trip.block_id {
            Some(b) => b.clone(),
            None => continue,
        };
        let route_info = parsed.routes.get(&trip.route_id);
        let short_name = route_info
            .map(|r| r.short_name.clone())
            .unwrap_or_else(|| trip.route_id.clone());
        let mode = route_info
            .map(|r| match r.route_type {
                0 => Mode::Tram,
                2 => Mode::Rail,
                _ => Mode::Bus,
            })
            .unwrap_or(Mode::Bus);

        block_routes
            .entry(block.clone())
            .or_default()
            .insert(short_name);
        block_mode.entry(block).or_insert(mode);
    }

    let total = block_routes.len();
    let mut tram_blocks = 0usize;
    let mut bus_blocks = 0usize;
    let mut rail_blocks = 0usize;
    let mut interlined_count = 0usize;
    let mut interlined_examples: Vec<InterlinedBlock> = Vec::new();

    for (block_id, routes) in &block_routes {
        match block_mode.get(block_id).copied().unwrap_or(Mode::Bus) {
            Mode::Tram => tram_blocks += 1,
            Mode::Bus | Mode::Other => bus_blocks += 1,
            Mode::Rail => rail_blocks += 1,
        }
        if routes.len() > 1 {
            interlined_count += 1;
            if interlined_examples.len() < 20 {
                let mut route_list: Vec<String> = routes.iter().cloned().collect();
                route_list.sort();
                interlined_examples.push(InterlinedBlock {
                    block_id: block_id.clone(),
                    routes: route_list,
                });
            }
        }
    }

    Fleet {
        tram_blocks,
        bus_blocks,
        rail_blocks,
        total_blocks: total,
        interlined_blocks: interlined_count,
        interlined_examples,
    }
}

// ---------------------------------------------------------------------------
// 1.11 Weekend service ratio + 1.13 Directional asymmetry
// ---------------------------------------------------------------------------

struct WeekendAndDirection {
    weekend: WeekendService,
    direction: Vec<DirectionalAsymmetryEntry>,
}

fn compute_weekend_and_direction(parsed: &GtfsParsed) -> WeekendAndDirection {
    let weekday_sids: HashSet<&str> = parsed
        .calendar
        .iter()
        .filter(|(_, c)| c.monday || c.tuesday || c.wednesday || c.thursday || c.friday)
        .map(|(s, _)| s.as_str())
        .collect();
    let saturday_sids: HashSet<&str> = parsed
        .calendar
        .iter()
        .filter(|(_, c)| c.saturday)
        .map(|(s, _)| s.as_str())
        .collect();
    let sunday_sids: HashSet<&str> = parsed
        .calendar
        .iter()
        .filter(|(_, c)| c.sunday)
        .map(|(s, _)| s.as_str())
        .collect();

    // Per route: weekday/saturday/sunday trip counts + direction counts
    struct RouteCounts {
        mode_str: String,
        weekday: usize,
        saturday: usize,
        sunday: usize,
        dir0: usize,
        dir1: usize,
    }

    let mut route_counts: HashMap<String, RouteCounts> = HashMap::new();

    for trip in &parsed.trips {
        let route_info = parsed.routes.get(&trip.route_id);
        let short_name = route_info
            .map(|r| r.short_name.clone())
            .unwrap_or_else(|| trip.route_id.clone());
        let mode_str = route_info
            .map(|r| gtfs_mode_str(r.route_type).to_string())
            .unwrap_or_else(|| "BUS".to_string());

        let rc = route_counts
            .entry(short_name)
            .or_insert_with(|| RouteCounts {
                mode_str,
                weekday: 0,
                saturday: 0,
                sunday: 0,
                dir0: 0,
                dir1: 0,
            });

        let sid = trip.service_id.as_str();
        if weekday_sids.contains(sid) {
            rc.weekday += 1;
        }
        if saturday_sids.contains(sid) {
            rc.saturday += 1;
        }
        if sunday_sids.contains(sid) {
            rc.sunday += 1;
        }

        // Direction (only count weekday for asymmetry analysis)
        if weekday_sids.contains(sid) {
            match trip.direction_id {
                Some(0) => rc.dir0 += 1,
                Some(1) => rc.dir1 += 1,
                _ => {}
            }
        }
    }

    // Weekend service
    let mut weekday_only_routes: Vec<String> = Vec::new();
    let mut weekend_routes: Vec<WeekendRoute> = Vec::new();

    // Only flag routes as weekday-only if the GTFS data actually covers
    // some weekend dates. Otherwise, the feed might only contain upcoming
    // weekday dates and we'd incorrectly mark all routes as weekday-only.
    let has_any_saturday = !saturday_sids.is_empty();
    let has_any_sunday = !sunday_sids.is_empty();
    let feed_covers_weekends = has_any_saturday || has_any_sunday;

    let mut sorted_routes: Vec<(&String, &RouteCounts)> = route_counts.iter().collect();
    sorted_routes.sort_by(|a, b| a.1.mode_str.cmp(&b.1.mode_str).then(a.0.cmp(b.0)));

    for (name, rc) in &sorted_routes {
        if feed_covers_weekends && rc.saturday == 0 && rc.sunday == 0 && rc.weekday > 0 {
            weekday_only_routes.push(name.to_string());
        }
        if rc.weekday > 0 {
            weekend_routes.push(WeekendRoute {
                name: name.to_string(),
                mode: rc.mode_str.clone(),
                weekday_trips: rc.weekday,
                saturday_trips: rc.saturday,
                sunday_trips: rc.sunday,
            });
        }
    }

    let weekday_only_count = weekday_only_routes.len();
    let weekend = WeekendService {
        weekday_only_routes,
        weekday_only_count,
        routes: weekend_routes,
    };

    // Directional asymmetry (only include routes with meaningful difference).
    // Exclude loop routes where all trips use direction_id=0 (circular routes).
    let mut direction_entries: Vec<DirectionalAsymmetryEntry> = Vec::new();
    for (name, rc) in &sorted_routes {
        // Need trips in both directions to measure asymmetry
        if rc.dir0 == 0 || rc.dir1 == 0 {
            continue;
        }
        let total = rc.dir0 + rc.dir1;
        if total < 4 {
            continue;
        }
        let ratio = rc.dir0.min(rc.dir1) as f64 / rc.dir0.max(rc.dir1) as f64;
        // Only report routes with >20% asymmetry
        if ratio < 0.8 {
            direction_entries.push(DirectionalAsymmetryEntry {
                name: name.to_string(),
                mode: rc.mode_str.clone(),
                outbound_trips: rc.dir0,
                inbound_trips: rc.dir1,
                ratio: round2(ratio),
            });
        }
    }
    // Sort by ratio ascending (most asymmetric first)
    direction_entries.sort_by(|a, b| a.ratio.partial_cmp(&b.ratio).unwrap());

    WeekendAndDirection {
        weekend,
        direction: direction_entries,
    }
}

// ---------------------------------------------------------------------------
// 1.3 + 1.4 Service span computation
// ---------------------------------------------------------------------------

fn secs_to_hhmm(secs: f64) -> String {
    let h = (secs / 3600.0).floor() as u32;
    let m = ((secs % 3600.0) / 60.0).floor() as u32;
    // Wrap GTFS 25:xx → 01:xx for display
    format!("{:02}:{:02}", h % 24, m)
}

use crate::route_stats::format_time as secs_to_hhmm_raw;

fn compute_service_span(
    graph: &TransitGraphJson,
    route_groups: &[(String, RouteGroup)],
) -> ServiceSpan {
    // Per-stop: find earliest and latest departure time, and dominant mode
    #[derive(Clone)]
    struct StopSpanInfo {
        earliest: f64,
        latest: f64,
        has_tram: bool,
        has_bus: bool,
        has_rail: bool,
    }

    let mut stop_spans: Vec<Option<StopSpanInfo>> = vec![None; graph.stops.len()];

    for (si, stop) in graph.stops.iter().enumerate() {
        let mut earliest = f64::INFINITY;
        let mut latest = f64::NEG_INFINITY;
        let mut has_tram = false;
        let mut has_bus = false;
        let mut has_rail = false;

        for sp in &stop.patterns {
            let pattern = &graph.patterns[sp.pattern_idx];
            let offset = pattern.stop_offsets[sp.stop_idx];

            match pattern.mode_enum {
                Mode::Tram => has_tram = true,
                Mode::Bus | Mode::Other => has_bus = true,
                Mode::Rail => has_rail = true,
            }

            if let Some(&first_dep) = pattern.departures.first() {
                let t = first_dep + offset;
                if t < earliest {
                    earliest = t;
                }
            }
            if let Some(&last_dep) = pattern.departures.last() {
                let t = last_dep + offset;
                if t > latest {
                    latest = t;
                }
            }
        }

        if earliest < f64::INFINITY {
            stop_spans[si] = Some(StopSpanInfo {
                earliest,
                latest,
                has_tram,
                has_bus,
                has_rail,
            });
        }
    }

    // System-wide extremes
    let mut sys_earliest = f64::INFINITY;
    let mut sys_latest = f64::NEG_INFINITY;
    for info in stop_spans.iter().flatten() {
        if info.earliest < sys_earliest {
            sys_earliest = info.earliest;
        }
        if info.latest > sys_latest {
            sys_latest = info.latest;
        }
    }

    // Build first-service histogram (30-min buckets from 03:00 to 08:00)
    let first_buckets_start: f64 = 3.0 * 3600.0; // 03:00
    let first_buckets_end: f64 = 8.0 * 3600.0; // 08:00
    let bucket_size: f64 = 1800.0; // 30 minutes
    let n_first_buckets = ((first_buckets_end - first_buckets_start) / bucket_size).ceil() as usize;
    let mut first_hist: Vec<(usize, usize, usize, usize)> = vec![(0, 0, 0, 0); n_first_buckets];

    // Build last-service histogram (30-min buckets from 19:00 to 02:00 next day)
    let last_buckets_start: f64 = 19.0 * 3600.0;
    let last_buckets_end: f64 = 26.0 * 3600.0; // 02:00 next day
    let n_last_buckets = ((last_buckets_end - last_buckets_start) / bucket_size).ceil() as usize;
    let mut last_hist: Vec<(usize, usize, usize, usize)> = vec![(0, 0, 0, 0); n_last_buckets];

    // Night gap counters
    let cutoff_22 = 22.0 * 3600.0;
    let cutoff_23 = 23.0 * 3600.0;
    let mut dark_by_22 = 0usize;
    let mut dark_by_23 = 0usize;
    let mut total_with_service = 0usize;

    for info in stop_spans.iter().flatten() {
        total_with_service += 1;

        // First service histogram
        let bucket_idx = if info.earliest < first_buckets_start {
            0
        } else if info.earliest >= first_buckets_end {
            n_first_buckets - 1
        } else {
            ((info.earliest - first_buckets_start) / bucket_size).floor() as usize
        };
        if bucket_idx < n_first_buckets {
            first_hist[bucket_idx].0 += 1;
            if info.has_tram {
                first_hist[bucket_idx].1 += 1;
            }
            if info.has_bus {
                first_hist[bucket_idx].2 += 1;
            }
            if info.has_rail {
                first_hist[bucket_idx].3 += 1;
            }
        }

        // Last service histogram
        let last_bucket = if info.latest < last_buckets_start {
            0
        } else if info.latest >= last_buckets_end {
            n_last_buckets - 1
        } else {
            ((info.latest - last_buckets_start) / bucket_size).floor() as usize
        };
        if last_bucket < n_last_buckets {
            last_hist[last_bucket].0 += 1;
            if info.has_tram {
                last_hist[last_bucket].1 += 1;
            }
            if info.has_bus {
                last_hist[last_bucket].2 += 1;
            }
            if info.has_rail {
                last_hist[last_bucket].3 += 1;
            }
        }

        // Night gap
        if info.latest < cutoff_22 {
            dark_by_22 += 1;
        }
        if info.latest < cutoff_23 {
            dark_by_23 += 1;
        }
    }

    // Convert histograms to ServiceBucket
    let first_service_histogram: Vec<ServiceBucket> = (0..n_first_buckets)
        .map(|i| {
            let t = first_buckets_start + i as f64 * bucket_size;
            ServiceBucket {
                label: secs_to_hhmm(t),
                stop_count: first_hist[i].0,
                tram_stops: first_hist[i].1,
                bus_stops: first_hist[i].2,
                rail_stops: first_hist[i].3,
            }
        })
        .collect();

    let last_service_histogram: Vec<ServiceBucket> = (0..n_last_buckets)
        .map(|i| {
            let t = last_buckets_start + i as f64 * bucket_size;
            ServiceBucket {
                label: secs_to_hhmm(t),
                stop_count: last_hist[i].0,
                tram_stops: last_hist[i].1,
                bus_stops: last_hist[i].2,
                rail_stops: last_hist[i].3,
            }
        })
        .collect();

    // Per-mode stats - use origin-stop departures with morning/evening windows
    // (morning_earliest, evening_latest, routes_before_5am, routes_after_midnight)
    let mut mode_stats: HashMap<String, (f64, f64, usize, usize)> = HashMap::new();

    for (_key, group) in route_groups {
        let mode_str = &group.mode_str;
        let mut route_morning = f64::INFINITY;
        let mut route_evening = f64::NEG_INFINITY;

        for &pi in &group.pattern_indices {
            let p = &graph.patterns[pi];
            // Use origin departures only (no offset)
            for &dep in &p.departures {
                if (3.0 * 3600.0..=10.0 * 3600.0).contains(&dep) && dep < route_morning {
                    route_morning = dep;
                }
                if (18.0 * 3600.0..=25.0 * 3600.0).contains(&dep) && dep > route_evening {
                    route_evening = dep;
                }
            }
        }

        let entry =
            mode_stats
                .entry(mode_str.clone())
                .or_insert((f64::INFINITY, f64::NEG_INFINITY, 0, 0));
        if route_morning < entry.0 {
            entry.0 = route_morning;
        }
        if route_evening > entry.1 {
            entry.1 = route_evening;
        }
        if route_morning < 5.0 * 3600.0 {
            entry.2 += 1;
        }
        if route_evening > 24.0 * 3600.0 {
            entry.3 += 1;
        }
    }

    let by_mode: Vec<ServiceSpanByMode> = {
        let mut modes: Vec<_> = mode_stats.into_iter().collect();
        modes.sort_by_key(|(m, _)| match m.as_str() {
            "TRAM" => 0,
            "BUS" => 1,
            "RAIL" => 2,
            _ => 3,
        });
        modes
            .into_iter()
            .map(|(mode, (morning, evening, b5, am))| ServiceSpanByMode {
                mode,
                earliest_departure: secs_to_hhmm(morning),
                latest_departure: secs_to_hhmm(evening),
                routes_before_5am: b5,
                routes_after_midnight: am,
            })
            .collect()
    };

    // Routes ending before 22:00, 23:00, or running past midnight
    let mut routes_before_22: Vec<String> = Vec::new();
    let mut routes_before_23: Vec<String> = Vec::new();
    let mut routes_past_midnight: Vec<String> = Vec::new();

    for (key, group) in route_groups {
        let name = key.split(':').nth(1).unwrap_or(key).to_string();
        let mut route_latest = f64::NEG_INFINITY;

        for &pi in &group.pattern_indices {
            let p = &graph.patterns[pi];
            if let Some(&last) = p.departures.last() {
                let t = last + p.stop_offsets.last().copied().unwrap_or(0.0);
                if t > route_latest {
                    route_latest = t;
                }
            }
        }

        if route_latest < cutoff_22 {
            routes_before_22.push(name.clone());
        }
        if route_latest < cutoff_23 {
            routes_before_23.push(name.clone());
        }
        if route_latest > 24.0 * 3600.0 {
            routes_past_midnight.push(name.clone());
        }
    }

    routes_before_22.sort();
    routes_before_23.sort();
    routes_past_midnight.sort();

    let pct_dark = if total_with_service > 0 {
        round1(dark_by_23 as f64 / total_with_service as f64 * 100.0)
    } else {
        0.0
    };

    // Narrative-friendly morning/evening times: scan origin-stop departures only
    let mut first_morning = f64::INFINITY; // earliest dep between 03:00-10:00
    let mut last_evening = f64::NEG_INFINITY; // latest dep between 18:00-24:00
    let mut any_rail = false;

    for p in &graph.patterns {
        if p.mode_enum == Mode::Rail && !p.departures.is_empty() {
            any_rail = true;
        }
        // Only look at origin stop departures (offset = 0) for system-wide times
        for &dep in &p.departures {
            if (3.0 * 3600.0..=10.0 * 3600.0).contains(&dep) && dep < first_morning {
                first_morning = dep;
            }
            // Cap at 25:00 to capture late-night departures up to 01:00 AM
            // but exclude GTFS post-midnight continuation trips (e.g. 28:45)
            if (18.0 * 3600.0..=25.0 * 3600.0).contains(&dep) && dep > last_evening {
                last_evening = dep;
            }
        }
    }

    ServiceSpan {
        earliest_departure: secs_to_hhmm(sys_earliest),
        latest_departure: secs_to_hhmm_raw(sys_latest),
        first_morning_departure: if first_morning < f64::INFINITY {
            secs_to_hhmm(first_morning)
        } else {
            secs_to_hhmm(sys_earliest)
        },
        last_evening_departure: if last_evening > f64::NEG_INFINITY {
            secs_to_hhmm(last_evening)
        } else {
            secs_to_hhmm(sys_latest)
        },
        first_service_histogram,
        last_service_histogram,
        by_mode,
        has_rail: any_rail,
        night_gap: NightGap {
            stops_dark_by_22: dark_by_22,
            stops_dark_by_23: dark_by_23,
            total_stops: total_with_service,
            pct_dark_by_23: pct_dark,
            routes_ending_before_22: routes_before_22,
            routes_ending_before_23: routes_before_23,
            routes_past_midnight,
        },
    }
}

// ---------------------------------------------------------------------------
// 2.10 Pulse scheduling: detect synchronized arrivals at transfer hubs
// ---------------------------------------------------------------------------

fn compute_pulse_scheduling(graph: &TransitGraphJson) -> Vec<PulseHub> {
    // For each stop, collect unique route names and the patterns per route
    let mut stop_route_patterns: Vec<HashMap<String, Vec<usize>>> =
        vec![HashMap::new(); graph.stops.len()];

    for (si, stop) in graph.stops.iter().enumerate() {
        for sp in &stop.patterns {
            let p = &graph.patterns[sp.pattern_idx];
            let route_name = p.route.clone();
            stop_route_patterns[si]
                .entry(route_name)
                .or_default()
                .push(sp.pattern_idx);
        }
    }

    // Find transfer hubs: stops served by 3+ different routes
    let mut hubs: Vec<PulseHub> = Vec::new();

    for (si, route_patterns) in stop_route_patterns.iter().enumerate() {
        if route_patterns.len() < 3 {
            continue;
        }

        let stop = &graph.stops[si];
        let mut routes: Vec<String> = route_patterns.keys().cloned().collect();
        routes.sort_by(|a, b| match (a.parse::<i32>(), b.parse::<i32>()) {
            (Ok(ai), Ok(bi)) => ai.cmp(&bi),
            _ => a.cmp(b),
        });

        // For each hour (5:00-23:00), compute arrivals per route at this stop
        let mut hourly_wait: Vec<f64> = Vec::with_capacity(19);

        for hour in 5u8..=23 {
            let hour_start = hour as f64 * 3600.0;
            let hour_end = hour_start + 3600.0;

            // Collect arrivals per route within this hour
            let mut route_arrivals: Vec<(&str, Vec<f64>)> = Vec::new();

            for (route_name, pattern_indices) in route_patterns {
                let mut arrivals: Vec<f64> = Vec::new();
                // Deduplicate pattern indices for this stop+route
                let mut seen_patterns: HashSet<usize> = HashSet::new();

                for sp in &stop.patterns {
                    if !seen_patterns.insert(sp.pattern_idx) {
                        continue;
                    }
                    if !pattern_indices.contains(&sp.pattern_idx) {
                        continue;
                    }
                    let pattern = &graph.patterns[sp.pattern_idx];
                    let offset = pattern.stop_offsets[sp.stop_idx];

                    for &dep in &pattern.departures {
                        let arrival = dep + offset;
                        if arrival >= hour_start && arrival < hour_end {
                            arrivals.push(arrival);
                        }
                    }
                }
                arrivals.sort_by(|a, b| a.partial_cmp(b).unwrap());
                arrivals.dedup();
                if !arrivals.is_empty() {
                    route_arrivals.push((route_name.as_str(), arrivals));
                }
            }

            // Compute average minimum transfer wait across all route pairs
            let mut pair_waits: Vec<f64> = Vec::new();

            for i in 0..route_arrivals.len() {
                for j in (i + 1)..route_arrivals.len() {
                    let (_, ref arr_a) = route_arrivals[i];
                    let (_, ref arr_b) = route_arrivals[j];

                    // For each arrival of route A, find minimum wait to next arrival of route B
                    let mut min_waits_ab: Vec<f64> = Vec::new();
                    for &a in arr_a {
                        let mut best = f64::INFINITY;
                        for &b in arr_b {
                            if b >= a {
                                best = (b - a).min(best);
                                break; // arr_b is sorted, first >= a is the minimum
                            }
                        }
                        if best < f64::INFINITY {
                            min_waits_ab.push(best);
                        }
                    }

                    // And vice versa: for each arrival of B, find min wait to next A
                    let mut min_waits_ba: Vec<f64> = Vec::new();
                    for &b in arr_b {
                        let mut best = f64::INFINITY;
                        for &a in arr_a {
                            if a >= b {
                                best = (a - b).min(best);
                                break;
                            }
                        }
                        if best < f64::INFINITY {
                            min_waits_ba.push(best);
                        }
                    }

                    // Average of both directions
                    let all_waits: Vec<f64> = min_waits_ab
                        .into_iter()
                        .chain(min_waits_ba.into_iter())
                        .collect();
                    if !all_waits.is_empty() {
                        let avg_wait = all_waits.iter().sum::<f64>() / all_waits.len() as f64;
                        pair_waits.push(avg_wait / 60.0); // convert to minutes
                    }
                }
            }

            if pair_waits.is_empty() {
                hourly_wait.push(f64::NAN);
            } else {
                let avg = pair_waits.iter().sum::<f64>() / pair_waits.len() as f64;
                hourly_wait.push(round1(avg));
            }
        }

        // Compute overall average (ignoring NaN hours)
        let valid_hours: Vec<f64> = hourly_wait
            .iter()
            .copied()
            .filter(|v| !v.is_nan())
            .collect();
        if valid_hours.is_empty() {
            continue;
        }
        let avg_transfer_wait = valid_hours.iter().sum::<f64>() / valid_hours.len() as f64;

        // Find best hour (lowest wait)
        let mut best_hour = 5u8;
        let mut best_wait = f64::INFINITY;
        for (i, &w) in hourly_wait.iter().enumerate() {
            if !w.is_nan() && w < best_wait {
                best_wait = w;
                best_hour = (i as u8) + 5;
            }
        }

        // Replace NaN with -1 for JSON serialization
        let hourly_wait_json: Vec<f64> = hourly_wait
            .iter()
            .map(|&v| if v.is_nan() { -1.0 } else { v })
            .collect();

        hubs.push(PulseHub {
            stop_name: if stop.name.is_empty() {
                stop.key.clone()
            } else {
                stop.name.clone()
            },
            stop_key: stop.key.clone(),
            lat: stop.lat,
            lon: stop.lon,
            route_count: routes.len(),
            routes,
            avg_transfer_wait_min: round1(avg_transfer_wait),
            best_hour,
            best_hour_wait_min: round1(best_wait),
            hourly_wait: hourly_wait_json,
        });
    }

    // Sort by route_count descending (most connected hubs first)
    hubs.sort_by(|a, b| {
        b.route_count.cmp(&a.route_count).then_with(|| {
            a.avg_transfer_wait_min
                .partial_cmp(&b.avg_transfer_wait_min)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });

    // Limit to top 20
    hubs.truncate(20);

    hubs
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/// Parse YYYYMMDD string and return day of week (0=Sunday, 1=Monday, ..., 6=Saturday).
/// Uses Tomohiko Sakamoto's algorithm.
fn date_to_day_of_week(yyyymmdd: &str) -> Option<u32> {
    let y: i32 = yyyymmdd[0..4].parse().ok()?;
    let m: u32 = yyyymmdd[4..6].parse().ok()?;
    let d: u32 = yyyymmdd[6..8].parse().ok()?;
    // Tomohiko Sakamoto's algorithm
    static T: [i32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if m < 3 { y - 1 } else { y };
    let dow = (y + y / 4 - y / 100 + y / 400 + T[(m - 1) as usize] + d as i32) % 7;
    Some(dow as u32) // 0=Sunday
}

use crate::route_stats::{round1, round2};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

pub fn compute_and_write(
    graph: &TransitGraphJson,
    data_dir: &Path,
    out_path: &Path,
    day_filtered: bool,
) {
    eprintln!("Computing network statistics...");

    let divisor = if day_filtered { 1.0 } else { 7.0 };

    // Group patterns by route
    let route_groups = group_routes(graph);

    // Per-route stats + vehicle-km accumulation
    let mut route_entries: Vec<NetworkRoute> = Vec::new();
    let mut vkm_tram = 0.0f64;
    let mut vkm_bus = 0.0f64;
    let mut vkm_rail = 0.0f64;

    for (key, group) in &route_groups {
        // 1.1 Hourly departures
        let hourly = compute_hourly_departures(graph, group, divisor);

        // 1.2 Headway CV
        let (overall_cv, peak_cv) = compute_headway_cvs(graph, group, divisor);

        // 1.8 Tortuosity
        let (tortuosity, straight_km) = compute_tortuosity(graph, group);

        // 1.10 Stop spacing
        let spacing = compute_stop_spacing(graph, group);

        // 1.20 Peak-to-base ratio
        let (peak_dep, base_dep, ptb_ratio) = compute_peak_to_base(&hourly);

        // 1.5 Vehicle-km: sum across all patterns
        for &pi in &group.pattern_indices {
            let p = &graph.patterns[pi];
            let dist = pattern_distance_km(graph, pi);
            let trips = p.departures.len() as f64 / divisor;
            match p.mode_enum {
                Mode::Tram => vkm_tram += trips * dist,
                Mode::Bus | Mode::Other => vkm_bus += trips * dist,
                Mode::Rail => vkm_rail += trips * dist,
            }
        }

        let name = key.split(':').nth(1).unwrap_or(key).to_string();
        route_entries.push(NetworkRoute {
            name,
            mode: group.mode_str.clone(),
            hourly_departures: hourly,
            headway_cv: overall_cv.map(round2),
            peak_headway_cv: peak_cv.map(round2),
            tortuosity,
            straight_line_km: straight_km,
            stop_spacing: spacing,
            peak_dep_per_hour: peak_dep,
            base_dep_per_hour: base_dep,
            peak_to_base_ratio: ptb_ratio,
        });
    }

    // Sort routes: mode (TRAM, BUS, RAIL), then numeric/alpha name
    route_entries.sort_by(|a, b| {
        let mode_order = |m: &str| match m {
            "TRAM" => 0,
            "BUS" => 1,
            "RAIL" => 2,
            _ => 3,
        };
        let ma = mode_order(&a.mode);
        let mb = mode_order(&b.mode);
        ma.cmp(&mb)
            .then_with(|| match (a.name.parse::<i32>(), b.name.parse::<i32>()) {
                (Ok(ai), Ok(bi)) => ai.cmp(&bi),
                _ => a.name.cmp(&b.name),
            })
    });

    // 1.15 Dead-end stops
    let dead_ends = compute_dead_end_stops(graph);

    // Vehicle-km totals
    let vkm_total = vkm_tram + vkm_bus + vkm_rail;

    // GTFS-based stats (fleet, weekend, direction)
    let gtfs_dir = data_dir.join("gtfs");
    let mut fleet_val: Option<Fleet> = None;
    let mut weekend_val: Option<WeekendService> = None;
    let mut direction_val: Option<Vec<DirectionalAsymmetryEntry>> = None;

    // Try parsing each GTFS zip and merge results
    let zip_names = ["zet.zip", "hzpp-zagreb.zip"];
    let mut all_parsed: Vec<GtfsParsed> = Vec::new();
    for name in &zip_names {
        let path = gtfs_dir.join(name);
        if path.exists() {
            if let Some(parsed) = parse_gtfs_zip(&path) {
                eprintln!(
                    "  Parsed GTFS: {} ({} trips, {} routes, {} services)",
                    name,
                    parsed.trips.len(),
                    parsed.routes.len(),
                    parsed.calendar.len()
                );
                all_parsed.push(parsed);
            }
        }
    }

    if !all_parsed.is_empty() {
        // Merge parsed data
        let mut merged = GtfsParsed {
            trips: Vec::new(),
            calendar: HashMap::new(),
            routes: HashMap::new(),
        };
        for mut p in all_parsed {
            merged.trips.append(&mut p.trips);
            merged.calendar.extend(p.calendar);
            merged.routes.extend(p.routes);
        }

        fleet_val = Some(compute_fleet(&merged));
        let wd = compute_weekend_and_direction(&merged);
        weekend_val = Some(wd.weekend);
        direction_val = Some(wd.direction);
    }

    // 1.3 + 1.4 Service span (first/last service + night gap)
    let service_span_val = Some(compute_service_span(graph, &route_groups));
    if let Some(ref ss) = service_span_val {
        eprintln!(
            "  Service span: {} – {}, {} stops dark by 23:00 ({:.0}%)",
            ss.earliest_departure,
            ss.latest_departure,
            ss.night_gap.stops_dark_by_23,
            ss.night_gap.pct_dark_by_23,
        );
    }

    // 2.10 Pulse scheduling detection
    let pulse_hubs = compute_pulse_scheduling(graph);
    eprintln!(
        "  Pulse hubs: {} hubs with 3+ routes (top avg wait: {:.1} min)",
        pulse_hubs.len(),
        pulse_hubs.first().map_or(0.0, |h| h.avg_transfer_wait_min),
    );

    // Build output
    let output = NetworkStatsOutput {
        generated_at: crate::chrono_now_iso(),
        vehicle_km: VehicleKm {
            tram: vkm_tram.round() as i64,
            bus: vkm_bus.round() as i64,
            rail: vkm_rail.round() as i64,
            total: vkm_total.round() as i64,
        },
        routes: route_entries,
        dead_end_stops: dead_ends,
        fleet: fleet_val,
        weekend_service: weekend_val,
        directional_asymmetry: direction_val,
        service_span: service_span_val,
        pulse_hubs,
    };

    let json = serde_json::to_string_pretty(&output).expect("JSON serialization failed");
    std::fs::write(out_path, json).expect("Cannot write network-stats.json");

    eprintln!(
        "  Vehicle-km/day: {} tram, {} bus, {} rail (total: {})",
        vkm_tram.round() as i64,
        vkm_bus.round() as i64,
        vkm_rail.round() as i64,
        vkm_total.round() as i64,
    );
    eprintln!("  {} dead-end stops", output.dead_end_stops.total);
    if let Some(ref fleet) = output.fleet {
        eprintln!(
            "  Fleet: {} blocks ({} tram, {} bus, {} interlined)",
            fleet.total_blocks, fleet.tram_blocks, fleet.bus_blocks, fleet.interlined_blocks,
        );
    }
    if let Some(ref weekend) = output.weekend_service {
        eprintln!(
            "  Weekend: {} weekday-only routes",
            weekend.weekday_only_count
        );
    }
    eprintln!("  Written to {}", out_path.display());
}
