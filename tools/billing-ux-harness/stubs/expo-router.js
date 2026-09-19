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
  useNavigation: () => ({
    canGoBack: () => false,
    goBack: () => undefined,
    addListener: () => () => undefined,
    setOptions: () => undefined,
    dispatch: () => undefined,
  }),
  Stack: passthrough,
  Slot: passthrough,
  Redirect: () => null,
  Link: passthrough,
};
