
import { __setRuntimeSignalsForTests, env, isFirebaseConfigured } from "@/config/env";
import { findLegalConfigBlockers } from "@/config/legal";
import { findPublicLinkBlockers } from "@/config/publicLinks";
import { evaluateProductionConfig } from "@/startup/guards";

__setRuntimeSignalsForTests({ appOwnership: "standalone", isDev: false, platform: "android" });

const all = findLegalConfigBlockers();
const filtered = all.filter((b) =>
  b.includes("example.com") ||
  b.includes(".example") ||
  b.includes("support email") ||
  b.includes("privacy:") ||
  b.includes("terms:") ||
  b.includes("accountDeletion:") ||
  b.includes("download:") ||
  b.includes("forbidden") ||
  b.includes("/auth")
);
const result = evaluateProductionConfig();
const support = env.brand.supportEmail;
const domain = support.includes("@") ? support.split("@")[1] : "(none)";
const status = result.ok ? "PRODUCTION_CONFIG_VALID" : "PRODUCTION_CONFIG_INVALID";
console.log(status);
console.log("blockers=" + filtered.length);
console.log(JSON.stringify({
  ok: result.ok,
  code: result.ok ? null : ("code" in result ? result.code : null),
  message: result.ok ? null : ("message" in result ? result.message : null),
  firebaseConfigured: isFirebaseConfigured(),
  supportEmailDomain: domain,
  filteredBlockers: filtered.map((b) =>
    b.replace(support, "***@" + domain).replace(/Placeholder or invalid support email:.*/, "support_email_placeholder")
  ),
  publicLinkBlockers: findPublicLinkBlockers(),
  ignoredNonGuardPlaceholders: all.filter((b) => !filtered.includes(b)).map((b) =>
    b.startsWith("Grievance") ? "grievance_name_placeholder" :
    b.includes("registered address") ? "address_placeholder" : b
  ),
}, null, 2));
if (!result.ok || filtered.length !== 0) process.exit(2);
