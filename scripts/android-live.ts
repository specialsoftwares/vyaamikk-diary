/**
 * Android live-development helper.
 *
 * Primary: physical USB/Wi‑Fi ADB device + existing development-client install.
 * Secondary: emulator (UI / Firebase Console test phones).
 *
 * - Validates local `.env` has APP_MODE=production (required by expo/virtual/env)
 * - Prefers a connected physical device; starts AVD only if none present
 * - Starts `npm run start:prod-dev-client` if Metro is not already up
 * - Opens the installed development client against the current Metro URL
 *
 * Does not build APKs, does not print secrets, does not weaken production guards.
 * Does not enable FIREBASE_PHONE_AUTH_TEST_MODE (use start:prod-dev-client:firebase-test-phones).
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

const PKG = "com.specialsoftwares.vyaamikkdiary";
const AVD = "Vyaamikk_Pixel_API35";
const PORT = 8081;

function log(msg: string): void {
  console.log(`[android:live] ${msg}`);
}

function fail(msg: string): never {
  console.error(`[android:live] ${msg}`);
  process.exit(1);
}

function sh(cmd: string, args: string[], opts?: { allowFail?: boolean }): string {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    if (opts?.allowFail) return "";
    throw e;
  }
}

function readAppModeFromEnvFile(): string {
  if (!existsSync(".env")) {
    fail(".env missing. Copy .env.example → .env and fill Firebase public config.");
  }
  const text = readFileSync(".env", "utf8");
  const m = text.match(/^EXPO_PUBLIC_APP_MODE\s*=\s*(.*)$/m);
  if (!m) fail("EXPO_PUBLIC_APP_MODE missing from .env");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function firebaseKeysPresent(): boolean {
  if (!existsSync(".env")) return false;
  const text = readFileSync(".env", "utf8");
  const keys = [
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "EXPO_PUBLIC_FIREBASE_APP_ID",
  ];
  return keys.every((k) => {
    const m = text.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, "m"));
    if (!m) return false;
    const v = m[1].trim().replace(/^["']|["']$/g, "");
    return v.length > 0;
  });
}

function supportEmailSafe(): boolean {
  if (!existsSync(".env")) return false;
  const text = readFileSync(".env", "utf8");
  const m = text.match(/^EXPO_PUBLIC_SUPPORT_EMAIL\s*=\s*(.*)$/m);
  if (!m) return false;
  const v = m[1].trim().replace(/^["']|["']$/g, "");
  if (!v) return false;
  return !/\.example/i.test(v) && !/your@/i.test(v);
}

function lanIpv4(): string {
  const nets = networkInterfaces();
  const prefer = ["en0", "en1", "eth0"];
  for (const name of prefer) {
    for (const n of nets[name] ?? []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return "127.0.0.1";
}

function adbDevices(): string[] {
  const out = sh("adb", ["devices"], { allowFail: true });
  return out
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]!);
}

function classifyDevices(): { physical: string[]; emulators: string[] } {
  const all = adbDevices();
  return {
    physical: all.filter((d) => !d.startsWith("emulator-")),
    emulators: all.filter((d) => d.startsWith("emulator-")),
  };
}

/**
 * Physical devices need the Mac LAN IP.
 * Emulator-only sessions use 10.0.2.2 (stable across Wi‑Fi IP changes).
 */
function metroHostForTarget(kind: "physical" | "emulator"): string {
  return kind === "emulator" ? "10.0.2.2" : lanIpv4();
}

function ensureEmulator(): string {
  const { emulators } = classifyDevices();
  if (emulators.length > 0) {
    log(`emulator already connected: ${emulators.join(", ")}`);
    return emulators[0]!;
  }
  const avds = sh("emulator", ["-list-avds"], { allowFail: true })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!avds.includes(AVD)) {
    fail(`AVD ${AVD} not found. Available: ${avds.join(", ") || "(none)"}`);
  }
  log(`starting AVD ${AVD} (detached)...`);
  const child = spawn("emulator", ["-avd", AVD], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const boot = sh("adb", ["shell", "getprop", "sys.boot_completed"], {
      allowFail: true,
    });
    const { emulators: now } = classifyDevices();
    if (boot === "1" && now.length > 0) {
      log("emulator boot_completed=1");
      return now[0]!;
    }
    sh("sleep", ["3"], { allowFail: true });
  }
  fail("emulator did not reach device/boot_completed in time");
}

/** Prefer physical phone; fall back to emulator for secondary UI / test-phone work. */
function resolveTarget(): { serial: string; kind: "physical" | "emulator" } {
  const { physical, emulators } = classifyDevices();
  if (physical.length > 0) {
    log(`using physical device (primary): ${physical[0]}`);
    if (emulators.length > 0) {
      log(`emulator also present (${emulators.join(", ")}) — ignored for this session`);
    }
    return { serial: physical[0]!, kind: "physical" };
  }
  log("no physical ADB device — falling back to emulator (secondary)");
  const serial = ensureEmulator();
  return { serial, kind: "emulator" };
}

function metroListening(): boolean {
  try {
    const out = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], {
      allowFail: true,
    });
    return out.includes(`:${PORT}`);
  } catch {
    return false;
  }
}

function ensurePackageInstalled(serial: string): void {
  const path = sh("adb", ["-s", serial, "shell", "pm", "path", PKG], {
    allowFail: true,
  });
  if (!path.includes("package:")) {
    fail(
      `${PKG} is not installed on ${serial}. Install the existing development-client APK once ` +
        `(same package/signing — no new EAS build from this script).`
    );
  }
  log(`${PKG} installed on ${serial}`);
}

function openDevClient(serial: string, ip: string): void {
  const url = `exp+vyaamikk-diary://expo-development-client/?url=http%3A%2F%2F${ip}%3A${PORT}`;
  log(`opening development client on ${serial} → Metro ${ip}:${PORT}`);
  sh("adb", ["-s", serial, "shell", "am", "force-stop", PKG], { allowFail: true });
  sh("adb", [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url,
    PKG,
  ]);
}

function startMetroForeground(serial: string, kind: "physical" | "emulator"): void {
  log("starting npm run start:prod-dev-client (foreground — keep this terminal open)");
  const child = spawn("npm", ["run", "start:prod-dev-client"], {
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_PUBLIC_APP_MODE: "production",
    },
  });
  const ip = metroHostForTarget(kind);
  const opener = setInterval(() => {
    if (!metroListening()) return;
    clearInterval(opener);
    try {
      openDevClient(serial, ip);
    } catch (e) {
      console.error(e);
    }
  }, 2000);
  setTimeout(() => clearInterval(opener), 180_000);

  child.on("exit", (code) => {
    clearInterval(opener);
    process.exit(code ?? 1);
  });
}

function main(): void {
  const mode = readAppModeFromEnvFile();
  if (mode !== "production") {
    fail(
      `EXPO_PUBLIC_APP_MODE in .env is "${mode}". Development-client Metro requires production ` +
        `(expo/virtual/env merges .env over shell). Update .env and re-run.`
    );
  }
  if (!firebaseKeysPresent()) {
    fail("One or more EXPO_PUBLIC_FIREBASE_* values are empty in .env (names checked only).");
  }
  if (!supportEmailSafe()) {
    fail(
      "EXPO_PUBLIC_SUPPORT_EMAIL is missing or still uses an .example placeholder. " +
        "Use the real public support address (see .env.example)."
    );
  }
  log("local .env APP_MODE=production; Firebase public keys present; support email ok");

  const target = resolveTarget();
  ensurePackageInstalled(target.serial);

  if (metroListening()) {
    log(`Metro already listening on ${PORT} — reusing`);
    openDevClient(target.serial, metroHostForTarget(target.kind));
    log("done (Metro left running)");
    return;
  }

  startMetroForeground(target.serial, target.kind);
}

main();
