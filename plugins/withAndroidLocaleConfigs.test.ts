/**
 * Config-plugin source tests for Android locale resConfigs.
 * Not evidence that resource shrinking works on a device.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugin = require("./withAndroidLocaleConfigs.js") as {
  applyAndroidLocaleConfigsToGradle: (contents: string, language: string) => string;
};

const apply = plugin.applyAndroidLocaleConfigsToGradle;

const ANDROID = `
android {
    compileSdkVersion 35
    defaultConfig {
        applicationId "com.specialsoftwares.vyaamikkdiary"
        minSdkVersion 24
    }
}
`;

{
  const next = apply(ANDROID, "groovy");
  assert.match(next, /defaultConfig \{[\s\S]*resConfigs "en", "hi", "ta", "te", "gu"/);
  assert.match(next, /applicationId "com\.specialsoftwares\.vyaamikkdiary"/);
  const again = apply(next, "groovy");
  assert.equal(again, next, "already-correct declaration must be idempotent");
}

{
  const englishOnly = `
android {
    defaultConfig {
        resConfigs "en"
        applicationId "com.example"
    }
}
`;
  const next = apply(englishOnly, "groovy");
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu"/);
  assert.doesNotMatch(next, /resConfigs "en"\s*\n/);
  assert.match(next, /applicationId "com\.example"/);
}

{
  const semicolonSameLine = `
android {
    defaultConfig {
        resConfigs "en"; applicationId "com.example.preserved"
    }
}
`;
  const next = apply(semicolonSameLine, "groovy");
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu"; applicationId "com\.example\.preserved"/);
  const again = apply(next, "groovy");
  assert.equal(again, next);
}

{
  const neighbor = `
android {
    defaultConfig {
        resConfigs "en" minSdkVersion 24
        versionCode 22
    }
}
`;
  const next = apply(neighbor, "groovy");
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu" minSdkVersion 24/);
  assert.match(next, /versionCode 22/);
}

{
  const commented = `
android {
    defaultConfig {
        // resConfigs "en"
        applicationId "com.example"
    }
}
`;
  const next = apply(commented, "groovy");
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu"/);
  assert.match(next, /\/\/ resConfigs "en"/);
}

{
  const commentStructure = `
android {
    // defaultConfig { }
    defaultConfig {
        /* defaultConfig { } */
        applicationId "com.example"
    }
}
`;
  const next = apply(commentStructure, "groovy");
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu"/);
  assert.match(next, /\/\/ defaultConfig \{ \}/);
  assert.match(next, /\/\* defaultConfig \{ \} \*\//);
}

{
  const quotedBraces = `
android {
    defaultConfig {
        applicationId "weird{brace}"
        buildConfigField "String", "NOTE", "not resConfigs"
    }
}
`;
  const next = apply(quotedBraces, "groovy");
  assert.match(next, /applicationId "weird\{brace\}"/);
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu"/);
  assert.match(next, /"not resConfigs"/);
}

{
  const missing = `android {\n    compileSdkVersion 35\n}\n`;
  assert.throws(
    () => apply(missing, "groovy"),
    /LOCALE_PLUGIN: defaultConfig block not found/
  );
}

{
  const two = `
android {
    defaultConfig { applicationId "a" }
    defaultConfig { applicationId "b" }
}
`;
  assert.throws(() => apply(two, "groovy"), /exactly one defaultConfig/);
}

{
  assert.throws(
    () => apply("android { defaultConfig { applicationId \"x\" } }", "kotlin"),
    /must stay Groovy/
  );
}

{
  const unclosed = `android {\n    defaultConfig {\n        applicationId "x"\n`;
  assert.throws(() => apply(unclosed, "groovy"), /unclosed/);
}

{
  const blockComment = `
android {
    defaultConfig {
        /* resConfigs "en" */
        applicationId "com.example"
    }
}
`;
  const next = apply(blockComment, "groovy");
  assert.match(next, /resConfigs "en", "hi", "ta", "te", "gu"/);
  assert.match(next, /\/\* resConfigs "en" \*\//);
}

{
  const multiline = `
android {
    defaultConfig {
        resConfigs "en",
            "hi"
        applicationId "com.example"
    }
}
`;
  const before = multiline;
  assert.throws(() => apply(multiline, "groovy"), /unsupported resConfigs shape/);
  assert.equal(multiline, before, "unsupported shape must not return corrupted content");
}

{
  const kotlinish = `
android {
    defaultConfig {
        resConfigs += ["en"]
        applicationId "com.example"
    }
}
`;
  const before = kotlinish;
  assert.throws(() => apply(kotlinish, "groovy"), /unsupported resConfigs shape/);
  assert.equal(kotlinish, before);
}

console.log("withAndroidLocaleConfigs.test.ts: ok (CONFIG_PLUGIN_SOURCE)");
