// shoot.mjs — take the 3 dossier screenshots with the vanilla Chrome for
// Testing from the Playwright cache, driven over CDP with Node's built-in
// WebSocket (no packages). Usage:
//   node scripts/shoot.mjs --out out --shots screenshots
// Views: board (index.html), detail rank #1 (#detail), watchlist filter
// (#watchlist). 1440x900 JPEG, quality 80.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  return fallback;
}

const out = resolve(arg("out", "out"));
const shotsDir = resolve(arg("shots", "screenshots"));
const chrome =
  arg("chrome", "") ||
  `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
if (!existsSync(chrome)) throw new Error(`no Chrome at ${chrome}`);

const PORT = 9333;
const views = [
  { file: "01-board.jpg", url: `file://${out}/dashboard/index.html` },
  { file: "02-detail.jpg", url: `file://${out}/dashboard/index.html#detail` },
  { file: "03-watchlist.jpg", url: `file://${out}/dashboard/index.html#watchlist` },
];

mkdirSync(shotsDir, { recursive: true });
const proc = spawn(chrome, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--hide-scrollbars",
  "--window-size=1440,900",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForVersion() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("Chrome DevTools did not come up");
}

async function newTarget(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!res.ok) throw new Error(`new target failed: ${res.status}`);
  return await res.json();
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++msgId;
    pending.set(id, { resolvePromise, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await waitForVersion();
  for (const view of views) {
    const target = await newTarget("about:blank");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolvePromise, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolvePromise(msg.result);
      }
    };
    await send(ws, "Page.enable");
    await send(ws, "Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send(ws, "Page.navigate", { url: view.url });
    await sleep(2500);
    const ready = await send(ws, "Runtime.evaluate", { expression: "document.querySelectorAll('#board tr').length", returnByValue: true });
    const nRows = ready?.result?.value ?? 0;
    const shot = await send(ws, "Page.captureScreenshot", { format: "jpeg", quality: 80 });
    const buf = Buffer.from(shot.data, "base64");
    writeFileSync(join(shotsDir, view.file), buf);
    console.log(`${view.file}: ${buf.length} bytes, board rows rendered: ${nRows}`);
    ws.close();
    await sleep(300);
  }
} finally {
  proc.kill("SIGKILL");
}
console.log("screenshots done");
