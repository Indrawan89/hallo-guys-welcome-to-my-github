// shoot.mjs — takes the three dashboard screenshots via Chrome DevTools.
// Usage: node scripts/shoot.mjs
// Chrome's --headless --screenshot flag writes no file in this VM, so the
// script drives Chrome over CDP: launch with a debugging port, navigate,
// wait for the page to render, capture JPEG at 1440x900.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The system browser (/opt/meta-chromium/chrome) refuses to start without
// a Hatch WebGL domain policy file, so screenshots use the vanilla Chrome
// for Testing from the Playwright cache instead.
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome";
const PORT = 9333;
const PROFILE = "/tmp/cr-token-radar2";
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "out", "dashboard");
const SHOTS = [
  { name: "01-board.jpg", url: "index.html" },
  { name: "02-detail.jpg", url: "index.html?view=detail&slug=steakhouse-financial" },
  { name: "03-watchlist.jpg", url: "index.html?scope=watchlist" },
];
const QUALITY = 85;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForEndpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("chrome debugging endpoint did not come up");
}

async function main() {
  mkdirSync(join(ROOT, "screenshots"), { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--window-size=1440,900",
    "about:blank",
  ], { stdio: "ignore" });
  try {
    const version = await waitForEndpoint();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let nextId = 1;
    const pending = new Map();
    const events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method) {
        events.push(msg);
      }
    };
    function send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve) => pending.set(id, resolve));
    }
    async function waitEvent(method, timeoutMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const i = events.findIndex((e) => e.method === method);
        if (i >= 0) return events.splice(i, 1)[0];
        await sleep(100);
      }
      throw new Error(`timeout waiting for ${method}`);
    }
    for (const shot of SHOTS) {
      const { result } = await send("Target.createTarget", {
        url: "about:blank",
      });
      const targetId = result.targetId;
      const attached = await send("Target.attachToTarget", { targetId, flatten: true });
      const sessionId = attached.result.sessionId;
      const sendTo = (method, params = {}) => {
        const id = nextId++;
        ws.send(JSON.stringify({ id, sessionId, method, params }));
        return new Promise((resolve) => pending.set(id, resolve));
      };
      await sendTo("Page.enable");
      await sendTo("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sendTo("Page.navigate", { url: `file://${OUT}/${shot.url}` });
      await waitEvent("Page.loadEventFired");
      await sleep(1800); // let data.js render the tables
      const shotRes = await sendTo("Page.captureScreenshot", {
        format: "jpeg",
        quality: QUALITY,
        clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 },
      });
      const buf = Buffer.from(shotRes.result.data, "base64");
      writeFileSync(join(ROOT, "screenshots", shot.name), buf);
      console.log(`${shot.name}: ${buf.length} bytes`);
      await send("Target.closeTarget", { targetId });
    }
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
