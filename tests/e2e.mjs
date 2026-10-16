// Browser smoke test (Playwright). Run: node tests/e2e.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW_PATH || 'playwright');

const base = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '.';
const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); };

const browser = await chromium.launch();

async function run(label, device, lang, scheme) {
  const ctx = await browser.newContext({ ...device, locale: lang, colorScheme: scheme });
  await ctx.addInitScript(() => {
    window.__vib = [];
    if (!/iPhone/.test(navigator.userAgent)) {
      navigator.vibrate = (p) => { window.__vib.push(p); return true; };
    } else {
      // iOS Safari: function exists but never vibrates (returns false).
      navigator.vibrate = () => false;
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForSelector('.onboarding');
  await page.screenshot({ path: `${out}/${label}-1-onboarding.png` });
  await page.click('[data-action="onboard"]');
  await page.waitForSelector('.view-home');
  await page.screenshot({ path: `${out}/${label}-2-home.png`, fullPage: true });

  await page.goto(`${base}#/breathe`);
  await page.waitForSelector('.ex-list');
  await page.screenshot({ path: `${out}/${label}-3-list.png`, fullPage: true });

  // Box breathing session: start and watch phases change.
  await page.goto(`${base}#/breathe/box`);
  await page.click('#main-btn');
  const phases = new Set();
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(700);
    phases.add(await page.getAttribute('.session', 'data-phase'));
    if (i === 2) await page.screenshot({ path: `${out}/${label}-4-box-inhale.png` });
  }
  check(`${label}: box passes inhale/holdIn/exhale`, ['inhale', 'holdIn', 'exhale'].every((p) => phases.has(p)), [...phases].join(','));
  const fill = await page.evaluate(() => getComputedStyle(document.getElementById('visual')).getPropertyValue('--fill'));
  check(`${label}: lungs animation driven`, fill !== '', fill);
  const vib = await page.evaluate(() => window.__vib);
  if (!/iPhone/.test(device.userAgent)) {
    check(`${label}: vibration patterns sent per phase`, vib.length >= 3, `calls=${vib.length}, first len=${vib[0]?.length}`);
    check(`${label}: patterns are PWM arrays`, vib.every((p) => Array.isArray(p) && p.length > 4));
  } else {
    check(`${label}: iOS web does not try to vibrate`, vib.length === 0);
  }
  await page.click('#stop-btn');

  // Spirometer session
  await page.goto(`${base}#/spirometer`);
  await page.click('#main-btn');
  await page.waitForTimeout(5500);
  await page.screenshot({ path: `${out}/${label}-5-spiro.png` });
  const cy = await page.evaluate(() => [...document.querySelectorAll('.ball')].map((b) => Number(b.getAttribute('cy'))));
  check(`${label}: triflo balls rise during inhale`, cy[0] < 150, cy.join(','));
  await page.goto(`${base}#/home`);

  await page.goto(`${base}#/plan`);
  await page.waitForSelector('#plan-save');
  await page.screenshot({ path: `${out}/${label}-6-plan.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ics-btn')]);
  const path = await dl.path();
  const ics = (await import('node:fs')).readFileSync(path, 'utf8');
  check(`${label}: ics export downloads with alarms`, ics.includes('BEGIN:VALARM') && ics.includes('RRULE:FREQ=DAILY'), dl.suggestedFilename());

  // Save gives visible feedback and lands on home with a confirmation.
  await page.goto(`${base}#/plan`);
  await page.click('#plan-save');
  await page.waitForSelector('.saved-overlay', { timeout: 3000 });
  await page.screenshot({ path: `${out}/${label}-6b-saved.png` });
  await page.waitForSelector('.saved-banner', { timeout: 4000 });
  check(`${label}: save shows confirmation then home`, await page.isVisible('.view-home'));
  await page.screenshot({ path: `${out}/${label}-6c-home-saved.png` });

  await page.goto(`${base}#/settings`);
  await page.waitForSelector('.mode');
  const mode = await page.textContent('.mode');
  await page.screenshot({ path: `${out}/${label}-7-settings.png`, fullPage: true });
  check(`${label}: haptics mode shown`, mode.length > 10, mode.slice(0, 60));
  check(`${label}: no JS errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await run('android-sk', devices['Pixel 7'], 'sk-SK', 'light');
await run('android-tr', devices['Pixel 7'], 'tr-TR', 'dark');
await run('iphone-tr', devices['iPhone 14'], 'tr-TR', 'light');
await browser.close();

let fail = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  [${r.extra}]` : ''}`);
  if (!r.ok) fail++;
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
