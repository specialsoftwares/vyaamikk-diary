/** Harness-only stub. Production app uses real expo-router. */
const React = require("react");

function passthrough({ children }) {
  return children ?? null;
}

module.exports = {
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/",
  Stack: passthrough,
  Slot: passthrough,
  Redirect: () => null,
  Link: passthrough,
};
