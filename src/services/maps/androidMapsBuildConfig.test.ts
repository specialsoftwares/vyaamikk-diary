/**
 * The public flag and the native Maps key come from one resolver.
 * Public extra must not contain the key. A helper test does not prove tiles.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  applyAndroidMapsToExpoConfig,
  resolveAndroidMapsBuild,
} = require("./androidMapsBuildConfig.js") as {
  applyAndroidMapsBuild?: unknown;
  applyAndroidMapsToExpoConfig: (
    config: { extra?: Record<string, unknown>; android?: { package?: string; config?: object } },
    raw: string | undefined
  ) => {
    extra: { androidGoogleMapsConfigured?: boolean; kept?: boolean };
    android?: { config?: { googleMaps?: { apiKey?: string } } };
  };
  resolveAndroidMapsBuild: (raw: string | undefined) => {
    configured: boolean;
    manifestApiKey: string | null;
  };
};

const root = path.join(import.meta.dirname, "../../..");
const sentinel = "maps-config-sentinel";

const missing = resolveAndroidMapsBuild(undefined);
assert.equal(missing.configured, false);
assert.equal(missing.manifestApiKey, null);
const present = resolveAndroidMapsBuild(`  ${sentinel}  `);
assert.equal(present.configured, true);
assert.equal(present.manifestApiKey, sentinel);

const base = { name: "Vyaamikk", extra: { kept: true }, android: { package: "com.example.app" } };
const without = applyAndroidMapsToExpoConfig(base, undefined);
assert.equal(without.extra.androidGoogleMapsConfigured, false);
assert.equal(without.extra.kept, true);
assert.equal(without.android?.config?.googleMaps, undefined);
assert.equal(JSON.stringify(without.extra).includes(sentinel), false);

const withKey = applyAndroidMapsToExpoConfig(base, sentinel);
assert.equal(withKey.extra.androidGoogleMapsConfigured, true);
assert.equal(withKey.android?.config?.googleMaps?.apiKey, sentinel);
assert.equal(JSON.stringify(withKey.extra).includes(sentinel), false);
assert.equal(
  Boolean(withKey.android?.config?.googleMaps?.apiKey),
  withKey.extra.androidGoogleMapsConfigured
);

const appConfig = require(path.join(root, "app.config.js")) as (args: {
  config: typeof base;
}) => ReturnType<typeof applyAndroidMapsToExpoConfig>;
const previous = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
try {
  delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const bare = appConfig({ config: base });
  assert.equal(bare.extra.androidGoogleMapsConfigured, false);
  assert.equal(bare.android?.config?.googleMaps, undefined);

  process.env.GOOGLE_MAPS_ANDROID_API_KEY = sentinel;
  const resolved = appConfig({ config: base });
  assert.equal(resolved.extra.androidGoogleMapsConfigured, true);
  assert.equal(resolved.android?.config?.googleMaps?.apiKey, sentinel);
  assert.equal(JSON.stringify(resolved.extra).includes(sentinel), false);
} finally {
  if (previous === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  else process.env.GOOGLE_MAPS_ANDROID_API_KEY = previous;
}

type AndroidManifest = {
  manifest: {
    application: {
      $: Record<string, string>;
      "meta-data"?: { $: Record<string, string> }[];
    }[];
  };
};

const { setGoogleMapsApiKey } = require("@expo/config-plugins/build/android/GoogleMapsApiKey.js") as {
  setGoogleMapsApiKey: (
    config: { android?: { config?: { googleMaps?: { apiKey?: string } } } },
    manifest: AndroidManifest
  ) => AndroidManifest;
};

function blankManifest(): AndroidManifest {
  return {
    manifest: {
      application: [{ $: { "android:name": ".MainApplication" } }],
    },
  };
}

function apiKeyValue(manifest: AndroidManifest): string | undefined {
  const items = manifest.manifest.application[0]?.["meta-data"] ?? [];
  return items.find((item) => item.$["android:name"] === "com.google.android.geo.API_KEY")?.$[
    "android:value"
  ];
}

const withManifest = blankManifest();
setGoogleMapsApiKey(
  { android: { config: { googleMaps: { apiKey: sentinel } } } },
  withManifest
);
assert.equal(apiKeyValue(withManifest), sentinel);

const withoutManifest = blankManifest();
setGoogleMapsApiKey({ android: { config: {} } }, withoutManifest);
assert.equal(apiKeyValue(withoutManifest), undefined);

function publicExpoConfig(envValue: string | undefined): {
  extra?: { androidGoogleMapsConfigured?: boolean };
} {
  const env = { ...process.env };
  if (envValue === undefined) delete env.GOOGLE_MAPS_ANDROID_API_KEY;
  else env.GOOGLE_MAPS_ANDROID_API_KEY = envValue;
  const result = spawnSync("npx", ["expo", "config", "--type", "public", "--json"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr?.slice(0, 400) ?? "expo config failed");
  return JSON.parse(result.stdout) as { extra?: { androidGoogleMapsConfigured?: boolean } };
}

const publicMissing = publicExpoConfig(undefined);
assert.equal(publicMissing.extra?.androidGoogleMapsConfigured, false);
assert.equal(JSON.stringify(publicMissing.extra ?? {}).includes(sentinel), false);

const publicPresent = publicExpoConfig(sentinel);
assert.equal(publicPresent.extra?.androidGoogleMapsConfigured, true);
assert.equal(JSON.stringify(publicPresent.extra ?? {}).includes(sentinel), false);

console.log("androidMapsBuildConfig.test.ts: ok — tiles are not claimed");
