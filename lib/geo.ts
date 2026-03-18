/** Precomputed geographic constants for Zagreb latitude (~45.8°) */
export const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
export const KM_PER_DEG_LAT = 111.32
export const KM_PER_DEG_LON = 111.32 * COS_LAT

/** Fast approximate distance in km using flat-earth projection at Zagreb latitude */
export function fastDistKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dlat = (lat2 - lat1) * KM_PER_DEG_LAT
  const dlon = (lon2 - lon1) * KM_PER_DEG_LON
  return Math.sqrt(dlat * dlat + dlon * dlon)
}
