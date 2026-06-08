/** Earth radius in kilometres (WGS84 mean). */
const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two WGS84 points (straight-line, not road).
 * Returns kilometres rounded to one decimal, or null when inputs are invalid.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number | null {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = EARTH_RADIUS_KM * c;
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.round(km * 10) / 10;
}
