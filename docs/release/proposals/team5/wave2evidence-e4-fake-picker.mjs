/**
 * Host stand-in for pinned expo-image-picker ~17.0.11.
 * Records launch options and returns URI-only assets (no fileSize, no bytes).
 * NATIVE_DEVICE not claimed.
 */

function launches() {
  const g = globalThis;
  if (!Array.isArray(g.__GRIN_T5_E4_LAUNCHES__)) {
    g.__GRIN_T5_E4_LAUNCHES__ = [];
  }
  return g.__GRIN_T5_E4_LAUNCHES__;
}

function permissions() {
  const g = globalThis;
  if (!g.__GRIN_T5_E4_PERMS__) {
    g.__GRIN_T5_E4_PERMS__ = { camera: true, library: true };
  }
  return g.__GRIN_T5_E4_PERMS__;
}

export async function requestCameraPermissionsAsync() {
  return { granted: permissions().camera === true, status: permissions().camera ? "granted" : "denied" };
}

export async function requestMediaLibraryPermissionsAsync() {
  return { granted: permissions().library === true, status: permissions().library ? "granted" : "denied" };
}

export async function launchCameraAsync(options) {
  launches().push({ method: "launchCameraAsync", options: { ...options } });
  return {
    canceled: false,
    assets: [
      {
        uri: "file:///tmp/grin-t5-e4-camera.jpg",
        mimeType: "image/jpeg",
        fileName: "camera.jpg",
        width: 8,
        height: 8,
      },
    ],
  };
}

export async function launchImageLibraryAsync(options) {
  launches().push({ method: "launchImageLibraryAsync", options: { ...options } });
  return {
    canceled: false,
    assets: [
      {
        uri: "file:///tmp/grin-t5-e4-library.jpg",
        mimeType: "image/jpeg",
        fileName: "library.jpg",
        width: 8,
        height: 8,
      },
    ],
  };
}
