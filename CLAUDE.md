# Noor's Whiplash — project guide for Claude Code

Real-time multiplayer party-game platform (Jackbox-style) with four games: **Noor's Whiplash** (comedy writing + voting), **Fib Factory** (bluffing on weird true facts), **Doodle Duel** (draw on your phone, others guess) and **Who Dunnit?** (one secret impostor gets a different question). One screen (TV/laptop) is the host; players join from phone browsers with a room code or QR. 18+ "spicy" deck by default, with a clean "Family" deck toggle.

## Commands
- `npm install` — once
- `npm run dev` — server on :3000 + Vite client on :5173 (hot reload; phones on the same Wi-Fi can open the LAN address shown on the TV)
- `npm run build && npm start` — production build on :3000
- `npm test` — unit + multiplayer socket tests (~35s). Run after any server change.
- `npm run typecheck`
- Browser E2E with screenshots: `npm run build && TIME_SCALE=0.5 PORT=3200 node dist/server.js &` then `BASE_URL=http://localhost:3200 npm run test:e2e` (needs Chrome; set `CHROME_PATH` if needed). Screenshots land in `tests/screenshots/`. Look at them after UI changes.
- New-games browser E2E: same server, then `BASE_URL=http://localhost:3200 npm run test:e2e:games` (screenshots in `tests/screenshots/games/`).

## Architecture
- `shared/types.ts`: every type the server and client share (views, actions, settings).
- `server/rooms.ts`: room system that works for any game (codes, players, reconnect tokens, host pause/resume, VIP, rename, settings). Games implement `GameInstance`.
- `server/games/comedyClash/`: this game's engine (state machine), `scoring.ts` (pure rules), `prompts.ts` (SPICY + FAMILY decks, final prompts). The internal id is still `comedy-clash`; the display name is "Noor's Whiplash".
- `server/games/base.ts`: `BaseGame`, the shared timer/pause/scores/results plumbing the newer games extend. Also has `normalize`/`levenshtein` helpers for typed answers.
- `server/games/fibFactory/` (facts.ts must contain only TRUE facts), `doodleDuel/` (words.ts; live strokes arrive via the `draw` socket event and are relayed to the TV with `room.emitHost`), `whoDunnit/` (questions.ts holds crew/impostor pairs).
- `shared/types.ts` `GAME_LIST` holds each game's name, tagline and player counts; `server/games/registry.ts` maps ids to engines; `client/src/games/registry.tsx` maps ids to TV/phone components and stage colour. Non-Whiplash games put their state in `view.data`.
- `server/index.ts`: Express + Socket.IO events. The server is authoritative for timers, prompts, votes and scores. Never trust the client.
- `client/src/net.ts`: socket, session resume (localStorage), state store, clock offset.
- `client/src/host/`: TV screens. `client/src/player/`: phone controller. `client/src/components/`: characters, timers, confetti, logo, UI.
- `client/src/audio.ts`: all sound and music, synthesized with Web Audio (no audio files).
- State flows one way: the server sends a per-client view (`hostView` / `playerView`) on every change. Hidden info (answers before reveal, authors before results) must never appear in another player's view.

## Design decisions (from Noor; keep these)
- **Characters (`components/Avatar.tsx`) are final.** Don't redesign them: flat colour, odd shapes, mismatched eyes, stick legs.
- **The UI should feel light, not cartoony:** flat colour per round, hairline borders (1.5px translucent), soft shadows. No thick black outlines, no hard offset shadows, no emoji in the UI.
- Host controls: Pause (button, P or Space) freezes all timers server-side; Full screen (button or F).
- Fonts: Bricolage Grotesque (UI), Unbounded 900, slanted, with a pink/cyan speed trail for the "WHIPLASH" title and "The Final Lash".
- The host screen scales from `--u` (1% of a 16:9 frame). Size host UI in `calc(var(--u) * N)` so it looks the same on a laptop and a 4K TV.
- Prompts: the spicy deck is Cards Against Humanity-style (sex, booze, bodily, dark, bad dates). The humour should never punch at groups of people. Append new prompts to the arrays; don't reorder them (IDs depend on position).
- For visual work, also use the Superdesign plugin and the installed design skills (modern-web-design, motion-framer, gsap-scrolltrigger).

## Deploy
Render free plan via `render.yaml` (Blueprint). Pushing to `main` redeploys automatically. Optionally set the `PUBLIC_URL` env var to the Render URL so the QR code and join address use it. The free plan sleeps after 15 idle minutes, and a game in progress keeps it awake.
