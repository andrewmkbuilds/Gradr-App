/**
 * Gradr design-system guard: `<Text>` must be the design-system component.
 *
 * TypeScript does NOT catch this: the DOM lib declares a global `Text`
 * constructor, so a JSX `<Text>` with no import silently resolves to
 * `lib.dom`'s `Text` and only blows up later with TS2607/TS2786 — or worse,
 * ships. This rule fails in the editor the moment the import is missing,
 * instead of waiting for the CI script (scripts/check-ds-text-import.mjs).
 *
 * A local declaration (component, variable, parameter, or a `Text` imported
 * from anywhere) is accepted — the rule only rejects the *unbound* case that
 * falls through to the DOM global.
 */

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an in-scope Text binding (the design-system Text) for JSX <Text> usage.",
    },
    schema: [],
    messages: {
      unbound:
        '<Text> has no local binding, so it resolves to the DOM `Text` constructor. Add: import { Text } from "@/design-system/gradr-9b9b95";',
    },
  },

  create(context) {
    /** @type {import("estree").Node[]} */
    const usages = [];

    return {
      JSXOpeningElement(node) {
        if (node.name?.type === "JSXIdentifier" && node.name.name === "Text") {
          usages.push(node.name);
        }
      },

      "Program:exit"(program) {
        if (usages.length === 0) return;

        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const globalScope = sourceCode.scopeManager.globalScope;

        // A module-level or imported `Text` is a real binding; anything the
        // scope analyser only knows as a "through" reference is the DOM global.
        const hasBinding = [globalScope, ...(globalScope?.childScopes ?? [])].some((scope) =>
          scope.variables.some((v) => v.name === "Text" && v.defs.length > 0),
        );

        if (hasBinding) return;

        for (const node of usages) {
          context.report({ node, messageId: "unbound" });
        }
      },
    };
  },
};
