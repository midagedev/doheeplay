# Hermes Game Authoring Guide

Hermes should treat this repository as a static HTML game shelf.

## Allowed work area

For a normal game request, edit only:

```text
games/<slug>/metadata.json
games/<slug>/index.html
games/<slug>/assets/
```

Do not edit build scripts, GitHub Actions, or site-wide styles unless the human asks.

## Game rules

- Make one complete, playable browser game.
- Keep it static: HTML, CSS, JavaScript, JSON, images, fonts, and audio only.
- Prefer a single `index.html` unless assets are genuinely useful.
- Do not use external scripts, CDNs, analytics, network calls, cookies, or secrets.
- Keep controls friendly for keyboard and touch.
- Use visible restart/play controls and avoid text that can overlap on mobile.
- Run `npm run check` before handing off.

## Metadata

Every game needs a `metadata.json`:

```json
{
  "title": "Game title",
  "description": "One sentence a child can understand.",
  "createdAt": "2026-06-26",
  "tags": ["arcade"],
  "controls": ["Arrow keys", "Space", "Touch buttons"]
}
```

`createdAt` should be the current date in `YYYY-MM-DD` format.

## Suggested prompt for Hermes

```text
Create one complete static HTML game for this repo.

User request:
<paste the child's request here>

Work only under games/<new-slug>/.
Create metadata.json and index.html.
No network calls, no external assets, no CDNs.
Make the game playable by keyboard and touch.
After creating it, run npm run check and fix any validation errors.
```

