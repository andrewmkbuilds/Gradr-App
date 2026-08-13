import { describe, expect, it } from "vitest";
import {
  LIMITS,
  buildSessionContext,
  validateSetup,
} from "@/lib/interview/setupValidation";
import { buildSessionDirective } from "@/lib/interview/personas";

describe("interview setup validation", () => {
  it("treats an entirely empty draft as valid, with a grounding warning", () => {
    const v = validateSetup({});
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual({});
    expect(v.warnings.targetRole).toMatch(/generic/i);
  });

  it("accepts a normal role and company with no messages", () => {
    const v = validateSetup({ targetRole: "Senior Frontend Engineer", company: "Northwind" });
    expect(v.valid).toBe(true);
    expect(v.warnings.targetRole).toBeUndefined();
    expect(v.warnings.company).toBeUndefined();
  });

  it("rejects a one-character role", () => {
    const v = validateSetup({ targetRole: "S" });
    expect(v.valid).toBe(false);
    expect(v.errors.targetRole).toMatch(/at least 2/);
  });

  it("rejects a role that is punctuation only", () => {
    const v = validateSetup({ targetRole: "???" });
    expect(v.valid).toBe(false);
    expect(v.errors.targetRole).toMatch(/letter or number/);
  });

  it("rejects an over-long role and a multi-line role", () => {
    expect(validateSetup({ targetRole: "a".repeat(LIMITS.targetRole.max + 1) }).errors.targetRole).toMatch(
      /under 80/,
    );
    expect(validateSetup({ targetRole: "Engineer\nPasted resume" }).errors.targetRole).toMatch(
      /single line/,
    );
  });

  it("treats whitespace-only input as absent rather than invalid", () => {
    const v = validateSetup({ targetRole: "   ", company: "  " });
    expect(v.valid).toBe(true);
    expect(v.warnings.targetRole).toBeTruthy();
  });

  it("warns on a stub job description and errors on an oversized one", () => {
    expect(validateSetup({ jobDescription: "We are hiring." }).warnings.jobDescription).toMatch(
      /very short/i,
    );
    const big = validateSetup({ jobDescription: "x".repeat(LIMITS.jobDescription.max + 1) });
    expect(big.valid).toBe(false);
    expect(big.errors.jobDescription).toMatch(/paste under/i);
  });

  it("warns that only the first slice of a long job description reaches the model", () => {
    const v = validateSetup({ jobDescription: "y".repeat(LIMITS.jobDescription.sentToModel + 500) });
    expect(v.valid).toBe(true);
    expect(v.warnings.jobDescription).toMatch(/2,500/);
  });

  it("omits blank optional fields from the built session context", () => {
    const ctx = buildSessionContext({
      personaId: "hiring-manager",
      difficultyId: "standard",
      draft: { targetRole: "  ", company: "", jobDescription: "   " },
    });
    expect(ctx).toEqual({ personaId: "hiring-manager", difficultyId: "standard" });
    expect("targetRole" in ctx).toBe(false);
  });

  it("trims and carries the fields it does keep into the model directive", () => {
    const ctx = buildSessionContext({
      personaId: "hiring-manager",
      difficultyId: "standard",
      draft: { targetRole: "  Data Analyst  ", company: " Helio Labs ", jobDescription: " SQL and dbt " },
      resumeText: "Shipped a churn model.",
    });
    expect(ctx.targetRole).toBe("Data Analyst");
    expect(ctx.company).toBe("Helio Labs");

    const directive = buildSessionDirective(ctx);
    expect(directive).toContain("Data Analyst");
    expect(directive).toContain("Helio Labs");
    expect(directive).toContain("churn model");
  });
});
