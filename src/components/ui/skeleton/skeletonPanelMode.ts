export type SkeletonPanelMode = "hidden" | "skeleton" | "skeleton-and-slow" | "content";

/**
 * Loading decision shared by SkeletonLoadingPanel and list/dashboard screens.
 *
 * Panel children are the skeleton, not the page, so the panel calls this with
 * `hasContent = false`. A screen passes `hasContent` when it already has rows:
 * refresh stays on "content" and must not be replaced by a skeleton.
 *
 * - usable content (including a refresh): "content"
 * - not loading and nothing to show: "hidden" (empty or error UI lives outside)
 * - initial load: "skeleton"
 * - initial load past the slow threshold: "skeleton-and-slow" (skeleton stays)
 */
export function skeletonPanelMode(
  loading: boolean,
  slow: boolean,
  hasContent: boolean
): SkeletonPanelMode {
  if (hasContent) return "content";
  if (!loading) return "hidden";
  return slow ? "skeleton-and-slow" : "skeleton";
}
