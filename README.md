# Noor’s Whiplash

A real-time multiplayer party game you play the way TV game shows work: open it on a **TV or laptop**, and friends join and play from their **phones' browsers**. You don't need any downloads or accounts.

Noor’s Whiplash is the first game on the platform. Players write answers to filthy, dark or just plain weird prompts, the answers go head-to-head anonymously, and everyone else votes for the funnier one.

**Four games, one room.** Pick a game on the TV (you can switch in the lobby between games):
- **Noor’s Whiplash**: write answers to prompts and win anonymous head-to-head votes.
- **Fib Factory**: a weird TRUE fact has a blank. Write a convincing fake answer, then try to spot the truth. +1,000 for the truth, +500 for every friend you fool.
- **Doodle Duel**: take turns drawing a secret word on your phone. It appears live on the TV and everyone races to guess.
- **Who Dunnit?** (4+ players): everyone answers a question, but one secret impostor got a different one. Argue, then vote out the faker.

The host can **pause** (button, P or Space) and go **full screen** (button or F) at any time. **Late joiners** can scan the QR mid-game: they start on 0 points and play from the next round. Every game ends with a **Highlights of the night** screen (funniest player, clean-sweep champion, line of the night, biggest round, best lie, smoothest escape…).

**Two decks:** the default **Spicy 18+** deck has 120 Cards Against Humanity-style prompts about sex, booze, bodily functions, bad dates and dark stuff, with no punching at groups of people. The **Family** deck has 58 clean but still unhinged prompts for when parents or kids are around. Switch between them in the lobby. Spicy rooms also mix in some family prompts for variety.

---

## Quick start (your computer + phones on the same Wi-Fi)

Requires **Node.js 20+** ([nodejs.org](https://nodejs.org)).

```bash
npm install
npm run build
npm start
```

1. On the computer connected to your TV, open **http://localhost:3000**. Click **Play Game** and pick **Noor’s Whiplash**.
2. The TV shows a room code, a QR code and an address like `192.168.1.23:3000`. That's your computer's local network address, and the TV finds it for you automatically.
3. On each phone (on the **same Wi-Fi**), scan the QR code or open that address and enter the code.
4. Once 3+ players are in, press **Everybody's in!** on the TV, or the VIP (the first player to join) can press Start on their phone.

> If phones can't connect, your computer's firewall is probably blocking port 3000. Allow Node.js through the firewall, or use the internet deployment below.

### Development mode (hot reload)

```bash
npm run dev     # server on :3000, Vite client on :5173 (also reachable from phones on your LAN)
```

---

## Play over the internet (deploy)

The server keeps **persistent WebSocket connections**, so deploy it to a host that runs a long-lived Node process. **Serverless hosts like Vercel and Netlify won't work.** Good options are **Render**, **Railway** and **Fly.io**, or any VPS.

### Render (easiest, `render.yaml` included)
1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, then pick the repo. It reads `render.yaml`. Build: `npm ci && npm run build`. Start: `npm start`. Health check: `/health`.
3. Once it's live, add an env var `PUBLIC_URL=https://<your-app>.onrender.com` so the TV shows the clean address in the QR code.

> The **free** plan works for game nights (the included `render.yaml` uses it). Since Feb 2026, Render keeps free services awake while WebSocket messages are flowing, and the phones and TV ping the server every 10 seconds, so a game in progress keeps it awake. After 15 idle minutes it sleeps. Opening the site wakes it in about a minute, so open the TV page a minute before people join. Render may occasionally restart free services, which would end a game in progress. Upgrade to Starter if that ever becomes annoying.

### Railway / Fly.io / any Docker host
A `Dockerfile` is included: `docker build -t comedy-clash . && docker run -p 3000:3000 comedy-clash`.

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (default 3000) | Port to listen on. Most hosts set this for you. |
| `PUBLIC_URL` | recommended in production | Address shown on the TV and encoded in the QR code. |
| `CORS_ORIGIN` | no | Comma-separated allowed origins for socket connections. |
| `TIME_SCALE` | **tests only** | Speeds up all timers (e.g. `0.02` = 50× faster). Never set it in production. |

**Scaling note:** room state lives in the server's memory. That's fine for one instance, which can comfortably handle hundreds of simultaneous rooms. To run several instances behind a load balancer you'd need sticky sessions plus the Socket.IO Redis adapter and a shared state store. That isn't needed for friends-and-family use.

---

## How the game works

| Stage | TV shows | Phones show |
|---|---|---|
| Lobby | Room code, QR, join address, players popping in, Spicy/Family toggle | Join form → "You're in!" (tap your name to rename; VIP gets Start) |
| Intro | Animated title + rules + scoring | "Eyes on the TV" |
| Round 1–3 | Round title with ×1 / ×2 / ×3 multiplier | — |
| Writing ("Thinking time": 120s default, adjustable 60–240s) | Timer, who's finished | 2 private prompts, big text box |
| Reveal → Vote (30s) | Two anonymous answers slide in, VS badge, vote progress dots | Two big vote buttons (authors can't vote) |
| Result | Vote bars, authors revealed, points count up, CLEAN SWEEP stamp | — |
| Standings | Animated leaderboard that re-sorts itself | Your rank and points gained |
| Final Clash | Same prompt for everyone; grid of all answers | Write → vote for any answer except your own |
| Game over | Podium, crown, confetti, winner title, fun awards | Your placing, any award; VIP gets Play Again |

**Pairing:** each round, every player answers **two** prompts and faces **two different opponents**, whatever the player count (3–10).

**Scoring (fair at any player count):** points depend on the *share* of eligible voters who picked you, not the raw vote count.
- Each matchup is worth **1,000 × round** (R1 1,000, R2 2,000, R3 3,000), split by vote share.
- **Clean Sweep:** win every eligible vote (with 2+ voters) for **+250 × round**.
- **Forfeit:** if your opponent didn't answer, you get half the pool.
- **Final Clash:** a 5,000-point pool split by vote share.
- Ties at the top are shared, and the TV announces a joint win.

**Edge cases handled:** disconnects and refreshes (phones rejoin automatically with a secure token), players who never answer, nobody voting, tied votes, and the TV disconnecting (timers freeze until it's back, and phones show a banner). Rooms with no TV for 20 minutes close. Lobby players who disconnect for 45s are removed.

**Anti-cheat:** the server owns every timer, prompt assignment, vote and score. Phones never receive other players' answers before the reveal, or who wrote what before the result, including over the raw socket. Self-votes, double votes and votes from ineligible players are rejected on the server. Inputs are length-limited and sanitized, and each socket is rate-limited.

---

## Project structure

```
shared/types.ts                     Types shared by server + client (views, actions)
server/index.ts                     Express + Socket.IO server, event handlers
server/rooms.ts                     Room system: codes, players, reconnect tokens, host, VIP (game-agnostic)
server/timer.ts                     Pausable server-side phase timer
server/games/registry.ts            Game registry (add future games here)
server/games/comedyClash/engine.ts  Comedy Clash state machine
server/games/comedyClash/scoring.ts Pure scoring + pairing rules
server/games/comedyClash/prompts.ts 120 spicy + 58 family prompts across 11 categories, + 22 final prompts
client/src/net.ts                   Socket connection, session resume, state store, clock sync
client/src/audio.ts                 Procedural Web Audio sound effects + music sequencer
client/src/components/              12 original characters + host character, timers, confetti, UI
client/src/host/                    TV screen (lobby + every phase)
client/src/player/                  Phone controller
tests/                              Unit tests, multi-client socket tests, real-browser E2E
```

**Adding prompts:** append strings to any category array in `prompts.ts` (`SPICY` or `FAMILY`), or add a new category.

**Adding a future game:** implement the `GameInstance` interface in `server/rooms.ts` (`start`, `action`, `hostView`, `playerView`, …), register it in `server/games/registry.ts`, then add its TV and phone screens. Rooms, lobby, joining, QR, reconnection, VIP, sound and the stage visuals are all reused. The game-select screen already shows placeholder cards, clearly marked *Coming soon*.

**Art & audio:** all original. The look is deliberately simple: flat colour per round, one outline weight, and 12 hand-built SVG characters with odd shapes (a noodle, a potato, a wonky star…), mismatched eyes and stick legs. Every sound and all the music are synthesized live in the browser with the Web Audio API, so there are no audio files and nothing to license. The font (Bricolage Grotesque) is open-source (SIL OFL) and bundled locally.

---

## Tests

```bash
npm test            # unit + multiplayer socket tests (~30s)
npm run typecheck
# Real-browser E2E (needs Chrome/Chromium, e.g. `npx playwright install chromium`):
npm run build && TIME_SCALE=0.5 PORT=3200 node dist/server.js &
BASE_URL=http://localhost:3200 npm run test:e2e   # screenshots → tests/screenshots/
```

What's covered automatically:
- **Scoring/pairing unit tests**: vote shares, round multipliers, sweeps, ties, forfeits, divide-by-zero, fairness across player counts, pairing for 3–10 players, 150+ unique prompts, a 100+ spicy deck, and a family deck big enough for replays.
- **Multiplayer socket tests** (real server, independent clients for the TV and each phone):
  - A full 4-player game where every stage happens in order, and each final score equals the independently re-summed points
  - Answers private during writing, authors hidden during voting, self-votes / double votes / invalid votes / foreign prompts all rejected
  - A phone refresh mid-game resumes the same player; forged tokens are rejected; a silent player's matchups resolve as forfeits
  - The TV disconnecting pauses the game and resumes on reconnect
  - Play Again (via the VIP phone) with **no repeated prompts**, plus Back to Lobby
  - Join validation: bad code, duplicate name, avatar collision, room full (11th player), game already started, minimum players
  - **10 simultaneous players** through a whole game with all 11 clients agreeing on the final scores
  - Renaming in the lobby (unique names, blocked once the game starts)
  - Family mode never serves an 18+ prompt across a full game
- **Real-browser E2E**: Chrome with a 1080p TV page and four 390×844 phone pages in separate browser contexts. The phones join (one via the QR link), the VIP starts, everyone writes and votes through the actual UI, a phone is refreshed mid-game and rejoins, the game runs to the podium, then Play Again. It also screenshots the TV at 720p and 4K.

### Still needs a check on real devices
Automated tests can't fully cover these. Please try them on a game night:
- **iPhone Safari and Android Chrome** keyboards: the answer box should stay visible above the keyboard.
- **Phone sleep/lock** mid-round: on wake the phone should reconnect within a few seconds.
- **Smart-TV browsers** (Samsung/LG built-in browsers vary a lot). Casting or HDMI from a laptop is the most reliable setup.
- **Sound on the TV**: browsers block audio until the first click, so click once on the TV screen (a "Click for sound" button appears).
- **Venue Wi-Fi** that isolates devices from each other (some guest/hotel networks). Use the internet deployment in that case.

### Production checklist
- [ ] `https://<your-app>/health` returns `{"ok":true}`
- [ ] `PUBLIC_URL` is set, and the QR code on the TV opens the join page on a phone
- [ ] 3 phones on **mobile data** (not Wi-Fi) can join and play a round
- [ ] Refresh a phone mid-round: it rejoins as the same player
- [ ] Refresh the TV mid-round: the game pauses, then resumes
- [ ] Play Again, Game Selection and New Room all work from the final screen
- [ ] Your instance type doesn't sleep when idle
