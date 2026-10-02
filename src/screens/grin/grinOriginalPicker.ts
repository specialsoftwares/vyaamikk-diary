/**
 * Platform-safe GRIN original picker.
 *
 * PDF/document + supported images + camera. Copies bytes into an app-owned
 * file before attachOriginal. Hashes retained bytes with hashBoundedChunks.
 * Does not quality:0.8 recompress an imported original.
 *
 * Provenance: camera_capture | imported_original | os_conversion | derivative.
 * expo-image-picker ~17.0.11 may transcode; quality:1 does not prove identity.
 * Document-picker cache copies do not prove identity with the OS source when
 * conversion cannot be ruled out.
 *
 * Tests inject OS bridge + host fs. NATIVE_DEVICE is not claimed.
 * No filenames, bodies, or hashes in logs.
 */

import {
  canStartPickerInvocation,
  isPickerCancelError,
  pickerHostIsReady,
  shouldDeferPickerLaunch,
  shouldRequestMediaLibraryPermissionBeforeLaunch,
} from "@/onboarding/identityMediaPickerGate";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { requireOriginGrinApplicationRepository } from "@/services/grin/repository";

import { isGrinAttachCategory, type GrinAttachCategory } from "./grinAttachCategories";
import {
  commitGrinOriginalRetention,
  discardUncommittedGrinOriginal,
  isAllowedOriginalMime,
  retainPickedOriginal,
  type GrinCaptureProvenance,
  type GrinOsConversion,
  type GrinRetainedOriginal,
} from "./grinOriginalRetention";
import { getGrinScreenRuntime } from "./grinScreenHooks";
import { Platform } from "./grinSurfaces";

export type { GrinCaptureProvenance, GrinOsConversion, GrinRetainedOriginal };

export type GrinPickedOriginal = GrinRetainedOriginal & {
  fileName: string;
};

export type GrinPickedOsAsset = {
  uri: string;
  mime: string | null;
  fileName: string | null;
  size: number | null;
  injectedBytes?: Uint8Array | null;
};

export type GrinOriginalOsBridge = {
  pickDocument?: () => Promise<GrinPickedOsAsset | null>;
  pickCamera?: () => Promise<GrinPickedOsAsset | null>;
  requestCameraPermission?: () => Promise<boolean>;
  requestMediaLibraryPermission?: () => Promise<boolean>;
};

export type GrinOriginalPicker = (input: {
  source: "camera" | "library";
  category: GrinAttachCategory;
  origin?: GrinDispatchSession;
}) => Promise<GrinPickedOriginal | null>;

let injectedPicker: GrinOriginalPicker | null = null;
let injectedOs: GrinOriginalOsBridge | null = null;
let pickerInFlight = false;

export function setGrinOriginalPickerForTests(picker: GrinOriginalPicker | null): void {
  injectedPicker = picker;
  pickerInFlight = false;
}

export function setGrinOriginalOsBridgeForTests(bridge: GrinOriginalOsBridge | null): void {
  injectedOs = bridge;
}

export function resetGrinOriginalPickerForTests(): void {
  injectedPicker = null;
  injectedOs = null;
  pickerInFlight = false;
}

export { commitGrinOriginalRetention, discardUncommittedGrinOriginal };

function assertOrigin(origin: GrinDispatchSession | undefined): void {
  if (!origin) return;
  requireOriginGrinApplicationRepository(origin);
}

function inferMime(asset: { mime: string | null; fileName: string | null; uri: string }): string {
  if (asset.mime && asset.mime.trim()) return asset.mime.toLowerCase();
  const name = `${asset.fileName ?? ""} ${asset.uri}`.toLowerCase();
  if (name.includes(".pdf")) return "application/pdf";
  if (name.includes(".png")) return "image/png";
  if (name.includes(".webp")) return "image/webp";
  if (name.includes(".jpg") || name.includes(".jpeg")) return "image/jpeg";
  return "";
}

function provenanceFor(
  source: "camera" | "library",
  mime: string
): { captureProvenance: GrinCaptureProvenance; osConversionOccurred: GrinOsConversion } {
  if (source === "camera") {
    return { captureProvenance: "camera_capture", osConversionOccurred: "unknown" };
  }
  if (mime === "application/pdf") {
    // Document-picker copyToCacheDirectory copies bytes; OS conversion of PDF
    // cannot be ruled out from pinned-library evidence, so keep unknown.
    return { captureProvenance: "imported_original", osConversionOccurred: "unknown" };
  }
  // expo-image-picker / OS image pickers may transcode HEIC and other formats.
  return { captureProvenance: "os_conversion", osConversionOccurred: "unknown" };
}

async function requestCameraGranted(): Promise<boolean> {
  if (injectedOs?.requestCameraPermission) return injectedOs.requestCameraPermission();
  const ImagePicker = await import("expo-image-picker");
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  return perm.granted;
}

async function requestLibraryGranted(): Promise<boolean> {
  if (injectedOs?.requestMediaLibraryPermission) return injectedOs.requestMediaLibraryPermission();
  if (!shouldRequestMediaLibraryPermissionBeforeLaunch(Platform.OS)) return true;
  const ImagePicker = await import("expo-image-picker");
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return perm.granted;
}

async function pickCameraAsset(): Promise<GrinPickedOsAsset | null> {
  if (injectedOs?.pickCamera) return injectedOs.pickCamera();
  const ImagePicker = await import("expo-image-picker");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    // Do not set quality. quality: 0.8 recompresses. quality: 1 does not prove identity.
    base64: false,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mime: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    size: typeof asset.fileSize === "number" ? asset.fileSize : null,
  };
}

async function pickLibraryAsset(): Promise<GrinPickedOsAsset | null> {
  if (injectedOs?.pickDocument) return injectedOs.pickDocument();
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mime: asset.mimeType ?? null,
    fileName: asset.name ?? null,
    size: typeof asset.size === "number" ? asset.size : null,
  };
}

async function productionPick(input: {
  source: "camera" | "library";
  category: GrinAttachCategory;
  origin?: GrinDispatchSession;
}): Promise<GrinPickedOriginal | null> {
  if (!isGrinAttachCategory(input.category)) {
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
  let retainedPath: string | null = null;
  try {
    assertOrigin(input.origin);
    if (input.source === "camera") {
      const granted = await requestCameraGranted();
      assertOrigin(input.origin);
      if (!granted) throw new Error("permission");
    } else {
      const granted = await requestLibraryGranted();
      assertOrigin(input.origin);
      if (!granted) throw new Error("permission");
    }
    const asset = input.source === "camera" ? await pickCameraAsset() : await pickLibraryAsset();
    assertOrigin(input.origin);
    if (!asset) return null;
    const mime = inferMime(asset);
    if (!isAllowedOriginalMime(mime)) throw new Error("unsupported_mime");
    const provenance = provenanceFor(input.source, mime);
    const ownerUid = input.origin?.ownerUid ?? "unbound";
    const retained = await retainPickedOriginal({
      sourcePath: asset.uri,
      mime,
      captureProvenance: provenance.captureProvenance,
      osConversionOccurred: provenance.osConversionOccurred,
      ownerUid,
      injectedBytes: asset.injectedBytes ?? null,
    });
    retainedPath = retained.localPath;
    assertOrigin(input.origin);
    return {
      ...retained,
      fileName: "original",
    };
  } catch (error) {
    if (retainedPath) await discardUncommittedGrinOriginal(retainedPath);
    if (isPickerCancelError(error)) return null;
    throw error;
  } finally {
    pickerInFlight = false;
  }
}

export async function pickGrinOriginal(input: {
  source: "camera" | "library";
  category: GrinAttachCategory;
  origin?: GrinDispatchSession;
}): Promise<GrinPickedOriginal | null> {
  if (injectedPicker) return injectedPicker(input);
  return productionPick(input);
}
