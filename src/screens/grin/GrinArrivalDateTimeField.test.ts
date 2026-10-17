/**
 * Injected-picker regressions for GrinArrivalDateTimeField.
 * Not NATIVE_DEVICE — does not claim native datetimepicker acceptance.
 */
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMountContainer } from "@/billing/quotaUpsell/quotaUpsellHost.fakeDom";
import { lightColors } from "@/theme/palettes";

import {
  GrinArrivalDateTimeField,
  isArrivalPickerSelection,
  type ArrivalDateTimePickerProps,
  type ArrivalPickerEvent,
} from "./GrinArrivalDateTimeField";
import { installGrinScreenRuntime } from "./grinScreenHooks";
import { installGrinSurfaces, type GrinSurfaces } from "./grinSurfaces";

assert.equal(isArrivalPickerSelection({ type: "set" }), true);
assert.equal(isArrivalPickerSelection({ type: "dismissed" }), false);
assert.equal(isArrivalPickerSelection({}), false);
assert.equal(isArrivalPickerSelection(undefined), false);

type Capture = {
  lastProps: ArrivalDateTimePickerProps | null;
  renders: number;
};

function makeInjected(cap: Capture) {
  return function InjectedPicker(props: ArrivalDateTimePickerProps) {
    cap.lastProps = props;
    cap.renders += 1;
    return React.createElement("div", { "data-picker": props.mode });
  };
}

function passthrough(tag: string) {
  return function Surface(props: Record<string, unknown> & { children?: React.ReactNode }) {
    return React.createElement(tag, null, props.children);
  };
}

function installSurfaces(presses: Map<string, () => void>, banners: string[]): void {
  const Button = (props: Record<string, unknown>) => {
    const key = String(props.label ?? "");
    if (typeof props.onPress === "function") presses.set(key, props.onPress as () => void);
    return React.createElement("button", { "data-press": key }, key);
  };
  const Banner = (props: Record<string, unknown>) => {
    banners.push(String(props.message ?? ""));
    return React.createElement("div", { "data-banner": true }, String(props.message ?? ""));
  };
  const surfaces: GrinSurfaces = {
    Screen: passthrough("div"),
    Header: passthrough("div"),
    Banner,
    Button,
    FormSection: passthrough("div"),
    TextField: passthrough("div"),
    SelectField: passthrough("div"),
    Card: passthrough("div"),
    EmptyState: passthrough("div"),
    View: passthrough("div"),
    Text: passthrough("span"),
    FlatList: passthrough("div"),
    IndigoChoiceChip: passthrough("button"),
    IndigoChoiceChipRow: passthrough("div"),
    StyleSheet: { create: (s) => s },
    Platform: { OS: "android" },
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
  installGrinSurfaces(surfaces);
  installGrinScreenRuntime({
    useT: () => (key) => key,
    useThemedStyles: (factory) => factory(lightColors),
    useRouter: () => ({
      back: () => undefined,
      push: () => undefined,
      replace: () => undefined,
    }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() => ({}) as T,
    useFocusEffect: () => undefined,
    getPickerHostAppState: () => "active",
  });
}

async function mountField(opts: {
  valueIso: string;
  onChangeIso: (iso: string) => void;
  DateTimePicker: React.ComponentType<ArrivalDateTimePickerProps> | null;
  presses: Map<string, () => void>;
  banners: string[];
}): Promise<{ root: Root; cleanup: () => void }> {
  installSurfaces(opts.presses, opts.banners);
  const container = createMountContainer();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(GrinArrivalDateTimeField, {
        label: "Reported arrival",
        valueIso: opts.valueIso,
        onChangeIso: opts.onChangeIso,
        DateTimePicker: opts.DateTimePicker,
      })
    );
  });
  return {
    root,
    cleanup: () => {
      act(() => root.unmount());
    },
  };
}

async function main(): Promise<void> {
  // --- Unavailable picker: no Change that only opens Done ---
  {
    const presses = new Map<string, () => void>();
    const banners: string[] = [];
    const changes: string[] = [];
    const original = "2026-03-15T10:30:45.123Z";
    const { cleanup } = await mountField({
      valueIso: original,
      onChangeIso: (iso) => changes.push(iso),
      DateTimePicker: null,
      presses,
      banners,
    });
    assert.equal(presses.has("grin.field.changeArrival"), false, "no Change when picker unavailable");
    assert.ok(
      banners.some((b) => b === "grin.field.arrivalPickerUnavailable"),
      "honest unavailable banner"
    );
    assert.deepEqual(changes, []);
    cleanup();
  }

  // --- Dismiss date with originalValue: must not commit or open time ---
  {
    const presses = new Map<string, () => void>();
    const banners: string[] = [];
    const changes: string[] = [];
    const original = "2026-03-15T10:30:45.123Z";
    const cap: Capture = { lastProps: null, renders: 0 };
    const { cleanup } = await mountField({
      valueIso: original,
      onChangeIso: (iso) => changes.push(iso),
      DateTimePicker: makeInjected(cap),
      presses,
      banners,
    });
    assert.ok(presses.has("grin.field.changeArrival"));
    await act(async () => {
      presses.get("grin.field.changeArrival")!();
    });
    assert.equal(cap.lastProps?.mode, "date");
    const dismissedDate = new Date(original);
    await act(async () => {
      cap.lastProps!.onChange({ type: "dismissed" } satisfies ArrivalPickerEvent, dismissedDate);
    });
    assert.deepEqual(changes, [], "dismiss date must not commit");
    // After dismiss, picker closed — no time step.
    assert.equal(cap.lastProps?.mode, "date");
    // Re-open should still be date (not stuck in time).
    await act(async () => {
      presses.get("grin.field.changeArrival")!();
    });
    assert.equal(cap.lastProps?.mode, "date");
    cleanup();
  }

  // --- Dismiss time with originalValue that has seconds/ms: must not zero them ---
  {
    const presses = new Map<string, () => void>();
    const banners: string[] = [];
    const changes: string[] = [];
    const original = "2026-03-15T10:30:45.123Z";
    const cap: Capture = { lastProps: null, renders: 0 };
    const { cleanup } = await mountField({
      valueIso: original,
      onChangeIso: (iso) => changes.push(iso),
      DateTimePicker: makeInjected(cap),
      presses,
      banners,
    });
    await act(async () => {
      presses.get("grin.field.changeArrival")!();
    });
    const selectedDay = new Date("2026-03-16T10:30:45.123Z");
    await act(async () => {
      cap.lastProps!.onChange({ type: "set" }, selectedDay);
    });
    assert.equal(cap.lastProps?.mode, "time", "date set advances to time");
    assert.deepEqual(changes, [], "date set alone must not commit until time confirmed");
    const timeOriginal = new Date("2026-03-16T11:45:45.123Z");
    await act(async () => {
      cap.lastProps!.onChange({ type: "dismissed" }, timeOriginal);
    });
    assert.deepEqual(changes, [], "dismiss time must not commit or zero seconds/ms");
    cleanup();
  }

  // --- Confirmed date + time selection commits once with preserved seconds/ms from draft ---
  {
    const presses = new Map<string, () => void>();
    const banners: string[] = [];
    const changes: string[] = [];
    const original = new Date(2026, 2, 15, 10, 30, 45, 123).toISOString();
    const cap: Capture = { lastProps: null, renders: 0 };
    const { cleanup } = await mountField({
      valueIso: original,
      onChangeIso: (iso) => changes.push(iso),
      DateTimePicker: makeInjected(cap),
      presses,
      banners,
    });
    await act(async () => {
      presses.get("grin.field.changeArrival")!();
    });
    await act(async () => {
      cap.lastProps!.onChange({ type: "set" }, new Date(2026, 3, 1, 10, 30, 45, 123));
    });
    await act(async () => {
      // Time picker often returns seconds=0; we preserve draft seconds/ms.
      cap.lastProps!.onChange({ type: "set" }, new Date(2026, 3, 1, 14, 15, 0, 0));
    });
    assert.equal(changes.length, 1);
    const committed = new Date(changes[0]!);
    assert.equal(committed.getFullYear(), 2026);
    assert.equal(committed.getMonth(), 3);
    assert.equal(committed.getDate(), 1);
    assert.equal(committed.getHours(), 14);
    assert.equal(committed.getMinutes(), 15);
    assert.equal(committed.getSeconds(), 45, "seconds preserved from draft, not zeroed");
    assert.equal(committed.getMilliseconds(), 123, "ms preserved from draft, not zeroed");
    cleanup();
  }

  // --- Reopen after cancel restores original for a fresh edit ---
  {
    const presses = new Map<string, () => void>();
    const banners: string[] = [];
    const changes: string[] = [];
    const originalDate = new Date(2026, 4, 1, 8, 0, 1, 500);
    const original = originalDate.toISOString();
    const cap: Capture = { lastProps: null, renders: 0 };
    const { cleanup } = await mountField({
      valueIso: original,
      onChangeIso: (iso) => changes.push(iso),
      DateTimePicker: makeInjected(cap),
      presses,
      banners,
    });
    await act(async () => {
      presses.get("grin.field.changeArrival")!();
    });
    await act(async () => {
      cap.lastProps!.onChange({ type: "set" }, new Date(2026, 4, 2, 8, 0, 1, 500));
    });
    await act(async () => {
      cap.lastProps!.onChange({ type: "dismissed" }, new Date(2026, 4, 2, 9, 0, 1, 500));
    });
    assert.deepEqual(changes, []);
    await act(async () => {
      presses.get("grin.field.changeArrival")!();
    });
    assert.equal(cap.lastProps?.mode, "date");
    assert.equal(
      cap.lastProps?.value.getTime(),
      originalDate.getTime(),
      "reopen uses original committed value"
    );
    cleanup();
  }

  console.log("GrinArrivalDateTimeField.test.ts: ok (INJECTED picker / not NATIVE_DEVICE)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
