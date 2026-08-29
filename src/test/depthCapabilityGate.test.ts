import { describe, expect, it } from "vitest";
import {
  deviceLevelFrom,
  fpsFloorFor,
  resolveLevel,
  stepCeilingDown,
  type DepthLevel,
} from "@/lib/motion/depthManager";

/** A capable desktop: fine pointer, wide viewport, plenty of cores and RAM. */
const desktop = { coarse: false, width: 1440, cores: 8, memory: 8, saveData: false };

describe("depth capability gate — device hints", () => {
  it("returns full for a capable desktop", () => {
    expect(deviceLevelFrom(desktop)).toBe("full");
  });

  it("drops to lite on a coarse pointer", () => {
    expect(deviceLevelFrom({ ...desktop, coarse: true })).toBe("lite");
  });

  it("drops to lite below the md breakpoint and stays full at it", () => {
    expect(deviceLevelFrom({ ...desktop, width: 767 })).toBe("lite");
    expect(deviceLevelFrom({ ...desktop, width: 768 })).toBe("full");
  });

  it("drops to lite on low core counts", () => {
    expect(deviceLevelFrom({ ...desktop, cores: 4 })).toBe("lite");
    expect(deviceLevelFrom({ ...desktop, cores: 6 })).toBe("full");
  });

  it("drops to lite on low device memory", () => {
    expect(deviceLevelFrom({ ...desktop, memory: 4 })).toBe("lite");
    expect(deviceLevelFrom({ ...desktop, memory: 8 })).toBe("full");
  });

  it("turns depth off entirely when the user asked to save data", () => {
    expect(deviceLevelFrom({ ...desktop, saveData: true })).toBe("off");
    // Save-data wins over otherwise-capable hardware.
    expect(deviceLevelFrom({ ...desktop, saveData: true, cores: 16, memory: 32 })).toBe("off");
  });

  it("assumes capable hardware when the hints are not exposed", () => {
    expect(deviceLevelFrom({ coarse: false, width: 1280 })).toBe("full");
  });
});

describe("depth capability gate — reduced motion", () => {
  const base = { device: "full" as DepthLevel, reduced: false, ceiling: "full" as DepthLevel, override: null };

  it("returns off whenever motion is reduced, regardless of hardware", () => {
    expect(resolveLevel({ ...base, reduced: true })).toBe("off");
    expect(resolveLevel({ ...base, reduced: true, override: "full" })).toBe("off");
    expect(resolveLevel({ ...base, device: "lite", reduced: true })).toBe("off");
  });
});

describe("depth capability gate — FPS probe", () => {
  it("requires a higher frame budget to keep full depth than lite", () => {
    expect(fpsFloorFor("full")).toBeGreaterThan(fpsFloorFor("lite"));
  });

  it("steps the ceiling down one level at a time", () => {
    expect(stepCeilingDown("full")).toBe("lite");
    expect(stepCeilingDown("lite")).toBe("off");
    expect(stepCeilingDown("off")).toBe("off");
  });

  /** Mirrors DepthManager.consumeFps: two consecutive bad windows downgrade. */
  function simulate(samples: number[], device: DepthLevel = "full") {
    let ceiling: DepthLevel = "full";
    let bad = 0;
    for (const fps of samples) {
      if (fps >= fpsFloorFor(ceiling)) {
        bad = 0;
        continue;
      }
      bad += 1;
      if (bad < 2) continue;
      bad = 0;
      ceiling = stepCeilingDown(ceiling);
    }
    return resolveLevel({ device, reduced: false, ceiling, override: null });
  }

  it("keeps full depth on a healthy frame rate", () => {
    expect(simulate([60, 58, 61, 59])).toBe("full");
  });

  it("ignores a single bad window", () => {
    expect(simulate([60, 20, 60, 58])).toBe("full");
  });

  it("downgrades to lite after two consecutive bad windows", () => {
    expect(simulate([60, 18, 18, 30])).toBe("lite");
  });

  it("bottoms out at off when the device keeps missing the lite budget", () => {
    expect(simulate([18, 18, 10, 10])).toBe("off");
  });

  it("never lifts the device level above the probe ceiling", () => {
    expect(simulate([18, 18], "full")).toBe("lite");
    expect(simulate([60, 60], "lite")).toBe("lite");
  });
});
