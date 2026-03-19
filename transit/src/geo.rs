/// Precomputed geographic constants for Zagreb latitude (~45.8°N)
pub const COS_LAT: f64 = 0.69716510293; // cos(45.8° × π/180)
pub const KM_PER_DEG_LAT: f64 = 111.32;
pub const KM_PER_DEG_LON: f64 = 111.32 * COS_LAT; // ~77.43
pub const WALK_SPEED: f64 = 5.0; // km/h

/// Fast approximate distance in km using flat-earth projection at Zagreb latitude.
#[inline(always)]
pub fn fast_dist_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let dlat = (lat2 - lat1) * KM_PER_DEG_LAT;
    let dlon = (lon2 - lon1) * KM_PER_DEG_LON;
    (dlat * dlat + dlon * dlon).sqrt()
}
