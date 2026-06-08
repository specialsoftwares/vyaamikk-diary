/** Ensures only one swipe row stays open at a time across the app. */
let activeCloser: (() => void) | null = null;

export function notifySwipeRowOpened(close: () => void): void {
  if (activeCloser && activeCloser !== close) {
    activeCloser();
  }
  activeCloser = close;
}

export function notifySwipeRowClosed(close: () => void): void {
  if (activeCloser === close) {
    activeCloser = null;
  }
}
