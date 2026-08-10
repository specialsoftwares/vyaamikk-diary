export function formatLocationCardLines(input: {
  locality: string | null;
  district: string;
  state: string;
}): { title: string; subtitle: string } {
  const title = (input.locality ?? "").trim() || input.district.trim();
  const subtitle = [input.district.trim(), input.state.trim()].filter(Boolean).join(" · ");
  return { title, subtitle };
}
