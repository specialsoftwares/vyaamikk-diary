/**
 * Selected tab comes from the navigator state, never from a separate highlight.
 * Android Back is handled by the tab router (`backBehavior="history"`), whose
 * empty-history result is the initial route, not route zero.
 */

export type TabRouteState = {
  index: number;
  routes: { key: string; name: string }[];
  history?: { type: string; key?: string }[];
};

export function selectedTabRouteName(state: TabRouteState): string | null {
  const route = state.routes[state.index];
  return route?.name ?? null;
}
