// shoot.mjs — take the three dashboard screenshots with Chrome for Testing
// (from the Playwright cache) driven over CDP with Node's built-in
// WebSocket. No screenshots are ever copied from an older entry.
// Usage: node scripts/shoot.mjs --out out --shots screenshots [--quality 80]
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function parseArgs(argv) {
  const o = { out: 'out', shots: 'screenshots', quality: 80 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) o.out = argv[++i];
    else if (argv[i] === '--shots' && argv[i + 1]) o.shots = argv[++i];
    else if (argv[i] === '--quality' && argv[i + 1]) o.quality = Number(argv[++i]);
  }
  return o;
}

function findChrome() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const candidates = [];
  if (existsSync(cache)) {
    for (const d of readdirSync(cache)) {
      candidates.push(join(cache, d, 'chrome-linux', 'chrome'));
      candidates.push(join(cache, d, 'chrome-linux', 'headless_shell'));
    }
  }
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('no Chrome for Testing found under ~/.cache/ms-playwright');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }
  async call(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  async waitForEvent(method, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const i = this.events.findIndex((e) => e.method === method);
      if (i >= 0) return this.events.splice(i, 1)[0];
      await sleep(100);
    }
    throw new Error(`timeout waiting for ${method}`);
  }
  close() {
    this.ws.close();
  }
}

async function main() {
  const { out, shots, quality } = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  console.log(`chrome: ${chrome}`);
  const port = 9333;
  const pageUrl = (suffix) => `file://${join(process.cwd(), out, 'dashboard', 'index.html')}${suffix}`;
  const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
  const topSlug = board.rows[0].slug;

  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1440,900',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    let targets = null;
    for (let i = 0; i < 50; i++) {
      try {
        targets = await httpJson(`http://127.0.0.1:${port}/json/list`);
        break;
      } catch {
        await sleep(200);
      }
    }
    if (!targets) throw new Error('chrome did not open its debugging port');
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    mkdirSync(shots, { recursive: true });
    const jobs = [
      { name: '01-board.jpg', hash: '' },
      { name: '02-detail.jpg', hash: `#detail/${topSlug}` },
      { name: '03-watchlist.jpg', hash: '#filter=watchlist' },
    ];
    // first shot: a real navigation; the others only change the hash, which
    // the page listens for (no new load event fires for a hash change).
    await cdp.call('Page.navigate', { url: pageUrl('') });
    await cdp.waitForEvent('Page.loadEventFired');
    await sleep(700);
    for (const job of jobs) {
      if (job.hash) {
        await cdp.call('Runtime.evaluate', {
          expression: `window.location.hash = ${JSON.stringify(job.hash)}`,
        });
        await sleep(800);
      }
      const evalRes = await cdp.call('Runtime.evaluate', {
        expression: `document.querySelectorAll('#board-body tr').length + '|' + (document.querySelector('#detail-body') ? document.querySelector('#detail-body').textContent.length : 0)`,
        returnByValue: true,
      });
      console.log(`${job.name}: page state ${evalRes.result.value}`);
      const shot = await cdp.call('Page.captureScreenshot', {
        format: 'jpeg',
        quality,
        clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 },
      });
      const bytes = Buffer.from(shot.data, 'base64');
      writeFileSync(join(shots, job.name), bytes);
      console.log(`${job.name}: ${bytes.length} bytes`);
    }
    cdp.close();
  } finally {
    proc.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
