import { chromium } from "playwright";
import { readFileSync } from "fs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 420 } });
const l = readFileSync("/tmp/logo/light.svg","utf8"), d = readFileSync("/tmp/logo/dark.svg","utf8");
await p.setContent(`<body style="margin:0;display:flex;font-family:sans-serif">
<div style="flex:1;background:#F2F0EF;display:flex;align-items:center;justify-content:center;gap:24px">
${l.replace('width="512" height="512"','width="220" height="220"')}
${l.replace('width="512" height="512"','width="48" height="48"')}
${l.replace('width="512" height="512"','width="16" height="16"')}
</div>
<div style="flex:1;background:#0b1c22;display:flex;align-items:center;justify-content:center;gap:24px">
${d.replace('width="512" height="512"','width="220" height="220"')}
${d.replace('width="512" height="512"','width="48" height="48"')}
${d.replace('width="512" height="512"','width="16" height="16"')}
</div></body>`);
await p.screenshot({ path: "/tmp/logo/preview.png" });
await b.close();
