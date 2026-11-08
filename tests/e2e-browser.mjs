// Real-browser end-to-end test: 1 TV page + N phone pages (separate browser contexts =
// separate devices), driving the actual UI. Saves screenshots to tests/screenshots/.
//
//   npm run build && TIME_SCALE=0.5 PORT=3200 node dist/server.js &
//   BASE_URL=http://localhost:3200 node tests/e2e-browser.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const N = Number(process.env.PLAYERS ?? 4);
const OUT = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const errors = [];

// ---- TV ----
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const tv = await tvCtx.newPage();
tv.on('pageerror', (e) => errors.push(`TV: ${e.message}`));
await tv.goto(BASE);
await tv.waitForTimeout(1800);
await tv.screenshot({ path: OUT + '01-landing.png' });
await tv.getByRole('button', { name: /Play Game/ }).click();
await tv.waitForTimeout(800);
await tv.screenshot({ path: OUT + '02-game-select.png' });
await tv.getByText('Start a room').click();
await tv.waitForSelector('.code-tile');
const code = (await tv.locator('.code-tile').allInnerTexts()).join('');
log('room', code);

// ---- phones ----
const names = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Faye', 'Gus', 'Hana', 'Ivo', 'Jo'];
const phones = [];
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`Phone${i}: ${e.message}`));
  await p.goto(i === 1 ? `${BASE}/join/${code}` : `${BASE}/join`); // phone 2 simulates scanning the QR
  if (i !== 1) await p.locator('.code-input').fill(code);
  await p.locator('input[placeholder="Your name"]').waitFor();
  await p.locator('input[placeholder="Your name"]').fill(names[i]);
  await p.locator('.avatar-opt:not(.taken)').nth(i % 3).click();
  if (i === 0) await p.screenshot({ path: OUT + '10-phone-join.png' });
  await p.getByText('Join the show!').click();
  await p.waitForSelector('.phone-bar');
  phones.push(p);
  log('joined', names[i]);
}
await tv.waitForTimeout(1500);
await tv.screenshot({ path: OUT + '03-lobby.png' });
await phones[0].screenshot({ path: OUT + '11-phone-lobby-vip.png' });

// Check names on TV
for (let i = 0; i < N; i++) {
  if (!(await tv.getByText(names[i], { exact: false }).first().isVisible())) errors.push(`TV missing ${names[i]}`);
}

// VIP starts from phone
await phones[0].getByText('Everybody’s in — start!').click();

// ---- auto-play phones ----
let refreshed = false;
const shots = new Set();
const answers = ['A haunted spreadsheet', 'Free hugs from a cactus', 'My cat filed my taxes', 'Socks with opinions', 'Mild panic, but fancy', 'Soup you can wear', 'A llama in a tuxedo', 'Interpretive tax dance'];
async function drive(p, i) {
  try {
    const ta = p.locator('textarea.answer-input');
    if (await ta.isVisible({ timeout: 50 }).catch(() => false)) {
      if (i === 0 && !shots.has('write')) {
        shots.add('write');
        await ta.fill(answers[0]);
        await p.screenshot({ path: OUT + '12-phone-writing.png' });
      }
      await ta.fill(answers[(Math.random() * answers.length) | 0] + ` (${names[i]})`);
      await p.getByRole('button', { name: 'Send it' }).click({ timeout: 500 });
      return;
    }
    const btn = p.locator('.vote-btn:not([disabled])');
    if ((await btn.count()) > 0) {
      if (i === 0 && !shots.has('vote')) {
        shots.add('vote');
        await p.screenshot({ path: OUT + '13-phone-voting.png' });
      }
      await btn.first().click({ timeout: 500 });
    }
  } catch {}
}

const tvShots = { intro: '04-intro', 'round-intro': '05-round-intro', writing: '06-writing', matchup: '07-matchup', scoreboard: '08-scoreboard', 'final-intro': '09a-final-intro', 'final-board': '09b-final-board', gameover: '09c-gameover' };
const seen = new Set();
const start = Date.now();
while (Date.now() - start < 240_000) {
  for (const [cls, name] of Object.entries(tvShots)) {
    if (seen.has(cls)) continue;
    if (await tv.locator(`.${cls}`).count()) {
      seen.add(cls);
      const wait = { matchup: 2600, scoreboard: 2400, gameover: 5000, intro: 4300, 'final-board': 2200, 'round-intro': 1300 }[cls] ?? 900;
      await tv.waitForTimeout(wait);
      await tv.screenshot({ path: OUT + name + '.png' });
      log('tv phase', cls);
      if (cls === 'matchup') {
        // also capture the result reveal
        await tv.waitForSelector('.author', { timeout: 15000 }).catch(() => {});
        await tv.waitForTimeout(1300);
        await tv.screenshot({ path: OUT + '07b-matchup-result.png' });
      }
    }
  }
  if (seen.has('gameover')) break;

  // Refresh one phone mid-game (round 1 writing) to verify reconnect.
  if (!refreshed && seen.has('writing')) {
    refreshed = true;
    await phones[2].reload();
    await phones[2].waitForSelector('.phone-bar', { timeout: 10000 });
    const nm = await phones[2].locator('.pb-name b').innerText();
    log('phone 3 refreshed → rejoined as', nm);
    if (nm !== names[2]) errors.push('Refresh rejoined as wrong player: ' + nm);
  }
  await Promise.all(phones.map(drive));
  await tv.waitForTimeout(150);
}

if (!seen.has('gameover')) errors.push('Game did not reach game over. Seen: ' + [...seen].join(','));
await phones[0].screenshot({ path: OUT + '14-phone-gameover.png' });

// Play again from the TV
await tv.waitForTimeout(1500);
await tv.getByRole('button', { name: /Play Again/ }).click();
await tv.waitForSelector('.intro', { timeout: 10000 }).then(() => log('play again → intro ✔')).catch(() => errors.push('Play again failed'));

// TV at other common sizes
for (const [w, h, n] of [[1280, 720, '15-tv-720p'], [3840, 2160, '16-tv-4k']]) {
  await tv.setViewportSize({ width: w, height: h });
  await tv.waitForTimeout(1200);
  await tv.screenshot({ path: OUT + n + '.png' });
}

await browser.close();
if (errors.length) {
  console.error('FAILURES:\n' + errors.join('\n'));
  process.exit(1);
}
log('E2E browser test passed ✔ — screenshots in tests/screenshots/');
