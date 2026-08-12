// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".expo/**",
      ".expo-export-audit/**",
      "builds/**",
      "functions/lib/**",
      "coverage/**",
      "android/**",
      "ios/**",
    ],
  },
  {
    // Correctness-focused overrides — avoid stylistic mass rewrites.
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-duplicate-imports": "error",
      "eqeqeq": ["error", "smart"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Metro only inlines static process.env.EXPO_PUBLIC_* (dot access).
      "expo/no-dynamic-env-var": "error",
    },
  },
]);
