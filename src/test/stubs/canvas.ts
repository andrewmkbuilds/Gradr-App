/**
 * jsdom loads the optional `canvas` package when it is present in
 * node_modules. A transitive install of it here has no compiled native
 * binding, so every jsdom test crashes on require. None of our tests need real
 * canvas rendering, so we alias the package to this inert stub.
 */
export function createCanvas() {
  throw new Error("canvas is stubbed in tests");
}
export function createImageData() {
  throw new Error("canvas is stubbed in tests");
}
export class Image {}
export default { createCanvas, createImageData, Image };
