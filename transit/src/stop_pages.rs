//! Per-stop page data for the /stanica/[slug] pSEO pages.
//!
//! The inverse pivot of [`crate::line_pages`]: instead of "one line, its stops",
//! this groups the dominant tram/bus patterns into PHYSICAL stops (clustering the
//! per-direction platforms that share a name) and, for each, computes the lines
//! that stop there, the at-stop headway / first-last (scheduled passing time =
//! terminal departure + this stop's offset, scoped to direction + day type), the
//! neighbouring stops, and the 15/30/45-minute reachability bands from the
//! isochrone server. Run with
//! `cargo run --release --bin transit-scorer -- --stop-pages`.
//!
//! Honesty constraints (see the stop-pages spec): never a live "next departure"
//! (headway only), per-stop facts derived AT the stop (not borrowed from a line
//! terminal), `oba smjera` derived (not templated), reach measured by a real
//! isochrone at the stop. Rail is excluded upstream by `merge_patterns`, so a
//! `BusStop`/tram page is never mislabelled.

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;
use ts_rs::TS;

use crate::districts::{load_districts, point_in_polygon, District};
use crate::geo::fast_dist_km;
use crate::line_pages::{
    direction_departures, dominant_lines, fetch_and_merge, numeric_sort_key, round5,
    stop_offsets_sec, LineBuild, LineMode, MergedPattern, ServiceDates, DAY_RADNI,
};
use crate::route_stats::{compute_headway, decode_polyline, round1};

/// Platforms within this distance that share a normalised name are the same
/// physical stop (the two direction platforms sit either side of the street).
const CLUSTER_KM: f64 = 0.2;
/// Peak window for the "u špici" headway figures.
const PEAK_START: f64 = 7.0 * 3600.0;
const PEAK_END: f64 = 9.0 * 3600.0;
/// Reachability bands (seconds): 15 / 30 / 45 minutes.
const REACH_BANDS: [f64; 3] = [900.0, 1800.0, 2700.0];
/// Hero map: clip each serving line's shape to this radius around the stop. Kept
/// well wider than the crop window (below) so the corridors run off the frame
/// edges — drawn "full length" — instead of stopping short inside the view.
const HERO_CLIP_KM: f64 = 1.6;
/// Hero crop half-window (radius, km): the map stays zoomed on the station at a
/// fixed scale regardless of how long the lines are. Small enough that the bbox
/// height fits at z18 in the wide desktop band (else buildCrop drops to z17 and
/// the crop reads ~2.4 km instead of the intended ~1.2 km).
const HERO_WINDOW_KM: f64 = 0.16;
/// Departures past this GTFS time (02:00 next day) are the overnight tail of a
/// near-24h line — kept out of the "first/last" daytime-window fact so a hub
/// doesn't read as "4:17–4:46". Night lines still appear in `lines`.
const NIGHT_TAIL_CUTOFF: f64 = 26.0 * 3600.0;

// ---------------------------------------------------------------------------
// Output types (exported to TypeScript via ts-rs)
// ---------------------------------------------------------------------------

/// Stop-level mode: which vehicle types call here.
#[derive(Serialize, TS, Clone, Copy, PartialEq)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "lowercase")]
pub enum StopMode {
    Tram,
    Bus,
    Both,
}

/// One line calling at this stop. `headsign` is the primary (busier) direction's
/// terminal; `both_directions` is true when the line also passes the other way.
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopLine {
    pub broj: String,
    pub mode: LineMode,
    pub is_night: bool,
    /// Terminal this line heads toward from here (primary direction). For a loop
    /// line terminating here, the turnaround point instead of this stop's name.
    pub headsign: String,
    /// One-way loop that departs and returns to this stop.
    pub is_loop: bool,
    /// Line stops in both directions at this physical stop.
    pub both_directions: bool,
    /// Average peak (07–09) gap between this line's vehicles, minutes.
    pub peak_headway_min: Option<f64>,
    /// Typical peak gap range [p25, p75], minutes — for "svakih 5–8 min".
    #[ts(type = "[number, number] | null")]
    pub peak_range_min: Option<(u32, u32)>,
    /// Average all-day gap, minutes — for infrequent "interval" lines.
    pub all_day_headway_min: Option<f64>,
}

/// A stop one hop away on a shared line. `slug` resolves to its own page when one
/// exists.
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopNeighbor {
    pub name: String,
    pub slug: Option<String>,
}

/// Reachable distinct stations within each band (15 / 30 / 45 min), computed from
/// a single isochrone run at this stop.
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopReach {
    pub stations15: u32,
    pub stations30: u32,
    pub stations45: u32,
}

/// One serving line's route geometry clipped to a window around the stop, so the
/// hero can draw the actual corridors through the junction.
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopHeroLine {
    pub broj: String,
    pub mode: LineMode,
    /// [lon, lat] pairs, the line's shape clipped to ~HERO_CLIP_KM of the stop.
    #[ts(type = "[number, number][]")]
    pub shape: Vec<(f64, f64)>,
}

/// Hero-map geometry for one stop: the serving-line corridors, the to/from
/// neighbour points, and a bbox to crop/project into.
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopHeroGeom {
    /// [minLon, minLat, maxLon, maxLat] — a fixed station-centred crop window.
    pub bbox: Vec<f64>,
    pub lines: Vec<StopHeroLine>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopPageData {
    pub slug: String,
    pub name: String,
    pub kvart: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub mode: StopMode,
    /// At least one calling line passes here in both directions.
    pub both_directions: bool,
    pub line_count: usize,
    pub tram_lines: Vec<String>,
    pub bus_lines: Vec<String>,
    /// First / last weekday passing time across all calling lines ("HH:MM").
    pub first_departure: String,
    pub last_departure: String,
    /// Combined peak gap range across every calling line & direction [low, high],
    /// minutes — the "vozilo naiđe svakih 3–5 min" figure.
    #[ts(type = "[number, number] | null")]
    pub peak_interval_min: Option<(u32, u32)>,
    pub lines: Vec<StopLine>,
    pub neighbors: Vec<StopNeighbor>,
    pub hero: StopHeroGeom,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reach: Option<StopReach>,
    pub prev_slug: Option<String>,
    pub next_slug: Option<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopIndexEntry {
    pub slug: String,
    pub name: String,
    pub kvart: Option<String>,
    pub mode: StopMode,
    pub line_count: usize,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StopPagesIndex {
    pub generated_at: String,
    pub service_dates: ServiceDates,
    pub stops: Vec<StopIndexEntry>,
}

// ---------------------------------------------------------------------------
// Small numeric / string helpers
// ---------------------------------------------------------------------------

/// Slug + clustering key: lowercase, fold Croatian diacritics, keep [a-z0-9],
/// collapse the rest to single dashes. Doubles as the normalised-name key, so
/// two platforms of one stop and a neighbour reference all share a key.
fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_dash = true; // start "true" to trim leading dashes
    for ch in s.chars() {
        let lower = ch.to_lowercase().next().unwrap_or(ch);
        let mapped = match lower {
            'č' | 'ć' => 'c',
            'š' => 's',
            'ž' => 'z',
            'đ' => 'd',
            c if c.is_ascii_alphanumeric() => c,
            _ => '-',
        };
        if mapped == '-' {
            if !prev_dash {
                out.push('-');
                prev_dash = true;
            }
        } else {
            out.push(mapped);
            prev_dash = false;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// [p25, p75] of the gaps between consecutive passing times in [start, end],
/// minutes — a robust "every 5–8 min" range that ignores one freak gap.
fn gap_range_min(times: &[f64], start: f64, end: f64) -> Option<(u32, u32)> {
    let mut window: Vec<f64> = times
        .iter()
        .filter(|&&t| t >= start && t <= end)
        .copied()
        .collect();
    if window.len() < 3 {
        return None;
    }
    window.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut gaps: Vec<f64> = window.windows(2).map(|w| (w[1] - w[0]) / 60.0).collect();
    gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let lo = crate::percentile(&gaps, 25.0).round().max(1.0) as u32;
    let hi = crate::percentile(&gaps, 75.0).round().max(lo as f64) as u32;
    Some((lo, hi))
}

// ---------------------------------------------------------------------------
// Physical-stop clusters
// ---------------------------------------------------------------------------

/// One platform occurrence of a stop on a line's dominant pattern.
struct Occ {
    line_idx: usize,
    pi: usize,
    pos: usize,
    direction: usize,
    name: String,
    lat: f64,
    lon: f64,
    offset_sec: f64,
}

/// A clustered physical stop: the occurrences that share a name and sit within
/// CLUSTER_KM of each other. `key` is the normalised-name slug (the grouping key),
/// cached so it isn't re-slugified at every downstream use.
struct Cluster {
    name: String,
    key: String,
    lat: f64,
    lon: f64,
    occ_idxs: Vec<usize>,
}

/// One boarding direction of a line at a stop (named so the assembly below reads
/// without positional tuple indexing).
struct DirInfo {
    direction: usize,
    /// Pattern index (into `patterns`) of this boarding occurrence — for hero geom.
    pi: usize,
    headsign: String,
    /// Headsign equals this stop's own name (loop / terminus) — sorted last.
    is_self: bool,
    is_loop: bool,
    times: Vec<f64>,
}

/// Single-linkage clustering inside one same-name group (groups are tiny, so the
/// O(n²) adjacency walk is cheap).
fn cluster_group(occs: &[Occ], idxs: &[usize]) -> Vec<Vec<usize>> {
    let n = idxs.len();
    let mut assigned = vec![false; n];
    let mut clusters: Vec<Vec<usize>> = Vec::new();
    for i in 0..n {
        if assigned[i] {
            continue;
        }
        let mut stack = vec![i];
        assigned[i] = true;
        let mut members = vec![idxs[i]];
        while let Some(a) = stack.pop() {
            for b in 0..n {
                if assigned[b] {
                    continue;
                }
                let oa = &occs[idxs[a]];
                let ob = &occs[idxs[b]];
                if fast_dist_km(oa.lat, oa.lon, ob.lat, ob.lon) <= CLUSTER_KM {
                    assigned[b] = true;
                    members.push(idxs[b]);
                    stack.push(b);
                }
            }
        }
        clusters.push(members);
    }
    clusters
}

/// Passing times (seconds) at this stop for one line/direction/day = pooled
/// terminal departures + this stop's offset.
fn passing_times(
    line_patterns: &[&MergedPattern],
    dominant_first: (f64, f64),
    direction: usize,
    day: usize,
    offset_sec: f64,
) -> Vec<f64> {
    direction_departures(line_patterns, dominant_first, direction, day)
        .iter()
        .map(|&t| t as f64 + offset_sec)
        .collect()
}

/// One pattern's route shape clipped to the contiguous run within `clip_km` of
/// the stop, as [lon, lat] pairs. Falls back to the stop polyline when the
/// pattern has no encoded geometry.
fn clip_shape(dom: &MergedPattern, lat: f64, lon: f64, clip_km: f64) -> Vec<(f64, f64)> {
    let latlon: Vec<(f64, f64)> = match &dom.geometry {
        Some(enc) => decode_polyline(enc),
        None => dom.stops.iter().map(|s| (s.lat, s.lon)).collect(),
    };
    if latlon.is_empty() {
        return Vec::new();
    }
    // Closest vertex to the stop, then walk outward both ways within clip_km.
    let mut ci = 0;
    let mut best = f64::INFINITY;
    for (i, &(la, lo)) in latlon.iter().enumerate() {
        let d = fast_dist_km(lat, lon, la, lo);
        if d < best {
            best = d;
            ci = i;
        }
    }
    let mut lo_i = ci;
    while lo_i > 0 && fast_dist_km(lat, lon, latlon[lo_i - 1].0, latlon[lo_i - 1].1) <= clip_km {
        lo_i -= 1;
    }
    let mut hi_i = ci;
    while hi_i + 1 < latlon.len()
        && fast_dist_km(lat, lon, latlon[hi_i + 1].0, latlon[hi_i + 1].1) <= clip_km
    {
        hi_i += 1;
    }
    latlon[lo_i..=hi_i]
        .iter()
        .map(|&(la, lo)| (round5(lo), round5(la)))
        .collect()
}

// ---------------------------------------------------------------------------
// Reachability (isochrone server)
// ---------------------------------------------------------------------------

enum ReachError {
    /// Server unreachable / broken — trips the circuit breaker.
    Transport(String),
    /// Valid response without usable routing nodes — only this stop goes without.
    NoData(&'static str),
}

/// Count distinct reachable stations in each band from one isochrone run. Uses
/// `routing=only` (no polygons), folds platforms to one station via the slug
/// key, and excludes the origin stop itself.
fn fetch_reach(
    isochrone_url: &str,
    lat: f64,
    lon: f64,
    self_key: &str,
) -> Result<StopReach, ReachError> {
    let url = format!(
        "{}/api/isochrone?lat={:.5}&lon={:.5}&time=08:00&routing=only",
        isochrone_url, lat, lon
    );
    let mut resp = ureq::get(&url)
        .call()
        .map_err(|e| ReachError::Transport(e.to_string()))?;
    let json: serde_json::Value = resp
        .body_mut()
        .read_json()
        .map_err(|e| ReachError::Transport(e.to_string()))?;
    let nodes = json["routing"]["nodes"]
        .as_array()
        .ok_or(ReachError::NoData("no routing nodes"))?;

    // band index -> set of station keys reachable within that band
    let mut bands: [std::collections::HashSet<String>; 3] = Default::default();
    for node in nodes {
        if node["kind"].as_str() != Some("STOP") {
            continue;
        }
        let time = match node["time"].as_f64() {
            Some(t) => t,
            None => continue,
        };
        let name = node["name"].as_str().unwrap_or("");
        let key = slugify(name);
        if key.is_empty() || key == self_key {
            continue;
        }
        for (bi, &threshold) in REACH_BANDS.iter().enumerate() {
            if time <= threshold {
                bands[bi].insert(key.clone());
            }
        }
    }
    Ok(StopReach {
        stations15: bands[0].len() as u32,
        stations30: bands[1].len() as u32,
        stations45: bands[2].len() as u32,
    })
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn generate(
    otp_url: &str,
    isochrone_url: &str,
    skip_isochrone: bool,
    stop_filter: Option<&str>,
    data_dir: &Path,
) {
    eprintln!("Fetching patterns from OTP ({})...", otp_url);
    let (service_dates, merged) = fetch_and_merge(otp_url);
    let patterns: Vec<&MergedPattern> = merged.values().collect();

    let lines = dominant_lines(&patterns);
    eprintln!("  {} lines", lines.len());

    // Per-line pattern refs (all variants), for direction_departures.
    let line_patterns: Vec<Vec<&MergedPattern>> = lines
        .iter()
        .map(|l| l.pattern_idxs.iter().map(|&pi| patterns[pi]).collect())
        .collect();

    // Flatten every dominant-pattern stop into occurrences.
    let mut occs: Vec<Occ> = Vec::new();
    for (li, line) in lines.iter().enumerate() {
        for &pi in &line.dominant {
            let p = patterns[pi];
            let offsets = stop_offsets_sec(p);
            for (pos, s) in p.stops.iter().enumerate() {
                occs.push(Occ {
                    line_idx: li,
                    pi,
                    pos,
                    direction: p.direction,
                    name: s.name.clone(),
                    lat: s.lat,
                    lon: s.lon,
                    offset_sec: offsets[pos],
                });
            }
        }
    }

    // Group occurrences by normalised name, then spatially cluster each group.
    let mut by_name: indexmap::IndexMap<String, Vec<usize>> = indexmap::IndexMap::new();
    for (i, o) in occs.iter().enumerate() {
        by_name.entry(slugify(&o.name)).or_default().push(i);
    }

    let mut clusters: Vec<Cluster> = Vec::new();
    for (key, idxs) in &by_name {
        for members in cluster_group(&occs, idxs) {
            // Representative name = modal original casing among members.
            let mut name_counts: HashMap<&str, usize> = HashMap::new();
            for &oi in &members {
                *name_counts.entry(occs[oi].name.as_str()).or_default() += 1;
            }
            let name = name_counts
                .into_iter()
                .max_by_key(|&(_, c)| c)
                .map(|(n, _)| n.to_string())
                .unwrap_or_default();
            let lat = members.iter().map(|&oi| occs[oi].lat).sum::<f64>() / members.len() as f64;
            let lon = members.iter().map(|&oi| occs[oi].lon).sum::<f64>() / members.len() as f64;
            clusters.push(Cluster {
                name,
                key: key.clone(),
                lat,
                lon,
                occ_idxs: members,
            });
        }
    }
    eprintln!("  {} physical stops", clusters.len());

    // Districts → one kvart per cluster (single point-in-polygon scan each).
    let districts: Vec<District> = load_districts(&data_dir.join("districts.geojson"));
    let kvarts: Vec<Option<String>> = clusters
        .iter()
        .map(|c| {
            districts
                .iter()
                .find(|d| point_in_polygon(c.lon, c.lat, &d.ring))
                .map(|d| d.name.clone())
        })
        .collect();

    // Assign slugs (dedup duplicate names across kvarts).
    let slugs = assign_slugs(&clusters, &kvarts);

    // Normalised name -> cluster indices, for nearest-match neighbour resolution
    // (a duplicate name resolves to the closest cluster).
    let mut name_to_clusters: HashMap<String, Vec<usize>> = HashMap::new();
    for (ci, c) in clusters.iter().enumerate() {
        name_to_clusters.entry(c.key.clone()).or_default().push(ci);
    }

    // Order pages alphabetically by slug for stable prev/next + index.
    let mut order: Vec<usize> = (0..clusters.len()).collect();
    order.sort_by(|&a, &b| slugs[a].cmp(&slugs[b]));

    let ctx = Ctx {
        lines: &lines,
        line_patterns: &line_patterns,
        patterns: &patterns,
        occs: &occs,
        clusters: &clusters,
        slugs: &slugs,
        kvarts: &kvarts,
        name_to_clusters: &name_to_clusters,
    };

    let out_dir = data_dir.join("stanice");
    std::fs::create_dir_all(&out_dir).expect("Cannot create data/stanice");

    let mut isochrone_alive = !skip_isochrone;
    let mut index_entries: Vec<StopIndexEntry> = Vec::new();
    let mut written = 0usize;

    for (ord_i, &ci) in order.iter().enumerate() {
        let slug = &slugs[ci];
        let mut data = ctx.build_stop(ci);
        data.prev_slug = ord_i.checked_sub(1).map(|i| slugs[order[i]].clone());
        data.next_slug = order.get(ord_i + 1).map(|&j| slugs[j].clone());

        // Reachability — one isochrone call per stop. Under a --stop filter only
        // the target needs the network call; the rest still assemble (prev/next
        // and the index need the full ordering).
        let is_target = stop_filter.is_none_or(|f| f == slug.as_str());
        if isochrone_alive && is_target {
            let c = &clusters[ci];
            match fetch_reach(isochrone_url, c.lat, c.lon, &c.key) {
                Ok(reach) => data.reach = Some(reach),
                Err(ReachError::NoData(why)) => {
                    eprintln!("  {}: no reach ({})", slug, why);
                }
                Err(ReachError::Transport(e)) => {
                    eprintln!(
                        "  isochrone unreachable ({}), omitting reach for the rest",
                        e
                    );
                    isochrone_alive = false;
                }
            }
        }

        index_entries.push(StopIndexEntry {
            slug: data.slug.clone(),
            name: data.name.clone(),
            kvart: data.kvart.clone(),
            mode: data.mode,
            line_count: data.line_count,
        });

        if stop_filter.is_some_and(|f| f != slug.as_str()) {
            continue;
        }
        let path = out_dir.join(format!("{}.json", slug));
        let json = serde_json::to_string_pretty(&data).expect("JSON serialization failed");
        std::fs::write(&path, json).expect("Cannot write stop JSON");
        written += 1;
    }

    if stop_filter.is_none() {
        let index = StopPagesIndex {
            generated_at: crate::chrono_now_iso(),
            service_dates,
            stops: index_entries,
        };
        let json = serde_json::to_string_pretty(&index).expect("JSON serialization failed");
        std::fs::write(out_dir.join("index.json"), json).expect("Cannot write index JSON");
        eprintln!("  index.json written ({} stops)", clusters.len());
    } else {
        eprintln!("  (single-stop filter active — index.json not rewritten)");
    }

    eprintln!(
        "Done: {} stop files written to {}",
        written,
        out_dir.display()
    );
}

/// Assign a unique slug per cluster. Base = the cluster's normalised-name key; on
/// a duplicate name, append the kvart slug; if that still collides, a numeric
/// suffix.
fn assign_slugs(clusters: &[Cluster], kvarts: &[Option<String>]) -> Vec<String> {
    let mut base_counts: HashMap<&str, usize> = HashMap::new();
    for c in clusters {
        *base_counts.entry(c.key.as_str()).or_default() += 1;
    }

    let mut taken: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut slugs: Vec<String> = Vec::with_capacity(clusters.len());
    for (ci, c) in clusters.iter().enumerate() {
        let base = &c.key;
        let mut slug = if base_counts[base.as_str()] > 1 {
            match &kvarts[ci] {
                Some(k) => format!("{}-{}", base, slugify(k)),
                None => base.clone(),
            }
        } else {
            base.clone()
        };
        if taken.contains(&slug) {
            let mut n = 2;
            while taken.contains(&format!("{}-{}", slug, n)) {
                n += 1;
            }
            slug = format!("{}-{}", slug, n);
        }
        taken.insert(slug.clone());
        slugs.push(slug);
    }
    slugs
}

/// Immutable shared state the per-stop assembly reads. `build_stop` takes a
/// cluster index instead of ten positional slices.
struct Ctx<'a> {
    lines: &'a [LineBuild],
    line_patterns: &'a [Vec<&'a MergedPattern>],
    patterns: &'a [&'a MergedPattern],
    occs: &'a [Occ],
    clusters: &'a [Cluster],
    slugs: &'a [String],
    kvarts: &'a [Option<String>],
    name_to_clusters: &'a HashMap<String, Vec<usize>>,
}

impl Ctx<'_> {
    /// Assemble one stop's page data (everything except reach + prev/next).
    fn build_stop(&self, ci: usize) -> StopPageData {
        let cluster = &self.clusters[ci];
        let self_key = &cluster.key;

        // Group this cluster's occurrences by line.
        let mut occ_by_line: indexmap::IndexMap<usize, Vec<usize>> = indexmap::IndexMap::new();
        for &oi in &cluster.occ_idxs {
            occ_by_line
                .entry(self.occs[oi].line_idx)
                .or_default()
                .push(oi);
        }

        let mut stop_lines: Vec<StopLine> = Vec::new();
        let mut all_peak_times: Vec<f64> = Vec::new();
        let mut first_last: Vec<f64> = Vec::new();
        let mut neighbor_names: Vec<String> = Vec::new();
        let mut hero_lines: Vec<StopHeroLine> = Vec::new();

        for (&li, oidxs) in &occ_by_line {
            let line = &self.lines[li];
            let lp = &self.line_patterns[li];

            // Neighbours: the stops adjacent on every touch (both ends of a loop).
            for &oi in oidxs {
                let dom = self.patterns[self.occs[oi].pi];
                let pos = self.occs[oi].pos;
                if pos > 0 {
                    neighbor_names.push(dom.stops[pos - 1].name.clone());
                }
                if pos + 1 < dom.stops.len() {
                    neighbor_names.push(dom.stops[pos + 1].name.clone());
                }
            }

            // Collapse to one boarding occurrence per direction: a loop touches
            // this stop twice (depart + return) in the same direction — keep the
            // departure (smallest offset), which is where riders actually board.
            let mut by_dir: indexmap::IndexMap<usize, usize> = indexmap::IndexMap::new();
            for &oi in oidxs {
                by_dir
                    .entry(self.occs[oi].direction)
                    .and_modify(|cur| {
                        if self.occs[oi].offset_sec < self.occs[*cur].offset_sec {
                            *cur = oi;
                        }
                    })
                    .or_insert(oi);
            }

            // Per boarding direction: weekday passing times + a useful headsign.
            let mut per_dir: Vec<DirInfo> = Vec::new();
            for &oi in by_dir.values() {
                let o = &self.occs[oi];
                let dom = self.patterns[o.pi];
                let dominant_first = (dom.stops[0].lat, dom.stops[0].lon);
                let times = passing_times(lp, dominant_first, o.direction, DAY_RADNI, o.offset_sec);

                let raw_headsign = dom
                    .headsign
                    .clone()
                    .unwrap_or_else(|| dom.stops.last().unwrap().name.clone());
                let is_loop = slugify(&dom.stops[0].name) == *self_key
                    && slugify(&dom.stops.last().unwrap().name) == *self_key;
                // A loop terminating here labels itself with this stop; show the
                // turnaround (farthest point on the pattern) instead.
                let headsign = if slugify(&raw_headsign) == *self_key {
                    dom.stops
                        .iter()
                        .filter(|s| slugify(&s.name) != *self_key)
                        .max_by(|a, b| {
                            let da = fast_dist_km(o.lat, o.lon, a.lat, a.lon);
                            let db = fast_dist_km(o.lat, o.lon, b.lat, b.lon);
                            da.partial_cmp(&db).unwrap()
                        })
                        .map(|s| s.name.clone())
                        .unwrap_or(raw_headsign)
                } else {
                    raw_headsign
                };
                let is_self = slugify(&headsign) == *self_key;
                per_dir.push(DirInfo {
                    direction: o.direction,
                    pi: o.pi,
                    headsign,
                    is_self,
                    is_loop,
                    times,
                });
            }

            let both_directions = per_dir
                .iter()
                .map(|d| d.direction)
                .collect::<std::collections::HashSet<_>>()
                .len()
                > 1;

            // Primary direction = the one a boarding rider cares about: headed AWAY
            // from here (not this stop's own name — matters at terminals), then the
            // busier platform.
            per_dir.sort_by_key(|d| (d.is_self, std::cmp::Reverse(d.times.len())));
            let primary = &per_dir[0];

            // Hero: this line's corridor through the stop (primary direction).
            let shape = clip_shape(
                self.patterns[primary.pi],
                cluster.lat,
                cluster.lon,
                HERO_CLIP_KM,
            );
            if shape.len() >= 2 {
                hero_lines.push(StopHeroLine {
                    broj: line.broj.clone(),
                    mode: LineMode::from_otp(&line.mode),
                    shape,
                });
            }

            for d in &per_dir {
                all_peak_times.extend(
                    d.times
                        .iter()
                        .filter(|&&x| (PEAK_START..=PEAK_END).contains(&x)),
                );
                // Night lines (31–34) would stretch "first/last" across the small
                // hours and make the daytime window look absurd — exclude them from
                // the window fact (they still appear in `lines`).
                if !line.is_night {
                    first_last.extend(d.times.iter());
                }
            }

            let peak_headway_min =
                compute_headway(&primary.times, Some(PEAK_START), Some(PEAK_END)).map(round1);
            let all_day_headway_min = compute_headway(&primary.times, None, None).map(round1);
            let peak_range_min = gap_range_min(&primary.times, PEAK_START, PEAK_END);

            stop_lines.push(StopLine {
                broj: line.broj.clone(),
                mode: LineMode::from_otp(&line.mode),
                is_night: line.is_night,
                headsign: primary.headsign.clone(),
                is_loop: primary.is_loop,
                both_directions,
                peak_headway_min,
                peak_range_min,
                all_day_headway_min,
            });
        }

        // Trams first, then buses; numeric within each.
        stop_lines.sort_by_cached_key(|l| (l.mode != LineMode::Tram, numeric_sort_key(&l.broj)));

        let tram_lines: Vec<String> = stop_lines
            .iter()
            .filter(|l| l.mode == LineMode::Tram)
            .map(|l| l.broj.clone())
            .collect();
        let bus_lines: Vec<String> = stop_lines
            .iter()
            .filter(|l| l.mode == LineMode::Bus)
            .map(|l| l.broj.clone())
            .collect();
        let mode = match (!tram_lines.is_empty(), !bus_lines.is_empty()) {
            (true, true) => StopMode::Both,
            (true, false) => StopMode::Tram,
            _ => StopMode::Bus,
        };
        let both_directions = stop_lines.iter().any(|l| l.both_directions);

        first_last.sort_by(|a, b| a.partial_cmp(b).unwrap());
        // Drop the deep-overnight tail so the window reads as a real day (sorted,
        // so the kept times are a prefix); fall back to all for a night-only stop.
        let window: Vec<f64> = first_last
            .iter()
            .copied()
            .filter(|&t| t < NIGHT_TAIL_CUTOFF)
            .collect();
        let span = if window.is_empty() {
            &first_last
        } else {
            &window
        };
        let first_departure = format_clock(span.first().copied().unwrap_or(0.0));
        let last_departure = format_clock(span.last().copied().unwrap_or(0.0));
        let peak_interval_min = gap_range_min(&all_peak_times, PEAK_START, PEAK_END);

        // Hero crop = a fixed window around the stop (constant zoom); the clipped
        // corridors run off its edges. ~111 km per degree lat; lon shrinks by cos.
        let dlat = HERO_WINDOW_KM / 111.0;
        let dlon = HERO_WINDOW_KM / (111.0 * cluster.lat.to_radians().cos());
        let hero = StopHeroGeom {
            bbox: vec![
                round5(cluster.lon - dlon),
                round5(cluster.lat - dlat),
                round5(cluster.lon + dlon),
                round5(cluster.lat + dlat),
            ],
            lines: hero_lines,
        };

        // Resolve neighbours to distinct names (excluding self), nearest-match slug.
        let mut seen = std::collections::HashSet::new();
        let mut neighbors: Vec<StopNeighbor> = Vec::new();
        for name in neighbor_names {
            let key = slugify(&name);
            if key == *self_key || !seen.insert(key.clone()) {
                continue;
            }
            let slug = self.name_to_clusters.get(&key).map(|cands| {
                let best = cands
                    .iter()
                    .min_by(|&&a, &&b| {
                        let da = fast_dist_km(
                            cluster.lat,
                            cluster.lon,
                            self.clusters[a].lat,
                            self.clusters[a].lon,
                        );
                        let db = fast_dist_km(
                            cluster.lat,
                            cluster.lon,
                            self.clusters[b].lat,
                            self.clusters[b].lon,
                        );
                        da.partial_cmp(&db).unwrap()
                    })
                    .copied()
                    .unwrap();
                self.slugs[best].clone()
            });
            neighbors.push(StopNeighbor { name, slug });
        }

        StopPageData {
            slug: self.slugs[ci].clone(),
            name: cluster.name.clone(),
            kvart: self.kvarts[ci].clone(),
            lat: round5(cluster.lat),
            lon: round5(cluster.lon),
            mode,
            both_directions,
            line_count: stop_lines.len(),
            tram_lines,
            bus_lines,
            first_departure,
            last_departure,
            peak_interval_min,
            lines: stop_lines,
            neighbors,
            hero,
            reach: None,
            prev_slug: None,
            next_slug: None,
        }
    }
}

/// Wall-clock "H:MM", wrapping GTFS hours past midnight (29:23 → 5:23), no
/// leading zero on the hour to match the mockup's "4:18" / "0:24".
fn format_clock(seconds: f64) -> String {
    let total = seconds.max(0.0) as u32;
    let h = (total / 3600) % 24;
    let m = (total % 3600) / 60;
    format!("{}:{:02}", h, m)
}
