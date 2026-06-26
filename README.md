# Dohee Play

Dohee Play is a tiny static game shelf for HTML games.

The intended flow is:

1. Hermes creates a new game in `games/<slug>/`.
2. The repo validates the game with `npm run check`.
3. GitHub Pages publishes `dist/` after a push to `main`.

No VPS web server or Cloudflare Worker is required for the first version.

## Repository shape

```text
games/
  star-hop/
    index.html
    metadata.json
scripts/
  build-site.mjs
  new-game.mjs
  validate-game.mjs
src/
  styles.css
.github/workflows/pages.yml
```

## Local commands

```bash
npm run check
npm run build
npm run new-game -- "Rainbow Runner" rainbow-runner
```

Open `dist/index.html` after a build to preview the catalog.

## GitHub Pages setup

In the GitHub repository settings:

1. Go to **Settings -> Pages**.
2. Set **Build and deployment -> Source** to **GitHub Actions**.
3. Push `main`.

For a project repository, the site will usually be available at:

```text
https://<github-user>.github.io/doheeplay/
```

If this repository is renamed to `<github-user>.github.io`, the site is served from the user root instead.

## Adding a game

Each game lives in its own folder:

```text
games/my-game/
  index.html
  metadata.json
  assets/
```

`metadata.json` must include:

```json
{
  "title": "My Game",
  "description": "A short, kid-readable description.",
  "createdAt": "2026-06-26",
  "tags": ["arcade"],
  "controls": ["Arrow keys", "Space"]
}
```

Games should be static, self-contained, and safe to open directly in a browser.
Network calls and external scripts are intentionally blocked by validation.

