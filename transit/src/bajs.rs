use serde::Deserialize;

use crate::geo::fast_dist_km;

#[allow(dead_code)]
const BAJS_TRANSFER_MAX_KM: f64 = 0.35;
#[allow(dead_code)]
const BAJS_BIKE_MAX_KM: f64 = 6.0;

/// BAJS station from the transit graph JSON dump.
#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct BajsStation {
    pub key: String,
    #[serde(rename = "stationId")]
    pub station_id: String,
    #[serde(rename = "shortName")]
    pub short_name: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub capacity: i32,
}

/// Index-based link to a node.
#[derive(Clone)]
#[allow(dead_code)]
pub struct IndexedLink {
    pub idx: usize,
    pub dist_km: f64,
}

/// Indexed BAJS adjacency for scoring Dijkstra.
#[allow(dead_code)]
pub struct IndexedBajsAdjacency {
    pub bajs_count: usize,
    pub stations: Vec<BajsStation>,
    /// stop_idx → links to BAJS nodes (indexed as stop_count + bi)
    pub stop_to_station_links: Vec<Option<Vec<IndexedLink>>>,
    /// bajs local idx → links to stop nodes
    pub station_to_stop_links: Vec<Vec<IndexedLink>>,
    /// bajs local idx → links to other BAJS nodes (indexed as stop_count + bj)
    pub station_bike_links: Vec<Vec<IndexedLink>>,
}

/// Build indexed BAJS adjacency structure for scoring.
/// All stations are treated as idealized (1 bike, 1 dock, installed+renting+returning).
#[allow(dead_code)]
pub fn build_bajs_adjacency_indexed(
    stop_coords: &[(f64, f64)], // (lat, lon) for each transit stop
    stop_count: usize,
    stations: &[BajsStation],
) -> IndexedBajsAdjacency {
    let bajs_count = stations.len();

    let mut stop_to_station_links: Vec<Option<Vec<IndexedLink>>> = vec![None; stop_count];
    let mut station_to_stop_links: Vec<Vec<IndexedLink>> = vec![Vec::new(); bajs_count];
    let mut station_bike_links: Vec<Vec<IndexedLink>> = vec![Vec::new(); bajs_count];

    // Stop ↔ station walk links
    for si in 0..stop_count {
        let (slat, slon) = stop_coords[si];
        let mut links = Vec::new();

        for bi in 0..bajs_count {
            let dist_km = fast_dist_km(slat, slon, stations[bi].lat, stations[bi].lon);
            if dist_km > BAJS_TRANSFER_MAX_KM {
                continue;
            }
            links.push(IndexedLink {
                idx: stop_count + bi,
                dist_km,
            });
            station_to_stop_links[bi].push(IndexedLink { idx: si, dist_km });
        }

        if !links.is_empty() {
            stop_to_station_links[si] = Some(links);
        }
    }

    // Station ↔ station bike links (idealized: all available)
    for i in 0..bajs_count {
        for j in (i + 1)..bajs_count {
            let dist_km = fast_dist_km(
                stations[i].lat,
                stations[i].lon,
                stations[j].lat,
                stations[j].lon,
            );
            if dist_km > BAJS_BIKE_MAX_KM {
                continue;
            }
            // Both directions (idealized stations always have bikes+docks)
            station_bike_links[i].push(IndexedLink {
                idx: stop_count + j,
                dist_km,
            });
            station_bike_links[j].push(IndexedLink {
                idx: stop_count + i,
                dist_km,
            });
        }
    }

    IndexedBajsAdjacency {
        bajs_count,
        stations: stations.to_vec(),
        stop_to_station_links,
        station_to_stop_links,
        station_bike_links,
    }
}
