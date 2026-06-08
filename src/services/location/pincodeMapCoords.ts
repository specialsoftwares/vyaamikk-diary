import {
  isValidIndianPincode,
  normalizeIndianPinInput,
} from "@/services/location/pincodeResolver";
import { getSharedIndiaPincodeOfflineLookup } from "@/services/location/pincodeOfflineLookup";

export interface PinCentroid {
  pinCode: string;
  latitude: number;
  longitude: number;
  district: string | null;
  state: string | null;
}

const centroidCache = new Map<string, PinCentroid | null>();

/** Centroid of post offices with coordinates for a PIN (offline DB). Not GPS. */
export async function resolvePinCentroid(pinCode: string): Promise<PinCentroid | null> {
  const pin = normalizeIndianPinInput(pinCode);
  if (!isValidIndianPincode(pin)) return null;
  if (centroidCache.has(pin)) return centroidCache.get(pin) ?? null;

  try {
    const lookup = await getSharedIndiaPincodeOfflineLookup();
    const res = lookup.getByPincode(pin, { limit: 80 });
    if (!res.success || !res.data?.data?.length) {
      centroidCache.set(pin, null);
      return null;
    }
    const withCoords = res.data.data.filter(
      (o) =>
        o.latitude != null &&
        o.longitude != null &&
        Number.isFinite(o.latitude) &&
        Number.isFinite(o.longitude)
    );
    if (!withCoords.length) {
      centroidCache.set(pin, null);
      return null;
    }
    let latSum = 0;
    let lngSum = 0;
    for (const o of withCoords) {
      latSum += o.latitude!;
      lngSum += o.longitude!;
    }
    const n = withCoords.length;
    const first = withCoords[0];
    const centroid: PinCentroid = {
      pinCode: pin,
      latitude: latSum / n,
      longitude: lngSum / n,
      district: first.district?.trim() || null,
      state: first.state?.trim() || null,
    };
    centroidCache.set(pin, centroid);
    return centroid;
  } catch {
    centroidCache.set(pin, null);
    return null;
  }
}
