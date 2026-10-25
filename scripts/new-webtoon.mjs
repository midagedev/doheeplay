#!/usr/bin/env node
// Start a webtoon series or add its next episode.
//
//   npm run new-webtoon -- <slug> "<제목>"     # webtoons/<slug>/ with metadata, notes.md, ep01 draft
//   npm run new-webtoon -- <slug> --episode    # next epNN draft in an existing series
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function notesTemplate(title) {
  return `# ${title} — 시리즈 노트

웹툰을 만들 때마다 먼저 읽고, 바뀐 것을 여기에 적는다. 공개 사이트에는 올라가지 않는다(레포는 공개).

## 한 줄 이야기

(누가, 무엇을 하려다, 무엇에 부딪히는지 한 문장)

## 그림 스타일 토큰 (모든 컷 프롬프트 맨 앞에 그대로 붙인다)

- style: korean webtoon style, clean line art, soft cel shading, bright pastel colors
- seed: (첫 컷에서 마음에 든 seed 숫자)
- 비율: 세로 컷 \`768 1152\`, 가로 컷 \`1152 768\`, 정사각 \`1024 1024\`

## 캐릭터 (외형 토큰은 영어 명사구로, 바꾸지 않는다)

### (이름)
- 성격·말투: (대사만 봐도 누군지 알게)
- 외형 토큰: "(예: 12 year old girl, short black bob hair, big round brown eyes, yellow raincoat, red star hairpin)"
- 식별 표식: (항상 보이는 것 1~2개)
- 도희 그림: (도희가 그려 준 캐릭터 그림이 있으면 파일 이름)

## 장소 토큰

### LOC_(이름)
- 배경 토큰: "(영어 배경 묘사, 시간대·조명 포함)"

## 회차 기록

| 화 | 핵심 사건 | 떡밥(심은 것 / 회수할 화) | 끝 장면 |
|----|-----------|---------------------------|---------|
`;
}

function episodeTemplate(number) {
  return {
    title: `${number}화`,
    createdAt: today(),
    draft: true,
    panels: []
  };
}

async function writeEpisode(seriesDir, name, number) {
  const dir = path.join(seriesDir, name);
  await fs.mkdir(path.join(dir, "panels"), { recursive: true });
  await fs.writeFile(path.join(dir, "episode.json"), `${JSON.stringify(episodeTemplate(number), null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  const addEpisode = args.includes("--episode");
  const title = args.slice(1).filter((arg) => arg !== "--episode").join(" ").trim();

  if (!slug || !slugPattern.test(slug) || (!addEpisode && !title)) {
    console.error('Usage: npm run new-webtoon -- <english-slug> "<제목>"  |  npm run new-webtoon -- <slug> --episode');
    process.exitCode = 1;
    return;
  }

  const seriesDir = path.join(repoRoot, "webtoons", slug);

  if (addEpisode) {
    if (!await exists(seriesDir)) {
      console.error(`webtoons/${slug}/ does not exist; start the series first`);
      process.exitCode = 1;
      return;
    }
    const numbers = (await fs.readdir(seriesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^ep\d{2}$/.test(entry.name))
      .map((entry) => Number(entry.name.slice(2)));
    const number = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    if (number > 99) {
      console.error("episode numbers stop at ep99");
      process.exitCode = 1;
      return;
    }
    const name = `ep${String(number).padStart(2, "0")}`;
    await writeEpisode(seriesDir, name, number);
    console.log(`Created webtoons/${slug}/${name}/ (draft)`);
    return;
  }

  if (await exists(seriesDir)) {
    console.error(`webtoons/${slug}/ already exists; use --episode to add the next episode`);
    process.exitCode = 1;
    return;
  }
  await fs.mkdir(seriesDir, { recursive: true });
  await fs.writeFile(
    path.join(seriesDir, "metadata.json"),
    `${JSON.stringify({ title, description: "새 웹툰.", createdAt: today(), tags: ["webtoon"] }, null, 2)}\n`
  );
  await fs.writeFile(path.join(seriesDir, "notes.md"), notesTemplate(title));
  await writeEpisode(seriesDir, "ep01", 1);
  console.log(`Created webtoons/${slug}/ with notes.md and ep01/ (draft)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
