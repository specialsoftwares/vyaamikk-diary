/**
 * Config-plugin source tests for release manifest hardening.
 * Label: CONFIG_PLUGIN_SOURCE. Exercises the pure manifest transform on the
 * @expo/config-plugins AndroidManifest JSON shape. Not evidence of the merged
 * manifest in a built artifact — that requires `bundletool dump manifest` on
 * the next AAB.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugin = require("./withAndroidReleaseManifestHardening.js") as {
  applyAndroidReleaseManifestHardening: (manifest: unknown) => any;
  REMOVED_ACTIVITIES: string[];
};

const apply = plugin.applyAndroidReleaseManifestHardening;
const PREVIEW = "androidx.compose.ui.tooling.PreviewActivity";

function templateManifest() {
  // Shape produced by @expo/config-plugins for the Expo prebuild template.
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      "uses-permission": [{ $: { "android:name": "android.permission.INTERNET" } }],
      application: [
        {
          $: {
            "android:name": ".MainApplication",
            "android:allowBackup": "true",
          },
          activity: [
            {
              $: { "android:name": ".MainActivity", "android:exported": "true" },
              "intent-filter": [
                {
                  action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
                  category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

{
  assert.deepEqual(plugin.REMOVED_ACTIVITIES, [PREVIEW], "scope limited to the reproduced component");
}

{
  const next = apply(templateManifest());
  assert.equal(
    next.manifest.$["xmlns:tools"],
    "http://schemas.android.com/tools",
    "tools namespace must be declared for tools:node"
  );
  const app = next.manifest.application[0];
  const removed = app.activity.filter((a: any) => a.$["android:name"] === PREVIEW);
  assert.equal(removed.length, 1, "exactly one remove directive");
  assert.equal(removed[0].$["tools:node"], "remove");
  assert.equal(Object.keys(removed[0].$).length, 2, "no extra attributes on the remove directive");

  const main = app.activity.find((a: any) => a.$["android:name"] === ".MainActivity");
  assert.ok(main, "MainActivity preserved");
  assert.equal(main.$["android:exported"], "true", "MainActivity attributes untouched");
  assert.equal(main["intent-filter"].length, 1, "MainActivity intent filters untouched");
  assert.equal(next.manifest["uses-permission"].length, 1, "permissions untouched");
  assert.equal(app.$["android:allowBackup"], "true", "application attributes untouched");
}

{
  const once = apply(templateManifest());
  const snapshot = JSON.parse(JSON.stringify(once));
  const twice = apply(once);
  assert.deepEqual(twice, snapshot, "second application must be idempotent (no duplicate directive)");
}

{
  // Manifest without any activity array on the application element.
  const m = templateManifest();
  delete (m.manifest.application[0] as any).activity;
  const next = apply(m);
  assert.equal(next.manifest.application[0].activity.length, 1);
  assert.equal(next.manifest.application[0].activity[0].$["android:name"], PREVIEW);
}

{
  // An existing tools namespace must not be duplicated or changed.
  const m = templateManifest();
  (m.manifest.$ as any)["xmlns:tools"] = "http://schemas.android.com/tools";
  const next = apply(m);
  assert.equal(Object.keys(next.manifest.$).length, 2);
}

{
  // Refuse to silently overwrite an app-level declaration of the same activity.
  const m = templateManifest();
  m.manifest.application[0].activity.push({
    $: { "android:name": PREVIEW, "android:exported": "false" },
  } as any);
  assert.throws(() => apply(m), /refusing to overwrite/);
}

{
  assert.throws(() => apply({}), /missing <manifest>/);
  assert.throws(
    () => apply({ manifest: { $: {}, application: [{ $: { "android:name": ".Other" } }] } }),
    /MainApplication/
  );
}

console.log("withAndroidReleaseManifestHardening.test.ts: ok (CONFIG_PLUGIN_SOURCE)");
