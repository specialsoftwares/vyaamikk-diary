/**
 * Tab Back uses the router history. Navigating to the previous tab would
 * push it again and bounce. An empty history returns null so the system
 * can leave the app. Route zero is Calendar; the start route is You.
 * A letterhead screen on the parent stack pops on its own Back.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { StackRouter, TabActions, TabRouter } from "@react-navigation/routers";

const tabNames = ["calendar", "you", "saved-records", "settings"];
type RouteState = {
  index: number;
  routes: { key: string; name: string }[];
  history?: { key?: string }[];
};

const tabOptions = {
  routeNames: tabNames,
  routeParamList: {},
  routeGetIdList: {},
} as never;
const tabs = TabRouter({ initialRouteName: "you", backBehavior: "history" });

function historyNames(state: {
  history?: { key?: string }[];
  routes: { key: string; name: string }[];
}): string[] {
  return (state.history ?? []).map(
    (item) => state.routes.find((route) => route.key === item.key)?.name ?? ""
  );
}

let state = tabs.getInitialState(tabOptions) as RouteState;
assert.equal(state.routes[0]?.name, "calendar");
assert.equal(state.routes[state.index]?.name, "you");
assert.equal(tabs.getStateForAction(state as never, { type: "GO_BACK" }, tabOptions), null);

function jump(name: string): void {
  const next = tabs.getStateForAction(state as never, TabActions.jumpTo(name), tabOptions) as RouteState | null;
  assert.ok(next, name);
  state = next;
}

jump("calendar");
jump("settings");
jump("saved-records");
assert.deepEqual(historyNames(state), ["you", "calendar", "settings", "saved-records"]);

function back(): string | null {
  const next = tabs.getStateForAction(state as never, { type: "GO_BACK" }, tabOptions) as RouteState | null;
  if (!next) return null;
  state = next;
  return state.routes[state.index]?.name ?? null;
}

assert.equal(back(), "settings");
assert.equal(back(), "calendar");
assert.equal(back(), "you");
assert.equal(back(), null);
assert.deepEqual(historyNames(state), ["you"]);

jump("settings");
const bounced = tabs.getStateForAction(state as never, TabActions.jumpTo("you"), tabOptions) as RouteState | null;
assert.ok(bounced);
assert.equal(bounced.routes[bounced.index]?.name, "you");
const returnToSettings = tabs.getStateForAction(bounced as never, { type: "GO_BACK" }, tabOptions) as RouteState | null;
assert.equal(returnToSettings?.routes[returnToSettings.index]?.name, "settings");

const stack = StackRouter({});
const stackOptions = {
  routeNames: ["tabs", "letterhead"],
  routeParamList: {},
  routeGetIdList: {},
} as never;
let stackState = stack.getInitialState(stackOptions) as RouteState;
assert.equal(stackState.routes[stackState.index]?.name, "tabs");
const opened = stack.getStateForAction(
  stackState as never,
  { type: "NAVIGATE", payload: { name: "letterhead" } },
  stackOptions
) as RouteState | null;
assert.ok(opened);
assert.equal(opened.routes[opened.index]?.name, "letterhead");
const closed = stack.getStateForAction(opened as never, { type: "GO_BACK" }, stackOptions) as RouteState | null;
assert.equal(closed?.routes[closed.index]?.name, "tabs");
assert.equal(closed?.index, stackState.index);

const root = path.join(import.meta.dirname, "../..");
const tabBar = fs.readFileSync(path.join(root, "src/navigation/AppTabBar.tsx"), "utf8");
const layout = fs.readFileSync(path.join(root, "app/(app)/(tabs)/_layout.tsx"), "utf8");
const createScreen = fs.readFileSync(path.join(root, "app/(app)/letterhead/create.tsx"), "utf8");
assert.doesNotMatch(tabBar, /BackHandler/);
assert.doesNotMatch(tabBar, /hardwareBackPress/);
assert.match(layout, /initialRouteName="you"/);
assert.match(layout, /backBehavior="history"/);
assert.match(createScreen, /draftPayloadToLetterheadInput/);
assert.match(createScreen, /isShareSheetCancellation/);
assert.doesNotMatch(createScreen, /saveLetterheadCreateWithPdf|buildLetterheadHtml/);

console.log("tabHistoryBack.test.ts: ok");
