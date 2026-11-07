// Browser tests for the Review tab, planning, the myAccount sheet, receipt
// photos, reminders and sync. Run with: npm run test:e2e
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; worker-src blob:; connect-src 'none'";
const PDFJS = [process.env.PDFJS_DIR, path.join(ROOT, 'node_modules/pdfjs-dist/build')].filter(Boolean)
  .find((d) => fs.existsSync(path.join(d, 'pdf.min.js'))) || null;

let server; let url; let browser;
const euro = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);
const text = (p, sel) => p.textContent(sel).then((t) => t.replace(/\s+/g, ' ').trim());
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('taxback.v1') || 'null'));

before(async () => {
  require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-single.js')], { stdio: 'ignore' });
  const body = fs.readFileSync(path.join(ROOT, 'dist/taxback.html'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
  server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP }); res.end(html); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function newPage({ state, init, context } = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1200, height: 900 } }, context));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  if (PDFJS) await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(PDFJS, path.basename(new URL(r.request().url()).pathname))) }));
  await ctx.addInitScript(() => { window.confirm = () => false; window.alert = () => {}; });
  if (state) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('taxback.v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, state);
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto(url);
  return p;
}

const base = (extra = {}) => Object.assign({
  profile: { status: 'single', youDob: '1985-06-01' }, selectedYear: 2025, checklist: {}, expenses: [],
  years: { 2025: { youGross: 60000, youTaxPaid: 11200 } },
}, extra);

describe('your situation credits', () => {
  it('single parent credit shows in the claims and the tax', async () => {
    const p = await newPage({ state: base() });
    await p.click('[data-tab=profile]');
    // only asked once you say it applies
    assert.equal(await p.isVisible('#profileForm [name=singleParent]'), false);
    await p.click('#optChips [data-opt=children]');
    await p.check('#profileForm [name=singleParent]');
    await p.click('[data-tab=dashboard]');
    // 60,000: band 48,000 → 9,600 + 4,800 = 14,400 − 2,000 − 2,000 − 1,900 = 8,500; refund 11,200 − 8,500 = 2,700
    const lines = await p.$$eval('#claimTable tr', (r) => r.map((x) => [...x.cells].map((c) => c.textContent)));
    assert.deepEqual(lines[0], ['Single Person Child Carer Credit', euro(2700)]);
    assert.equal(await p.$eval('#stats .stat:nth-child(2) .stat-value', (n) => n.textContent), euro(2700));
    // the widowed field only shows for widowed
    assert.equal(await p.isVisible('#profileForm [name=bereavementYear]'), false);
    await p.click('[data-tab=profile]');
    await p.selectOption('#profileForm [name=status]', 'widowed');
    assert.equal(await p.isVisible('#profileForm [name=bereavementYear]'), true);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});

describe('Review tab', () => {
  it('flags missing credits and emergency tax on the certificate', async () => {
    const p = await newPage({ state: base() });
    await p.click('[data-tab=review]');
    await p.click('#addJob');
    await p.fill('#job-credits-0', '2000');
    await p.press('#job-credits-0', 'Tab');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'job-band-0', 'focus moves on to the next box');
    await p.fill('#job-band-0', '44000');
    await p.press('#job-band-0', 'Tab');
    assert.match(await text(p, '#tccResult'), /Up to €2,000\.00 of credits may be missing/);
    await p.selectOption('#job-basis-0', 'emergency');
    // 5,000 a month: emergency 40% = 2,000 vs normal 933.33 (with 4,000 credits) → but certificate here, so uses expected 4,000/44,000
    assert.match(await text(p, '#emergencyCard'), /emergency tax takes about €2,000\.00 instead of €933\.33/);
    const yd = (await stored(p)).years['2025'];
    assert.deepEqual(yd.tcc.you, [{ employer: 'Main job', credits: 2000, band: 44000, basis: 'emergency' }]);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });

  it('checks each payslip against the certificate', async () => {
    const p = await newPage({ state: base({ years: { 2025: { payMode: 'month', youGross: 15000, youTaxPaid: 3600,
      tcc: { you: [{ employer: 'Main job', credits: 4000, band: 44000, basis: 'cumulative' }] },
      months: { you: { 1: { gross: 5000, tax: 933.33 }, 2: { gross: 5000, tax: 1200 }, 3: { gross: 5000, tax: 933.33 } } } } } }) });
    await p.click('[data-tab=review]');
    const rows = await p.$$eval('#payslipCheck tr', (r) => r.slice(1).map((x) => [...x.cells].map((c) => c.textContent)));
    assert.deepEqual(rows[0], ['January', euro(5000), euro(933.33), euro(933.33), 'OK']);
    assert.equal(rows[1][4], `${euro(266.66)} too much`);
    assert.match(await text(p, '#payslipCheck'), /1 payslip took a different amount/);
    await p.context().close();
  });

  it('compares joint and separate assessment for a couple', async () => {
    const p = await newPage({ state: base({ profile: { status: 'married', youDob: '1985-06-01', spouseDob: '1987-01-01' },
      years: { 2025: { youGross: 70000, spouseGross: 10000 } } }) });
    await p.click('[data-tab=review]');
    // joint 11,400 vs separate 15,200 (see the calculation tests)
    assert.match(await text(p, '#assessResult'), /Joint assessment saves you €3,800\.00/);
    assert.equal(await p.isVisible('#tccPerson'), true);
    await p.context().close();
  });

  it('compares a Statement of Liability typed in', async () => {
    const p = await newPage({ state: base() });
    await p.click('[data-tab=review]');
    await p.fill('#solForm [name=solCredits]', '3000');
    await p.fill('#solForm [name=solLiability]', '12200');
    await p.fill('#solForm [name=solPaid]', '11200');
    await p.press('#solForm [name=solPaid]', 'Tab');
    // Taxback: credits 4,000, liability 11,200 → Revenue has 1,000 fewer credits; Revenue says underpaid 1,000
    assert.match(await text(p, '#solResult'), /Revenue gave €1,000\.00 fewer credits/);
    assert.match(await text(p, '#solResult'), /underpaid €1,000\.00/);
    await p.context().close();
  });

  it('reads a Statement of Liability PDF', { skip: !PDFJS && 'pdf.js not installed locally' }, async () => {
    const p = await newPage({ state: base() });
    await p.click('[data-tab=review]');
    await p.setInputFiles('#solFile', path.join(FIX, 'statement.pdf'));
    await p.waitForFunction(() => document.querySelector('#solForm [name=solIncome]').value === '52300', null, { timeout: 20000 });
    assert.equal(await p.inputValue('#solForm [name=solCredits]'), '4274.1');
    assert.equal(await p.inputValue('#solForm [name=solPaid]'), '8120');
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});

describe('planning and claiming', () => {
  it('suggests an AVC top-up and lists numbers for myAccount', async () => {
    const p = await newPage({ state: base({ expenses: [{ id: 'h', year: 2025, date: '2025-05-01', category: 'health', amount: 420, person: 'you' }] }) });
    await p.click('[data-tab=dashboard]');
    // age 40 → limit 15,000; 16,000 of income taxed at 40% → all 15,000 saves 6,000
    assert.match(await text(p, '#saveTips'), /Each €1,000 you put into a pension saves you €400 in tax\..*up to €15,000 would get 40% back, €6,000 in all/);
    await p.click('[data-tab=guide]');
    const sheet = await p.$$eval('#claimSheet tr', (r) => r.map((x) => x.cells[1].textContent));
    assert.deepEqual(sheet, ['420.00']);
    assert.equal(await p.$$eval('#lifeEvents details', (d) => d.length), 9);
    const links = await p.$$eval('#reminders a', (a) => a.map((x) => x.href));
    assert.ok(links.some((h) => h.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE')));
    assert.ok(links.some((h) => h.startsWith('https://outlook.live.com/calendar/')));
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});

describe('receipt photos', () => {
  it('stores a photo with a receipt and shows it', async () => {
    const p = await newPage({ state: base() });
    await p.click('[data-tab=expenses]');
    await p.click('#catTiles .cat-tile[data-cat=health]');
    await p.fill('#amountInput', '65');
    await p.setInputFiles('#photoInput', path.join(FIX, 'receipt.png'));
    await p.waitForSelector('#photoPreview img');
    await p.click('#expSubmit');
    const ex = (await stored(p)).expenses;
    assert.equal(ex[0].photo, true);
    await p.click('.photo-link');
    await p.waitForSelector('.viewer img');
    const size = await p.$eval('.viewer img', (i) => i.naturalWidth);
    assert.equal(size, 40);
    await p.click('.viewer-close');
    // deleting the receipt deletes its photo
    await p.click('.items li >> text=Delete');
    await p.click('.items li >> button.armed');
    const left = await p.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('taxback-photos', 1);
      r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').count(); q.onsuccess = () => res(q.result); };
    }));
    assert.equal(left, 0);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});

describe('sync across devices', () => {
  // A stand-in for the hosted page's private storage.
  const fakeStore = (remote) => {
    window.__writes = [];
    let doc = remote;
    const listeners = [];
    const ref = {
      get: async () => ({ exists: !!doc, data: () => doc, metadata: { fromCache: false, hasPendingWrites: false } }),
      set: async (d) => { doc = d; window.__writes.push(d); },
      onSnapshot: (next) => { listeners.push(next); return () => {}; },
    };
    window.__push = (d) => { doc = d; listeners.forEach((l) => l({ exists: true, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } })); };
    window.claude = { use: async (n) => (n === 'db' ? { doc: (path) => { window.__path = path; return ref; } } : n === 'user' ? { id: async () => 'u123' } : null) };
  };

  it('loads newer data from another device and saves changes', async () => {
    const remoteState = { profile: { status: 'single', youDob: '1980-01-01' }, selectedYear: 2025, checklist: {}, updatedAt: Date.now() + 60000,
      years: { 2025: { youGross: 50000 } }, expenses: [{ id: 'x', year: 2025, date: '2025-02-02', category: 'health', amount: 300, person: 'you' }] };
    const p = await newPage({ init: `(${fakeStore})(${JSON.stringify({ state: JSON.stringify(remoteState), updatedAt: remoteState.updatedAt })})` });
    await p.waitForFunction(() => /On\./.test(document.querySelector('#syncText').textContent));
    assert.equal(await p.evaluate(() => window.__path), 'data/users/u123/taxback');
    assert.equal((await stored(p)).expenses.length, 1, 'remote copy loaded');
    assert.match(await text(p, '#toast'), /Loaded your data from your other devices/);
    // a change is written back
    await p.click('[data-tab=expenses]');
    await p.fill('#amountInput', '80');
    await p.click('#expSubmit');
    await p.waitForFunction(() => window.__writes.length > 0, null, { timeout: 5000 });
    const written = await p.evaluate(() => JSON.parse(window.__writes[window.__writes.length - 1].state));
    assert.equal(written.expenses.length, 2);
    // a change from another device arrives live
    await p.evaluate((s) => window.__push({ state: JSON.stringify(Object.assign(JSON.parse(s), { expenses: [] })), updatedAt: Date.now() + 120000 }), JSON.stringify(remoteState));
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('taxback.v1')).expenses.length === 0);
    // turning sync off stops writes
    await p.click('[data-tab=data]');
    await p.uncheck('#syncToggle');
    assert.match(await text(p, '#syncText'), /^Off/);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });

  it('says sync is unavailable outside the hosted page', async () => {
    const p = await newPage({ state: base() });
    await p.click('[data-tab=data]');
    assert.match(await text(p, '#syncText'), /Sync works on the hosted Taxback page/);
    assert.equal(await p.isDisabled('#syncToggle'), true);
    await p.context().close();
  });
});

describe('phone layout', () => {
  it('uses a More menu and stacks wide tables', async () => {
    const p = await newPage({ state: base({ profile: { status: 'married', youDob: '1985-06-01', spouseDob: '1987-01-01' },
      years: { 2025: { youGross: 70000, youTaxPaid: 14000, spouseGross: 20000, spouseTaxPaid: 2000 } } }), context: { viewport: { width: 390, height: 844 } } });
    assert.equal(await p.isVisible('.tabs [data-tab=checklist]'), false);
    await p.click('#moreBtn');
    assert.equal(await p.getAttribute('#moreBtn', 'aria-expanded'), 'true');
    await p.click('#moreSheet >> text=Help');
    assert.equal(await p.isVisible('#tab-help'), true);
    assert.equal(await p.isVisible('#moreSheet'), false);
    assert.equal(await p.getAttribute('#moreBtn', 'class'), 'nav-more current');
    await p.click('.tabs [data-tab=dashboard]');
    // stacked: each figure carries its column name, and nothing is cut off
    const label = await p.$eval('#chargesTable tr:nth-child(2) td:nth-child(2)', (td) => getComputedStyle(td, '::before').content);
    assert.equal(label, '"Due (estimate)"');
    const fits = await p.$eval('#chargesTable', (t) => t.scrollWidth <= t.parentElement.clientWidth);
    assert.equal(fits, true);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});
