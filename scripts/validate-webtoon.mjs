#!/usr/bin/env node
// Validate webtoons/<slug>/ series before they are built into the tailnet webtoon site.
// webtoons/ is a clone of the private repo midagedev/dohee-webtoons (gitignored here).
//
// Layout (see .agents/skills/webtoon-dohee/SKILL.md):
//   webtoons/<slug>/metadata.json        title, description, createdAt, tags?
//   webtoons/<slug>/notes.md             series bible (characters, style, places) — not on the site
//   webtoons/<slug>/refs/                character sheets and the child's drawings — not on the site
//   webtoons/<slug>/epNN/episode.json    title, createdAt, draft?, panels[]
//   webtoons/<slug>/epNN/panels/<file>   panel images (png/jpg/webp)
//
// Bubbles are real text laid over the image by the viewer, so Korean never has to be drawn by
// an image model. Their position is in percent of the panel box.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const episodePattern = /^ep\d{2}$/;
const imageNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const whPattern = /^\d{3,4} \d{3,4}$/;

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const allowedExtensions = new Set([...imageExtensions, ".json", ".md"]);

export const BUBBLE_KINDS = ["speech", "thought", "shout", "narration", "sfx"];
export const GAPS = { none: 0, normal: 24, wide: 96 };
const TAILS = ["left", "right", "none"];

export const LIMITS = {
  maxImageBytes: 3 * 1024 * 1024,
  maxSeriesBytes: 80 * 1024 * 1024,
  maxPanels: 60,
  maxBubbles: 4,
  maxBubbleChars: 60,
  minBubbleWidth: 10,
  maxBubbleWidth: 90,
  minBlankRatio: 0.1,
  maxBlankRatio: 2,
  maxPromptChars: 1500
};

function fail(errors, message) {
  errors.push(message);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, errors, rel) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    fail(errors, `${rel(filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

// webtoons/ is a git checkout: skip .git, .DS_Store and other dot entries everywhere.
async function listDir(dir) {
  return (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => !entry.name.startsWith("."));
}

async function walk(dir) {
  const entries = await listDir(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";
const inRange = (value, lo, hi) => typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi;

function validateMetadata(metadata, where, errors) {
  if (!isObject(metadata)) {
    fail(errors, `${where} must contain a JSON object`);
    return;
  }
  for (const field of ["title", "description", "createdAt"]) {
    if (!isNonEmptyString(metadata[field])) {
      fail(errors, `${where} needs a non-empty "${field}" string`);
    }
  }
  if (typeof metadata.createdAt === "string" && !datePattern.test(metadata.createdAt)) {
    fail(errors, `${where} createdAt must use YYYY-MM-DD`);
  }
  if (metadata.tags !== undefined
    && (!Array.isArray(metadata.tags) || metadata.tags.some((value) => typeof value !== "string"))) {
    fail(errors, `${where} optional "tags" must be an array of strings`);
  }
}

function validateBubble(bubble, where, errors) {
  if (!isObject(bubble)) {
    fail(errors, `${where} must be an object`);
    return;
  }
  if (!isNonEmptyString(bubble.text)) {
    fail(errors, `${where} needs non-empty "text"`);
  } else if ([...bubble.text].length > LIMITS.maxBubbleChars) {
    fail(errors, `${where} text is ${[...bubble.text].length} characters; max ${LIMITS.maxBubbleChars} — split it into another bubble or panel`);
  }
  if (bubble.kind !== undefined && !BUBBLE_KINDS.includes(bubble.kind)) {
    fail(errors, `${where} kind must be one of ${BUBBLE_KINDS.join(", ")}`);
  }
  for (const axis of ["x", "y"]) {
    if (!inRange(bubble[axis], 0, 100)) {
      fail(errors, `${where} "${axis}" must be a number from 0 to 100 (percent of the panel)`);
    }
  }
  if (bubble.w !== undefined && !inRange(bubble.w, LIMITS.minBubbleWidth, LIMITS.maxBubbleWidth)) {
    fail(errors, `${where} "w" must be a number from ${LIMITS.minBubbleWidth} to ${LIMITS.maxBubbleWidth}`);
  }
  if (inRange(bubble.x, 0, 100) && inRange(bubble.w ?? 40, 0, 100) && bubble.x + (bubble.w ?? 40) > 100) {
    fail(errors, `${where} x + w is ${bubble.x + (bubble.w ?? 40)}; it must stay within 100`);
  }
  if (bubble.tail !== undefined && !TAILS.includes(bubble.tail)) {
    fail(errors, `${where} tail must be one of ${TAILS.join(", ")}`);
  }
}

// What webtoon-draw sends to the rig for this panel. The renderer ignores it.
function validateDraw(draw, where, errors) {
  if (!isObject(draw)) {
    fail(errors, `${where} must be an object`);
    return;
  }
  if (!isNonEmptyString(draw.prompt) || draw.prompt.length > LIMITS.maxPromptChars) {
    fail(errors, `${where} needs a "prompt" string of at most ${LIMITS.maxPromptChars} characters`);
  }
  if (draw.neg !== undefined && (typeof draw.neg !== "string" || draw.neg.length > LIMITS.maxPromptChars)) {
    fail(errors, `${where} neg must be a string of at most ${LIMITS.maxPromptChars} characters`);
  }
  if (draw.wh !== undefined && (typeof draw.wh !== "string" || !whPattern.test(draw.wh))) {
    fail(errors, `${where} wh must look like "768 1152" (width height, 256–2048)`);
  } else if (typeof draw.wh === "string") {
    const sides = draw.wh.split(" ").map(Number);
    if (sides.some((side) => side < 256 || side > 2048 || side % 16 !== 0)) {
      fail(errors, `${where} wh sides must be 256–2048 and multiples of 16`);
    }
  }
  if (draw.seed !== undefined && !(Number.isInteger(draw.seed) && draw.seed >= 0 && draw.seed <= 2 ** 31)) {
    fail(errors, `${where} seed must be a whole number from 0 to 2147483648`);
  }
}

async function validatePanel(panel, index, episodeDir, where, errors, draft) {
  const at = `${where} panels[${index}]`;
  if (!isObject(panel)) {
    fail(errors, `${at} must be an object`);
    return;
  }
  const hasImage = panel.image !== undefined;
  const hasBlank = panel.blank !== undefined;
  if (hasImage === hasBlank) {
    fail(errors, `${at} needs exactly one of "image" (a file in panels/) or "blank" (a #rrggbb color)`);
  }
  if (hasImage) {
    if (typeof panel.image !== "string" || !imageNamePattern.test(panel.image)
      || !imageExtensions.has(path.extname(panel.image).toLowerCase())) {
      fail(errors, `${at} image must be a plain .png/.jpg/.jpeg/.webp file name inside panels/`);
    } else if (!await pathExists(path.join(episodeDir, "panels", panel.image))
      && !(draft && panel.draw !== undefined)) {
      // A draft may list panels that webtoon-draw has not drawn yet; a published episode may not.
      fail(errors, `${at} image panels/${panel.image} does not exist`);
    }
  }
  if (hasBlank) {
    if (typeof panel.blank !== "string" || !colorPattern.test(panel.blank)) {
      fail(errors, `${at} blank must be a #rrggbb color`);
    }
    if (panel.ratio !== undefined && !inRange(panel.ratio, LIMITS.minBlankRatio, LIMITS.maxBlankRatio)) {
      fail(errors, `${at} ratio (height / width) must be from ${LIMITS.minBlankRatio} to ${LIMITS.maxBlankRatio}`);
    }
  }
  if (panel.draw !== undefined) {
    validateDraw(panel.draw, `${at} draw`, errors);
    if (!hasImage) fail(errors, `${at} draw needs an "image" file name to draw into`);
  }
  if (panel.alt !== undefined && typeof panel.alt !== "string") {
    fail(errors, `${at} alt must be a string`);
  }
  if (panel.gap !== undefined && !(panel.gap in GAPS)) {
    fail(errors, `${at} gap must be one of ${Object.keys(GAPS).join(", ")}`);
  }
  if (panel.bubbles !== undefined) {
    if (!Array.isArray(panel.bubbles)) {
      fail(errors, `${at} bubbles must be an array`);
    } else {
      if (panel.bubbles.length > LIMITS.maxBubbles) {
        fail(errors, `${at} has ${panel.bubbles.length} bubbles; max ${LIMITS.maxBubbles} — split the panel`);
      }
      panel.bubbles.forEach((bubble, b) => validateBubble(bubble, `${at} bubbles[${b}]`, errors));
    }
  }
}

async function validateEpisode(slug, episodeName, episodeDir, rel, errors) {
  const episodePath = path.join(episodeDir, "episode.json");
  const where = rel(episodePath);
  if (!await pathExists(episodePath)) {
    fail(errors, `webtoons/${slug}/${episodeName}/episode.json is required`);
    return null;
  }
  const episode = await readJson(episodePath, errors, rel);
  if (!isObject(episode)) {
    if (episode !== null) fail(errors, `${where} must contain a JSON object`);
    return null;
  }
  if (!isNonEmptyString(episode.title)) {
    fail(errors, `${where} needs a non-empty "title" string`);
  }
  if (!isNonEmptyString(episode.createdAt) || !datePattern.test(episode.createdAt)) {
    fail(errors, `${where} createdAt must use YYYY-MM-DD`);
  }
  if (episode.draft !== undefined && typeof episode.draft !== "boolean") {
    fail(errors, `${where} draft must be true or false`);
  }
  if (!Array.isArray(episode.panels)) {
    fail(errors, `${where} panels must be an array`);
    return episode;
  }
  if (episode.panels.length > LIMITS.maxPanels) {
    fail(errors, `${where} has ${episode.panels.length} panels; max ${LIMITS.maxPanels}`);
  }
  if (episode.draft !== true && episode.panels.length === 0) {
    fail(errors, `${where} has no panels; keep "draft": true until the first panel is in`);
  }
  for (const [index, panel] of episode.panels.entries()) {
    await validatePanel(panel, index, episodeDir, where, errors, episode.draft === true);
  }
  return episode;
}

async function validateSeries(slug, dir, rel) {
  const errors = [];
  if (!slugPattern.test(slug)) {
    fail(errors, `webtoons/${slug} has an invalid slug; use lowercase letters, numbers, and hyphens`);
  }

  const metadataPath = path.join(dir, "metadata.json");
  let metadata = null;
  if (!await pathExists(metadataPath)) {
    fail(errors, `webtoons/${slug}/metadata.json is required`);
  } else {
    metadata = await readJson(metadataPath, errors, rel);
    if (metadata !== null) validateMetadata(metadata, rel(metadataPath), errors);
  }

  let totalBytes = 0;
  for (const filePath of await walk(dir)) {
    const ext = path.extname(filePath).toLowerCase();
    const stats = await fs.stat(filePath);
    totalBytes += stats.size;
    if (!allowedExtensions.has(ext)) {
      fail(errors, `${rel(filePath)} uses blocked extension "${ext || "(none)"}" (webtoons hold only images, json and md)`);
    }
    if (imageExtensions.has(ext) && stats.size > LIMITS.maxImageBytes) {
      fail(errors, `${rel(filePath)} is too large (${stats.size} bytes; max ${LIMITS.maxImageBytes}) — convert it to .jpg`);
    }
  }
  if (totalBytes > LIMITS.maxSeriesBytes) {
    fail(errors, `webtoons/${slug} is too large (${totalBytes} bytes; max ${LIMITS.maxSeriesBytes})`);
  }

  const entries = await listDir(dir);
  for (const entry of entries) {
    if (entry.isDirectory() && !episodePattern.test(entry.name) && entry.name !== "refs") {
      fail(errors, `webtoons/${slug}/${entry.name} is not an episode folder (use ep01, ep02, ...) or refs`);
    }
  }
  const episodeNames = entries
    .filter((entry) => entry.isDirectory() && episodePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const episodes = [];
  for (const name of episodeNames) {
    const episodeDir = path.join(dir, name);
    const episode = await validateEpisode(slug, name, episodeDir, rel, errors);
    if (episode) episodes.push({ name, dir: episodeDir, episode });
  }

  return { errors, metadata, episodes };
}

// Returns the series that have at least one published (non-draft) episode. Throws when any
// series fails validation, like validateGames(). includeDrafts keeps draft episodes too (preview).
export async function validateWebtoons({ root = defaultRoot, quiet = false, includeDrafts = false } = {}) {
  const webtoonsRoot = path.join(root, "webtoons");
  const rel = (filePath) => path.relative(root, filePath).split(path.sep).join("/");
  const errors = [];
  const series = [];
  let drafts = 0;

  if (await pathExists(webtoonsRoot)) {
    const entries = await listDir(webtoonsRoot);
    const dirs = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of dirs) {
      const slug = entry.name;
      const dir = path.join(webtoonsRoot, slug);
      const result = await validateSeries(slug, dir, rel);
      errors.push(...result.errors);
      if (result.errors.length > 0) continue;
      const published = result.episodes.filter(({ episode }) => includeDrafts || episode.draft !== true);
      drafts += result.episodes.length - published.length;
      if (published.length > 0) {
        series.push({ slug, dir, metadata: result.metadata, episodes: published });
      }
    }
  }

  if (errors.length > 0) {
    const message = ["Webtoon validation failed:", ...errors.map((error) => `- ${error}`)].join("\n");
    if (!quiet) console.error(message);
    throw new Error(message);
  }

  if (!quiet) {
    const episodeCount = series.reduce((sum, item) => sum + item.episodes.length, 0);
    console.log(`Validated ${series.length} webtoon${series.length === 1 ? "" : "s"} (${episodeCount} published episode${episodeCount === 1 ? "" : "s"}, ${drafts} draft${drafts === 1 ? "" : "s"}).`);
  }
  return { series };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateWebtoons().catch(() => {
    process.exitCode = 1;
  });
}
