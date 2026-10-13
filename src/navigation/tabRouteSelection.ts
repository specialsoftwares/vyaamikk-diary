/**
 * Selected tab comes from the navigator state, never from a separate highlight.
 * Android Back leaves a non-root tab for the previous one, then the start tab.
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

/**
 * Route name Back should open, or null when the start tab is already focused
 * and the system should leave the app.
 */
export function previousTabRouteName(state: TabRouteState): string | null {
  const current = state.routes[state.index];
  if (!current) return null;
  const history = state.history ?? [];
  if (history.length >= 2) {
    const prevKey = history[history.length - 2]?.key;
    const prev = prevKey ? state.routes.find((route) => route.key === prevKey) : undefined;
    if (prev && prev.name !== current.name) return prev.name;
  }
  if (state.index > 0) return state.routes[0]?.name ?? null;
  return null;
}
