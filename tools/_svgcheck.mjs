import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 200, height: 200 }, deviceScaleFactor: 3 });
await p.setContent(`<body style="margin:0;background:#6b7a3a">
<div style="position:absolute;left:0;top:0;transform:translate3d(100px,100px,0) translate(-50%,-50%) scale(2.4);opacity:1">
<svg width="34" height="34" viewBox="-17 -17 34 34" style="display:block;overflow:visible">
<path d="M 10.40 -8.13 Q 17.60 0 10.40 8.13 Q 14.40 0 10.40 -8.13 Z M -10.40 -8.13 Q -17.60 0 -10.40 8.13 Q -14.40 0 -10.40 -8.13 Z" fill="rgba(10,7,4,0.55)" stroke="rgba(10,7,4,0.55)" stroke-width="2" stroke-linejoin="round"/>
<path d="M 10.40 -8.13 Q 17.60 0 10.40 8.13 Q 14.40 0 10.40 -8.13 Z M -10.40 -8.13 Q -17.60 0 -10.40 8.13 Q -14.40 0 -10.40 -8.13 Z" fill="rgba(240,229,203,0.94)"/>
</svg></div>
<div style="position:absolute;left:0;top:0;transform:translate3d(100px,160px,0) translate(-50%,-50%) scale(1);opacity:0.9">
<svg width="46" height="14" viewBox="-23 -7 46 14" style="display:block;overflow:visible">
<ellipse cx="0" cy="0" rx="19" ry="3.8" fill="none" stroke="rgba(10,7,4,0.52)" stroke-width="3"/>
<ellipse cx="0" cy="0" rx="19" ry="3.8" fill="none" stroke="rgba(240,229,203,0.68)" stroke-width="1.25"/>
</svg></div>
</body>`);
await p.screenshot({ path: "/tmp/claude-0/svgcheck.png" });
await b.close();
console.log("wrote /tmp/claude-0/svgcheck.png");
