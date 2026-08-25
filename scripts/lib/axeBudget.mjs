/**
 * Accessibility budget.
 *
 * CI should fail on *new* accessibility debt, not on the backlog that already
 * exists — otherwise every unrelated PR is red and the signal is ignored.
 * tests/a11y/axe-budget.json records the accepted count per surface and rule;
 * anything above the allowance, or above the global severity limits, fails.
 * Full axe JSON is still written for every surface and uploaded as an artifact.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BUDGET_FILE = "tests/a11y/axe-budget.json";

const DEFAULTS = {
  // Impacts that count towards the budget at all.
  blockingImpacts: ["critical", "serious"],
  // Hard ceilings across the whole run, applied to unbudgeted violations.
  maxNewCritical: 0,
  maxNewSerious: 0,
  surfaces: {},
};

export function loadBudget(root = process.cwd()) {
  const file = join(root, BUDGET_FILE);
  if (!existsSync(file)) return { ...DEFAULTS };
  return { ...DEFAULTS, ...JSON.parse(readFileSync(file, "utf8")) };
}

/**
 * Compares one surface's violations against its allowance.
 *
 * @param {object} budget   loaded budget
 * @param {string} surface  stable surface key (e.g. "auth-desktop")
 * @param {Array}  violations  axe violations ({ id, impact, nodes })
 * @returns {{ ok: boolean, overBudget: Array, blocking: Array, ignored: Array, summary: string }}
 */
export function evaluateSurface(budget, surface, violations) {
  const allowances = budget.surfaces?.[surface]?.allow ?? {};
  const blockingImpacts = new Set(budget.blockingImpacts);
  const blocking = violations.filter((v) => blockingImpacts.has(v.impact));
  const ignored = violations.filter((v) => !blockingImpacts.has(v.impact));

  const overBudget = [];
  for (const violation of blocking) {
    const count = violation.nodes?.length ?? 1;
    const allowed = allowances[violation.id] ?? 0;
    if (count > allowed) {
      overBudget.push({ ...violation, count, allowed, excess: count - allowed });
    }
  }

  const excessCritical = overBudget
    .filter((v) => v.impact === "critical")
    .reduce((sum, v) => sum + v.excess, 0);
  const excessSerious = overBudget
    .filter((v) => v.impact === "serious")
    .reduce((sum, v) => sum + v.excess, 0);

  const ok = excessCritical <= budget.maxNewCritical && excessSerious <= budget.maxNewSerious;
  const summary = overBudget.length
    ? overBudget
        .map((v) => `${v.id}[${v.impact}] ${v.count}/${v.allowed} allowed`)
        .join(", ")
    : `${blocking.length} within budget, ${ignored.length} minor/moderate`;

  return { ok, overBudget, blocking, ignored, summary, excessCritical, excessSerious };
}
