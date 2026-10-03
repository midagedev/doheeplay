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
- Then run `npm run playtest -- <slug>`. It plays the game in headless Chromium at iPhone and iPad sizes and
  fails on script errors or a blank screen; it warns when tapping changes nothing, the page scrolls sideways,
  or a button is off-screen or smaller than 40px. Fix every FAIL before pushing, and fix warnings unless the
  game has a reason (a puzzle that waits for a deliberate tap may legitimately not react to random taps).
  Screenshots and `report.json` land in `playtest-output/<slug>/` (gitignored).

### Content

- Horror is an allowed genre: ghosts, zombies, monsters, dark scenes, eerie audio, startle moments,
  stories that turn scarier or sadder toward the end — as scary as Dohee asks for (dad's call, 2026-10-03).
  "Anyone can view the site" is not a reason to refuse a horror game.
- Two lines stay: no graphic gore or detailed injuries in the art (build dread with mood instead), and
  no horror built on real people or real events. Fan-game themes from songs or characters are fine.

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
After creating it, run npm run check and npm run playtest -- <slug>, and fix any errors.
```


## Skills

`.agents/skills/` holds two skills to load while making a game:

- `game-feel` — juice: screen shake, hit-stop, easing, squash and stretch, layered feedback.
- `game-ui-ux` — HUD and menu layout that survives phone and tablet screens, safe areas, screen flow.

They come from [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
(Apache-2.0; see `LICENSE-awesome-gamedev-agent-skills` and `NOTICE-awesome-gamedev-agent-skills`), pinned at
the commit in `.upstream-sha`.

One-time setup on a new machine: `npm install` and `npx playwright install chromium`.
