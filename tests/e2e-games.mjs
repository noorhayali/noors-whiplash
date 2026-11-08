// Browser E2E for Fib Factory, Doodle Duel and Who Dunnit?: a real TV page and one real
// phone page in Chrome, plus socket "bot" phones to fill the room. Screenshots every phase.
//   npm run build && TIME_SCALE=0.5 PORT=3200 node dist/server.js &
//   BASE_URL=http://localhost:3200 node tests/e2e-games.mjs
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const OUT = new URL('./screenshots/games/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(code, name, avatar, behave) {
  const s = io(BASE, { transports: ['websocket'], forceNew: true });
  const b = { s, state: null, name };
  s.on('state', (v) => {
    b.state = v;
    behave(b, v);
  });
  b.ready = new Promise((r) => s.emit('player:join', { code, name, avatar }, r));
  b.act = (a) => new Promise((r) => s.emit('game:action', a, r));
  return b;
}

async function runGame(cardName, gameKey, nBots, behave, drivePhone) {
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  tv.on('pageerror', (e) => errors.push(`${gameKey} TV: ${e.message}`));
  await tv.goto(BASE);
  await tv.getByRole('button', { name: /Play Game/ }).click();
  await tv.locator('.game-card', { hasText: cardName }).click();
  await tv.waitForSelector('.code-tile');
  const code = (await tv.locator('.code-tile').allInnerTexts()).join('');
  log(gameKey, 'room', code);

  const phCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await phCtx.newPage();
  phone.on('pageerror', (e) => errors.push(`${gameKey} phone: ${e.message}`));
  await phone.goto(`${BASE}/join/${code}`);
  await phone.locator('input[placeholder="Your name"]').fill('Ava');
  await phone.getByText('Join the show!').click();
  await phone.waitForSelector('.phone-bar');

  const bots = [];
  const names = ['Ben', 'Cleo', 'Dev', 'Eli'];
  for (let i = 0; i < nBots; i++) {
    const b = bot(code, names[i], i + 3, behave);
    await b.ready;
    bots.push(b);
  }
  await tv.waitForTimeout(1200);
  await tv.screenshot({ path: `${OUT}${gameKey}-00-lobby.png` });
  await tv.getByRole('button', { name: /Everybody/ }).click();

  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const phase = bots[0].state?.phase;
    const round = bots[0].state?.round;
    const tag = `${phase}`;
    if (phase && !seen.has(tag)) {
      seen.add(tag);
      await sleep(phase === 'gameOver' ? 4500 : phase === 'reveal' ? 1600 : 900);
      const n = String(seen.size).padStart(2, '0');
      await tv.screenshot({ path: `${OUT}${gameKey}-${n}-${phase}-tv.png` });
      await phone.screenshot({ path: `${OUT}${gameKey}-${n}-${phase}-phone.png` });
      log(gameKey, 'phase', phase, 'round', round);
    }
    if (phase === 'gameOver') break;
    try {
      await drivePhone(phone, bots[0].state);
    } catch {}
    await sleep(150);
  }
  if (!seen.has('gameOver')) errors.push(`${gameKey}: never reached gameOver (saw ${[...seen].join(',')})`);
  bots.forEach((b) => b.s.close());
  await tvCtx.close();
  await phCtx.close();
}

// ---------------- Fib Factory ----------------
await runGame(
  'Fib Factory',
  'fib',
  3,
  (b, v) => {
    const d = v.data;
    if (v.phase === 'lie' && d?.myLie === null && b.lied !== v.round) (b.lied = v.round), b.act({ type: 'lie', text: `${b.name}'s lie #${v.round}` });
    if (v.phase === 'pick' && d?.canPick && b.picked !== v.round) {
      b.picked = v.round;
      const opts = d.options.filter((o) => !o.mine);
      b.act({ type: 'pick', choice: opts[Math.floor(Math.random() * opts.length)].key });
    }
  },
  async (phone) => {
    const ta = phone.locator('textarea.answer-input');
    if (await ta.isVisible({ timeout: 50 }).catch(() => false)) {
      await ta.fill('a very convincing lie');
      await phone.getByRole('button', { name: 'Send it' }).click({ timeout: 500 });
    }
    const btn = phone.locator('.vote-btn:not([disabled])');
    if ((await btn.count()) > 0) await btn.first().click({ timeout: 500 });
  },
);

// ---------------- Doodle Duel ----------------
await runGame(
  'Doodle Duel',
  'doodle',
  2,
  (b, v) => {
    const d = v.data;
    if (!d) return;
    if (v.phase === 'choose' && d.isArtist && b.chose !== v.round) (b.chose = v.round), b.act({ type: 'choose', index: 0 });
    if (v.phase === 'draw' && d.isArtist && b.drew !== v.round) {
      b.drew = v.round;
      // a wobbly smiley
      b.s.emit('draw', { t: 's', c: 0, w: 1, p: [300, 300] });
      const pts = [];
      for (let a = 0; a <= 64; a++) pts.push(500 + Math.cos((a / 64) * Math.PI * 2) * 250, 500 + Math.sin((a / 64) * Math.PI * 2) * 330);
      b.s.emit('draw', { t: 's', c: 5, w: 1, p: pts.slice(0, 120) });
      setTimeout(() => b.s.emit('draw', { t: 'm', p: pts.slice(120) }), 200);
      b.s.emit('draw', { t: 's', c: 1, w: 2, p: [380, 400, 400, 420] });
      b.s.emit('draw', { t: 's', c: 1, w: 2, p: [600, 400, 620, 420] });
      b.s.emit('draw', { t: 's', c: 0, w: 1, p: [350, 650, 450, 720, 550, 730, 650, 660] });
      b.word = d.word;
      global.__word = d.word;
      global.__wordRound = v.round;
    }
    if (v.phase === 'draw' && !d.isArtist && !d.gotIt && b.guessed !== v.round && global.__wordRound === v.round) {
      b.guessed = v.round;
      setTimeout(() => b.act({ type: 'guess', text: 'banana' }), 600);
      setTimeout(() => b.act({ type: 'guess', text: global.__word }), 2600);
    }
  },
  async (phone, botState) => {
    // Phone = Ava. If she's the artist: pick a word and scribble. Otherwise guess.
    const choose = phone.locator('.phone-center .btn');
    if (await phone.getByText('Your turn to draw').isVisible({ timeout: 50 }).catch(() => false)) await choose.first().click();
    const canvas = phone.locator('canvas.draw-canvas');
    if (await canvas.isVisible({ timeout: 50 }).catch(() => false)) {
      const w = await phone.locator('.draw-word b').innerText();
      global.__word = w;
      global.__wordRound = botState?.round;
      if (global.__drawn !== botState?.round) {
        global.__drawn = botState?.round;
        const box = await canvas.boundingBox();
        await phone.locator('.swatch').nth(5).click();
        await phone.mouse.move(box.x + 60, box.y + 60);
        await phone.mouse.down();
        for (let i = 0; i < 20; i++) await phone.mouse.move(box.x + 60 + i * 13, box.y + 60 + Math.sin(i / 2) * 50 + i * 6);
        await phone.mouse.up();
        await phone.locator('.swatch').nth(1).click();
        await phone.mouse.move(box.x + 200, box.y + 200);
        await phone.mouse.down();
        for (let i = 0; i < 16; i++) await phone.mouse.move(box.x + 200 + Math.cos(i / 2.5) * 60, box.y + 200 + Math.sin(i / 2.5) * 60);
        await phone.mouse.up();
      }
      return;
    }
    // Bots' turn as artist: they expose the word via a global for guessing.
    if (botState?.phase === 'draw' && global.__word && global.__wordRound !== botState.round) global.__wordRound = botState.round;
    const guess = phone.locator('input[placeholder="Your guess…"]');
    if (await guess.isVisible({ timeout: 50 }).catch(() => false) && global.__guessed !== botState?.round && global.__word) {
      global.__guessed = botState?.round;
      await guess.fill('pineapple');
      await phone.getByRole('button', { name: 'Guess' }).click();
      await sleep(900);
      await guess.fill(global.__word);
      await phone.getByRole('button', { name: 'Guess' }).click();
    }
  },
);

// ---------------- Who Dunnit? ----------------
const answers = ['3', 'like twice', 'Paris', 'never', 'pizza', '7'];
await runGame(
  'Who Dunnit?',
  'who',
  3,
  (b, v) => {
    const d = v.data;
    if (v.phase === 'answer' && d?.myAnswer === null && b.answered !== v.round) (b.answered = v.round), b.act({ type: 'answer', text: answers[(v.round + b.name.length) % answers.length] });
    if (v.phase === 'vote' && d?.canVote && b.voted !== v.round) {
      b.voted = v.round;
      const others = v.players.filter((p) => p.id !== v.me.id);
      setTimeout(() => b.act({ type: 'accuse', target: others[Math.floor(Math.random() * others.length)].id }), 800);
    }
  },
  async (phone) => {
    const ta = phone.locator('textarea.answer-input');
    if (await ta.isVisible({ timeout: 50 }).catch(() => false)) {
      await ta.fill('maybe 4');
      await phone.getByRole('button', { name: 'Send it' }).click({ timeout: 500 });
    }
    const btn = phone.locator('.who-btn:not([disabled])');
    if ((await btn.count()) > 0) await btn.first().click({ timeout: 500 });
  },
);

await browser.close();
if (errors.length) {
  console.error('FAILURES:\n' + errors.join('\n'));
  process.exit(1);
}
log('All three games played through in the browser ✔');
