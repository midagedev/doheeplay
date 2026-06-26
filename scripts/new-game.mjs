#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return slug || `game-${today().replaceAll("-", "")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlTemplate(title) {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7efe5;
        color: #202124;
      }
      main {
        width: min(680px, calc(100vw - 32px));
      }
      h1 {
        font-size: 2rem;
        margin: 0 0 12px;
      }
      .stage {
        min-height: 320px;
        display: grid;
        place-items: center;
        border: 3px solid #202124;
        border-radius: 8px;
        background: #ffffff;
      }
      button {
        min-height: 44px;
        border: 0;
        border-radius: 8px;
        padding: 0 18px;
        background: #176b87;
        color: #ffffff;
        font-weight: 800;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <section class="stage">
        <button type="button">Start</button>
      </section>
    </main>
  </body>
</html>
`;
}

async function main() {
  const [title, requestedSlug] = process.argv.slice(2);

  if (!title) {
    console.error('Usage: npm run new-game -- "Game Title" optional-slug');
    process.exitCode = 1;
    return;
  }

  const slug = slugify(requestedSlug || title);
  const dir = path.join(repoRoot, "games", slug);

  await fs.mkdir(path.dirname(dir), { recursive: true });
  await fs.mkdir(dir, { recursive: false });
  await fs.writeFile(
    path.join(dir, "metadata.json"),
    `${JSON.stringify({
      title,
      description: "A new static HTML game.",
      createdAt: today(),
      tags: ["draft"],
      controls: ["Keyboard", "Touch"]
    }, null, 2)}\n`
  );
  await fs.writeFile(path.join(dir, "index.html"), htmlTemplate(title));

  console.log(`Created games/${slug}/`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
