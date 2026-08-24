import { existsSync, renameSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * jsdom loads the optional `canvas` peer whenever it is present in
 * node_modules. Bun installs it here even though nothing in the app uses it,
 * and its native binding is never compiled — so every jsdom test crashes with
 * `MODULE_NOT_FOUND: canvas/build/Release/canvas.node` before a single test
 * runs. Nothing under test needs real canvas rendering, so we move the broken
 * install aside once per run; jsdom then falls back to its no-canvas path.
 */
export default function setup() {
  const root = path.resolve(__dirname, "../../node_modules");
  const canvasDir = path.join(root, "canvas");
  if (!existsSync(canvasDir)) return;

  const releaseDir = path.join(canvasDir, "build/Release");
  const compiled =
    existsSync(releaseDir) && readdirSync(releaseDir).some((f) => f.endsWith(".node"));
  if (compiled) return; // a real, working canvas — leave it alone

  const parked = path.join(root, ".canvas-disabled");
  if (existsSync(parked)) return;
  renameSync(canvasDir, parked);
}
