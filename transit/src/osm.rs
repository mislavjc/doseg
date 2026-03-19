use std::collections::HashSet;
use std::path::Path;

use osmpbf::{Element, ElementReader};

/// Bounding box for filtering OSM data.
struct Bbox {
    min_lat: f64,
    max_lat: f64,
    min_lon: f64,
    max_lon: f64,
}

const BBOX: Bbox = Bbox {
    min_lat: 45.7,
    max_lat: 45.92,
    min_lon: 15.75,
    max_lon: 16.2,
};

/// Grid cell size for populated-area lookup (~300m).
pub const POP_CELL: f64 = 0.003;

/// Extract populated grid cells from OSM PBF by finding building centroids.
///
/// Uses osmpbf's parallel reader for speed. Since Way references are node IDs
/// that need coordinate lookup, we do two passes:
/// 1. Collect all node coordinates within bbox
/// 2. Find buildings and compute centroids
pub fn extract_populated_cells(path: &Path) -> HashSet<(i32, i32)> {
    use std::collections::HashMap;

    // Pass 1: collect node coordinates
    let reader = ElementReader::from_path(path).expect("Cannot open OSM PBF");
    let node_coords: HashMap<i64, (f64, f64)> = reader
        .par_map_reduce(
            |element| {
                let mut map = HashMap::new();
                if let Element::Node(ref node) = element {
                    let lat = node.lat();
                    let lon = node.lon();
                    if (BBOX.min_lat..=BBOX.max_lat).contains(&lat)
                        && (BBOX.min_lon..=BBOX.max_lon).contains(&lon)
                    {
                        map.insert(node.id(), (lat, lon));
                    }
                }
                if let Element::DenseNode(node) = element {
                    let lat = node.lat();
                    let lon = node.lon();
                    if (BBOX.min_lat..=BBOX.max_lat).contains(&lat)
                        && (BBOX.min_lon..=BBOX.max_lon).contains(&lon)
                    {
                        map.insert(node.id(), (lat, lon));
                    }
                }
                map
            },
            HashMap::new,
            |mut a, b| {
                a.extend(b);
                a
            },
        )
        .expect("OSM PBF pass 1 failed");

    eprintln!("  {} nodes in bbox", node_coords.len());

    // Pass 2: find buildings and compute centroids
    let reader2 = ElementReader::from_path(path).expect("Cannot reopen OSM PBF");
    let cells: HashSet<(i32, i32)> = reader2
        .par_map_reduce(
            |element| {
                let mut set = HashSet::new();
                if let Element::Way(way) = element {
                    let is_building = way.tags().any(|(k, _)| k == "building");
                    if !is_building {
                        return set;
                    }
                    let mut s_lat = 0.0f64;
                    let mut s_lon = 0.0f64;
                    let mut n = 0u32;
                    for ref_id in way.refs() {
                        if let Some(&(lat, lon)) = node_coords.get(&ref_id) {
                            s_lat += lat;
                            s_lon += lon;
                            n += 1;
                        }
                    }
                    if n > 0 {
                        let clat = s_lat / n as f64;
                        let clon = s_lon / n as f64;
                        let cx = (clon / POP_CELL).floor() as i32;
                        let cy = (clat / POP_CELL).floor() as i32;
                        set.insert((cx, cy));
                    }
                }
                set
            },
            HashSet::new,
            |mut a, b| {
                a.extend(b);
                a
            },
        )
        .expect("OSM PBF pass 2 failed");

    cells
}
