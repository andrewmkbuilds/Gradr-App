import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import noHardcodedColors from "./eslint-rules/no-hardcoded-colors.js";
import noRawVerticalSpacing from "./eslint-rules/no-raw-vertical-spacing.js";


export default tseslint.config(
  // The vendored design system owns the raw token values; app code may not.
  { ignores: ["dist", "src/design-system/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      gradr: {
        rules: {
          "no-hardcoded-colors": noHardcodedColors,
          "no-raw-vertical-spacing": noRawVerticalSpacing,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Design system guard: colour comes from tokens, never from raw values
      // or Tailwind's default palette.
      "gradr/no-hardcoded-colors": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Architecture guard: Gradr stays on Vite + React Router.
      // React Router, React Query and TanStack Table remain allowed.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@tanstack/start",
                "@tanstack/start/*",
                "@tanstack/start-*",
                "@tanstack/react-start",
                "@tanstack/react-start/*",
                "@tanstack/react-router",
                "@tanstack/react-router/*",
                "@tanstack/router",
                "@tanstack/router/*",
              ],
              message:
                "TanStack Start / TanStack Router are not allowed in Gradr. Use react-router-dom — see README 'Architecture boundaries'.",
            },
          ],
        },
      ],
    },

  },
  {
    // Public surfaces share one fluid vertical rhythm — fixed py-12 / mt-16 /
    // space-y-10 stack into empty bands at some breakpoint.
    // See docs/vertical-rhythm.md.
    files: [
      "src/surfaces/**/*.tsx",
      "src/pages/legal/**/*.tsx",
      "src/pages/blog/**/*.tsx",
      "src/components/PublicShell.tsx",
      "src/pages/AiCareerCoach.tsx",
      "src/pages/AtsResumeChecker.tsx",
      "src/pages/AiCoverLetterGenerator.tsx",
      "src/pages/AiInterviewCoach.tsx",
      "src/pages/JobApplicationTracker.tsx",
      "src/pages/JobSearchIndex.tsx",
      "src/pages/JobLanding.tsx",
      "src/pages/GuideArticle.tsx",
      "src/pages/CareerAdvice.tsx",
      "src/pages/Pricing.tsx",
      "src/pages/AffiliateProgram.tsx",
    ],
    rules: { "gradr/no-raw-vertical-spacing": "error" },
  },
  {
    // HTML email clients do not support CSS custom properties, so the
    // transactional templates must inline literal brand hex values.
    files: ["supabase/functions/_shared/transactional-email-templates/**"],
    rules: { "gradr/no-hardcoded-colors": "off" },
  },
);
