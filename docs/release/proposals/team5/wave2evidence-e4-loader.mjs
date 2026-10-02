/**
 * Team 5 host loader. Intercepts `expo-image-picker` so productionPick can run
 * on SQLITE_HOST / host filesystem. Not NATIVE_DEVICE. Not a committed native stub.
 */

const fake = new URL("./wave2evidence-e4-fake-picker.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "expo-image-picker") {
    return { shortCircuit: true, url: fake };
  }
  return nextResolve(specifier, context);
}
