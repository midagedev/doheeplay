// Render validated webtoons (from validate-webtoon.mjs) into <out>/webtoons/ — the tailnet
// webtoon site (build-webtoon-site.mjs) and the phone preview (webtoon-preview.mjs).
//   <out>/webtoons/<slug>/index.html          episode list
//   <out>/webtoons/<slug>/epNN/index.html     vertical-scroll viewer, bubbles as real text
//   <out>/webtoons/<slug>/epNN/panels/*       copied images
// notes.md, refs/, script.md and draft episodes are never copied.
import { promises as fs } from "node:fs";
import path from "node:path";
import { GAPS } from "./validate-webtoon.mjs";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const DEFAULT_TAIL = { speech: "left", shout: "left" };

function renderBubble(bubble) {
  const kind = bubble.kind ?? "speech";
  const tail = bubble.tail ?? DEFAULT_TAIL[kind] ?? "none";
  const width = bubble.w ?? 40;
  const text = escapeHtml(bubble.text).replaceAll("\n", "<br>");
  return `<p class="bubble ${kind} tail-${tail}" style="left:${bubble.x}%;top:${bubble.y}%;width:${width}%">${text}</p>`;
}

function renderPanel(panel, index) {
  const gap = GAPS[panel.gap ?? "normal"];
  const bubbles = (panel.bubbles ?? []).map(renderBubble).join("");
  const label = escapeHtml(panel.alt ?? "");
  let art;
  if (panel.image) {
    const loading = index < 2 ? "eager" : "lazy";
    art = `<img src="./panels/${escapeHtml(panel.image)}" alt="${label}" loading="${loading}" decoding="async">`;
  } else {
    const ratio = panel.ratio ?? 0.5;
    art = `<div class="blank" role="img" aria-label="${label}" style="background:${panel.blank};aspect-ratio:1 / ${ratio}"></div>`;
  }
  return `<figure class="panel" data-panel="${index + 1}" style="margin-top:${index === 0 ? 0 : gap}px">${art}${bubbles}</figure>`;
}

function page({ title, cssHref, body }) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${cssHref}">
  </head>
  <body class="webtoon-body">
${body}
  </body>
</html>
`;
}

export function renderEpisode(series, index) {
  const { metadata, episodes } = series;
  const { name, episode } = episodes[index];
  const prev = episodes[index - 1];
  const next = episodes[index + 1];
  const nav = [
    prev ? `<a class="wt-nav-link" href="../${prev.name}/">← 이전 화</a>` : `<span class="wt-nav-link is-off">← 이전 화</span>`,
    `<a class="wt-nav-link" href="../">목록</a>`,
    next ? `<a class="wt-nav-link" href="../${next.name}/">다음 화 →</a>` : `<span class="wt-nav-link is-off">다음 화 →</span>`
  ].join("");
  const panels = episode.panels.map(renderPanel).join("\n      ");
  return page({
    title: `${episode.title} · ${metadata.title}`,
    cssHref: "../../../webtoon.css",
    body: `    <header class="wt-header">
      <a class="wt-series" href="../">${escapeHtml(metadata.title)}</a>
      <h1>${escapeHtml(episode.title)}</h1>
    </header>
    <main class="wt-strip" data-episode="${name}">
      ${panels}
    </main>
    <nav class="wt-nav" aria-label="회차 이동">${nav}</nav>`
  });
}

export function renderSeriesIndex(series) {
  const { metadata, episodes } = series;
  const items = episodes.map(({ name, episode }) => {
    const cover = episode.panels.find((panel) => panel.image);
    const thumb = cover
      ? `<img src="./${name}/panels/${escapeHtml(cover.image)}" alt="" loading="lazy">`
      : `<span class="wt-thumb-blank"></span>`;
    return `<li><a class="wt-episode" href="./${name}/">${thumb}<span><strong>${escapeHtml(episode.title)}</strong><small>${escapeHtml(episode.createdAt)} · ${episode.panels.length}컷</small></span></a></li>`;
  }).join("\n        ");
  return page({
    title: `${metadata.title} · 도희 웹툰`,
    cssHref: "../../webtoon.css",
    body: `    <header class="wt-header">
      <a class="wt-series" href="../../">도희 웹툰</a>
      <h1>${escapeHtml(metadata.title)}</h1>
      <p class="wt-description">${escapeHtml(metadata.description)}</p>
    </header>
    <main class="wt-list">
      <ol>
        ${items}
      </ol>
    </main>`
  });
}

export async function buildWebtoons(seriesList, distRoot) {
  for (const series of seriesList) {
    const seriesDist = path.join(distRoot, "webtoons", series.slug);
    await fs.mkdir(seriesDist, { recursive: true });
    for (const [index, { name, dir }] of series.episodes.entries()) {
      const episodeDist = path.join(seriesDist, name);
      await fs.mkdir(episodeDist, { recursive: true });
      const panelsDir = path.join(dir, "panels");
      try {
        await fs.cp(panelsDir, path.join(episodeDist, "panels"), { recursive: true });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await fs.writeFile(path.join(episodeDist, "index.html"), renderEpisode(series, index));
    }
    await fs.writeFile(path.join(seriesDist, "index.html"), renderSeriesIndex(series));
  }
}
