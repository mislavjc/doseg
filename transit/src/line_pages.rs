//! Per-line page data for the /linije/[broj] pSEO pages.
//!
//! Queries OTP for three representative service dates (weekday / Saturday /
//! Sunday — probing two candidates each to dodge holidays), picks the dominant
//! pattern per direction, and writes one JSON per line plus an index under
//! data/linije/. Run with `cargo run --release --bin transit-scorer -- --line-pages`.

use std::collections::HashMap;
use std::path::Path;

use graphql_client::GraphQLQuery;
use serde::Serialize;
use ts_rs::TS;

use crate::districts::polygon_area_km2;
use crate::geo::{fast_dist_km, KM_PER_DEG_LAT};
use crate::route_stats::{
    compute_headway, decode_polyline, format_time, polyline_distance_km, round1,
};

/// OTP's Polyline scalar — only needed as an opaque String.
type Polyline = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "schema.json",
    query_path = "src/queries/line_patterns.graphql",
    response_derives = "Debug"
)]
pub struct GetLinePatterns;

const DAY_RADNI: usize = 0;
const DAY_SUBOTA: usize = 1;
const DAY_NEDJELJA: usize = 2;

/// Interchange radius — stops this close count as the same boarding place.
const NEAR_KM: f64 = 0.15;
/// Terminal clustering radius (matches the hub clustering in route_stats).
const TERMINAL_NEAR_KM: f64 = 0.2;
/// Max points in a simplified shape polyline.
const MAX_SHAPE_POINTS: usize = 200;
/// A "via" hub must be served by at least this many other lines.
const VIA_MIN_LINES: usize = 3;

// ---------------------------------------------------------------------------
// Output types (exported to TypeScript via ts-rs)
// ---------------------------------------------------------------------------

/// Transit mode of a line, exported to TS as the union "tram" | "bus".
#[derive(Serialize, TS, Clone, Copy, PartialEq)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "lowercase")]
pub enum LineMode {
    Tram,
    Bus,
}

impl LineMode {
    fn from_otp(mode: &str) -> Self {
        if mode == "TRAM" {
            LineMode::Tram
        } else {
            LineMode::Bus
        }
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LinePageData {
    pub broj: String,
    pub mode: LineMode,
    /// Night line (service concentrated between 23:00 and 04:00)
    pub is_night: bool,
    /// [origin, destination] — endpoints of direction 0
    pub terminals: Vec<String>,
    /// Up to two intermediate hub stop names ("preko X i Y")
    pub via: Vec<String>,
    pub one_way: bool,
    pub directions: Vec<LineDirection>,
    /// [minLon, minLat, maxLon, maxLat] over shapes + stops
    pub bbox: Vec<f64>,
    /// Weekday departures per clock hour (index 0–23, both directions summed)
    pub histogram: Vec<u32>,
    pub timetable: LineTimetable,
    pub related: RelatedLines,
    pub prev_broj: Option<String>,
    pub next_broj: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reach: Option<LineReach>,
    pub stats: LineStats,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineDirection {
    pub headsign: String,
    pub stops: Vec<LineStop>,
    /// [lon, lat] pairs, Douglas–Peucker simplified
    #[ts(type = "[number, number][]")]
    pub shape: Vec<(f64, f64)>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineStop {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    /// Median travel time from the terminal, minutes
    pub offset_min: u32,
    /// Tram lines boarding within 150 m (empty for most stops)
    pub tram_interchange: Vec<String>,
}

/// One timetable row: GTFS hour (kept verbatim, may be ≥24 for night service)
/// and the departure minutes within it.
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct HourRow {
    pub hour: u32,
    pub minutes: Vec<u32>,
}

/// Departures grouped per day type, then per direction (parallel to `directions`).
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineTimetable {
    pub radni_dan: Vec<Vec<HourRow>>,
    pub subota: Vec<Vec<HourRow>>,
    pub nedjelja: Vec<Vec<HourRow>>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RelatedLine {
    pub broj: String,
    pub mode: LineMode,
    pub is_night: bool,
    /// Which of this line's terminals it departs from
    pub terminal: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TramCrossing {
    pub broj: String,
    pub stop_name: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RelatedLines {
    pub shared_terminal: Vec<RelatedLine>,
    pub tram_crossings: Vec<TramCrossing>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineReach {
    pub area_km2: f64,
    pub stop_name: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineStats {
    /// Weekday departures, both directions
    pub daily_departures: u32,
    /// First/last weekday departure from the direction-0 terminal ("HH:MM", may be ≥24)
    pub first_departure: String,
    pub last_departure: String,
    pub peak_headway_min: Option<f64>,
    pub avg_headway_min: Option<f64>,
    pub travel_time_min: f64,
    pub distance_km: f64,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineIndexEntry {
    pub broj: String,
    pub mode: LineMode,
    pub is_night: bool,
    pub terminals: Vec<String>,
    pub daily_departures: u32,
    pub peak_headway_min: Option<f64>,
    pub avg_headway_min: Option<f64>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ServiceDates {
    pub radni_dan: String,
    pub subota: String,
    pub nedjelja: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LinePagesIndex {
    pub generated_at: String,
    pub service_dates: ServiceDates,
    pub lines: Vec<LineIndexEntry>,
}

// ---------------------------------------------------------------------------
// OTP fetch + merge
// ---------------------------------------------------------------------------

struct MergedStop {
    name: String,
    lat: f64,
    lon: f64,
}

struct MergedPattern {
    mode: String, // "TRAM" | "BUS" (uppercase, from OTP)
    broj: String,
    direction: usize, // 0 or 1 (missing directionId → 0)
    headsign: Option<String>,
    stops: Vec<MergedStop>,
    geometry: Option<String>,
    /// Per day type: per trip, scheduledDeparture seconds parallel to stops
    trips: [Vec<Vec<Option<i64>>>; 3],
}

fn fetch_patterns(otp_url: &str, date: &str) -> Vec<get_line_patterns::GetLinePatternsPatterns> {
    let body = get_line_patterns::Variables {
        service_date: date.to_string(),
    };
    let body = GetLinePatterns::build_query(body);
    let resp: graphql_client::Response<get_line_patterns::ResponseData> =
        ureq::post(&format!("{}/otp/gtfs/v1", otp_url))
            .header("Content-Type", "application/json")
            .send_json(&body)
            .unwrap_or_else(|e| panic!("OTP request failed: {}", e))
            .body_mut()
            .read_json()
            .expect("Failed to parse OTP response");

    resp.data
        .expect("OTP returned no data")
        .patterns
        .unwrap_or_default()
        .into_iter()
        .flatten()
        .collect()
}

fn total_trips(patterns: &[get_line_patterns::GetLinePatternsPatterns]) -> usize {
    patterns
        .iter()
        .map(|p| p.trips_for_date.as_ref().map_or(0, |t| t.len()))
        .sum()
}

/// Day-type kinds for representative-date picking.
#[derive(Clone, Copy)]
enum DayKind {
    Weekday,
    Saturday,
    Sunday,
}

/// Feed validity window in epoch days, from OTP's serviceTimeRange.
fn fetch_service_range_days(otp_url: &str) -> (i64, i64) {
    let mut resp = ureq::post(&format!("{}/otp/gtfs/v1", otp_url))
        .header("Content-Type", "application/json")
        .send_json(serde_json::json!({"query": "{ serviceTimeRange { start end } }"}))
        .unwrap_or_else(|e| panic!("OTP serviceTimeRange request failed: {}", e));
    let json: serde_json::Value = resp
        .body_mut()
        .read_json()
        .expect("Failed to parse serviceTimeRange");
    let start = json["data"]["serviceTimeRange"]["start"].as_i64().unwrap_or(0);
    let end = json["data"]["serviceTimeRange"]["end"].as_i64().unwrap_or(0);
    (start / 86400, end / 86400)
}

fn epoch_days_today() -> i64 {
    (std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        / 86400) as i64
}

fn format_epoch_days(days: i64) -> String {
    let (y, m, d) = crate::days_to_ymd(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Candidate dates for a day kind inside the feed window, preference-ordered.
/// Weekday prefers Tue/Wed/Thu (least likely to be holiday-adjacent).
fn candidate_dates(kind: DayKind, today: i64, last_day: i64) -> Vec<String> {
    // (epoch_days + 4) % 7: 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday)
    let wanted: &[i64] = match kind {
        DayKind::Weekday => &[2, 3, 4, 1, 5], // tue, wed, thu, mon, fri
        DayKind::Saturday => &[6],
        DayKind::Sunday => &[0],
    };
    let mut out: Vec<String> = Vec::new();
    for &w in wanted {
        for d in today..=last_day.min(today + 13) {
            if (d + 4) % 7 == w {
                out.push(format_epoch_days(d));
            }
        }
    }
    out
}

/// Fetch a day type from candidate dates inside the feed window. Probes until a
/// date with service is found, then one more candidate and keeps the busier
/// one (a public holiday on the first pick would undercount).
fn pick_date_and_fetch(
    otp_url: &str,
    kind: DayKind,
    label: &str,
    today: i64,
    last_day: i64,
) -> (String, Vec<get_line_patterns::GetLinePatternsPatterns>) {
    let mut best: Option<(String, Vec<get_line_patterns::GetLinePatternsPatterns>, usize)> = None;
    for date in candidate_dates(kind, today, last_day) {
        let patterns = fetch_patterns(otp_url, &date);
        let n = total_trips(&patterns);
        eprintln!("  {}: {} ({} trips)", label, date, n);
        match best {
            Some((_, _, best_n)) => {
                if n > best_n {
                    best = Some((date, patterns, n));
                }
                break; // one extra probe after the first hit — done
            }
            None if n > 0 => best = Some((date, patterns, n)),
            None => {}
        }
    }
    match best {
        Some((date, patterns, _)) => (date, patterns),
        None => {
            eprintln!("  {}: no service found in feed window!", label);
            ("".to_string(), Vec::new())
        }
    }
}

/// Merge the three per-date fetches into one pattern map keyed by OTP code.
fn merge_patterns(
    fetches: [Vec<get_line_patterns::GetLinePatternsPatterns>; 3],
) -> indexmap::IndexMap<String, MergedPattern> {
    let mut merged: indexmap::IndexMap<String, MergedPattern> = indexmap::IndexMap::new();

    for (day_idx, patterns) in fetches.into_iter().enumerate() {
        for p in patterns {
            let get_line_patterns::GetLinePatternsPatterns {
                code,
                direction_id,
                headsign,
                route,
                pattern_geometry,
                stops,
                trips_for_date,
            } = p;

            let mode = route
                .mode
                .as_ref()
                .map(|m| format!("{:?}", m))
                .unwrap_or_else(|| "BUS".into());
            if mode != "TRAM" && mode != "BUS" {
                continue;
            }
            let broj = route.short_name.unwrap_or_default();
            if broj.is_empty() {
                continue;
            }
            let stops: Vec<MergedStop> = stops
                .unwrap_or_default()
                .into_iter()
                .map(|s| MergedStop {
                    name: s.name,
                    lat: s.lat.unwrap_or(0.0),
                    lon: s.lon.unwrap_or(0.0),
                })
                .collect();
            if stops.len() < 2 {
                continue;
            }

            let entry = merged.entry(code).or_insert_with(|| MergedPattern {
                mode,
                broj,
                direction: direction_id.map_or(0, |d| if d == 1 { 1 } else { 0 }),
                headsign,
                stops,
                geometry: pattern_geometry.and_then(|g| g.points),
                trips: [Vec::new(), Vec::new(), Vec::new()],
            });

            entry.trips[day_idx] = trips_for_date
                .unwrap_or_default()
                .into_iter()
                .map(|t| {
                    t.stoptimes
                        .unwrap_or_default()
                        .into_iter()
                        .map(|st| st.and_then(|s| s.scheduled_departure))
                        .collect()
                })
                .collect();
        }
    }

    merged
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

fn perp_dist(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len2 = dx * dx + dy * dy;
    let t = if len2 == 0.0 {
        0.0
    } else {
        (((p.0 - a.0) * dx + (p.1 - a.1) * dy) / len2).clamp(0.0, 1.0)
    };
    let (ex, ey) = (p.0 - (a.0 + t * dx), p.1 - (a.1 + t * dy));
    (ex * ex + ey * ey).sqrt()
}

fn douglas_peucker(points: &[(f64, f64)], tol: f64) -> Vec<(f64, f64)> {
    let n = points.len();
    if n <= 2 {
        return points.to_vec();
    }
    let mut keep = vec![false; n];
    keep[0] = true;
    keep[n - 1] = true;
    let mut stack = vec![(0usize, n - 1)];
    while let Some((a, b)) = stack.pop() {
        if b <= a + 1 {
            continue;
        }
        let mut max_d = 0.0;
        let mut max_i = a;
        for (i, &pt) in points.iter().enumerate().take(b).skip(a + 1) {
            let d = perp_dist(pt, points[a], points[b]);
            if d > max_d {
                max_d = d;
                max_i = i;
            }
        }
        if max_d > tol {
            keep[max_i] = true;
            stack.push((a, max_i));
            stack.push((max_i, b));
        }
    }
    points
        .iter()
        .zip(&keep)
        .filter(|(_, &k)| k)
        .map(|(p, _)| *p)
        .collect()
}

fn simplify_shape(points: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    if points.len() <= MAX_SHAPE_POINTS {
        return points;
    }
    let mut tol = 1e-5;
    loop {
        let s = douglas_peucker(&points, tol);
        if s.len() <= MAX_SHAPE_POINTS {
            return s;
        }
        tol *= 2.0;
    }
}

fn round5(v: f64) -> f64 {
    (v * 1e5).round() / 1e5
}

/// Sum a GeoJSON MultiPolygon's area: outer ring minus holes, per polygon.
fn multipolygon_area_km2(coords: &serde_json::Value) -> f64 {
    let mut total = 0.0;
    for polygon in coords.as_array().into_iter().flatten() {
        for (ring_idx, ring) in polygon.as_array().into_iter().flatten().enumerate() {
            let pts: Vec<(f64, f64)> = ring
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|c| Some((c[0].as_f64()?, c[1].as_f64()?)))
                .collect();
            let area = polygon_area_km2(&pts);
            if ring_idx == 0 {
                total += area;
            } else {
                total -= area;
            }
        }
    }
    total.max(0.0)
}

// ---------------------------------------------------------------------------
// Spatial index over all dominant-pattern stops
// ---------------------------------------------------------------------------

struct GlobalStop {
    lat: f64,
    lon: f64,
    line_idx: usize,
    is_terminal: bool,
}

struct StopGrid {
    cell: f64,
    map: HashMap<(i32, i32), Vec<usize>>,
}

impl StopGrid {
    fn build(stops: &[GlobalStop]) -> Self {
        // Cell ≥ the largest query radius so a 3×3 neighborhood always covers it.
        let cell = (TERMINAL_NEAR_KM * 1.5) / KM_PER_DEG_LAT;
        let mut map: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
        for (i, s) in stops.iter().enumerate() {
            let key = ((s.lon / cell).floor() as i32, (s.lat / cell).floor() as i32);
            map.entry(key).or_default().push(i);
        }
        StopGrid { cell, map }
    }

    fn near(&self, lat: f64, lon: f64) -> impl Iterator<Item = usize> + '_ {
        let cx = (lon / self.cell).floor() as i32;
        let cy = (lat / self.cell).floor() as i32;
        (-1..=1).flat_map(move |dx| {
            (-1..=1).flat_map(move |dy| {
                self.map
                    .get(&(cx + dx, cy + dy))
                    .into_iter()
                    .flatten()
                    .copied()
            })
        })
    }
}

// ---------------------------------------------------------------------------
// Per-line assembly
// ---------------------------------------------------------------------------

struct LineBuild {
    broj: String,
    mode: String,
    is_night: bool,
    /// Dominant pattern (index into merged values) per direction, direction 0 first.
    dominant: Vec<usize>,
}

/// Night line = departures concentrated between 23:00 and 04:00.
fn line_is_night(patterns: &[&MergedPattern], pattern_idxs: &[usize]) -> bool {
    let mut night = 0u32;
    let mut day = 0u32;
    for &pi in pattern_idxs {
        for trips in &patterns[pi].trips {
            for st in trips {
                if let Some(Some(dep)) = st.first() {
                    let h = (dep / 3600) % 24;
                    if !(4..23).contains(&h) {
                        night += 1
                    } else {
                        day += 1
                    }
                }
            }
        }
    }
    night > day
}

/// Median cumulative stoptime offsets (seconds) from the terminal, per stop.
fn stop_offsets_sec(pattern: &MergedPattern) -> Vec<f64> {
    let n = pattern.stops.len();
    let mut offsets = vec![0.0f64; n];
    // Prefer weekday trips; fall back to whichever day has service.
    let trips = [DAY_RADNI, DAY_SUBOTA, DAY_NEDJELJA]
        .into_iter()
        .map(|d| &pattern.trips[d])
        .find(|t| !t.is_empty());
    let Some(trips) = trips else {
        return offsets;
    };
    for i in 1..n {
        let mut samples: Vec<f64> = trips
            .iter()
            .filter(|st| st.len() == n)
            .filter_map(|st| match (st[0], st[i]) {
                (Some(base), Some(dep)) if dep >= base => Some((dep - base) as f64),
                _ => None,
            })
            .collect();
        offsets[i] = if samples.is_empty() {
            offsets[i - 1]
        } else {
            samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
            crate::median(&samples)
        };
    }
    offsets
}

/// Terminal departures (seconds) for one (route, direction, day type), pooling
/// every pattern variant that departs from the dominant terminal cluster.
fn direction_departures(
    patterns: &[&MergedPattern],
    dominant_first: (f64, f64),
    direction: usize,
    day: usize,
) -> Vec<i64> {
    let mut deps: Vec<i64> = Vec::new();
    for p in patterns {
        if p.direction != direction {
            continue;
        }
        let first = &p.stops[0];
        if fast_dist_km(first.lat, first.lon, dominant_first.0, dominant_first.1) > NEAR_KM {
            continue;
        }
        deps.extend(
            p.trips[day]
                .iter()
                .filter_map(|st| st.first().copied().flatten()),
        );
    }
    deps.sort_unstable();
    deps
}

fn hour_rows(departures: &[i64]) -> Vec<HourRow> {
    let mut by_hour: indexmap::IndexMap<u32, Vec<u32>> = indexmap::IndexMap::new();
    for &dep in departures {
        let hour = (dep / 3600) as u32;
        let minute = ((dep % 3600) / 60) as u32;
        by_hour.entry(hour).or_default().push(minute);
    }
    let mut rows: Vec<HourRow> = by_hour
        .into_iter()
        .map(|(hour, minutes)| HourRow { hour, minutes })
        .collect();
    rows.sort_by_key(|r| r.hour);
    rows
}

fn numeric_sort_key(broj: &str) -> (u32, String) {
    (broj.parse::<u32>().unwrap_or(u32::MAX), broj.to_string())
}

enum ReachError {
    /// Server unreachable / broken — trips the circuit breaker.
    Transport(String),
    /// Valid response without a usable 30-min polygon (e.g. stop outside
    /// walk-graph coverage) — only this line goes without `reach`.
    NoData(&'static str),
}

/// Fetch the 30-minute reach polygon area for a stop from the isochrone server.
fn fetch_reach_km2(isochrone_url: &str, lat: f64, lon: f64) -> Result<f64, ReachError> {
    let url = format!(
        "{}/api/isochrone?lat={:.5}&lon={:.5}&time=08:00&routing=0",
        isochrone_url, lat, lon
    );
    let mut resp = ureq::get(&url)
        .call()
        .map_err(|e| ReachError::Transport(e.to_string()))?;
    let json: serde_json::Value = resp
        .body_mut()
        .read_json()
        .map_err(|e| ReachError::Transport(e.to_string()))?;
    let features = json["walkArea"]["features"]
        .as_array()
        .ok_or(ReachError::NoData("no walkArea features"))?;
    let feature = features
        .iter()
        .find(|f| f["properties"]["time"].as_f64() == Some(1800.0))
        .ok_or(ReachError::NoData("no 1800s feature"))?;
    Ok(multipolygon_area_km2(&feature["geometry"]["coordinates"]))
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn generate(
    otp_url: &str,
    isochrone_url: &str,
    skip_isochrone: bool,
    line_filter: Option<&str>,
    data_dir: &Path,
) {
    eprintln!("Fetching line patterns from OTP ({})...", otp_url);
    let (first_day, last_day) = fetch_service_range_days(otp_url);
    let today = epoch_days_today().max(first_day);
    eprintln!(
        "  feed window: {} – {}",
        format_epoch_days(first_day),
        format_epoch_days(last_day)
    );
    let (date_radni, p_radni) =
        pick_date_and_fetch(otp_url, DayKind::Weekday, "radni dan", today, last_day);
    let (date_sub, p_sub) =
        pick_date_and_fetch(otp_url, DayKind::Saturday, "subota", today, last_day);
    let (date_ned, p_ned) =
        pick_date_and_fetch(otp_url, DayKind::Sunday, "nedjelja", today, last_day);

    let merged = merge_patterns([p_radni, p_sub, p_ned]);
    let patterns: Vec<&MergedPattern> = merged.values().collect();
    eprintln!("  {} tram/bus patterns merged", patterns.len());

    // Group pattern indices by line, pick the dominant pattern per direction.
    let mut by_line: indexmap::IndexMap<(String, String), Vec<usize>> = indexmap::IndexMap::new();
    for (pi, p) in patterns.iter().enumerate() {
        by_line
            .entry((p.mode.clone(), p.broj.clone()))
            .or_default()
            .push(pi);
    }

    let mut lines: Vec<LineBuild> = Vec::new();
    for ((mode, broj), pattern_idxs) in &by_line {
        let mut dominant: Vec<usize> = Vec::new();
        for direction in 0..2 {
            let best = pattern_idxs
                .iter()
                .copied()
                .filter(|&pi| patterns[pi].direction == direction)
                .max_by_key(|&pi| {
                    let p = patterns[pi];
                    (
                        p.trips[DAY_RADNI].len(),
                        p.trips.iter().map(|t| t.len()).sum::<usize>(),
                        p.stops.len(),
                    )
                });
            if let Some(pi) = best {
                dominant.push(pi);
            }
        }
        if dominant.is_empty() {
            continue;
        }
        lines.push(LineBuild {
            broj: broj.clone(),
            mode: mode.clone(),
            is_night: line_is_night(&patterns, pattern_idxs),
            dominant,
        });
    }
    lines.sort_by_cached_key(|l| numeric_sort_key(&l.broj));
    eprintln!("  {} lines", lines.len());

    // Global stop index across dominant patterns (for interchange/via/related).
    let mut global_stops: Vec<GlobalStop> = Vec::new();
    for (li, line) in lines.iter().enumerate() {
        for &pi in &line.dominant {
            let stops = &patterns[pi].stops;
            for (si, s) in stops.iter().enumerate() {
                global_stops.push(GlobalStop {
                    lat: s.lat,
                    lon: s.lon,
                    line_idx: li,
                    is_terminal: si == 0 || si == stops.len() - 1,
                });
            }
        }
    }
    let grid = StopGrid::build(&global_stops);

    // Isochrone circuit breaker: first failure disables reach for the rest.
    let mut isochrone_alive = !skip_isochrone;

    let out_dir = data_dir.join("linije");
    std::fs::create_dir_all(&out_dir).expect("Cannot create data/linije");

    let mut index_entries: Vec<LineIndexEntry> = Vec::new();
    let mut written = 0usize;

    for (li, line) in lines.iter().enumerate() {
        let prev_broj = li.checked_sub(1).map(|i| lines[i].broj.clone());
        let next_broj = lines.get(li + 1).map(|l| l.broj.clone());

        let line_patterns: Vec<&MergedPattern> = by_line[&(line.mode.clone(), line.broj.clone())]
            .iter()
            .map(|&pi| patterns[pi])
            .collect();

        // Directions from dominant patterns
        let mut directions: Vec<LineDirection> = Vec::new();
        let mut bbox = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        let mut timetable_days: [Vec<Vec<HourRow>>; 3] = [Vec::new(), Vec::new(), Vec::new()];
        let mut histogram = vec![0u32; 24];

        let mut dir_offsets: Vec<Vec<f64>> = Vec::new();
        for &pi in &line.dominant {
            let p = patterns[pi];
            let offsets = stop_offsets_sec(p);

            let stops: Vec<LineStop> = p
                .stops
                .iter()
                .enumerate()
                .map(|(si, s)| {
                    // Daytime tram connections only — night trams (31–34) run
                    // while the rest of the network sleeps, so they aren't an
                    // interchange in the usual sense.
                    let mut trams: Vec<String> = grid
                        .near(s.lat, s.lon)
                        .filter(|&gi| {
                            let g = &global_stops[gi];
                            lines[g.line_idx].mode == "TRAM"
                                && !lines[g.line_idx].is_night
                                && lines[g.line_idx].broj != line.broj
                                && fast_dist_km(s.lat, s.lon, g.lat, g.lon) <= NEAR_KM
                        })
                        .map(|gi| lines[global_stops[gi].line_idx].broj.clone())
                        .collect();
                    trams.sort_by_cached_key(|b| numeric_sort_key(b));
                    trams.dedup();
                    LineStop {
                        name: s.name.clone(),
                        lat: round5(s.lat),
                        lon: round5(s.lon),
                        offset_min: (offsets[si] / 60.0).round() as u32,
                        tram_interchange: trams,
                    }
                })
                .collect();

            let shape_latlon = match &p.geometry {
                Some(encoded) => decode_polyline(encoded),
                None => p.stops.iter().map(|s| (s.lat, s.lon)).collect(),
            };
            let shape: Vec<(f64, f64)> = simplify_shape(
                shape_latlon
                    .iter()
                    .map(|&(lat, lon)| (lon, lat))
                    .collect(),
            )
            .into_iter()
            .map(|(lon, lat)| (round5(lon), round5(lat)))
            .collect();

            for &(lon, lat) in &shape {
                bbox[0] = bbox[0].min(lon);
                bbox[1] = bbox[1].min(lat);
                bbox[2] = bbox[2].max(lon);
                bbox[3] = bbox[3].max(lat);
            }
            for s in &stops {
                bbox[0] = bbox[0].min(s.lon);
                bbox[1] = bbox[1].min(s.lat);
                bbox[2] = bbox[2].max(s.lon);
                bbox[3] = bbox[3].max(s.lat);
            }

            let direction = p.direction;
            let dominant_first = (p.stops[0].lat, p.stops[0].lon);
            for (day, day_rows) in timetable_days.iter_mut().enumerate() {
                let deps = direction_departures(&line_patterns, dominant_first, direction, day);
                if day == DAY_RADNI {
                    for &dep in &deps {
                        histogram[((dep / 3600) % 24) as usize] += 1;
                    }
                }
                day_rows.push(hour_rows(&deps));
            }

            directions.push(LineDirection {
                headsign: p
                    .headsign
                    .clone()
                    .unwrap_or_else(|| p.stops.last().unwrap().name.clone()),
                stops,
                shape,
            });
            dir_offsets.push(offsets);
        }

        // Stats from the direction-0 dominant pattern + weekday departures
        let dir0 = patterns[line.dominant[0]];
        let dir0_first = (dir0.stops[0].lat, dir0.stops[0].lon);
        let dir0_deps = direction_departures(&line_patterns, dir0_first, dir0.direction, DAY_RADNI);
        let dir0_deps_f: Vec<f64> = dir0_deps.iter().map(|&d| d as f64).collect();
        let daily_departures: u32 = timetable_days[DAY_RADNI]
            .iter()
            .flat_map(|dir| dir.iter())
            .map(|row| row.minutes.len() as u32)
            .sum();
        let offsets0 = &dir_offsets[0];
        let distance_km = match &dir0.geometry {
            Some(encoded) => polyline_distance_km(encoded),
            None => dir0
                .stops
                .windows(2)
                .map(|w| fast_dist_km(w[0].lat, w[0].lon, w[1].lat, w[1].lon))
                .sum(),
        };
        let stats = LineStats {
            daily_departures,
            first_departure: format_time(dir0_deps_f.first().copied().unwrap_or(0.0)),
            last_departure: format_time(dir0_deps_f.last().copied().unwrap_or(0.0)),
            peak_headway_min: compute_headway(
                &dir0_deps_f,
                Some(7.0 * 3600.0),
                Some(9.0 * 3600.0),
            )
            .map(round1),
            avg_headway_min: compute_headway(&dir0_deps_f, None, None).map(round1),
            travel_time_min: round1(offsets0.last().copied().unwrap_or(0.0) / 60.0),
            distance_km: round1(distance_km),
        };

        // Terminal display names from headsigns when available — GTFS often
        // names the last platform differently from the terminal everyone uses
        // (e.g. 109 ends at stop "Kauzlarićev prilaz" but heads to "Dugave").
        let dir1 = line.dominant.get(1).map(|&pi| patterns[pi]);
        let terminals = vec![
            dir1.and_then(|p| p.headsign.clone())
                .unwrap_or_else(|| dir0.stops[0].name.clone()),
            dir0.headsign
                .clone()
                .unwrap_or_else(|| dir0.stops.last().unwrap().name.clone()),
        ];

        // Via: intermediate hub stops on direction 0 served by the most other lines.
        let n0 = dir0.stops.len();
        let mut via_candidates: Vec<(usize, usize)> = dir0
            .stops
            .iter()
            .enumerate()
            .skip(1)
            .take(n0.saturating_sub(2))
            .map(|(si, s)| {
                let mut others: Vec<usize> = grid
                    .near(s.lat, s.lon)
                    .filter(|&gi| {
                        let g = &global_stops[gi];
                        g.line_idx != li
                            && fast_dist_km(s.lat, s.lon, g.lat, g.lon) <= NEAR_KM
                    })
                    .map(|gi| global_stops[gi].line_idx)
                    .collect();
                others.sort_unstable();
                others.dedup();
                (si, others.len())
            })
            .collect();
        via_candidates.retain(|&(_, count)| count >= VIA_MIN_LINES);
        via_candidates.sort_by_key(|&(_, count)| std::cmp::Reverse(count));
        let mut via_idxs: Vec<usize> = Vec::new();
        for &(si, _) in &via_candidates {
            if via_idxs.len() >= 2 {
                break;
            }
            if via_idxs.iter().all(|&v| si.abs_diff(v) >= n0 / 4) {
                via_idxs.push(si);
            }
        }
        via_idxs.sort_unstable();
        let via: Vec<String> = via_idxs
            .into_iter()
            .map(|si| dir0.stops[si].name.clone())
            .collect();

        // Related: lines whose terminal sits at one of our terminals.
        let our_terminals: Vec<(&MergedStop, &str)> = vec![
            (&dir0.stops[0], terminals[0].as_str()),
            (dir0.stops.last().unwrap(), terminals[1].as_str()),
        ];
        let mut shared_terminal: Vec<RelatedLine> = Vec::new();
        for (term_stop, term_name) in &our_terminals {
            for gi in grid.near(term_stop.lat, term_stop.lon) {
                let g = &global_stops[gi];
                if !g.is_terminal || g.line_idx == li {
                    continue;
                }
                if fast_dist_km(term_stop.lat, term_stop.lon, g.lat, g.lon) > TERMINAL_NEAR_KM {
                    continue;
                }
                let other = &lines[g.line_idx];
                if shared_terminal.iter().any(|r| r.broj == other.broj) {
                    continue;
                }
                shared_terminal.push(RelatedLine {
                    broj: other.broj.clone(),
                    mode: LineMode::from_otp(&other.mode),
                    is_night: other.is_night,
                    terminal: term_name.to_string(),
                });
            }
        }
        shared_terminal.sort_by_cached_key(|r| {
            (r.mode != LineMode::Tram, numeric_sort_key(&r.broj))
        });

        // Tram crossings mid-route (first stop where each tram line appears).
        let mut tram_crossings: Vec<TramCrossing> = Vec::new();
        for stop in directions[0].stops.iter().skip(1).take(n0.saturating_sub(2)) {
            for tram in &stop.tram_interchange {
                if !tram_crossings.iter().any(|c| &c.broj == tram) {
                    tram_crossings.push(TramCrossing {
                        broj: tram.clone(),
                        stop_name: stop.name.clone(),
                    });
                }
            }
        }
        tram_crossings.sort_by_cached_key(|c| numeric_sort_key(&c.broj));

        // Reach: 30-minute isochrone area from the mid-route stop.
        let mid = &dir0.stops[n0 / 2];
        let reach = if isochrone_alive {
            match fetch_reach_km2(isochrone_url, mid.lat, mid.lon) {
                Ok(area_km2) => Some(LineReach {
                    area_km2: round1(area_km2),
                    stop_name: mid.name.clone(),
                    lat: round5(mid.lat),
                    lon: round5(mid.lon),
                }),
                Err(ReachError::NoData(why)) => {
                    eprintln!("  linija {}: no reach ({})", line.broj, why);
                    None
                }
                Err(ReachError::Transport(e)) => {
                    eprintln!(
                        "  isochrone unreachable ({}), omitting reach for remaining lines",
                        e
                    );
                    isochrone_alive = false;
                    None
                }
            }
        } else {
            None
        };

        let [radni_dan, subota, nedjelja] = timetable_days;
        let data = LinePageData {
            broj: line.broj.clone(),
            mode: LineMode::from_otp(&line.mode),
            is_night: line.is_night,
            terminals: terminals.clone(),
            via,
            one_way: directions.len() == 1,
            directions,
            bbox: bbox.iter().map(|v| round5(*v)).collect(),
            histogram,
            timetable: LineTimetable {
                radni_dan,
                subota,
                nedjelja,
            },
            related: RelatedLines {
                shared_terminal,
                tram_crossings,
            },
            prev_broj,
            next_broj,
            reach,
            stats,
        };

        index_entries.push(LineIndexEntry {
            broj: line.broj.clone(),
            mode: LineMode::from_otp(&line.mode),
            is_night: line.is_night,
            terminals,
            daily_departures,
            peak_headway_min: data.stats.peak_headway_min,
            avg_headway_min: data.stats.avg_headway_min,
        });

        if let Some(filter) = line_filter {
            if filter != line.broj {
                continue;
            }
        }
        let path = out_dir.join(format!("{}.json", line.broj));
        let json = serde_json::to_string_pretty(&data).expect("JSON serialization failed");
        std::fs::write(&path, json).expect("Cannot write line JSON");
        written += 1;
    }

    if line_filter.is_none() {
        let index = LinePagesIndex {
            generated_at: crate::chrono_now_iso(),
            service_dates: ServiceDates {
                radni_dan: date_radni,
                subota: date_sub,
                nedjelja: date_ned,
            },
            lines: index_entries,
        };
        let json = serde_json::to_string_pretty(&index).expect("JSON serialization failed");
        std::fs::write(out_dir.join("index.json"), json).expect("Cannot write index JSON");
        eprintln!("  index.json written ({} lines)", lines.len());
    } else {
        eprintln!("  (single-line filter active — index.json not rewritten)");
    }

    eprintln!(
        "Done: {} line files written to {}",
        written,
        out_dir.display()
    );
}
