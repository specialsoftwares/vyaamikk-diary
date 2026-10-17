# Team 4 proposal: `expo-document-picker` (coordinator-owned `package.json`)

Do **not** treat this as a silent production change. Coordinator owns `package.json`.

Pinned app Expo SDK: `expo` **~54.0.36**.

Add the SDK 54 bundled native module:

```json
"expo-document-picker": "~14.0.8"
```

(`npx expo install expo-document-picker` on Expo 54.0.36.)

API Team 4 implemented against (`docs.expo.dev/versions/v54.0.0/sdk/document-picker/`):

```ts
import * as DocumentPicker from "expo-document-picker";

const result = await DocumentPicker.getDocumentAsync({
  type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  copyToCacheDirectory: true,
  multiple: false,
});
if (result.canceled || !result.assets?.[0]) return null;
const asset = result.assets[0];
// asset.uri, asset.mimeType, asset.size, asset.name
```

Notes:

- Cache-directory copy is **not** durable retention. Team 4 copies those bytes into an app-owned `documentDirectory/grin-originals/{ownerUid}/` file and hashes the retained copy with `hashBoundedChunks` before `attachOriginal`.
- SQLITE_HOST tests inject an OS bridge and host filesystem. They do not claim NATIVE_DEVICE and do not launch the system picker.
- No iCloud plugin is required for this GRIN original path.
