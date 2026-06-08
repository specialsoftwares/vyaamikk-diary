import type { ProfessionalServicePack } from "@/domain/professionalPack";

/** Drop rows with blank / duplicate ids (legacy Firestore docs before doc-id fix). */
export function dedupeProfessionalPacks(
  packs: ProfessionalServicePack[]
): ProfessionalServicePack[] {
  const seen = new Set<string>();
  const out: ProfessionalServicePack[] = [];
  for (const pack of packs) {
    const id = pack.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!pack.deletedAt) out.push(pack);
  }
  return out;
}
