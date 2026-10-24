import { currentAuthMutationGeneration } from "./authSessionFence";

/** Keeps an age response within the uid and auth generation that requested it. */
export async function applyCurrentAgeAssessment<T>(input: {
  generation: number;
  isCurrent: () => boolean;
  request: () => Promise<T>;
  apply: (result: T, generation: number) => Promise<unknown>;
}): Promise<T | null> {
  const owns = () => currentAuthMutationGeneration() === input.generation && input.isCurrent();
  if (!owns()) return null;
  const result = await input.request();
  if (!owns()) return null;
  await input.apply(result, input.generation);
  return owns() ? result : null;
}
