// Adversarial Playwright driver for PR #7 pre-merge fixes test plan.
// Connects to Devin's persistent Chrome via CDP at localhost:29229.

const { chromium } = require('playwright');

const FE = 'http://localhost:8080/index.html';
const BE = 'http://localhost:5000/api';

const ts = Date.now();
const SEEKER_EMAIL = `adv-seeker-${ts}@example.com`;
const RECRUITER_EMAIL = `adv-rec-${ts}@example.com`;
const PASSWORD = 'adv-pass-1';

function pad(s, n = 4) { return String(s).padStart(n); }
function ok(name, detail = '') { console.log(`PASS ${name}` + (detail ? ` :: ${detail}` : '')); return true; }
function fail(name, detail = '') { console.log(`FAIL ${name}` + (detail ? ` :: ${detail}` : '')); return false; }

// Set input value + dispatch input event, bypassing Playwright's visibility check.
async function setVal(page, sel, value) {
  await page.evaluate(({ sel, value }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('no such input: ' + sel);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel, value });
}
async function clickJS(page, sel) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('no such element: ' + sel);
    el.click();
  }, sel);
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const ctx = browser.contexts()[0] || await browser.newContext();
  // Reuse the existing page if there's one on the FE; else create one
  let page = ctx.pages().find(p => p.url().startsWith('http://localhost:8080'));
  if (!page) page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', message: String(e) }));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push({ kind: 'console.error', text: msg.text() }); });

  // Capture all /api/* fetches we make from the page
  const captured = [];
  await page.exposeFunction('__capture', (rec) => { captured.push(rec); });

  // Inject the fetch-capture wrapper on EVERY page load (survives navigations / reloads)
  await page.addInitScript(() => {
    window._captured = [];
    const _orig = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const auth = (init && init.headers && (init.headers['Authorization'] || init.headers['authorization'])) || null;
      let body = null;
      if (init && init.body && typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      const res = await _orig(input, init);
      const clone = res.clone();
      let respBody = null;
      try { respBody = await clone.json(); } catch {}
      window._captured.push({ url, status: res.status, auth, body, respBody });
      return res;
    };
  });

  await page.goto(FE, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });

  let nFail = 0;

  // ── TEST 1 ─────────────────────────────────────────────────────────────
  console.log('--- T1: motion.js console clean ---');
  // Wait briefly for the dynamic motion import
  await page.waitForTimeout(800);
  const t1 = await page.evaluate(() => {
    // Look for an actual import / dynamic import of the broken legacy URL,
    // ignoring matches inside HTML comments. Anchor on `import(` or `from "`.
    const html = document.documentElement.outerHTML;
    const stripComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const legacyImportRe = /(import[\s\S]{0,80}from\s*["'`][^"'`]*motion@latest\/dist\/motion\.js)|(import\s*\(\s*["'`][^"'`]*motion@latest\/dist\/motion\.js)/;
    const newImportRe = /motion@10\.18\.0\/\+esm/;
    return {
      hasMotion: typeof window._motion === 'object' && typeof window._motion?.animate === 'function',
      motionKeys: window._motion ? Object.keys(window._motion) : null,
      legacyMotionImport: legacyImportRe.test(stripComments),
      newMotionImport: newImportRe.test(stripComments),
    };
  });
  const motionErrors = errors.filter(e =>
    /motion/i.test(e.message || e.text || '') ||
    /does not provide an export named/i.test(e.message || e.text || '') ||
    /Failed to fetch dynamically imported module/i.test(e.message || e.text || '')
  );
  console.log('  probe:', JSON.stringify(t1));
  console.log('  motionErrors count:', motionErrors.length);
  if (t1.hasMotion && !t1.legacyMotionImport && t1.newMotionImport && motionErrors.length === 0) {
    ok('T1: motion ESM import works, no legacy import, no console errors');
  } else {
    nFail++;
    fail('T1', JSON.stringify({ ...t1, motionErrors }));
  }

  // ── TEST 2 ─────────────────────────────────────────────────────────────
  console.log('\n--- T2: no static demo cards on Jobs board ---');
  // Trigger jobs view via the actual nav handler used in index.html
  await page.evaluate(() => {
    // The desktop nav link uses onclick="switchView('job-board')". Just call it.
    if (typeof window.switchView === 'function') {
      window.switchView('job-board');
    }
  });
  // Wait for the dynamic loadJobs() to populate the grid
  await page.waitForFunction(() => {
    const grid = document.getElementById('job-grid');
    return grid && grid.style.display !== 'none' && grid.children.length > 0;
  }, { timeout: 8000 });
  const t2 = await page.evaluate(() => {
    const grid = document.getElementById('job-grid');
    const cards = [...grid.querySelectorAll('.job-card')];
    const noArgOpenCalls = cards.filter(c => (c.getAttribute('onclick') || '') === 'openJobModal()').length;
    const titles = cards.map(c => c.querySelector('.card-title')?.textContent?.trim() || '<no title>');
    // Demo titles to look for as exact matches (not substrings, since seeded data may
    // contain "Junior Data Scientist" which legitimately includes "Data Scientist").
    const exactDemoTitles = new Set(['UX Visionary', 'Frontend Architect', 'Data Scientist']);
    const matchesExactDemoTitle = titles.some(t => exactDemoTitles.has(t));
    return {
      cardCount: cards.length,
      cardTitles: titles,
      cardsHaveJobIds: cards.every(c => c.dataset.jobId && c.dataset.jobId.length > 0),
      jobIds: cards.map(c => c.dataset.jobId || null),
      noArgOpenCalls,
      matchesExactDemoTitle,
    };
  });
  console.log('  probe:', JSON.stringify(t2, null, 2));
  if (
    t2.cardCount === 3 &&
    t2.cardsHaveJobIds &&
    t2.noArgOpenCalls === 0 &&
    !t2.matchesExactDemoTitle
  ) {
    ok('T2: 3 dynamic cards, all with jobIds; no static demo cards');
  } else {
    nFail++;
    fail('T2', JSON.stringify(t2));
  }

  // ── TEST 3: Seeker register, no company field/payload ───────────────────
  console.log('\n--- T3: seeker register hides + omits company ---');
  await page.evaluate(() => { window._captured.length = 0; });
  await page.goto(FE + '#auth', { waitUntil: 'load' });
  // Land on home, click Job Seeker pill, then Launch Experience
  await page.evaluate(() => { location.hash = ''; if (typeof switchView === 'function') switchView('home'); });
  await page.waitForTimeout(300);
  // Make sure currentRole is seeker, then directly enter register mode
  await page.evaluate(() => {
    const seekerBtn = [...document.querySelectorAll('button.role-btn')].find(b => /Job Seeker/i.test(b.textContent));
    if (seekerBtn) seekerBtn.click();
    if (typeof switchView === 'function') switchView('auth-view');
    if (typeof setAuthMode === 'function') setAuthMode('register');
  });
  await page.waitForFunction(() => {
    const av = document.getElementById('auth-view');
    return av && getComputedStyle(av).display !== 'none' && getComputedStyle(document.getElementById('auth-name-group')).display !== 'none';
  }, { timeout: 8000 });
  // Verify name visible, company hidden
  const t3pre = await page.evaluate(() => ({
    nameDisplay: getComputedStyle(document.getElementById('auth-name-group')).display,
    companyDisplay: getComputedStyle(document.getElementById('auth-company-group')).display,
    currentRole: window.currentRole,
  }));
  console.log('  pre-submit groups:', JSON.stringify(t3pre));
  if (t3pre.companyDisplay === 'none' && t3pre.nameDisplay !== 'none') {
    ok('T3a: company group hidden for seeker, name group visible');
  } else {
    nFail++;
    fail('T3a: groups in unexpected state', JSON.stringify(t3pre));
  }
  // Fill form via DOM (auth-view is rendered but Playwright visibility check fails)
  await setVal(page, '#auth-name', 'Adversary One');
  await setVal(page, '#auth-email', SEEKER_EMAIL);
  await setVal(page, '#auth-password', PASSWORD);
  await clickJS(page, '#signin-btn');
  // Wait for the register response or navigation
  await page.waitForFunction(() => {
    return window._captured && window._captured.some(r => /\/api\/auth\/register/.test(r.url));
  }, { timeout: 15000 });
  const t3post = await page.evaluate(() => {
    const reg = window._captured.find(r => /\/api\/auth\/register/.test(r.url));
    return {
      hasToken: !!localStorage.getItem('giu-nexus.token'),
      register: reg && { status: reg.status, body: reg.body, role: reg.body?.role, hasCompanyKey: reg.body && Object.prototype.hasOwnProperty.call(reg.body, 'company') },
    };
  });
  console.log('  post-submit:', JSON.stringify(t3post, null, 2));
  if (
    t3post.register &&
    t3post.register.status === 201 &&
    t3post.register.role === 'seeker' &&
    t3post.register.hasCompanyKey === false &&
    t3post.hasToken
  ) {
    ok('T3b: seeker register 201, no company key in payload, token persisted');
  } else {
    nFail++;
    fail('T3b: seeker register not as expected', JSON.stringify(t3post));
  }

  // ── TEST 4: Recruiter register requires + persists company ─────────────
  console.log('\n--- T4: recruiter register requires + persists company ---');
  await page.evaluate(() => {
    if (window.api) window.api.logout();
    window._captured.length = 0;
  });
  await page.goto(FE, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  // Click the Recruiter role pill, then enter register mode
  await page.evaluate(() => {
    const recBtn = [...document.querySelectorAll('button.role-btn')].find(b => /^\s*Recruiter\s*$/i.test(b.textContent));
    if (recBtn) recBtn.click();
    if (typeof switchView === 'function') switchView('auth-view');
    if (typeof setAuthMode === 'function') setAuthMode('register');
  });
  await page.waitForFunction(() => {
    const av = document.getElementById('auth-view');
    return av && getComputedStyle(av).display !== 'none' && getComputedStyle(document.getElementById('auth-company-group')).display !== 'none';
  }, { timeout: 8000 });
  const t4pre = await page.evaluate(() => ({
    nameDisplay: getComputedStyle(document.getElementById('auth-name-group')).display,
    companyDisplay: getComputedStyle(document.getElementById('auth-company-group')).display,
    currentRole: window.currentRole,
  }));
  console.log('  pre-submit groups:', JSON.stringify(t4pre));
  if (t4pre.companyDisplay !== 'none' && t4pre.nameDisplay !== 'none') {
    ok('T4-pre: company group visible for recruiter');
  } else {
    nFail++;
    fail('T4-pre', JSON.stringify(t4pre));
  }
  // Sub 4a: empty company should be rejected client-side
  await setVal(page, '#auth-name', 'Adversary Two');
  await setVal(page, '#auth-email', RECRUITER_EMAIL);
  await setVal(page, '#auth-password', PASSWORD);
  await setVal(page, '#auth-company', '');
  await page.evaluate(() => { window._captured.length = 0; });
  await clickJS(page, '#signin-btn');
  await page.waitForTimeout(700);
  const t4a = await page.evaluate(() => ({
    companyHasError: document.getElementById('auth-company').classList.contains('error'),
    errorMsgVisible: document.getElementById('company-error').classList.contains('visible'),
    registerCallFired: window._captured.some(r => /\/api\/auth\/register/.test(r.url)),
  }));
  console.log('  4a probe:', JSON.stringify(t4a));
  if (t4a.companyHasError && t4a.errorMsgVisible && t4a.registerCallFired === false) {
    ok('T4a: empty company blocks submit + shows red error + fires NO request');
  } else {
    nFail++;
    fail('T4a', JSON.stringify(t4a));
  }
  // Sub 4b: fill company, expect success
  await setVal(page, '#auth-company', 'Adversary Holdings Ltd');
  await clickJS(page, '#signin-btn');
  await page.waitForFunction(() => {
    return window._captured && window._captured.some(r => /\/api\/auth\/register/.test(r.url));
  }, { timeout: 15000 });
  const t4b = await page.evaluate(() => {
    const reg = window._captured.find(r => /\/api\/auth\/register/.test(r.url));
    return {
      hasToken: !!localStorage.getItem('giu-nexus.token'),
      register: reg && { status: reg.status, body: reg.body, respUserRole: reg.respBody?.data?.user?.role },
    };
  });
  console.log('  4b probe:', JSON.stringify(t4b, null, 2));
  if (
    t4b.register &&
    t4b.register.status === 201 &&
    t4b.register.body?.role === 'recruiter' &&
    t4b.register.body?.company === 'Adversary Holdings Ltd' &&
    t4b.register.respUserRole === 'recruiter' &&
    t4b.hasToken
  ) {
    ok('T4b: recruiter register 201, company in body, role=recruiter, token persisted');
  } else {
    nFail++;
    fail('T4b', JSON.stringify(t4b));
  }

  // ── TEST 5: AI endpoints 401 unauth ────────────────────────────────────
  console.log('\n--- T5: AI endpoints 401 without JWT ---');
  await page.evaluate(() => {
    if (window.api) window.api.logout();
  });
  const t5 = await page.evaluate(async (BE) => {
    async function ping(p, body) {
      const r = await fetch(BE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let m = null; try { m = (await r.json()).message; } catch {}
      return { path: p, status: r.status, message: m };
    }
    return Promise.all([
      ping('/ai/skills/extract', { text: 'I built React + Node.js dashboards.' }),
      ping('/ai/match',          { cvText: 'react node', jobs: [{ id:'1', title:'X', requirements:['react'] }] }),
      ping('/ai/summarize',      { text: 'short text' }),
    ]);
  }, BE);
  console.log('  results:', JSON.stringify(t5, null, 2));
  if (t5.every(r => r.status === 401 && /Authentication required/i.test(r.message || ''))) {
    ok('T5: all 3 AI endpoints return 401 + "Authentication required" without JWT');
  } else {
    nFail++;
    fail('T5', JSON.stringify(t5));
  }

  // ── TEST 6: AI endpoints 200 with JWT (real HF) ────────────────────────
  console.log('\n--- T6: AI endpoints 200 with JWT (real HF) ---');
  // Sign back in with the seeker we just created
  await page.evaluate(async ({ BE, email, password }) => {
    const r = await fetch(BE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (data && data.data && data.data.token) {
      localStorage.setItem('giu-nexus.token', data.data.token);
    }
    return r.status;
  }, { BE, email: SEEKER_EMAIL, password: PASSWORD });
  const tokenHere = await page.evaluate(() => !!localStorage.getItem('giu-nexus.token'));
  console.log('  token re-acquired:', tokenHere);
  // Hit the three AI endpoints via the api.js client (which auto-attaches Bearer)
  const cv = '5+ years building React, TypeScript, and Node.js services. Strong with Postgres, Docker, and AWS.';
  const t6 = await page.evaluate(async ({ BE, cv }) => {
    const tok = localStorage.getItem('giu-nexus.token');
    const H = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok };
    async function p(path, body) {
      const r = await fetch(BE + path, { method: 'POST', headers: H, body: JSON.stringify(body) });
      let j = null; try { j = await r.json(); } catch {}
      return {
        path, status: r.status,
        source: j?.data?.source,
        model: j?.data?.model,
        skillsLen: j?.data?.skills?.length,
        matchesLen: j?.data?.matches?.length,
        firstMatch: j?.data?.matches?.[0],
        summary: j?.data?.summary?.slice(0, 80),
        rawErr: j?.data ? undefined : j,
      };
    }
    return Promise.all([
      p('/ai/skills/extract', { text: cv }),
      p('/ai/match',          { cvText: cv, jobs: [
        { id:'a', title:'React Eng',   description: 'Build React + TypeScript dashboards on Node.js services.', requirements: ['React', 'TypeScript', 'Node.js'] },
        { id:'b', title:'Backend Eng', description: 'Operate Postgres, Docker, and AWS infrastructure for our platform.', requirements: ['Postgres', 'Docker', 'AWS'] },
        { id:'c', title:'Mobile Eng',  description: 'Native iOS and Android development with Swift and Kotlin.', requirements: ['Swift', 'Kotlin'] },
      ] }),
      p('/ai/summarize',      { text: 'We are hiring a Senior React Engineer to lead our front-end platform. You will architect a TypeScript design-system, mentor mid-level engineers, ship Node.js BFF services, and own the shared component library. Strong opinions on testing, accessibility, and performance budgets are required.' }),
    ]);
  }, { BE, cv });
  console.log('  results:', JSON.stringify(t6, null, 2));
  const t6pass = t6.every(r => r.status === 200 && r.source === 'huggingface' && /^[\w\-./]+/.test(r.model || ''));
  if (t6pass) {
    ok('T6: all 3 AI endpoints 200 with JWT, source=huggingface, real model attribution');
  } else {
    nFail++;
    fail('T6', JSON.stringify(t6));
  }

  // ── TEST 7: logout brings back 401 ─────────────────────────────────────
  console.log('\n--- T7: logout brings back 401 ---');
  await page.evaluate(() => { if (window.api) window.api.logout(); });
  const t7 = await page.evaluate(async (BE) => {
    const tok = localStorage.getItem('giu-nexus.token');
    async function ping(p, body) {
      const r = await fetch(BE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let m = null; try { m = (await r.json()).message; } catch {}
      return { path: p, status: r.status, message: m };
    }
    return {
      tokenAfterLogout: tok,
      results: await Promise.all([
        ping('/ai/skills/extract', { text: 'x' }),
        ping('/ai/match',          { cvText: 'x', jobs: [{ id:'1', title:'X', requirements:['x'] }] }),
        ping('/ai/summarize',      { text: 'short' }),
      ]),
    };
  }, BE);
  console.log('  probe:', JSON.stringify(t7, null, 2));
  if (
    t7.tokenAfterLogout === null &&
    t7.results.every(r => r.status === 401 && /Authentication required/i.test(r.message || ''))
  ) {
    ok('T7: token cleared, all 3 AI endpoints back to 401');
  } else {
    nFail++;
    fail('T7', JSON.stringify(t7));
  }

  console.log('\n────────────────────────────────────');
  console.log(nFail === 0 ? 'ALL TESTS PASSED' : `${nFail} TEST(S) FAILED`);
  console.log('Page errors captured during run:', JSON.stringify(errors, null, 2));

  await browser.close();
  process.exit(nFail === 0 ? 0 : 1);
})().catch(e => { console.error('Driver crashed:', e); process.exit(2); });
