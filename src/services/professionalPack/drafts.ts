import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ProfessionalCategory, ProfessionalMatterType } from "@/domain/professionalPack";

const PREFIX = "vyd_pro_pack_draft_";

function draftKey(
  userId: string,
  category: ProfessionalCategory,
  matterType: ProfessionalMatterType
): string {
  return `${PREFIX}${userId}_${category}_${matterType}`;
}

export async function loadPackDraft(
  userId: string,
  category: ProfessionalCategory,
  matterType: ProfessionalMatterType
): Promise<Record<string, unknown> | null> {
  const raw = await AsyncStorage.getItem(draftKey(userId, category, matterType));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function savePackDraft(
  userId: string,
  category: ProfessionalCategory,
  matterType: ProfessionalMatterType,
  values: Record<string, unknown>
): Promise<void> {
  await AsyncStorage.setItem(
    draftKey(userId, category, matterType),
    JSON.stringify(values)
  );
}

export async function clearPackDraft(
  userId: string,
  category: ProfessionalCategory,
  matterType: ProfessionalMatterType
): Promise<void> {
  await AsyncStorage.removeItem(draftKey(userId, category, matterType));
}
