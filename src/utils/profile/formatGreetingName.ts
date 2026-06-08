import type { ProfileSalutationId } from "@/domain/profileSalutation";

type SalutationLabelFn = (key: string) => string;

/** Dashboard / PDF display name with optional honorific prefix. */
export function formatGreetingName(
  displayName: string,
  salutation: ProfileSalutationId | null | undefined,
  t: SalutationLabelFn
): string {
  const name = displayName.trim();
  if (!name) return "";
  if (!salutation || salutation === "none") return name;
  const prefix = t(`profile.salutation.${salutation}`);
  return `${prefix} ${name}`;
}
