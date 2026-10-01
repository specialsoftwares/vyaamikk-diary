/**
 * Platform-safe GRIN original picker. Category is a declared Wave1OriginalCategory.
 * Does not upload full-file base64. Tests inject a picker via setGrinOriginalPickerForTests.
 */

import {
  ALLOWED_ORIGINAL_MIME,
  MAX_IMAGE_ORIGINAL_BYTES,
  MAX_PDF_ORIGINAL_BYTES,
  isWave1OriginalCategory,
  type Wave1OriginalCategory,
} from "@/goodsEvidence/evidence";
import {
  canStartPickerInvocation,
  isPickerCancelError,
  pickerHostIsReady,
  shouldDeferPickerLaunch,
  shouldRequestMediaLibraryPermissionBeforeLaunch,
} from "@/onboarding/identityMediaPickerGate";

import { getGrinScreenRuntime } from "./grinScreenHooks";

export type GrinPickedOriginal = {
  localPath: string;
  mime: string;
  byteSize: number;
  claimedSha256: string | null;
  fileName: string;
};

export type GrinOriginalPicker = (input: {
  source: "camera" | "library";
  category: Wave1OriginalCategory;
}) => Promise<GrinPickedOriginal | null>;

let injectedPicker: GrinOriginalPicker | null = null;
let pickerInFlight = false;

export function setGrinOriginalPickerForTests(picker: GrinOriginalPicker | null): void {
  injectedPicker = picker;
  pickerInFlight = false;
}

export function resetGrinOriginalPickerForTests(): void {
  injectedPicker = null;
  pickerInFlight = false;
}

function mimeAllowed(mime: string): boolean {
  return (ALLOWED_ORIGINAL_MIME as readonly string[]).includes(mime);
}

async function productionPick(input: {
  source: "camera" | "library";
  category: Wave1OriginalCategory;
}): Promise<GrinPickedOriginal | null> {
  if (!isWave1OriginalCategory(input.category)) {
    throw new Error("invalid_evidence_category");
  }
  const hostState = getGrinScreenRuntime().getPickerHostAppState();
  if (shouldDeferPickerLaunch(hostState) || !pickerHostIsReady(hostState)) {
    throw new Error("picker_host_not_ready");
  }
  if (!canStartPickerInvocation(pickerInFlight)) {
    throw new Error("picker_in_flight");
  }
  pickerInFlight = true;
  try {
    const ImagePicker = await import("expo-image-picker");
    const opts = {
      mediaTypes: ["images"] as const,
      allowsEditing: false,
      quality: 0.8,
      base64: false,
      exif: false,
    };
    let result: { canceled: boolean; assets?: Array<{ uri: string; mimeType?: string; fileName?: string; fileSize?: number }> };
    if (input.source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error("permission");
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      if (shouldRequestMediaLibraryPermissionBeforeLaunch("ios")) {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) throw new Error("permission");
      }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    const mime = (asset.mimeType ?? "image/jpeg").toLowerCase();
    if (!mimeAllowed(mime)) throw new Error("unsupported_mime");
    const byteSize = typeof asset.fileSize === "number" ? asset.fileSize : 0;
    const max = mime === "application/pdf" ? MAX_PDF_ORIGINAL_BYTES : MAX_IMAGE_ORIGINAL_BYTES;
    if (byteSize > max) throw new Error("too_large");
    return {
      localPath: asset.uri,
      mime,
      byteSize,
      claimedSha256: null,
      fileName: asset.fileName ?? "original",
    };
  } catch (error) {
    if (isPickerCancelError(error)) return null;
    throw error;
  } finally {
    pickerInFlight = false;
  }
}

export async function pickGrinOriginal(input: {
  source: "camera" | "library";
  category: Wave1OriginalCategory;
}): Promise<GrinPickedOriginal | null> {
  if (injectedPicker) return injectedPicker(input);
  return productionPick(input);
}
