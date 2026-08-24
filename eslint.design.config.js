// Design-system-only lint pass: enforces colour tokens without inheriting the
// project's broader (currently noisy) rule set, so CI can gate on it today.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import noHardcodedColors from "./eslint-rules/no-hardcoded-colors.js";

export default tseslint.config(
  { ignores: ["dist", "src/design-system/**", "**/*.mjs", "**/*.js"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    // react-hooks / @typescript-eslint are registered (rules stay off) so that
    // existing inline disable directives resolve instead of erroring.
    plugins: {
      gradr: { rules: { "no-hardcoded-colors": noHardcodedColors } },
      "react-hooks": reactHooks,
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "gradr/no-hardcoded-colors": "error" },
  },
);
