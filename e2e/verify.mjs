import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5199;
const BASE_URL = process.env.VERIFY_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const SCREENSHOT_EDIT = fileURLToPath(new URL('./edit-view.png', import.meta.url));
const SCREENSHOT_RACE = fileURLToPath(new URL('./race-view.png', import.meta.url));
const SCREENSHOT_FINISH = fileURLToPath(new URL('./finish-view.png', import.meta.url));

const flatLevel = {
  version: 1,
  strokes: [{ points: [[-20, 0], [60, 0]] }],
  boosts: [],
  trampolines: [],
  paddles: [],
  start: { x: 0, y: 0.5, angle: 0 },
  finish: { x: 18, y: 0.8 },
};

const boostLevel = {
  ...flatLevel,
  boosts: [{ x: 0, y: 1, angle: 0 }],
  finish: { x: 55, y: 0.8 },
};

const recoveryLevel = {
  ...flatLevel,
  start: { x: 0, y: 0.5, angle: Math.PI },
  finish: { x: 45, y: 0.8 },
};

const landingLevel = {
  ...flatLevel,
  start: { x: 0, y: 8, angle: 0 },
  finish: { x: 45, y: 0.8 },
};

let failures = 0;
const pass = (message) => console.log(`PASS: ${message}`);
const fail = (message) => {
  failures += 1;
  console.error(`FAIL: ${message}`);
};

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForServer(url, timeoutMs = 30_000) {
  await waitFor(
    async () => {
      try {
        const response = await fetch(url);
        return response.ok;
      } catch {
        return false;
      }
    },
    timeoutMs,
    'the Vite server',
  );
}

async function launchChromium() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const localChrome = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
  if (localChrome) {
    return chromium.launch({ headless: true, executablePath: localChrome, args });
  }
  return chromium.launch({ headless: true, args });
}

let server = null;
let browser = null;

try {
  if (!process.env.VERIFY_BASE_URL) {
    const viteEntry = fileURLToPath(
      new URL('../node_modules/vite/bin/vite.js', import.meta.url),
    );
    server = spawn(
      process.execPath,
      [viteEntry, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }
  await waitForServer(BASE_URL);

  browser = await launchChromium();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 30_000 });
  await page.screenshot({ path: SCREENSHOT_EDIT });
  pass('app booted with the public debug handle');

  const initialStrokeCount = await page.evaluate(
    () => window.__game.getLevel().strokes.length,
  );
  await page.mouse.move(340, 330);
  await page.mouse.down();
  await page.mouse.move(650, 390, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(550);
  const editorResult = await page.evaluate(() => ({
    count: window.__game.getLevel().strokes.length,
    autosaved: Boolean(localStorage.getItem('sketch-racer:autosave')),
  }));
  editorResult.count === initialStrokeCount + 1
    ? pass('freehand pointer gesture created a terrain stroke')
    : fail(`editor stroke count was ${editorResult.count}, expected ${initialStrokeCount + 1}`);
  editorResult.autosaved
    ? pass('editor mutation reached debounced localStorage autosave')
    : fail('autosave key was not written');

  const loadedFlat = await page.evaluate(
    (level) => window.__game.loadLevel(level),
    flatLevel,
  );
  if (!loadedFlat) throw new Error('debug handle rejected a valid flat level');
  await page.evaluate(() => window.__game.setMode('play'));
  await page.evaluate(() => window.__game.setInput({ gas: true }));
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: SCREENSHOT_RACE });
  await page.waitForFunction(
    () => window.__game.getRunState().phase === 'finished',
    null,
    { timeout: 25_000 },
  );
  const race = await page.evaluate(() => ({
    run: window.__game.getRunState(),
    overlay: !document.querySelector('.overlay')?.classList.contains('hidden'),
    x: window.__game.getCarPose()?.x ?? -Infinity,
  }));
  race.run.timeMs > 0 && race.x > 15
    ? pass(`car reached the finish in ${(race.run.timeMs / 1000).toFixed(2)}s`)
    : fail(`finish state was invalid: ${JSON.stringify(race)}`);
  race.overlay ? pass('finish result overlay is visible') : fail('finish overlay stayed hidden');
  await page.screenshot({ path: SCREENSHOT_FINISH });

  await page.evaluate(() => window.__game.setInput({}));
  await page.evaluate(() => window.__game.setMode('edit'));
  const loadedBoost = await page.evaluate(
    (level) => window.__game.loadLevel(level),
    boostLevel,
  );
  if (!loadedBoost) throw new Error('debug handle rejected a valid boost level');
  await page.evaluate(() => window.__game.setMode('play'));
  let peakVelocity = 0;
  for (let sample = 0; sample < 18; sample += 1) {
    await page.waitForTimeout(100);
    const velocity = await page.evaluate(
      () => window.__game.getCarVelocity()?.x ?? 0,
    );
    peakVelocity = Math.max(peakVelocity, velocity);
  }
  peakVelocity > 3
    ? pass(`boost accelerated a coasting car to ${peakVelocity.toFixed(2)} units/s`)
    : fail(`boost peak velocity was only ${peakVelocity.toFixed(2)} units/s`);

  await page.evaluate(() => window.__game.setMode('edit'));
  const loadedLanding = await page.evaluate(
    (level) => window.__game.loadLevel(level),
    landingLevel,
  );
  if (!loadedLanding) {
    throw new Error('debug handle rejected a valid landing level');
  }
  await page.evaluate(() => window.__game.setMode('play'));
  let sawFastFall = false;
  let landed = false;
  let maximumRebound = 0;
  for (let sample = 0; sample < 70; sample += 1) {
    await page.waitForTimeout(50);
    const state = await page.evaluate(() => ({
      pose: window.__game.getCarPose(),
      velocity: window.__game.getCarVelocity(),
    }));
    if ((state.velocity?.y ?? 0) < -5) sawFastFall = true;
    if (sawFastFall && (state.pose?.y ?? Infinity) < 1.25) landed = true;
    if (landed) {
      maximumRebound = Math.max(maximumRebound, state.velocity?.y ?? 0);
    }
  }
  sawFastFall && landed && maximumRebound < 0.75
    ? pass(
        `ordinary terrain absorbed the landing (${maximumRebound.toFixed(2)} rebound)`,
      )
    : fail(
        `landing absorption failed: ${JSON.stringify({ sawFastFall, landed, maximumRebound })}`,
      );

  await page.evaluate(() => window.__game.setMode('edit'));
  const loadedRecovery = await page.evaluate(
    (level) => window.__game.loadLevel(level),
    recoveryLevel,
  );
  if (!loadedRecovery) throw new Error('debug handle rejected a valid recovery level');
  await page.evaluate(() => window.__game.setMode('play'));
  await page.waitForTimeout(1_500);
  const roofAngle = await page.evaluate(
    () => Math.cos(window.__game.getCarPose()?.angle ?? 0),
  );
  if (roofAngle > -0.75) {
    fail(`recovery scenario did not settle upside down: ${roofAngle.toFixed(2)}`);
  }
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(
      () => Math.cos(window.__game.getCarPose()?.angle ?? Math.PI) > 0.8,
      null,
      { timeout: 8_000 },
    );
  } finally {
    await page.keyboard.up('d');
  }
  pass('D key rocked an overturned car back onto its wheels');

  if (pageErrors.length === 0) pass('browser reported no page or console errors');
  else fail(`browser errors: ${pageErrors.join(' | ')}`);
} catch (error) {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser?.close().catch(() => undefined);
  server?.kill('SIGTERM');
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
