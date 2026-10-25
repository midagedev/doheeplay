#!/usr/bin/env node
// Render one webtoon episode (drafts included) in headless Chromium at phone width and check
// what a reader would trip over: a panel image that does not load, a bubble that spills out of
// its panel, two bubbles in one panel that overlap, and script errors.
//
//   npm run webtoon-preview -- <slug> <epNN>
//
// Writes playtest-output/webtoon-<slug>-<epNN>/: panel-NNN.png (each panel as a phone shows
// it, bubbles included), strip.png (the whole episode, small), report.json. Exit 1 on FAIL.
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateWebtoons } from "./validate-webtoon.mjs";
import { buildWebtoons } from "./webtoon-render.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: 393, height: 852 };
const OVERLAP_PX = 2; // touching edges are fine; real overlap is more than a hairline

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};

function serve(root) {
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
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

// Geometry of every panel and bubble, measured in the page.
async function measure(page) {
  return page.evaluate(() => [...document.querySelectorAll(".panel")].map((panel) => {
    const p = panel.getBoundingClientRect();
    const img = panel.querySelector("img");
    return {
      panel: Number(panel.dataset.panel),
      rect: { left: p.left, top: p.top + scrollY, right: p.right, bottom: p.bottom + scrollY },
      imageLoaded: img ? img.complete && img.naturalWidth > 0 : true,
      image: img ? img.getAttribute("src") : null,
      bubbles: [...panel.querySelectorAll(".bubble")].map((bubble) => {
        const b = bubble.getBoundingClientRect();
        // The tail is a ::after triangle hanging below the box; count it as part of the bubble.
        const after = getComputedStyle(bubble, "::after");
        const tail = after.content && after.content !== "none" ? parseFloat(after.borderTopWidth) || 0 : 0;
        return {
          text: bubble.textContent.slice(0, 30),
          rect: { left: b.left, top: b.top + scrollY, right: b.right, bottom: b.bottom + scrollY + tail },
        };
      }),
    };
  }));
}

export function findLayoutProblems(panels) {
  const problems = [];
  for (const { panel, rect, imageLoaded, image, bubbles } of panels) {
    if (!imageLoaded) problems.push(`panel ${panel}: image ${image} did not load`);
    for (const bubble of bubbles) {
      const r = bubble.rect;
      const spill = Math.max(rect.left - r.left, r.right - rect.right, rect.top - r.top, r.bottom - rect.bottom);
      if (spill > 1) {
        problems.push(`panel ${panel}: bubble "${bubble.text}" spills ${Math.round(spill)}px out of the panel — move it (x/y) or make it wider (w)`);
      }
    }
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i].rect, b = bubbles[j].rect;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > OVERLAP_PX && h > OVERLAP_PX) {
          problems.push(`panel ${panel}: bubbles "${bubbles[i].text}" and "${bubbles[j].text}" overlap by ${Math.round(w)}x${Math.round(h)}px`);
        }
      }
    }
  }
  return problems;
}

const waitForImages = (page) => page.evaluate(async () => {
  // Lazy images load only near the viewport: make them eager, then wait for every one.
  for (const img of document.querySelectorAll(".panel img")) img.loading = "eager";
  await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; })));
});

// Build one episode (drafts included) under outDir/site, open it at phone width, screenshot
// it and return { panels, problems }.
export async function previewEpisode({ root = repoRoot, slug, episodeName, outDir }) {
  const { series } = await validateWebtoons({ root, quiet: true, includeDrafts: true });
  const target = series.find((item) => item.slug === slug);
  if (!target || !target.episodes.some(({ name }) => name === episodeName)) {
    throw new Error(`webtoons/${slug}/${episodeName} not found (or it failed validation — run npm run validate)`);
  }

  const siteDir = path.join(outDir, "site");
  await fs.rm(outDir, { recursive: true, force: true });
  await buildWebtoons([target], siteDir);
  await fs.copyFile(path.join(repoRoot, "src", "webtoon.css"), path.join(siteDir, "webtoon.css"));

  const { chromium } = await import("playwright");
  const server = await serve(siteDir);
  const browser = await chromium.launch();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });
    const url = `http://127.0.0.1:${server.address().port}/webtoons/${slug}/${episodeName}/`;
    await page.goto(url, { waitUntil: "load" });
    await waitForImages(page);

    const panels = await measure(page);
    const problems = [...findLayoutProblems(panels), ...errors];

    const handles = await page.$$(".panel");
    for (const [index, handle] of handles.entries()) {
      await handle.screenshot({ path: path.join(outDir, `panel-${String(index + 1).padStart(3, "0")}.png`) });
    }
    const small = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await small.goto(url, { waitUntil: "load" });
    await waitForImages(small);
    await small.screenshot({ path: path.join(outDir, "strip.png"), fullPage: true });

    const report = { slug, episode: episodeName, panels: panels.length, problems };
    await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  const [slug, episodeName] = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (!slug || !/^ep\d{2}$/.test(episodeName ?? "")) {
    console.error("Usage: npm run webtoon-preview -- <slug> <epNN>");
    process.exitCode = 1;
    return;
  }
  const outDir = path.join(repoRoot, "playtest-output", `webtoon-${slug}-${episodeName}`);
  const { panels, problems } = await previewEpisode({ slug, episodeName, outDir });
  console.log(`${slug}/${episodeName}: ${panels} panels → ${path.relative(repoRoot, outDir)}/`);
  if (problems.length > 0) {
    console.log(["FAIL:", ...problems.map((problem) => `- ${problem}`)].join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: every image loaded, no bubble spills out or overlaps another.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
