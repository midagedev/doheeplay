#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateGames } from "./validate-game.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const srcRoot = path.join(repoRoot, "src");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTags(tags = []) {
  return tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
}

function renderControls(controls = []) {
  if (controls.length === 0) {
    return "";
  }
  return `<p class="controls">${controls.map(escapeHtml).join(" · ")}</p>`;
}

function renderIndex(games) {
  const cards = games
    .map(({ slug, metadata }) => {
      const title = metadata.title;
      const description = metadata.description;
      const tags = renderTags(metadata.tags || []);
      const controls = renderControls(metadata.controls || []);
      return `
        <article class="game-card">
          <a class="game-link" href="./games/${escapeHtml(slug)}/">
            <span class="game-kicker">${escapeHtml(metadata.createdAt)}</span>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(description)}</p>
            ${controls}
            <span class="play-button">Play</span>
          </a>
          <div class="tags">${tags}</div>
        </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dohee Play</title>
    <meta name="description" content="A small shelf of handmade HTML games.">
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="shell">
      <header class="site-header">
        <p class="eyebrow">HTML game shelf</p>
        <h1>Dohee Play</h1>
        <p class="intro">새로 만든 작은 게임들이 여기에 모여요.</p>
      </header>
      <section class="game-grid" aria-label="Games">
        ${cards}
      </section>
    </main>
  </body>
</html>
`;
}

function render404() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Not Found · Dohee Play</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="shell not-found">
      <p class="eyebrow">404</p>
      <h1>게임을 찾지 못했어요.</h1>
      <p class="intro"><a href="./">처음 화면으로 돌아가기</a></p>
    </main>
  </body>
</html>
`;
}

async function copyGame(game) {
  const target = path.join(distRoot, "games", game.slug);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(game.dir, target, { recursive: true });
}

async function build() {
  const { games } = await validateGames({ quiet: true });
  games.sort((a, b) => {
    const dateCompare = String(b.metadata.createdAt).localeCompare(String(a.metadata.createdAt));
    return dateCompare || String(a.metadata.title).localeCompare(String(b.metadata.title));
  });

  await fs.rm(distRoot, { recursive: true, force: true });
  await fs.mkdir(distRoot, { recursive: true });

  await Promise.all(games.map(copyGame));
  await fs.copyFile(path.join(srcRoot, "styles.css"), path.join(distRoot, "styles.css"));
  await fs.writeFile(path.join(distRoot, "index.html"), renderIndex(games));
  await fs.writeFile(path.join(distRoot, "404.html"), render404());
  await fs.writeFile(path.join(distRoot, ".nojekyll"), "");
  await fs.writeFile(
    path.join(distRoot, "games.json"),
    `${JSON.stringify(games.map(({ slug, metadata }) => ({ slug, ...metadata })), null, 2)}\n`
  );

  console.log(`Built ${games.length} game${games.length === 1 ? "" : "s"} into dist/.`);
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
