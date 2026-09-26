#!/usr/bin/env node
// Play a built game in headless Chromium on phone- and tablet-sized touch screens and report
// what a player would hit first: script errors, blocked network calls, a blank or frozen
// screen, controls that do nothing, and buttons that are off-screen or too small to tap.
//
//   npm run playtest -- <slug>          # builds dist/ first, then plays games/<slug>/
//   npm run playtest -- <slug> --no-build
//
// Screenshots and report.json land in playtest-output/<slug>/. Exit 1 when any FAIL check
// trips; WARN checks are printed but do not fail.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");

const DEVICES = [
  { name: "iphone", viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
  { name: "ipad", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 },
];
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MIN_TAP_PX = 40; // Apple HIG asks for 44pt; allow a little slack before warning.
const SETTLE_MS = 1500;
const PLAY_MS = 3000;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav",
  ".woff2": "font/woff2", ".glb": "model/gltf-binary",
};

function parseArgs(argv) {
  const args = { slug: null, build: true };
  for (const arg of argv) {
    if (arg === "--no-build") args.build = false;
    else if (!arg.startsWith("-") && !args.slug) args.slug = arg;
  }
  return args;
}

function serveDist() {
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(distRoot, urlPath);
    if (!file.startsWith(distRoot)) { res.writeHead(403).end(); return; }
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
      const body = await fs.readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Pixel stats of a screenshot, measured in the page itself so the script needs no PNG decoder.
async function imageStats(page, pngBuffers) {
  return page.evaluate(async (b64s) => {
    const load = (b64) => new Promise((ok, bad) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = bad;
      img.src = `data:image/png;base64,${b64}`;
    });
    const W = 96, H = 96;
    const sample = async (b64) => {
      const img = await load(b64);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, W, H);
      return g.getImageData(0, 0, W, H).data;
    };
    const [a, b] = await Promise.all(b64s.map(sample));
    const colors = new Set();
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      colors.add(((a[i] >> 4) << 8) | ((a[i + 1] >> 4) << 4) | (a[i + 2] >> 4));
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 30) changed++;
    }
    return { distinctColors: colors.size, changedRatio: changed / (W * H) };
  }, pngBuffers.map((buf) => buf.toString("base64")));
}

async function visibleControls(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return [...document.querySelectorAll("button, [role=button], a[href], input, select")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const shown = r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        return shown && {
          label: (el.innerText || el.getAttribute("aria-label") || el.value || el.tagName).trim().slice(0, 40),
          x: r.x, y: r.y, width: r.width, height: r.height,
          offscreen: r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh || r.right > vw + 1 || r.bottom > vh + 1,
        };
      })
      .filter(Boolean);
  });
}

async function playOnDevice(browser, baseUrl, slug, device, outDir) {
  const context = await browser.newContext({
    viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor,
    isMobile: true, hasTouch: true, userAgent: MOBILE_UA,
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith(baseUrl) && !url.startsWith("data:") && !url.startsWith("blob:")) externalRequests.push(url);
  });
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

  const url = `${baseUrl}/games/${slug}/`;
  const response = await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(SETTLE_MS);
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${device.name}-${name}.png`) });
  const start = await shot("1-start");

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
  }));
  const controlsAtStart = await visibleControls(page);

  // Play: press the first on-screen button (usually start), then tap around the screen and
  // hit the common keys, the way a child poking at a new game would.
  const startButton = controlsAtStart.find((c) => !c.offscreen);
  if (startButton) {
    await page.touchscreen.tap(startButton.x + startButton.width / 2, startButton.y + startButton.height / 2);
    await page.waitForTimeout(400);
  }
  const { width: w, height: h } = device.viewport;
  const taps = [[0.5, 0.5], [0.5, 0.75], [0.25, 0.6], [0.75, 0.6], [0.5, 0.35], [0.5, 0.85]];
  const keys = ["Space", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", "Space"];
  const stepMs = Math.floor(PLAY_MS / taps.length);
  for (let i = 0; i < taps.length; i++) {
    await page.touchscreen.tap(Math.round(w * taps[i][0]), Math.round(h * taps[i][1]));
    await page.keyboard.press(keys[i]);
    await page.waitForTimeout(stepMs);
  }
  const after = await shot("2-after-play");
  const stats = await imageStats(page, [start, after]);
  const controlsAfter = await visibleControls(page);
  await context.close();

  const checks = [];
  const add = (level, id, ok, detail) => checks.push({ level, id, ok, detail });
  add("FAIL", "page-loads", response?.ok() ?? false, `HTTP ${response?.status()}`);
  add("FAIL", "no-script-errors", errors.length === 0, errors.slice(0, 5));
  add("FAIL", "no-external-requests", externalRequests.length === 0, externalRequests.slice(0, 5));
  add("FAIL", "not-blank", stats.distinctColors > 4, `${stats.distinctColors} distinct colours at start`);
  add("WARN", "reacts-to-play", stats.changedRatio > 0.002,
    `${(stats.changedRatio * 100).toFixed(1)}% of the screen changed after tapping and key presses`);
  add("WARN", "no-horizontal-scroll", layout.scrollWidth <= layout.innerWidth + 1,
    `scrollWidth ${layout.scrollWidth} vs viewport ${layout.innerWidth}`);
  const offscreen = [...controlsAtStart, ...controlsAfter].filter((c) => c.offscreen).map((c) => c.label);
  add("WARN", "controls-on-screen", offscreen.length === 0, [...new Set(offscreen)]);
  const small = [...controlsAtStart, ...controlsAfter]
    .filter((c) => !c.offscreen && (c.width < MIN_TAP_PX || c.height < MIN_TAP_PX))
    .map((c) => `${c.label} (${Math.round(c.width)}x${Math.round(c.height)})`);
  add("WARN", "tap-targets-big-enough", small.length === 0, [...new Set(small)]);

  return {
    device: device.name, viewport: device.viewport, url,
    screenshots: [`${device.name}-1-start.png`, `${device.name}-2-after-play.png`],
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) {
    console.error("usage: npm run playtest -- <slug> [--no-build]");
    process.exit(2);
  }
  if (args.build) {
    const built = spawnSync(process.execPath, [path.join(repoRoot, "scripts/build-site.mjs")], { stdio: "inherit" });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
  try {
    await fs.access(path.join(distRoot, "games", args.slug, "index.html"));
  } catch {
    console.error(`dist/games/${args.slug}/index.html not found — is the slug right and does npm run check pass?`);
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("playwright is not installed: run `npm install` and `npx playwright install chromium` once.");
    process.exit(2);
  }

  const outDir = path.join(repoRoot, "playtest-output", args.slug);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const server = await serveDist();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const results = [];
  try {
    for (const device of DEVICES) results.push(await playOnDevice(browser, baseUrl, args.slug, device, outDir));
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.flatMap((r) => r.checks.filter((c) => c.level === "FAIL" && !c.ok).map((c) => `${r.device}:${c.id}`));
  const report = { slug: args.slug, passed: failed.length === 0, failed, results };
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  for (const r of results) {
    console.log(`\n[${r.device} ${r.viewport.width}x${r.viewport.height}]`);
    for (const c of r.checks) {
      const mark = c.ok ? "ok  " : c.level === "FAIL" ? "FAIL" : "warn";
      const detail = Array.isArray(c.detail) ? (c.detail.length ? ` — ${c.detail.join(" | ")}` : "") : ` — ${c.detail}`;
      console.log(`  ${mark} ${c.id}${c.ok && Array.isArray(c.detail) ? "" : detail}`);
    }
  }
  console.log(`\nScreenshots: ${path.relative(repoRoot, outDir)}/`);
  console.log(report.passed ? "PLAYTEST PASSED" : `PLAYTEST FAILED: ${failed.join(", ")}`);
  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
