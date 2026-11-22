//! Tram network topology for the /karta-tramvaja schematic.
//!
//! Queries OTP for one weekday, keeps the dominant tram pattern per line and
//! direction, folds platforms into their parent station, and merges the two
//! directions of each line into one drawable stop sequence. Stops served in
//! only one direction stay in the sequence and are listed in `one_way`.
//! Writes data/karta-tramvaja/network.json; the schematic layout is computed
//! from it by scripts/build-tram-map.ts.
//! Run with `cargo run --release --bin transit-scorer -- --tram-map`.

use std::collections::HashMap;
use std::path::Path;

use graphql_client::GraphQLQuery;
use serde::Serialize;
use ts_rs::TS;

use crate::geo::fast_dist_km;
use crate::line_pages::{
    DayKind, epoch_days_today, fetch_service_range_days, pick_service_date, round5,
};

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "schema.json",
    query_path = "src/queries/tram_network.graphql",
    response_derives = "Debug"
)]
pub struct GetTramNetwork;

type Pattern = get_tram_network::GetTramNetworkPatterns;

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TramMapStation {
    /// OTP parent-station id without the feed prefix.
    pub id: String,
    /// Official ZET name, nominative.
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    /// Day and night lines calling here, in line-number order.
    pub lines: Vec<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TramMapOneWay {
    pub station: String,
    /// Terminal the trams calling here are heading to.
    pub towards: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TramMapLine {
    pub broj: String,
    pub is_night: bool,
    /// Station ids from one terminal to the other, both directions merged.
    pub stations: Vec<String>,
    pub one_way: Vec<TramMapOneWay>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TramMapNetwork {
    pub generated_at: String,
    pub service_date: String,
    pub stations: Vec<TramMapStation>,
    pub lines: Vec<TramMapLine>,
}

#[derive(Clone)]
struct Station {
    id: String,
    name: String,
    lat: f64,
    lon: f64,
}

/// Terminal loops give the arrival and departure platforms separate parent
/// stations with the same name; fold those into the busier one so a terminal
/// is one place on the map.
const SAME_PLACE_KM: f64 = 0.2;

fn canonical_ids(sequences: &[Vec<Station>]) -> HashMap<String, Station> {
    let mut seen: Vec<(Station, usize)> = Vec::new();
    for s in sequences.iter().flatten() {
        if let Some(e) = seen.iter_mut().find(|(t, _)| t.id == s.id) {
            e.1 += 1;
        } else {
            seen.push((s.clone(), 1));
        }
    }
    seen.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.id.cmp(&b.0.id)));
    let mut canon: HashMap<String, Station> = HashMap::new();
    for (i, (s, _)) in seen.iter().enumerate() {
        let target = seen[..i]
            .iter()
            .map(|(t, _)| t)
            .find(|t| t.name == s.name && fast_dist_km(t.lat, t.lon, s.lat, s.lon) < SAME_PLACE_KM)
            .map_or_else(|| s.clone(), |t| canon[&t.id].clone());
        canon.insert(s.id.clone(), target);
    }
    canon
}

fn canonicalise(seq: &[Station], canon: &HashMap<String, Station>) -> Vec<Station> {
    let mut out: Vec<Station> = Vec::new();
    for s in seq {
        let c = canon[&s.id].clone();
        if out.last().is_none_or(|l| l.id != c.id) {
            out.push(c);
        }
    }
    out
}

fn stations_of(p: &Pattern) -> Vec<Station> {
    let mut out: Vec<Station> = Vec::new();
    for s in p.stops.iter().flatten() {
        let st = match &s.parent_station {
            Some(ps) => Station {
                id: ps
                    .gtfs_id
                    .split_once(':')
                    .map_or(ps.gtfs_id.as_str(), |(_, id)| id)
                    .to_string(),
                name: ps.name.clone(),
                lat: ps.lat.unwrap_or(0.0),
                lon: ps.lon.unwrap_or(0.0),
            },
            None => Station {
                id: s.name.clone(),
                name: s.name.clone(),
                lat: s.lat.unwrap_or(0.0),
                lon: s.lon.unwrap_or(0.0),
            },
        };
        if out.last().is_none_or(|l| l.id != st.id) {
            out.push(st);
        }
    }
    out
}

/// Longest-common-subsequence alignment of two id lists: matched index pairs.
fn lcs_pairs(left: &[&str], right: &[&str]) -> Vec<(usize, usize)> {
    let (rows, cols) = (left.len(), right.len());
    let mut dp = vec![vec![0u16; cols + 1]; rows + 1];
    for li in (0..rows).rev() {
        for ri in (0..cols).rev() {
            dp[li][ri] = if left[li] == right[ri] {
                dp[li + 1][ri + 1] + 1
            } else {
                dp[li + 1][ri].max(dp[li][ri + 1])
            };
        }
    }
    let (mut li, mut ri, mut out) = (0, 0, Vec::new());
    while li < rows && ri < cols {
        if left[li] == right[ri] {
            out.push((li, ri));
            li += 1;
            ri += 1;
        } else if dp[li + 1][ri] >= dp[li][ri + 1] {
            li += 1;
        } else {
            ri += 1;
        }
    }
    out
}

/// Merge outbound `a` with the reversed inbound `b` into one sequence. Stops
/// between two shared anchors are ordered by their projection on the anchor
/// segment, so a one-way pair on parallel streets reads in travel order.
/// Returns the sequence and, per stop, which direction alone serves it.
fn merge_directions(a: &[Station], b: &[Station]) -> Vec<(Station, Option<usize>)> {
    let ai: Vec<&str> = a.iter().map(|s| s.id.as_str()).collect();
    let bi: Vec<&str> = b.iter().map(|s| s.id.as_str()).collect();
    let pairs = lcs_pairs(&ai, &bi);
    let mut out: Vec<(Station, Option<usize>)> = Vec::new();
    let (mut pa, mut pb) = (0, 0);
    let mut anchors: Vec<Option<(usize, usize)>> = pairs.iter().copied().map(Some).collect();
    anchors.push(None);
    for anchor in anchors {
        let (ea, eb) = anchor.unwrap_or((a.len(), b.len()));
        let mut gap: Vec<(Station, Option<usize>)> = a[pa..ea]
            .iter()
            .map(|s| (s.clone(), Some(0)))
            .chain(b[pb..eb].iter().map(|s| (s.clone(), Some(1))))
            .collect();
        let from = out
            .last()
            .map(|(s, _)| s.clone())
            .or_else(|| gap.first().map(|(s, _)| s.clone()));
        let to = anchor
            .map(|(i, _)| a[i].clone())
            .or_else(|| gap.last().map(|(s, _)| s.clone()));
        if let (Some(f), Some(t)) = (from, to) {
            let (dx, dy) = (t.lon - f.lon, t.lat - f.lat);
            gap.sort_by(|(p, _), (q, _)| {
                let tp = (p.lon - f.lon) * dx + (p.lat - f.lat) * dy;
                let tq = (q.lon - f.lon) * dx + (q.lat - f.lat) * dy;
                tp.total_cmp(&tq)
            });
        }
        out.extend(gap);
        if let Some((i, j)) = anchor {
            out.push((a[i].clone(), None));
            pa = i + 1;
            pb = j + 1;
        }
    }
    out
}

fn line_sort_key(broj: &str) -> u32 {
    broj.parse().unwrap_or(u32::MAX)
}

pub fn generate(otp_url: &str, data_dir: &Path) {
    let (_, last_day) = fetch_service_range_days(otp_url);
    let date = pick_service_date(otp_url, DayKind::Weekday, epoch_days_today(), last_day);
    eprintln!("Tram map: service date {date}");
    let patterns: Vec<Pattern> = crate::otp::query::<GetTramNetwork>(
        otp_url,
        get_tram_network::Variables {
            service_date: date.clone(),
        },
    )
    .patterns
    .unwrap_or_default()
    .into_iter()
    .flatten()
    .filter(|p| {
        p.route
            .mode
            .as_ref()
            .is_some_and(|m| format!("{m:?}") == "TRAM")
    })
    .collect();

    // Dominant pattern per (line, direction): the most trips on the service date.
    let mut dominant: HashMap<(String, usize), (usize, &Pattern)> = HashMap::new();
    for p in &patterns {
        let Some(broj) = p.route.short_name.clone() else {
            continue;
        };
        let dir = p.direction_id.map_or(0, |d| usize::from(d == 1));
        let trips = p.trips_for_date.as_ref().map_or(0, Vec::len);
        let slot = dominant.entry((broj, dir)).or_insert((trips, p));
        if trips > slot.0 {
            *slot = (trips, p);
        }
    }

    let mut brojevi: Vec<String> = dominant.keys().map(|(b, _)| b.clone()).collect();
    brojevi.sort_by_key(|b| line_sort_key(b));
    brojevi.dedup();

    let raw: HashMap<(String, usize), Vec<Station>> = dominant
        .iter()
        .map(|(k, (_, p))| (k.clone(), stations_of(p)))
        .collect();
    let all: Vec<Vec<Station>> = raw.values().cloned().collect();
    let canon = canonical_ids(&all);

    let mut stations: HashMap<String, (Station, Vec<String>)> = HashMap::new();
    let mut lines: Vec<TramMapLine> = Vec::new();
    for broj in brojevi {
        let seq = |dir: usize| {
            raw.get(&(broj.clone(), dir))
                .map(|s| canonicalise(s, &canon))
                .unwrap_or_default()
        };
        let (out, back) = (seq(0), seq(1));
        let back_rev: Vec<Station> = back.iter().rev().cloned().collect();
        let terminals = [
            out.last().map(|s| s.name.clone()).unwrap_or_default(),
            back.last().map(|s| s.name.clone()).unwrap_or_default(),
        ];
        let merged = merge_directions(&out, &back_rev);
        let mut one_way = Vec::new();
        for (s, only) in &merged {
            if let Some(dir) = only {
                one_way.push(TramMapOneWay {
                    station: s.id.clone(),
                    towards: terminals[*dir].clone(),
                });
            }
            let entry = stations
                .entry(s.id.clone())
                .or_insert_with(|| (s.clone(), Vec::new()));
            if !entry.1.contains(&broj) {
                entry.1.push(broj.clone());
            }
        }
        let number = line_sort_key(&broj);
        eprintln!(
            "  line {broj}: {} stations, {} one-way",
            merged.len(),
            one_way.len()
        );
        lines.push(TramMapLine {
            is_night: (30..40).contains(&number),
            stations: merged.into_iter().map(|(s, _)| s.id).collect(),
            one_way,
            broj,
        });
    }

    let mut stations: Vec<TramMapStation> = stations
        .into_values()
        .map(|(s, mut lines)| {
            lines.sort_by_key(|b| line_sort_key(b));
            TramMapStation {
                id: s.id,
                name: s.name,
                lat: round5(s.lat),
                lon: round5(s.lon),
                lines,
            }
        })
        .collect();
    stations.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
    eprintln!("  {} stations, {} lines", stations.len(), lines.len());

    let network = TramMapNetwork {
        generated_at: crate::chrono_now_iso(),
        service_date: date,
        stations,
        lines,
    };
    let dir = data_dir.join("karta-tramvaja");
    std::fs::create_dir_all(&dir).expect("create data/karta-tramvaja");
    let path = dir.join("network.json");
    let json = serde_json::to_string_pretty(&network).expect("serialize tram network");
    std::fs::write(&path, json + "\n").expect("write tram network");
    eprintln!("Wrote {}", path.display());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(id: &str, lon: f64) -> Station {
        Station {
            id: id.into(),
            name: id.into(),
            lat: 45.8,
            lon,
        }
    }

    #[test]
    fn merge_keeps_one_way_stops_in_travel_order() {
        let a = [st("a", 0.0), st("x", 1.0), st("c", 2.0), st("d", 3.0)];
        let b = [st("a", 0.0), st("c", 2.0), st("y", 2.5), st("d", 3.0)];
        let merged = merge_directions(&a, &b);
        let ids: Vec<&str> = merged.iter().map(|(s, _)| s.id.as_str()).collect();
        assert_eq!(ids, ["a", "x", "c", "y", "d"]);
        let only: Vec<Option<usize>> = merged.iter().map(|(_, d)| *d).collect();
        assert_eq!(only, [None, Some(0), None, Some(1), None]);
    }

    #[test]
    fn merge_orders_parallel_pair_by_projection() {
        let a = [st("a", 0.0), st("far", 0.8), st("d", 1.0)];
        let b = [st("a", 0.0), st("near", 0.2), st("d", 1.0)];
        let ids: Vec<String> = merge_directions(&a, &b)
            .into_iter()
            .map(|(s, _)| s.id)
            .collect();
        assert_eq!(ids, ["a", "near", "far", "d"]);
    }
}
