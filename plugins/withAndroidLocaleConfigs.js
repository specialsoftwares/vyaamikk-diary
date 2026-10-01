const { withAppBuildGradle } = require("@expo/config-plugins");

/** Keep framework resources for every UI language in src/i18n/types.ts. */
const REQUIRED_LOCALES = ["en", "hi", "ta", "te", "gu"];
const RES_CONFIGS = `resConfigs ${REQUIRED_LOCALES.map((l) => `"${l}"`).join(", ")}`;
const REQUIRED_RE = /resConfigs\s+"en"\s*,\s*"hi"\s*,\s*"ta"\s*,\s*"te"\s*,\s*"gu"/;

function stripGroovyComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findDefaultConfigBlocks(source) {
  const blocks = [];
  const re = /defaultConfig\s*\{/g;
  let match;
  while ((match = re.exec(source))) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, open);
    if (close < 0) {
      throw new Error("LOCALE_PLUGIN: defaultConfig brace is unclosed");
    }
    blocks.push({
      headerStart: match.index,
      open,
      close,
      inner: source.slice(open + 1, close),
    });
  }
  return blocks;
}

function resConfigsDeclarations(innerCode) {
  return innerCode.match(/resConfigs\s+[^\n;]+/g) ?? [];
}

/**
 * Apply required locale resConfigs to a Groovy app build.gradle body.
 * Exported for source tests. Not evidence that resource shrinking works on device.
 */
function applyAndroidLocaleConfigsToGradle(contents, language) {
  if (language !== "groovy") {
    throw new Error("android/app/build.gradle must stay Groovy to set resConfigs");
  }
  if (typeof contents !== "string") {
    throw new Error("LOCALE_PLUGIN: gradle contents missing");
  }

  const blocks = findDefaultConfigBlocks(contents);
  if (blocks.length === 0) {
    throw new Error("LOCALE_PLUGIN: defaultConfig block not found");
  }
  if (blocks.length !== 1) {
    throw new Error("LOCALE_PLUGIN: expected exactly one defaultConfig block");
  }

  const block = blocks[0];
  const innerCode = stripGroovyComments(block.inner);
  const decls = resConfigsDeclarations(innerCode);
  const alreadyRequired = REQUIRED_RE.test(innerCode) && decls.length === 1;
  if (alreadyRequired) {
    return contents;
  }

  let nextInner = block.inner.replace(/^[ \t]*resConfigs\s+[^\n]*\n?/gm, "");
  if (stripGroovyComments(nextInner).includes("resConfigs")) {
    throw new Error("LOCALE_PLUGIN: ambiguous resConfigs in defaultConfig");
  }
  const insert = `\n        ${RES_CONFIGS}\n`;
  nextInner = insert + nextInner;
  return contents.slice(0, block.open + 1) + nextInner + contents.slice(block.close);
}

function withAndroidLocaleConfigs(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyAndroidLocaleConfigsToGradle(
      cfg.modResults.contents,
      cfg.modResults.language
    );
    return cfg;
  });
}

module.exports = withAndroidLocaleConfigs;
module.exports.applyAndroidLocaleConfigsToGradle = applyAndroidLocaleConfigsToGradle;
module.exports.REQUIRED_LOCALES = REQUIRED_LOCALES;
