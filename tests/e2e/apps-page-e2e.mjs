/**
 * Playwright E2E test for Admin Dashboard + Apps page.
 * Runs headless Chromium, validates UI rendering, button clicks, API responses.
 *
 * Usage: node tests/e2e/apps-page-e2e.mjs
 */
import { chromium } from '/tmp/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8088';
const PASS = '\x1b[32m  PASS\x1b[0m';
const FAIL = '\x1b[31m  FAIL\x1b[0m';
const INFO = '\x1b[36m  INFO\x1b[0m';
let failures = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`${PASS} ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`${FAIL} ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

(async () => {
  // Pre-flight: ensure admin is reachable
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {
      if (attempt === 4) { console.log('\x1b[31m  Admin server not reachable after 5 attempts. Aborting.\x1b[0m'); process.exit(1); }
      console.log(`\x1b[33m  Waiting for admin server... (${attempt + 1}/5)\x1b[0m`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('\n\x1b[1m=== Admin Dashboard (/) E2E ===\x1b[0m\n');

  // ── 1. Dashboard loads ──
  const dashRes = await page.goto(`${BASE}/`);
  check('Dashboard loads', dashRes.status() === 200, `HTTP ${dashRes.status()}`);

  // Wait for JS to execute
  await page.waitForTimeout(2000);

  // ── 2. No JS errors ──
  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  // ── 3. Header elements ──
  const title = await page.title();
  check('Page title', title.includes('Brewnet'), title);

  // Tab bar exists
  const tabServices = await page.locator('.tab-btn, .tab').filter({ hasText: /Services/i }).count();
  check('Services tab exists', tabServices > 0);

  const tabLogs = await page.locator('.tab-btn, .tab').filter({ hasText: /Logs/i }).count();
  check('Logs tab exists', tabLogs > 0);

  // ── 4. Services table/cards render ──
  const svcBody = await page.locator('#svc-body, #svc-grid').count();
  check('Services container exists', svcBody > 0);

  // Wait for services to load (AJAX)
  await page.waitForTimeout(3000);

  // Check services rendered (either table rows or cards)
  const svcItems = await page.locator('#svc-body tr, .svc-card').count();
  check('Services rendered', svcItems > 0, `${svcItems} items`);

  // ── 5. Service names visible ──
  const bodyText = await page.locator('body').textContent();
  check('Traefik visible', bodyText.includes('Traefik') || bodyText.includes('traefik'));
  check('Gitea visible', bodyText.includes('Gitea') || bodyText.includes('gitea'));

  // ── 6. Refresh button works ──
  const refreshBtn = page.locator('text=/Refresh/i').first();
  if (await refreshBtn.isVisible()) {
    await refreshBtn.click();
    await page.waitForTimeout(2000);
    check('Refresh button clickable', true);
  } else {
    check('Refresh button exists', false, 'not found');
  }

  // ── 7. Logs tab switch ──
  const logsTab = page.locator('.tab-btn, .tab').filter({ hasText: /Logs/i }).first();
  if (await logsTab.isVisible()) {
    await logsTab.click();
    await page.waitForTimeout(1500);
    const logsVisible = await page.locator('#tab-logs, #logs-table, #logs-body').first().isVisible();
    check('Logs tab content visible after click', logsVisible);

    // Switch back to services
    const svcTab = page.locator('.tab-btn, .tab').filter({ hasText: /Services/i }).first();
    await svcTab.click();
    await page.waitForTimeout(500);
  }

  // ── 8. Activity log ──
  const actLog = await page.locator('#log').count();
  check('Activity log element exists', actLog > 0);

  // ── 9. No console JS errors ──
  check('No JS errors on dashboard', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors[0] : '');

  // ═══════════════════════════════════════════════════
  console.log('\n\x1b[1m=== Apps Page (/apps) E2E ===\x1b[0m\n');
  // ═══════════════════════════════════════════════════

  const jsErrors2 = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', (err) => jsErrors2.push(err.message));

  const appsRes = await page.goto(`${BASE}/apps`);
  check('Apps page loads', appsRes.status() === 200, `HTTP ${appsRes.status()}`);

  await page.waitForTimeout(3000);

  // ── 10. Header nav links ──
  const dashLink = await page.locator('a.nav-link').filter({ hasText: 'Dashboard' }).count();
  const appsLink = await page.locator('a.nav-link').filter({ hasText: 'Apps' }).count();
  check('Dashboard nav link', dashLink > 0);
  check('Apps nav link (active)', appsLink > 0);

  // ── 11. Stats boxes ──
  const statsBoxes = await page.locator('.sbox, .stats4 .sbox').count();
  check('Stats boxes rendered', statsBoxes >= 4, `${statsBoxes} boxes`);

  // ── 12. New App button ──
  const newAppBtn = page.locator('button').filter({ hasText: /New App/i }).first();
  check('New App button exists', await newAppBtn.isVisible());

  // ── 13. Click New App → Modal opens ──
  await newAppBtn.click();
  await page.waitForTimeout(500);
  const modalVisible = await page.locator('#modal-new-app').isVisible();
  check('New App modal opens on click', modalVisible);

  if (modalVisible) {
    // ── 14. New Project tab (default tab) ──
    const langGrid = await page.locator('#lang-grid').isVisible();
    check('New Project tab — Language grid visible (default)', langGrid);

    // ── 15. Git Clone tab ──
    const gitCloneTab = page.locator('.tab').filter({ hasText: /Git Clone/i }).first();
    if (await gitCloneTab.isVisible()) {
      await gitCloneTab.click();
      await page.waitForTimeout(300);
      const cloneUrlInput = await page.locator('#clone-url').isVisible();
      check('Git Clone tab — URL input visible', cloneUrlInput);
      const cloneBranchInput = await page.locator('#clone-branch').isVisible();
      check('Git Clone tab — Branch input visible', cloneBranchInput);
      // Switch back to New Project for framework checks
      const projTab = page.locator('.tab').filter({ hasText: /New Project/i }).first();
      await projTab.click();
      await page.waitForTimeout(300);
    }

    // ── 16. New Project frameworks (already on New Project tab) ──
    {
      const langCards = await page.locator('#lang-grid .lcard').count();
      check('Language options count', langCards === 7, `${langCards} languages`);

      // Click Go → frameworks appear
      const goCard = page.locator('#lang-grid .lcard').filter({ hasText: 'Go' }).first();
      if (await goCard.isVisible()) {
        await goCard.click();
        await page.waitForTimeout(300);
        const fwSection = await page.locator('#fw-section').isVisible();
        check('Go selected → Framework section visible', fwSection);

        // Check frameworks — should NOT contain Chi
        const fwChips = await page.locator('#fw-row .fchip').allTextContents();
        check('Go frameworks: Gin, Echo v4, Fiber v3',
          fwChips.includes('Gin') && fwChips.includes('Echo v4') && fwChips.includes('Fiber v3'),
          fwChips.join(', '));
        check('Go: no Chi (unsupported)', !fwChips.includes('Chi'), fwChips.join(', '));
      }

      // Click Python → check no Starlette
      const pyCard = page.locator('#lang-grid .lcard').filter({ hasText: 'Python' }).first();
      if (await pyCard.isVisible()) {
        await pyCard.click();
        await page.waitForTimeout(300);
        const pyFw = await page.locator('#fw-row .fchip').allTextContents();
        check('Python frameworks: FastAPI, Django, Flask',
          pyFw.includes('FastAPI') && pyFw.includes('Django') && pyFw.includes('Flask'),
          pyFw.join(', '));
        check('Python: no Starlette', !pyFw.includes('Starlette'));
      }

      // Click Rust → check no Rocket/Warp
      const rustCard = page.locator('#lang-grid .lcard').filter({ hasText: 'Rust' }).first();
      if (await rustCard.isVisible()) {
        await rustCard.click();
        await page.waitForTimeout(300);
        const rustFw = await page.locator('#fw-row .fchip').allTextContents();
        check('Rust: no Rocket/Warp', !rustFw.includes('Rocket') && !rustFw.includes('Warp'), rustFw.join(', '));
      }

      // Click Node.js → check no Fastify/Hono
      const nodeCard = page.locator('#lang-grid .lcard').filter({ hasText: 'Node.js' }).first();
      if (await nodeCard.isVisible()) {
        await nodeCard.click();
        await page.waitForTimeout(300);
        const nodeFw = await page.locator('#fw-row .fchip').allTextContents();
        check('Node.js: no Fastify/Hono', !nodeFw.includes('Fastify') && !nodeFw.includes('Hono'), nodeFw.join(', '));
      }

      // Click Java → check no Quarkus
      const javaCard = page.locator('#lang-grid .lcard').filter({ hasText: 'Java' }).first();
      if (await javaCard.isVisible()) {
        await javaCard.click();
        await page.waitForTimeout(300);
        const javaFw = await page.locator('#fw-row .fchip').allTextContents();
        check('Java: no Quarkus', !javaFw.includes('Quarkus'), javaFw.join(', '));
      }

      // Click React → only Next.js
      const reactCard = page.locator('#lang-grid .lcard').filter({ hasText: 'React' }).first();
      if (await reactCard.isVisible()) {
        await reactCard.click();
        await page.waitForTimeout(300);
        const reactFw = await page.locator('#fw-row .fchip').allTextContents();
        check('React: only Next.js', reactFw.length === 1 && reactFw[0] === 'Next.js', reactFw.join(', '));
      }
    }

    // Close modal
    const closeBtn = page.locator('#modal-new-app .xbtn, #modal-new-app button').filter({ hasText: /취소|✕|Close/i }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // ── 17. Gitea Repos table ──
  const repoTable = await page.locator('#repo-tbody').count();
  check('Gitea repos table exists', repoTable > 0);
  await page.waitForTimeout(2000);
  const repoRows = await page.locator('#repo-tbody tr').count();
  check('Gitea repos loaded', repoRows > 0, `${repoRows} rows`);

  // ── 18. App cards rendering ──
  const appList = await page.locator('#app-list').count();
  check('App list container exists', appList > 0);

  // ── 19. No JS errors on apps page ──
  check('No JS errors on /apps', jsErrors2.length === 0, jsErrors2.length > 0 ? jsErrors2[0] : '');

  // ═══════════════════════════════════════════════════
  console.log('\n\x1b[1m=== API Response Validation ===\x1b[0m\n');
  // ═══════════════════════════════════════════════════

  // Direct API checks
  const apiChecks = [
    { url: '/api/services', check: (d) => Array.isArray(d.services) && d.services.length > 0 },
    { url: '/api/apps', check: (d) => Array.isArray(d.apps) },
    { url: '/api/git/repos', check: (d) => Array.isArray(d.repos) },
    { url: '/api/apps/boilerplates', check: (d) => Array.isArray(d.boilerplates) },
    { url: '/api/health', check: (d) => d.status === 'ok' },
  ];

  // Use fetch() instead of page.goto() to avoid Playwright navigating away from
  // the HTML page and potentially crashing the admin server with rapid navigation.
  for (const { url, check: validator } of apiChecks) {
    try {
      const res = await fetch(`${BASE}${url}`);
      const body = await res.json();
      check(`API ${url}`, res.status === 200 && body && validator(body), `HTTP ${res.status}`);
    } catch (e) {
      check(`API ${url}`, false, e.message.substring(0, 100));
    }
  }

  // ── Services detail check ──
  const svcRes = await (await fetch(`${BASE}/api/services`)).json();
  const fb = (svcRes.services || []).find(s => s.id === 'filebrowser');
  if (fb) {
    check('FileBrowser external URL is /files',
      fb.externalUrl && fb.externalUrl.includes('/files') && !fb.externalUrl.includes('/static'),
      fb.externalUrl);
  }

  await browser.close();

  // ═══════════════════════════════════════════════════
  console.log(`\n\x1b[1m=== Summary ===\x1b[0m`);
  if (failures === 0) {
    console.log(`\x1b[32m\x1b[1m  All tests passed!\x1b[0m\n`);
  } else {
    console.log(`\x1b[31m\x1b[1m  ${failures} test(s) failed\x1b[0m\n`);
  }
  process.exit(failures > 0 ? 1 : 0);
})();
