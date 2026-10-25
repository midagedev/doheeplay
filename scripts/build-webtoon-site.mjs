#!/usr/bin/env node
// Build the family-only webtoon site into webtoon-site/ (served on the tailnet by Tailscale Serve,
// https://vps.mogera-goblin.ts.net:10002/). Webtoon data lives in webtoons/, a clone of the
// private repo midagedev/dohee-webtoons; neither folder goes to the public doheeplay repo.
//
//   npm run webtoon-site
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateWebtoons } from "./validate-webtoon.mjs";
import { buildWebtoons, escapeHtml } from "./webtoon-render.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function renderHome(series) {
  const cards = series.map(({ slug, metadata, episodes }) => {
    const latest = episodes[episodes.length - 1];
    return `<li><a class="wt-episode" href="./webtoons/${escapeHtml(slug)}/"><span class="wt-thumb-blank"></span><span><strong>${escapeHtml(metadata.title)}</strong><small>${episodes.length}화 · 최근 ${escapeHtml(latest.episode.createdAt)}</small><small>${escapeHtml(metadata.description)}</small></span></a></li>`;
  }).join("\n        ");
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>도희 웹툰</title>
    <link rel="stylesheet" href="./webtoon.css">
  </head>
  <body class="webtoon-body">
    <header class="wt-header">
      <span class="wt-series">우리 가족만 보는 곳</span>
      <h1>도희 웹툰</h1>
    </header>
    <main class="wt-list">
      <ol>
        ${cards || "<li>아직 공개한 웹툰이 없어요.</li>"}
      </ol>
    </main>
  </body>
</html>
`;
}

// Writes into a sibling temp folder and swaps it in, so a reader never sees a half-built site.
export async function buildWebtoonSite({ root = repoRoot, outDir = path.join(root, "webtoon-site"), quiet = false } = {}) {
  const { series } = await validateWebtoons({ root, quiet: true });
  series.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  const staging = `${outDir}.tmp`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  await buildWebtoons(series, staging);
  await fs.copyFile(path.join(repoRoot, "src", "webtoon.css"), path.join(staging, "webtoon.css"));
  await fs.writeFile(path.join(staging, "index.html"), renderHome(series));
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.rename(staging, outDir);
  const episodes = series.reduce((sum, item) => sum + item.episodes.length, 0);
  if (!quiet) console.log(`Built ${series.length} webtoon${series.length === 1 ? "" : "s"} (${episodes} episode${episodes === 1 ? "" : "s"}) into ${path.relative(root, outDir) || outDir}/`);
  return { series: series.length, episodes };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildWebtoonSite().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
