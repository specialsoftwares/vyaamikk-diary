const { withAppBuildGradle } = require("@expo/config-plugins");

/** Keep framework resources for every UI language in src/i18n/types.ts. */
const REQUIRED_LOCALES = ["en", "hi", "ta", "te", "gu"];
const RES_CONFIGS = `resConfigs ${REQUIRED_LOCALES.map((l) => `"${l}"`).join(", ")}`;
const LOCALE_TOKEN = /"(?:en|hi|ta|te|gu)"/;
const WS = "[ \\t]+";
const WS0 = "[ \\t]*";
const DECL_RE = new RegExp(
  `^resConfigs${WS}${LOCALE_TOKEN.source}(?:${WS0},${WS0}${LOCALE_TOKEN.source})*(?:${WS0};)?`
);
const REQUIRED_RE = new RegExp(
  `^resConfigs${WS}"en"${WS0},${WS0}"hi"${WS0},${WS0}"ta"${WS0},${WS0}"te"${WS0},${WS0}"gu"(?:${WS0};)?$`
);

function maskGroovyIgnorables(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      const last = end < 0 ? source.length : end + 2;
      out += " ".repeat(last - i);
      i = last;
      continue;
    }
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      const last = end < 0 ? source.length : end;
      out += " ".repeat(last - i);
      i = last;
      continue;
    }
    const quote = source[i] === '"' || source[i] === "'" ? source[i] : null;
    if (quote) {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += " ".repeat(j - i);
      i = j;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function findMatchingBrace(masked, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findDefaultConfigBlocks(source) {
  const masked = maskGroovyIgnorables(source);
  const blocks = [];
  const re = /defaultConfig\s*\{/g;
  let match;
  while ((match = re.exec(masked))) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(masked, open);
    if (close < 0) {
      throw new Error("LOCALE_PLUGIN: defaultConfig brace is unclosed");
    }
    blocks.push({
      open,
      close,
      inner: source.slice(open + 1, close),
      maskedInner: masked.slice(open + 1, close),
    });
  }
  return blocks;
}

function findResConfigsSpans(inner, maskedInner) {
  const spans = [];
  const re = /\bresConfigs\b/g;
  let match;
  while ((match = re.exec(maskedInner))) {
    const index = match.index;
    const slice = inner.slice(index);
    const declMatch = slice.match(DECL_RE);
    if (!declMatch) {
      throw new Error("LOCALE_PLUGIN: unsupported resConfigs shape");
    }
    const text = declMatch[0];
    const after = slice.slice(text.length);
    if (/^[ \t]*,/.test(after) || /^[ \t]*"/.test(after)) {
      throw new Error("LOCALE_PLUGIN: unsupported resConfigs shape");
    }
    spans.push({ index, text });
  }
  return spans;
}

/**
 * Apply required locale resConfigs to a Groovy app build.gradle body.
 * Replaces only a recognized locale declaration. Not a Groovy parser.
 * Not evidence that resource shrinking works on device.
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
  const spans = findResConfigsSpans(block.inner, block.maskedInner);
  if (spans.length > 1) {
    throw new Error("LOCALE_PLUGIN: ambiguous resConfigs in defaultConfig");
  }

  if (spans.length === 1) {
    const span = spans[0];
    if (REQUIRED_RE.test(span.text.trim())) {
      return contents;
    }
    const hadSemi = span.text.trim().endsWith(";");
    const replacement = hadSemi ? `${RES_CONFIGS};` : RES_CONFIGS;
    const nextInner =
      block.inner.slice(0, span.index) + replacement + block.inner.slice(span.index + span.text.length);
    return contents.slice(0, block.open + 1) + nextInner + contents.slice(block.close);
  }

  const insert = `\n        ${RES_CONFIGS}\n`;
  return contents.slice(0, block.open + 1) + insert + block.inner + contents.slice(block.close);
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
