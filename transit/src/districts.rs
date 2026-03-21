use std::fs;
use std::path::Path;

use crate::geo::{KM_PER_DEG_LAT, KM_PER_DEG_LON};

/// A district with its polygon ring.
pub struct District {
    pub name: String,
    pub osm_id: i64,
    pub population: Option<i64>,
    pub ring: Vec<(f64, f64)>, // (lon, lat) as in GeoJSON
}

/// A sample point on the grid assigned to a district.
#[derive(Clone)]
pub struct SamplePoint {
    pub lat: f64,
    pub lon: f64,
    pub district_idx: usize,
}

/// Load districts from GeoJSON.
pub fn load_districts(path: &Path) -> Vec<District> {
    let raw = fs::read_to_string(path).expect("Cannot read districts.geojson");
    let geojson: serde_json::Value = serde_json::from_str(&raw).expect("Invalid GeoJSON");

    let features = geojson["features"].as_array().expect("No features array");
    features
        .iter()
        .map(|f| {
            let props = &f["properties"];
            let name = props["name"].as_str().unwrap_or("").to_string();
            let osm_id = props["osmId"].as_i64().unwrap_or(0);
            let population = props["population"].as_i64();

            let geom = &f["geometry"];
            let coords = if geom["type"].as_str() == Some("Polygon") {
                &geom["coordinates"][0]
            } else {
                // MultiPolygon: take first polygon
                &geom["coordinates"][0][0]
            };

            let ring: Vec<(f64, f64)> = coords
                .as_array()
                .expect("No coordinate array")
                .iter()
                .map(|c| {
                    let lon = c[0].as_f64().unwrap();
                    let lat = c[1].as_f64().unwrap();
                    (lon, lat)
                })
                .collect();

            District {
                name,
                osm_id,
                population,
                ring,
            }
        })
        .collect()
}

/// Polygon area in km² using the Shoelace formula with flat-earth projection.
pub fn polygon_area_km2(ring: &[(f64, f64)]) -> f64 {
    let n = ring.len();
    if n < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        let x_i = ring[i].0 * KM_PER_DEG_LON;
        let y_i = ring[i].1 * KM_PER_DEG_LAT;
        let x_j = ring[j].0 * KM_PER_DEG_LON;
        let y_j = ring[j].1 * KM_PER_DEG_LAT;
        area += x_i * y_j - x_j * y_i;
    }
    (area / 2.0).abs()
}

/// Ray-casting point-in-polygon test.
pub fn point_in_polygon(lon: f64, lat: f64, ring: &[(f64, f64)]) -> bool {
    let mut inside = false;
    let n = ring.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = ring[i];
        let (xj, yj) = ring[j];
        if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Check if a point is in or adjacent to a populated grid cell.
fn is_populated(
    lat: f64,
    lon: f64,
    cells: &std::collections::HashSet<(i32, i32)>,
    pop_cell: f64,
) -> bool {
    let cx = (lon / pop_cell).floor() as i32;
    let cy = (lat / pop_cell).floor() as i32;
    for dx in -1..=1 {
        for dy in -1..=1 {
            if cells.contains(&(cx + dx, cy + dy)) {
                return true;
            }
        }
    }
    false
}

/// Generate sample points on a regular grid, filtered by populated cells and district boundaries.
pub fn generate_sample_points(
    districts: &[District],
    grid_spacing_km: f64,
    populated_cells: &std::collections::HashSet<(i32, i32)>,
    pop_cell: f64,
) -> Vec<SamplePoint> {
    let lat_step = grid_spacing_km / KM_PER_DEG_LAT;
    let lon_step = grid_spacing_km / KM_PER_DEG_LON;

    let mut min_lat = f64::INFINITY;
    let mut max_lat = f64::NEG_INFINITY;
    let mut min_lon = f64::INFINITY;
    let mut max_lon = f64::NEG_INFINITY;

    for d in districts {
        for &(lon, lat) in &d.ring {
            if lat < min_lat {
                min_lat = lat;
            }
            if lat > max_lat {
                max_lat = lat;
            }
            if lon < min_lon {
                min_lon = lon;
            }
            if lon > max_lon {
                max_lon = lon;
            }
        }
    }

    let mut points = Vec::new();
    let mut skipped = 0u32;

    // Use integer iteration to avoid floating-point accumulation drift
    let lat_steps = ((max_lat - min_lat) / lat_step).ceil() as usize;
    let lon_steps = ((max_lon - min_lon) / lon_step).ceil() as usize;

    for i in 0..=lat_steps {
        let lat = min_lat + i as f64 * lat_step;
        for j in 0..=lon_steps {
            let lon = min_lon + j as f64 * lon_step;
            if !is_populated(lat, lon, populated_cells, pop_cell) {
                skipped += 1;
                continue;
            }
            for (di, d) in districts.iter().enumerate() {
                if point_in_polygon(lon, lat, &d.ring) {
                    points.push(SamplePoint {
                        lat,
                        lon,
                        district_idx: di,
                    });
                    break;
                }
            }
        }
    }

    eprintln!("  {} grid points skipped (no buildings nearby)", skipped);
    points
}
