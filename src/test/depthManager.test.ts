import { describe, expect, it } from "vitest";
import { resolveLevel, type DepthLevel } from "@/lib/motion/depthManager";

const base = { device: "full" as DepthLevel, reduced: false, ceiling: "full" as DepthLevel, override: null };

describe("depth manager level resolution", () => {
  it("disables all depth when motion is reduced, whatever the device can do", () => {
    expect(resolveLevel({ ...base, reduced: true })).toBe("off");
    expect(resolveLevel({ ...base, reduced: true, override: "full" })).toBe("off");
  });

  it("never exceeds the performance ceiling", () => {
    expect(resolveLevel({ ...base, ceiling: "lite" })).toBe("lite");
    expect(resolveLevel({ ...base, ceiling: "off" })).toBe("off");
  });

  it("keeps the device level when the ceiling allows it", () => {
    expect(resolveLevel(base)).toBe("full");
    expect(resolveLevel({ ...base, device: "lite" })).toBe("lite");
  });

  it("lets an explicit override raise or lower depth under the ceiling", () => {
    expect(resolveLevel({ ...base, device: "lite", override: "full" })).toBe("full");
    expect(resolveLevel({ ...base, override: "off" })).toBe("off");
    expect(resolveLevel({ ...base, override: "full", ceiling: "lite" })).toBe("lite");
  });
});
