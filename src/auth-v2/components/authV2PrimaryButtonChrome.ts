export type AuthV2PrimaryChrome = "active" | "muted";

/** Loading keeps the enabled footprint; only idle+disabled uses muted chrome. */
export function resolveAuthV2PrimaryChrome(input: {
  disabled?: boolean;
  loading?: boolean;
}): AuthV2PrimaryChrome {
  if (input.loading) return "active";
  if (input.disabled) return "muted";
  return "active";
}
