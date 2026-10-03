#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamesRoot = path.join(repoRoot, "games");

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedExtensions = new Set([
  ".css",
  ".gif",
  ".html",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".m4a",
  ".mp3",
  ".ogg",
  ".png",
  ".svg",
  ".txt",
  ".wav",
  ".webp",
  ".woff",
  ".woff2"
]);

const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt"]);
const maxFileBytes = 3 * 1024 * 1024;
const maxGameBytes = 12 * 1024 * 1024;

// 게임이 부를 수 있는 유일한 네트워크 엔드포인트: 가족 GLM 릴레이(tailnet 전용, 키 없음).
// 스킬 참고: .agents/skills/game-ai. 이 origin을 코드에 정확히 담은 파일만 fetch()를 쓸 수 있고,
// 그 외 모든 외부 URL·네트워크 API는 계속 차단한다.
const allowedNetOrigin = "https://vps.mogera-goblin.ts.net:10001";

const blockedPatterns = [
  { pattern: /https?:\/\//i, label: "external http(s) URL" },
  { pattern: /\/\/[a-z0-9.-]+\.[a-z]{2,}/i, label: "protocol-relative external URL" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { pattern: /\bWebSocket\s*\(/, label: "WebSocket" },
  { pattern: /\bEventSource\s*\(/, label: "EventSource" },
  { pattern: /\beval\s*\(/, label: "eval()" },
  { pattern: /\bnew\s+Function\s*\(/, label: "new Function()" },
  { pattern: /\bdocument\.cookie\b/, label: "document.cookie" },
  { pattern: /\bnavigator\.geolocation\b/, label: "geolocation" },
  { pattern: /\bNotification\.requestPermission\b/, label: "notifications" }
];

const vettedVendorFiles = new Set([
  "three.core.min.js",
  "three.module.min.js"
]);

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

async function readJson(filePath, errors) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    fail(errors, `${relative(filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
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

function validateMetadata(slug, metadata, metadataPath, errors) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    fail(errors, `${relative(metadataPath)} must contain a JSON object`);
    return;
  }

  for (const field of ["title", "description", "createdAt"]) {
    if (typeof metadata[field] !== "string" || metadata[field].trim() === "") {
      fail(errors, `${relative(metadataPath)} needs a non-empty "${field}" string`);
    }
  }

  if (typeof metadata.createdAt === "string" && !datePattern.test(metadata.createdAt)) {
    fail(errors, `${relative(metadataPath)} createdAt must use YYYY-MM-DD`);
  }

  if ("slug" in metadata && metadata.slug !== slug) {
    fail(errors, `${relative(metadataPath)} slug must match its folder name "${slug}"`);
  }

  for (const field of ["tags", "controls"]) {
    if (metadata[field] !== undefined) {
      if (!Array.isArray(metadata[field]) || metadata[field].some((value) => typeof value !== "string")) {
        fail(errors, `${relative(metadataPath)} optional "${field}" must be an array of strings`);
      }
    }
  }
}

async function validateTextFile(filePath, errors) {
  const parts = relative(filePath).split("/");
  const isVettedVendor = parts.includes("vendor") && vettedVendorFiles.has(path.basename(filePath));
  if (isVettedVendor) {
    return;
  }

  const content = await fs.readFile(filePath, "utf8");
  // fetch()는 릴레이를 쓰는 파일에서만 허용. 릴레이 origin은 검사 전에 지워서
  // "외부 URL" 패턴에 걸리지 않게 한다(다른 외부 URL은 그대로 걸린다).
  const usesRelay = content.includes(allowedNetOrigin);
  if (/\bfetch\s*\(/.test(content) && !usesRelay) {
    fail(errors, `${relative(filePath)} contains blocked pattern: fetch() (allowed only for the GLM relay)`);
  }
  const scrubbed = usesRelay ? content.split(allowedNetOrigin).join(" ") : content;
  for (const { pattern, label } of blockedPatterns) {
    if (pattern.test(scrubbed)) {
      fail(errors, `${relative(filePath)} contains blocked pattern: ${label}`);
    }
  }
}

async function validateGame(slug, dir) {
  const errors = [];

  if (!slugPattern.test(slug)) {
    fail(errors, `games/${slug} has an invalid slug; use lowercase letters, numbers, and hyphens`);
  }

  const indexPath = path.join(dir, "index.html");
  const metadataPath = path.join(dir, "metadata.json");

  if (!await pathExists(indexPath)) {
    fail(errors, `games/${slug}/index.html is required`);
  }
  if (!await pathExists(metadataPath)) {
    fail(errors, `games/${slug}/metadata.json is required`);
  }

  if (await pathExists(metadataPath)) {
    validateMetadata(slug, await readJson(metadataPath, errors), metadataPath, errors);
  }

  const files = await walk(dir);
  let totalBytes = 0;

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const stats = await fs.stat(filePath);
    totalBytes += stats.size;

    if (!allowedExtensions.has(ext)) {
      fail(errors, `${relative(filePath)} uses blocked extension "${ext || "(none)"}"`);
    }

    if (stats.size > maxFileBytes) {
      fail(errors, `${relative(filePath)} is too large (${stats.size} bytes; max ${maxFileBytes})`);
    }

    if (textExtensions.has(ext)) {
      await validateTextFile(filePath, errors);
    }
  }

  if (totalBytes > maxGameBytes) {
    fail(errors, `games/${slug} is too large (${totalBytes} bytes; max ${maxGameBytes})`);
  }

  return errors;
}

export async function validateGames({ quiet = false } = {}) {
  const errors = [];
  const games = [];

  if (!await pathExists(gamesRoot)) {
    fail(errors, "games/ directory is required");
  } else {
    const entries = await fs.readdir(gamesRoot, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

    if (dirs.length === 0) {
      fail(errors, "games/ must contain at least one game");
    }

    for (const entry of dirs) {
      const slug = entry.name;
      const dir = path.join(gamesRoot, slug);
      const gameErrors = await validateGame(slug, dir);
      errors.push(...gameErrors);

      if (gameErrors.length === 0) {
        const metadata = await readJson(path.join(dir, "metadata.json"), errors);
        games.push({ slug, dir, metadata });
      }
    }
  }

  if (errors.length > 0) {
    const message = ["Game validation failed:", ...errors.map((error) => `- ${error}`)].join("\n");
    if (!quiet) {
      console.error(message);
    }
    throw new Error(message);
  }

  if (!quiet) {
    console.log(`Validated ${games.length} game${games.length === 1 ? "" : "s"}.`);
  }

  return { games };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateGames().catch(() => {
    process.exitCode = 1;
  });
}
