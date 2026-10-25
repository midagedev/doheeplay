#!/usr/bin/env node
// Webtoon pipeline test: validator, renderer and the phone-width layout check, on a fixture
// series built in a temp folder (the real webtoons/ is never touched).
//
// Contract ↔ assertion map
//   C1 valid series validates; drafts are hidden unless includeDrafts      → t1, t2
//   C2 every bad episode.json / folder is refused with a message naming it  → t3 (one per rule)
//   C3 bubble text is escaped, notes.md and drafts are never published      → t4
//   C4 prev/next/list navigation follows published episodes only           → t4
//   C5 layout check catches spill, overlap and a broken image; clean passes → t5 (pure), t6 (browser)
//   C6 draw blocks are validated; a draft may wait for undrawn panels       → t3 (draw rules), t7
//   C7 webtoon-draw resumes rig jobs across runs, retries a failed job once,
//      sends the key only through the -K file                               → t8
//   C8 the tailnet site lists published series only and swaps in atomically → t9
//
//   npm run test:webtoon            # all, including headless Chromium
//   npm run test:webtoon -- --no-browser
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { validateWebtoons } from "./validate-webtoon.mjs";
import { buildWebtoons } from "./webtoon-render.mjs";
import http from "node:http";
import { buildWebtoonSite } from "./build-webtoon-site.mjs";
import { drawEpisode } from "./webtoon-draw.mjs";
import { findLayoutProblems, previewEpisode } from "./webtoon-preview.mjs";

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message.split("\n").join("\n     ")}`);
    process.exitCode = 1;
  }
}

// A solid-color RGB PNG of the given size, so panels have real proportions in the browser.
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const validEpisode = () => ({
  title: "1화 · 비 오는 날",
  createdAt: "2026-10-25",
  panels: [
    { image: "001.png", alt: "비 오는 골목", bubbles: [{ text: "<script>alert(1)</script> 어?", x: 6, y: 6, w: 44 }] },
    { image: "002.png", gap: "wide", bubbles: [
      { text: "누구야?", kind: "shout", x: 50, y: 8, w: 40, tail: "right" },
      { text: "쿵", kind: "sfx", x: 10, y: 60, w: 20 },
    ] },
    { blank: "#111111", ratio: 0.3, bubbles: [{ text: "그날 밤.", kind: "narration", x: 30, y: 30, w: 40 }] },
  ],
});

async function makeRoot(mutate = () => {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "webtoon-test-"));
  const series = path.join(root, "webtoons", "rain-cat");
  await fs.mkdir(path.join(series, "ep01", "panels"), { recursive: true });
  await fs.mkdir(path.join(series, "ep02", "panels"), { recursive: true });
  await fs.writeFile(path.join(series, "metadata.json"), JSON.stringify({
    title: "비 오는 고양이", description: "테스트 시리즈", createdAt: "2026-10-25", tags: ["webtoon"],
  }));
  await fs.writeFile(path.join(series, "notes.md"), "# notes\n");
  await fs.writeFile(path.join(series, "ep01", "panels", "001.png"), png(400, 600, [120, 160, 200]));
  await fs.writeFile(path.join(series, "ep01", "panels", "002.png"), png(400, 400, [200, 170, 120]));
  const files = {
    ep01: validEpisode(),
    ep02: { title: "2화", createdAt: "2026-10-26", draft: true, panels: [] },
  };
  await mutate({ root, series, files });
  for (const [name, episode] of Object.entries(files)) {
    await fs.writeFile(path.join(series, name, "episode.json"), JSON.stringify(episode));
  }
  return root;
}

async function expectRefused(mutate, needle) {
  const root = await makeRoot(mutate);
  await assert.rejects(validateWebtoons({ root, quiet: true }), (error) => {
    assert.match(error.message, needle);
    return true;
  });
}

await check("t1 valid series: one published episode, draft hidden", async () => {
  const { series } = await validateWebtoons({ root: await makeRoot(), quiet: true });
  assert.equal(series.length, 1);
  assert.deepEqual(series[0].episodes.map(({ name }) => name), ["ep01"]);
});

await check("t2 includeDrafts keeps the draft episode", async () => {
  const { series } = await validateWebtoons({ root: await makeRoot(), quiet: true, includeDrafts: true });
  assert.deepEqual(series[0].episodes.map(({ name }) => name), ["ep01", "ep02"]);
});

const panel0 = (files) => files.ep01.panels[0];
const refusals = [
  ["missing image file", ({ files }) => { panel0(files).image = "404.png"; }, /panels\/404\.png does not exist/],
  ["image path with a folder", ({ files }) => { panel0(files).image = "../x.png"; }, /plain \.png\/\.jpg/],
  ["image and blank together", ({ files }) => { panel0(files).blank = "#000000"; }, /exactly one of "image"/],
  ["bad blank color", ({ files }) => { files.ep01.panels[2].blank = "black"; }, /blank must be a #rrggbb/],
  ["unknown bubble kind", ({ files }) => { panel0(files).bubbles[0].kind = "yell"; }, /kind must be one of/],
  ["x out of range", ({ files }) => { panel0(files).bubbles[0].x = 120; }, /"x" must be a number from 0 to 100/],
  ["x + w past the edge", ({ files }) => { Object.assign(panel0(files).bubbles[0], { x: 70, w: 40 }); }, /x \+ w is 110/],
  ["text too long", ({ files }) => { panel0(files).bubbles[0].text = "가".repeat(61); }, /61 characters; max 60/],
  ["too many bubbles", ({ files }) => { panel0(files).bubbles = Array.from({ length: 5 }, (_, i) => ({ text: "a", x: 0, y: i * 10 })); }, /5 bubbles; max 4/],
  ["bad gap", ({ files }) => { panel0(files).gap = "huge"; }, /gap must be one of/],
  ["published episode with no panels", ({ files }) => { files.ep02.draft = false; }, /has no panels/],
  ["missing createdAt", ({ files }) => { delete files.ep01.createdAt; }, /createdAt must use YYYY-MM-DD/],
  ["html file in a webtoon", async ({ series }) => { await fs.writeFile(path.join(series, "ep01", "x.html"), "<p>"); }, /blocked extension "\.html"/],
  ["bad episode folder", async ({ series }) => { await fs.mkdir(path.join(series, "episode3")); }, /not an episode folder/],
  ["image over 3 MB", async ({ series }) => { await fs.writeFile(path.join(series, "ep01", "panels", "001.png"), Buffer.alloc(3 * 1024 * 1024 + 1)); }, /too large .* convert it to \.jpg/],
  ["draw with a bad wh", ({ files }) => { panel0(files).draw = { prompt: "a cat", wh: "768x1152" }; }, /wh must look like/],
  ["draw with a side not a multiple of 16", ({ files }) => { panel0(files).draw = { prompt: "a cat", wh: "770 1152" }; }, /multiples of 16/],
  ["draw with no prompt", ({ files }) => { panel0(files).draw = { wh: "768 1152" }; }, /needs a "prompt"/],
  ["draw on a blank panel", ({ files }) => { files.ep01.panels[2].draw = { prompt: "night" }; }, /draw needs an "image"/],
  ["published panel not drawn yet", ({ files }) => { Object.assign(panel0(files), { image: "009.jpg", draw: { prompt: "a cat" } }); }, /panels\/009\.jpg does not exist/],
];
for (const [name, mutate, needle] of refusals) {
  await check(`t3 refuses: ${name}`, () => expectRefused(mutate, needle));
}
await check("t3 refuses: bad series slug", async () => {
  const root = await makeRoot();
  await fs.rename(path.join(root, "webtoons", "rain-cat"), path.join(root, "webtoons", "Rain_Cat"));
  await assert.rejects(validateWebtoons({ root, quiet: true }), /invalid slug/);
});

await check("t7 a draft may list panels that are not drawn yet", async () => {
  const root = await makeRoot(({ files }) => {
    files.ep02.panels = [{ image: "001.jpg", draw: { prompt: "a cat in the rain", wh: "768 1152", seed: 7 } }];
  });
  const { series } = await validateWebtoons({ root, quiet: true, includeDrafts: true });
  assert.equal(series[0].episodes[1].episode.panels.length, 1);
});

// A stand-in for the rig: POST /gen/image queues a job, GET /jobs/<id> walks it through
// running → done (or failed), GET /jobs/<id>/files/<name> serves a PNG.
async function fakeRig({ failPrompt = null } = {}) {
  const jobs = new Map();
  const seen = { posts: [], auth: new Set() };
  let n = 0;
  const server = http.createServer((req, res) => {
    seen.auth.add(req.headers.authorization ?? "(none)");
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const send = (code, value) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
      if (req.method === "POST" && req.url === "/gen/image") {
        const id = `job${++n}`;
        const post = JSON.parse(body);
        jobs.set(id, { polls: 0, fail: failPrompt !== null && post.prompt.includes(failPrompt) });
        seen.posts.push(post);
        return send(201, { id, status: "queued", eta_s: 30 });
      }
      const file = req.url.match(/^\/jobs\/(\w+)\/files\/(.+)$/);
      if (file) {
        res.writeHead(200, { "content-type": "image/png" });
        return res.end(png(64, 96, [10, 20, 30]));
      }
      const job = req.url.match(/^\/jobs\/(\w+)$/);
      if (job && jobs.has(job[1])) {
        const j = jobs.get(job[1]);
        j.polls++;
        if (j.polls < 2) return send(200, { id: job[1], status: "running", artifacts: [] });
        if (j.fail) return send(200, { id: job[1], status: "failed", artifacts: [] });
        return send(200, { id: job[1], status: "done", artifacts: [{ path: `/rig/${job[1]}/manifest.json` }, { path: `/rig/${job[1]}/out.png` }] });
      }
      send(404, { error: "no such route" });
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, seen, base: `http://127.0.0.1:${server.address().port}` };
}

async function drawRoot() {
  return makeRoot(({ files }) => {
    files.ep02.panels = [
      { image: "001.png", draw: { prompt: "a cat in the rain", wh: "768 1152", seed: 7 } },
      { image: "002.png", draw: { prompt: "a cat on a roof" } },
      { image: "003.png", draw: { prompt: "a cat at night" } },
    ];
  });
}

await check("t8 webtoon-draw: resumes across runs, max 2 in flight, key only via -K", async () => {
  const rigSim = await fakeRig();
  try {
    const root = await drawRoot();
    const keyFile = path.join(root, "key.curl");
    await fs.writeFile(keyFile, 'header = "Authorization: Bearer test-key"\n');
    const opts = { root, slug: "rain-cat", episode: "ep02", base: rigSim.base, keyFile, log: () => {}, pollMs: 50 };
    const onlyOne = await drawEpisode({ ...opts, maxSeconds: 10, only: [3] });
    assert.equal(onlyOne.total, 1, "--only limits the run to the named panels");
    assert.equal(onlyOne.drawn, 1);
    await fs.rm(path.join(root, "webtoons", "rain-cat", "ep02", "panels", "003.png"));
    rigSim.seen.posts.length = 0;
    const first = await drawEpisode({ ...opts, maxSeconds: 0.01 });
    assert.deepEqual(first.stillOnRig, [1, 2, 3]);
    assert.equal(rigSim.seen.posts.length, 2, "only two jobs in flight at once");
    const state = JSON.parse(await fs.readFile(path.join(root, "webtoons", "rain-cat", "ep02", "draw-state.json"), "utf8"));
    assert.deepEqual(Object.keys(state).sort(), ["001.png", "002.png"]);
    const second = await drawEpisode({ ...opts, maxSeconds: 10 });
    assert.equal(second.drawn, 3);
    assert.deepEqual(second.failed, []);
    assert.equal(rigSim.seen.posts.length, 3, "a resumed run polls the old jobs instead of submitting again");
    assert.deepEqual(rigSim.seen.posts[0], { prompt: "a cat in the rain", neg: "text, letters, words, speech bubble, caption, watermark, signature, logo", wh: "768 1152", tag: "dohee-wt-rain-cat-ep02-1", wait: 0, seed: 7 });
    assert.equal(rigSim.seen.posts[1].wh, "768 1152", "default size is a tall panel");
    assert.deepEqual([...rigSim.seen.auth], ["Bearer test-key"]);
    const { series } = await validateWebtoons({ root, quiet: true, includeDrafts: true });
    assert.equal(series[0].episodes[1].episode.panels.length, 3);
    // --redo throws a drawn panel away and draws it again.
    const redo = await drawEpisode({ ...opts, maxSeconds: 10, redo: [2] });
    assert.equal(redo.drawn, 3);
    assert.equal(rigSim.seen.posts.length, 4);
  } finally {
    rigSim.server.close();
  }
});

await check("t8 webtoon-draw: a failed job is retried once, then the panel is reported", async () => {
  const rigSim = await fakeRig({ failPrompt: "on a roof" });
  try {
    const root = await drawRoot();
    const keyFile = path.join(root, "key.curl");
    await fs.writeFile(keyFile, 'header = "Authorization: Bearer test-key"\n');
    const result = await drawEpisode({ root, slug: "rain-cat", episode: "ep02", base: rigSim.base, keyFile, log: () => {}, pollMs: 50, maxSeconds: 10 });
    // Every job for panel 2 fails: it is tried twice and reported; panels 1 and 3 are drawn.
    assert.deepEqual(result.failed, ["002.png"]);
    assert.deepEqual(result.stillOnRig, []);
    assert.equal(result.drawn, 2);
    const tries = rigSim.seen.posts.filter((post) => post.prompt === "a cat on a roof").length;
    assert.equal(tries, 2);
    assert.equal(rigSim.seen.posts.length, 4);
  } finally {
    rigSim.server.close();
  }
});

await check("t9 webtoon site: home lists published series, css copied, old output replaced", async () => {
  const root = await makeRoot();
  const outDir = path.join(root, "webtoon-site");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "stale.html"), "old");
  const result = await buildWebtoonSite({ root, outDir, quiet: true });
  assert.deepEqual(result, { series: 1, episodes: 1 });
  const home = await fs.readFile(path.join(outDir, "index.html"), "utf8");
  assert.ok(home.includes('href="./webtoons/rain-cat/"') && home.includes("비 오는 고양이"));
  await fs.access(path.join(outDir, "webtoon.css"));
  await fs.access(path.join(outDir, "webtoons", "rain-cat", "ep01", "index.html"));
  await assert.rejects(fs.access(path.join(outDir, "stale.html")), "the old build is replaced, not merged");
  await assert.rejects(fs.access(`${outDir}.tmp`), "no staging folder left behind");
});

await check("t4 build: escaped text, no notes.md, no draft, navigation", async () => {
  const root = await makeRoot();
  const { series } = await validateWebtoons({ root, quiet: true });
  const dist = path.join(root, "dist");
  await buildWebtoons(series, dist);
  const html = await fs.readFile(path.join(dist, "webtoons", "rain-cat", "ep01", "index.html"), "utf8");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; 어?"), "bubble text must be escaped");
  assert.ok(!html.includes("<script>"), "no raw script tag");
  assert.ok(html.includes('class="bubble shout tail-right" style="left:50%;top:8%;width:40%"'));
  assert.ok(html.includes('class="bubble speech tail-left"'), "speech defaults to a left tail");
  assert.ok(html.includes('class="bubble sfx tail-none"'), "sfx has no tail");
  assert.ok(html.includes("margin-top:96px"), "wide gap is 96px");
  assert.ok(html.includes("aspect-ratio:1 / 0.3"), "blank panel keeps its ratio");
  assert.ok(html.includes('<span class="wt-nav-link is-off">다음 화 →</span>'), "draft ep02 is not linked as next");
  await fs.access(path.join(dist, "webtoons", "rain-cat", "ep01", "panels", "002.png"));
  await assert.rejects(fs.access(path.join(dist, "webtoons", "rain-cat", "notes.md")));
  await assert.rejects(fs.access(path.join(dist, "webtoons", "rain-cat", "ep02")));
  const list = await fs.readFile(path.join(dist, "webtoons", "rain-cat", "index.html"), "utf8");
  assert.ok(list.includes('href="./ep01/"') && !list.includes("ep02"));
});

await check("t5 layout rules (pure): spill, overlap, broken image; touching is fine", async () => {
  const box = (left, top, right, bottom) => ({ left, top, right, bottom });
  const clean = [{ panel: 1, rect: box(0, 0, 400, 400), imageLoaded: true, bubbles: [
    { text: "a", rect: box(10, 10, 200, 60) }, { text: "b", rect: box(200, 10, 390, 60) },
  ] }];
  assert.deepEqual(findLayoutProblems(clean), []);
  const bad = [{ panel: 2, rect: box(0, 0, 400, 400), imageLoaded: false, image: "x.png", bubbles: [
    { text: "spill", rect: box(300, 380, 420, 430) }, { text: "over", rect: box(310, 370, 390, 400) },
  ] }];
  const problems = findLayoutProblems(bad);
  assert.equal(problems.length, 3, problems.join("\n"));
  assert.match(problems.join("\n"), /did not load/);
  assert.match(problems.join("\n"), /spills 30px/);
  assert.match(problems.join("\n"), /overlap/);
});

if (!process.argv.includes("--no-browser")) {
  await check("t6 browser: clean episode passes, spilling and overlapping bubbles fail", async () => {
    const root = await makeRoot(({ files }) => {
      files.ep02 = { title: "2화", createdAt: "2026-10-26", draft: true, panels: [
        { image: "001.png", bubbles: [
          { text: "아래로 삐져나가는 아주 긴 말풍선 대사입니다 정말로 깁니다", x: 50, y: 90, w: 45 },
          { text: "겹침", x: 55, y: 88, w: 30 },
        ] },
      ] };
    });
    await fs.copyFile(
      path.join(root, "webtoons", "rain-cat", "ep01", "panels", "001.png"),
      path.join(root, "webtoons", "rain-cat", "ep02", "panels", "001.png"),
    );
    const out = path.join(root, "out");
    const ok = await previewEpisode({ root, slug: "rain-cat", episodeName: "ep01", outDir: path.join(out, "ep01") });
    assert.deepEqual(ok.problems, []);
    assert.equal(ok.panels, 3);
    await fs.access(path.join(out, "ep01", "panel-003.png"));
    await fs.access(path.join(out, "ep01", "strip.png"));
    const bad = await previewEpisode({ root, slug: "rain-cat", episodeName: "ep02", outDir: path.join(out, "ep02") });
    assert.match(bad.problems.join("\n"), /spills \d+px/);
    assert.match(bad.problems.join("\n"), /overlap/);
  });
}

console.log(`${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
