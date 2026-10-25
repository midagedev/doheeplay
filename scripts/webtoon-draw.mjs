#!/usr/bin/env node
// Draw the panels of one episode on dad's GPU rig (signalbox, Z-Image-Turbo) — every panel in
// episode.json that has a "draw" block and whose image file is missing.
//
//   npm run webtoon-draw -- <slug> <epNN>              # draw what is missing
//   npm run webtoon-draw -- <slug> <epNN> --only 1,2,3 # draw just these panels first (to check the look)
//   npm run webtoon-draw -- <slug> <epNN> --redo 3,5   # throw away panels 3 and 5 and draw them again
//
// One run stops after --max-seconds (default 150, under Hermes' 180 s terminal limit). Jobs
// keep going on the rig; running the same command again picks them up from draw-state.json.
// Exit 0 when every panel is drawn, 2 when some are still on the rig (run again), 1 on failure.
//
// The rig key stays in the curl config file (-K); this script never reads it.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { LIMITS } from "./validate-webtoon.mjs";

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_NEG = "text, letters, words, speech bubble, caption, watermark, signature, logo";
export const DEFAULT_WH = "768 1152";
const MAX_IN_FLIGHT = 2; // rig-gen etiquette: never more than two jobs at once
const MAX_ATTEMPTS = 2; // a failed job is retried once
const POLL_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = { slug: null, episode: null, redo: [], only: [], maxSeconds: 150 };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--redo") args.redo = (rest.shift() ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    else if (arg === "--only") args.only = (rest.shift() ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    else if (arg === "--max-seconds") args.maxSeconds = Number(rest.shift());
    else if (!args.slug) args.slug = arg;
    else if (!args.episode) args.episode = arg;
  }
  return args;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// curl with the rig key file; returns { status, body } (body parsed as JSON when it is JSON).
async function rig({ base, keyFile }, method, route, payload, outFile) {
  const argv = ["-sS", "-K", keyFile, "-X", method, `${base}${route}`, "-w", "\n%{http_code}", "--max-time", "60"];
  if (payload !== undefined) argv.push("-H", "Content-Type: application/json", "-d", JSON.stringify(payload));
  if (outFile) argv.push("-o", outFile);
  const { stdout } = await run("curl", argv, { maxBuffer: 4 * 1024 * 1024 });
  const cut = stdout.lastIndexOf("\n");
  const status = Number(stdout.slice(cut + 1));
  const text = stdout.slice(0, cut);
  let body = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status, body };
}

async function hasFfmpeg() {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

// Save the rig's PNG under the panel's name: JPEG/WebP names are converted with ffmpeg (a rig
// PNG is ~1.5–3 MB; the site caps images at 3 MB).
async function store(pngFile, target) {
  const ext = path.extname(target).toLowerCase();
  if (ext === ".png") {
    await fs.copyFile(pngFile, target);
  } else {
    if (!await hasFfmpeg()) throw new Error(`ffmpeg is needed to save ${path.basename(target)}; name the panel .png instead`);
    for (const quality of ext === ".webp" ? ["80", "65"] : ["3", "6"]) {
      const codec = ext === ".webp" ? ["-quality", quality] : ["-q:v", quality];
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", pngFile, ...codec, target]);
      if ((await fs.stat(target)).size <= LIMITS.maxImageBytes) break;
    }
  }
  const { size } = await fs.stat(target);
  if (size > LIMITS.maxImageBytes) throw new Error(`${path.basename(target)} is ${size} bytes even after compression`);
}

export async function drawEpisode({
  root = repoRoot, slug, episode: episodeName, redo = [], only = [], maxSeconds = 150,
  base = process.env.SIGNALBOX_URL ?? "https://ws.mogera-goblin.ts.net:8443",
  keyFile = process.env.SIGNALBOX_CURL_CONFIG ?? path.join(os.homedir(), ".config", "signalbox.curl"),
  log = console.log, pollMs = POLL_MS,
}) {
  const episodeDir = path.join(root, "webtoons", slug, episodeName);
  const episode = JSON.parse(await fs.readFile(path.join(episodeDir, "episode.json"), "utf8"));
  const statePath = path.join(episodeDir, "draw-state.json");
  const state = await exists(statePath) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
  const saveState = () => fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const conn = { base, keyFile };
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "webtoon-draw-"));
  const deadline = Date.now() + maxSeconds * 1000;

  const shots = episode.panels
    .map((panel, index) => ({ panel, number: index + 1 }))
    .filter(({ panel, number }) => panel.draw && panel.image && (only.length === 0 || only.includes(number)));
  for (const { panel, number } of shots) {
    if (redo.includes(number) && !state[panel.image]) {
      await fs.rm(path.join(episodeDir, "panels", panel.image), { force: true });
      log(`panel ${number}: removed for a redraw`);
    }
  }

  const failed = [];
  for (;;) {
    const missing = [];
    for (const shot of shots) {
      if (!await exists(path.join(episodeDir, "panels", shot.panel.image))) missing.push(shot);
    }
    const pending = missing.filter(({ panel }) => state[panel.image]?.jobId);
    const waiting = missing.filter(({ panel }) => !state[panel.image]?.jobId && !failed.includes(panel.image));

    for (const { panel, number } of pending) {
      const entry = state[panel.image];
      const { status, body } = await rig(conn, "GET", `/jobs/${entry.jobId}`);
      if (status !== 200) throw new Error(`rig answered ${status} for job ${entry.jobId}: ${JSON.stringify(body).slice(0, 200)}`);
      if (body.status === "done") {
        const art = (body.artifacts ?? []).map((a) => path.basename(a.path)).find((name) => name.endsWith(".png"));
        if (!art) throw new Error(`job ${entry.jobId} finished without a .png`);
        const pngFile = path.join(tmp, `${entry.jobId}.png`);
        const got = await rig(conn, "GET", `/jobs/${entry.jobId}/files/${encodeURIComponent(art)}`, undefined, pngFile);
        if (got.status !== 200) throw new Error(`could not download ${art} from job ${entry.jobId} (${got.status})`);
        await store(pngFile, path.join(episodeDir, "panels", panel.image));
        delete state[panel.image];
        await saveState();
        log(`panel ${number}: done → panels/${panel.image}`);
      } else if (["failed", "cancelled", "canceled", "killed"].includes(body.status)) {
        entry.attempts = (entry.attempts ?? 1);
        if (entry.attempts < MAX_ATTEMPTS) {
          log(`panel ${number}: job ${entry.jobId} ${body.status}; trying once more`);
          state[panel.image] = { attempts: entry.attempts + 1 };
        } else {
          log(`panel ${number}: job ${entry.jobId} ${body.status} twice — giving up on this panel`);
          delete state[panel.image];
          failed.push(panel.image);
        }
        await saveState();
      }
    }

    const inFlight = Object.values(state).filter((entry) => entry.jobId).length;
    for (const { panel, number } of waiting.slice(0, Math.max(0, MAX_IN_FLIGHT - inFlight))) {
      const payload = {
        prompt: panel.draw.prompt,
        neg: panel.draw.neg ?? DEFAULT_NEG,
        wh: panel.draw.wh ?? DEFAULT_WH,
        tag: `dohee-wt-${slug}-${episodeName}-${number}`.slice(0, 60).replace(/-+$/, ""),
        wait: 0,
      };
      if (panel.draw.seed !== undefined) payload.seed = panel.draw.seed;
      const { status, body } = await rig(conn, "POST", "/gen/image", payload);
      if (status === 401) throw new Error("the rig refused the key (401) — tell dad");
      if (status !== 201 && status !== 200) throw new Error(`rig refused panel ${number} (${status}): ${JSON.stringify(body).slice(0, 200)}`);
      state[panel.image] = { jobId: body.id, attempts: state[panel.image]?.attempts ?? 1 };
      await saveState();
      const eta = body.status === "queued" && body.eta_s ? `, starts in ~${Math.ceil(body.eta_s / 60)} min` : "";
      log(`panel ${number}: job ${body.id} ${body.status}${eta}`);
    }

    const left = (await Promise.all(shots.map(async ({ panel }) => !failed.includes(panel.image)
      && !await exists(path.join(episodeDir, "panels", panel.image))))).filter(Boolean).length;
    if (left === 0) break;
    if (Date.now() + pollMs > deadline) break;
    await sleep(pollMs);
  }

  await fs.rm(tmp, { recursive: true, force: true });
  const notDrawn = [];
  for (const { panel, number } of shots) {
    if (!await exists(path.join(episodeDir, "panels", panel.image))) notDrawn.push(number);
  }
  const stillOnRig = notDrawn.filter((number) => !failed.includes(shots.find((s) => s.number === number).panel.image));
  return { total: shots.length, drawn: shots.length - notDrawn.length, stillOnRig, failed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug || !/^ep\d{2}$/.test(args.episode ?? "") || !(args.maxSeconds > 0)) {
    console.error("Usage: npm run webtoon-draw -- <slug> <epNN> [--only 1,2,3] [--redo 3,5] [--max-seconds 150]");
    process.exitCode = 1;
    return;
  }
  const result = await drawEpisode(args);
  console.log(`${result.drawn}/${result.total} panels drawn.`);
  if (result.failed.length > 0) {
    console.log(`FAILED: ${result.failed.join(", ")} — change the prompt or try later.`);
    process.exitCode = 1;
  } else if (result.stillOnRig.length > 0) {
    console.log(`Still on the rig: panels ${result.stillOnRig.join(", ")} — run the same command again.`);
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
