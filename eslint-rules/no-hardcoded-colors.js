/**
 * ESLint rule: block hardcoded colour values in class names and styles.
 *
 * Colour must come from the Gradr design system — semantic tokens
 * (`bg-primary`, `text-muted-foreground`, `border-border`, …) or brand tokens
 * (`harbor`, `hull`, `shell`, `fog`, `ink`, `slate`, `success`, …). Raw hex /
 * rgb / hsl literals and Tailwind default-palette utilities (`bg-slate-800`,
 * `text-emerald-500`) cannot react to the theme and are rejected.
 *
 * Escape hatch: add `// eslint-disable-next-line gradr/no-hardcoded-colors`
 * with a comment explaining the deliberate deviation.
 */
const PALETTE = [
  "slate", "gray", "grey", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo",
  "violet", "purple", "fuchsia", "pink", "rose",
].join("|");

const PREFIX = "bg|text|border|ring|outline|divide|fill|stroke|shadow|from|via|to|decoration|accent|caret|placeholder";

const PATTERNS = [
  {
    id: "palette",
    re: new RegExp(`\\b(?:${PREFIX})-(?:${PALETTE})-\\d{2,3}\\b`, "g"),
    message:
      'Tailwind palette colour "{{match}}" bypasses the design system. Use a semantic token (bg-primary, text-muted-foreground, border-border, …).',
  },
  {
    id: "arbitrary",
    re: new RegExp(`\\b(?:${PREFIX})-\\[(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\\([^\\]]*\\))\\]`, "g"),
    message:
      'Hardcoded colour "{{match}}" bypasses the design system. Use a design-system token instead.',
  },
];

// Token-driven values such as `hsl(var(--primary) / 0.9)` are legal; only raw
// hex literals and numeric rgb()/hsl() colours are rejected.
const HEX_IN_STYLE = /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\(\s*[\d.]/;
const STYLE_COLOR_PROPS = new Set([
  "color", "backgroundColor", "borderColor", "background", "fill", "stroke",
  "outlineColor", "boxShadow", "borderTopColor", "borderBottomColor",
  "borderLeftColor", "borderRightColor",
]);

function checkString(context, node, value) {
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let hit;
    while ((hit = pattern.re.exec(value))) {
      context.report({ node, message: pattern.message.replace("{{match}}", hit[0]) });
    }
  }
}

/** Walks a string literal / template literal / conditional for class strings. */
function walk(context, node, seen = new Set()) {
  if (!node || seen.has(node)) return;
  seen.add(node);
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") checkString(context, node, node.value);
      break;
    case "TemplateLiteral":
      node.quasis.forEach((q) => checkString(context, node, q.value.raw));
      node.expressions.forEach((e) => walk(context, e, seen));
      break;
    case "JSXExpressionContainer":
      walk(context, node.expression, seen);
      break;
    case "ConditionalExpression":
      walk(context, node.consequent, seen);
      walk(context, node.alternate, seen);
      break;
    case "LogicalExpression":
    case "BinaryExpression":
      walk(context, node.left, seen);
      walk(context, node.right, seen);
      break;
    case "ArrayExpression":
      node.elements.forEach((e) => walk(context, e, seen));
      break;
    case "ObjectExpression":
      node.properties.forEach((p) => p.key && walk(context, p.key, seen));
      break;
    case "CallExpression":
      node.arguments.forEach((a) => walk(context, a, seen));
      break;
    default:
      break;
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hardcoded colours; require Gradr design-system tokens.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (name === "className" || name === "class") {
          walk(context, node.value);
          return;
        }
        if (name !== "style" || !node.value || node.value.type !== "JSXExpressionContainer") return;
        const expr = node.value.expression;
        if (!expr || expr.type !== "ObjectExpression") return;
        for (const prop of expr.properties) {
          if (prop.type !== "Property" || !prop.key) continue;
          const key = prop.key.name ?? prop.key.value;
          if (!STYLE_COLOR_PROPS.has(key)) continue;
          const value = prop.value;
          const raw =
            value.type === "Literal" && typeof value.value === "string"
              ? value.value
              : value.type === "TemplateLiteral"
                ? value.quasis.map((q) => q.value.raw).join("")
                : "";
          if (raw && HEX_IN_STYLE.test(raw)) {
            context.report({
              node: prop,
              message: `Inline style "${key}" uses a hardcoded colour. Use a design-system token (e.g. hsl(var(--primary))).`,
            });
          }
        }
      },
      // cva()/cn()/clsx() class strings outside JSX.
      CallExpression(node) {
        const callee = node.callee;
        const name = callee.type === "Identifier" ? callee.name : null;
        if (!["cn", "clsx", "cva", "twMerge", "classNames"].includes(name)) return;
        node.arguments.forEach((arg) => walk(context, arg));
      },
    };
  },
};
