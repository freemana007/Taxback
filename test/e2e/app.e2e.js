// End-to-end test of the hosted (bundled) app in a real browser.
//
//   npm run test:e2e
//
// Needs Playwright with Chromium. The page is served with a strict content
// policy like the hosted viewer's, and browser dialogs are disabled as they
// are there. Payslip tests need pdf.js locally (npm i --no-save
// pdfjs-dist@3.11.174, or set PDFJS_DIR to its build folder); they are
// skipped otherwise.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const Tax = require('../../tax.js');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; worker-src blob:; connect-src 'none'";

function findPdfJs() {
  const dirs = [process.env.PDFJS_DIR, path.join(ROOT, 'node_modules/pdfjs-dist/build')].filter(Boolean);
  return dirs.find((d) => fs.existsSync(path.join(d, 'pdf.min.js'))) || null;
}
const PDFJS = findPdfJs();

let server; let url; let browser;

function page(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`;
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1200, height: 900 } }, opts.context));
  await ctx.addInitScript(() => { window.confirm = () => false; window.alert = () => {}; window.prompt = () => null; });
  if (opts.init) await ctx.addInitScript(opts.init);
  // Fonts come from Google Fonts in the hosted page; serve them empty here.
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  if (PDFJS) {
    await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({
      contentType: 'application/javascript',
      body: fs.readFileSync(path.join(PDFJS, path.basename(new URL(r.request().url()).pathname))),
    }));
  }
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto(url);
  return p;
}

const text = (p, sel) => p.textContent(sel).then((t) => t.replace(/\s+/g, ' ').trim());
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('taxback.v1') || 'null'));
const euro = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

async function addReceipt(p, { cat, amount, desc, date = '2025-06-15', person, adults, children, paidBy, partTime }) {
  await p.click('[data-tab=expenses]');
  await p.selectOption('#catSelect', cat);
  await p.fill('#amountInput', String(amount));
  await p.fill('#expenseForm [name=date]', date);
  if (desc) await p.fill('#expenseForm [name=description]', desc);
  if (person) await p.selectOption('#expenseForm [name=person]', person);
  if (adults != null) await p.fill('#expenseForm [name=adults]', String(adults));
  if (children != null) await p.fill('#expenseForm [name=children]', String(children));
  if (paidBy) await p.selectOption('#paidBySelect', paidBy);
  if (partTime) await p.check('#expenseForm [name=partTime]');
  await p.click('#expSubmit');
}

before(async () => {
  execBuild();
  const html = page(fs.readFileSync(path.join(ROOT, 'dist/taxback.html'), 'utf8'));
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

function execBuild() {
  require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-single.js')], { stdio: 'ignore' });
}

describe('first visit', () => {
  it('opens on Start here with step 1 next and no errors', async () => {
    const p = await newPage();
    assert.equal(await p.isVisible('#tab-guide'), true);
    const chips = await p.$$eval('.step .chip', (n) => n.map((x) => x.textContent));
    assert.deepEqual(chips, ['Do this next', 'To do', 'To do', 'To do', 'To do', 'To do']);
    assert.equal(await p.isVisible('#fab'), false, 'add button only on the Overview');
    await p.click('[data-tab=dashboard]');
    assert.equal(await p.isVisible('#fab'), true);
    assert.match(await text(p, '#heroNext'), /0 of 6 steps done/);
    await p.click('#fab');
    assert.equal(await p.isVisible('#tab-expenses'), true);
    await p.click('[data-tab=guide]');
    assert.equal(await p.$$eval('.quiz-item', (n) => n.length), 9);
    assert.match(await text(p, '#deadlineBanner'), /left to claim for 2022/);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });

  it('every tab opens and every help box has content', async () => {
    const p = await newPage();
    for (const tab of ['guide', 'dashboard', 'expenses', 'profile', 'checklist', 'data']) {
      await p.click(`[data-tab=${tab}]`);
      assert.equal(await p.isVisible(`#tab-${tab}`), true, tab);
    }
    await p.click('[data-tab=profile]');
    const helps = await p.$$('details.help');
    assert.ok(helps.length >= 8);
    for (const h of helps) {
      if (!(await h.isVisible())) continue;
      await (await h.$('summary')).click();
      assert.ok((await h.textContent()).length > 60);
    }
    // each receipt type has its guide
    await p.click('[data-tab=expenses]');
    for (const cat of Object.keys(Tax.CATEGORIES)) {
      await p.selectOption('#catSelect', cat);
      assert.match(await text(p, '#catGuide'), /Counts.*Doesn’t count.*Where to find the amount.*How to work it out/);
    }
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});

describe('full household walkthrough (married, 2025)', () => {
  let p;
  before(async () => { p = await newPage({ context: { permissions: ['clipboard-read', 'clipboard-write'] } }); });
  after(async () => { await p.context().close(); });

  it('enters profile and income, including calculators', async () => {
    await p.selectOption('#yearSelect', '2025');
    await p.click('text=Answer 2 questions');
    await p.selectOption('#profileForm [name=status]', 'married');
    await p.fill('#profileForm [name=youDob]', '1984-03-10');
    await p.fill('#profileForm [name=spouseDob]', '1990-01-01');
    await p.press('#profileForm [name=spouseDob]', 'Tab');
    // pay and tax from a payslip after 9 months: 56,250 and 10,875 → 75,000 and 14,500 for the year
    await p.click('[data-help=youGross] summary');
    assert.equal(await p.inputValue('#calcYtdMonths'), '12', 'a finished year defaults to 12 months');
    await p.fill('#calcYtdPay', '56250');
    await p.fill('#calcYtdTax', '10875');
    await p.fill('#calcYtdMonths', '9');
    assert.equal(await text(p, '[data-help=youGross] .calc-result'), 'Full year: pay €75,000, tax €14,500');
    await p.click('[data-help=youGross] >> text=Use these numbers');
    for (const [k, v] of [['spouseGross', 30000], ['spouseTaxPaid', 2100]]) {
      await p.fill(`#yearForm [name=${k}]`, String(v));
      await p.press(`#yearForm [name=${k}]`, 'Tab');
    }
    // 50 weeks × 2 days = 100 days
    await p.click('[data-help=wfhDays] summary');
    await p.fill('#calcWfhA', '50');
    await p.fill('#calcWfhB', '2');
    await p.click('[data-help=wfhDays] >> text=Use this number');
    const yd = (await stored(p)).years['2025'];
    assert.deepEqual([yd.youGross, yd.youTaxPaid, yd.spouseGross, yd.spouseTaxPaid, yd.wfhDays], [75000, 14500, 30000, 2100, 100]);
  });

  it('adds receipts of every kind, with sums, guards and edits', async () => {
    await addReceipt(p, { cat: 'health', amount: '60 + 60 + 1,250.50', desc: 'GP and physio' });
    // a message says what the receipt is worth: 1,370.50 × 20% = 274.10
    assert.match(await text(p, '#toast'), /Added health expenses\. Saves you €274\.10/);
    // tiles choose the receipt type
    await p.click('#catTiles .cat-tile[data-cat=rent]');
    assert.equal(await p.inputValue('#catSelect'), 'rent');
    assert.equal(await p.getAttribute('#catTiles .cat-tile[data-cat=rent]', 'aria-pressed'), 'true');
    await addReceipt(p, { cat: 'medicalInsurance', amount: 2400, adults: 2, paidBy: 'employer', desc: 'Work health plan' });
    // self-paid insurance is refused
    await p.selectOption('#catSelect', 'medicalInsurance');
    await p.fill('#amountInput', '1500');
    await p.selectOption('#paidBySelect', 'self');
    assert.equal(await p.isVisible('#medSelfNotice'), true);
    await p.click('#expSubmit');
    await addReceipt(p, { cat: 'pension', amount: 5000, person: 'you', desc: 'AVC' });
    await addReceipt(p, { cat: 'pension', amount: 8000, person: 'spouse', desc: 'PRSA' });
    await addReceipt(p, { cat: 'remoteWorking', amount: 2900, desc: 'Electricity and broadband' });
    // rent via calculator: 1,600 × 12
    await p.selectOption('#catSelect', 'rent');
    await p.fill('#calcRentA', '1600');
    await p.click('#rentCalc >> text=Use this number');
    assert.equal(await p.inputValue('#amountInput'), '19200');
    await p.fill('#expenseForm [name=description]', 'Rent');
    await p.fill('#expenseForm [name=date]', '2025-12-31');
    await p.click('#expSubmit');
    await addReceipt(p, { cat: 'tuition', amount: 4000, partTime: true, desc: 'Evening course' });
    // bad amount shows an error and saves nothing
    const before = (await stored(p)).expenses.length;
    await p.selectOption('#catSelect', 'health');
    await p.fill('#amountInput', 'abc');
    await p.click('#expSubmit');
    assert.match(await text(p, '#amountTotal'), /Enter an amount/);
    assert.equal((await stored(p)).expenses.length, before);
    // add one to delete, then edit another
    await addReceipt(p, { cat: 'health', amount: 99, desc: 'Mistake' });
    await p.click('.items li:has-text("Mistake") >> text=Delete');
    assert.equal((await stored(p)).expenses.some((e) => e.description === 'Mistake'), true, 'first click only arms');
    await p.click('.items li:has-text("Mistake") >> button.armed');
    assert.equal((await stored(p)).expenses.some((e) => e.description === 'Mistake'), false);
    await p.click('.items li:has-text("Evening course") >> text=Edit');
    await p.fill('#expenseForm [name=description]', 'Evening course (part-time)');
    await p.click('#expSubmit');
    const ex = (await stored(p)).expenses;
    assert.equal(ex.length, 7);
    assert.equal(ex.find((e) => e.category === 'health').amount, 1370.5);
    assert.equal(ex.find((e) => e.category === 'tuition').description, 'Evening course (part-time)');
    assert.equal(ex.find((e) => e.category === 'tuition').partTime, true);
    // filter
    await p.selectOption('#expFilter', 'pension');
    assert.equal(await p.$$eval('#expenseList .items li', (n) => n.length), 2);
    await p.selectOption('#expFilter', '');
  });

  it('Overview matches hand-worked figures', async () => {
    // Deductions: pension 5,000 (you, limit 25% × 75,000) + 6,000 (spouse, limit 20% × 30,000)
    //   + remote 2,900 × 100/365 × 30% = 238.36 → taxable 105,000 − 11,238.36 = 93,761.64
    // Band 53,000 + 30,000 = 83,000: 16,600 + 10,761.64 × 40% = 20,904.66
    // Credits 4,000 + 4,000 + health 274.10 + insurance 400 (cap 2,000) + rent 2,000 + tuition 500 = 11,174.10
    // Tax due 9,730.56; paid 16,600 → refund 6,869.44
    // Without any claims: 16,600 + 22,000 × 40% − 8,000 = 17,400 → claims worth 7,669.44
    await p.click('[data-tab=dashboard]');
    const st = await stored(p);
    const input = {
      year: 2025, status: 'married', expenses: st.expenses,
      people: { you: { gross: 75000, taxPaid: 14500, dob: '1984-03-10' }, spouse: { gross: 30000, taxPaid: 2100, dob: '1990-01-01' } },
      settings: { wfhDays: 100 },
    };
    const calc = Tax.claimValues(input);
    assert.equal(calc.base.taxable, 93761.64);
    assert.equal(calc.base.grossTax, 20904.66);
    assert.equal(calc.base.totalCredits, 11174.1);
    assert.equal(calc.base.liability, 9730.56);
    assert.equal(calc.base.refund, 6869.44);
    assert.equal(calc.total, 7669.44);
    const stat = (i) => p.$eval(`#stats .stat:nth-child(${i})`, (n) => [n.querySelector('.stat-label').textContent, n.querySelector('.stat-value').textContent]);
    assert.deepEqual(await stat(1), ['Your claims are worth', euro(7669.44)]);
    assert.deepEqual(await stat(2), ['Estimated refund', euro(6869.44)]);
    const due = await p.$eval('#calcTable tr.total', (r) => [...r.cells].map((c) => c.textContent));
    assert.deepEqual(due, ['Income tax due', euro(9730.56)]);
    // each claim line on screen equals the calculator's value
    const lines = await p.$$eval('#claimTable tr', (rows) => rows.map((r) => [...r.cells].map((c) => c.textContent)));
    const labels = Object.fromEntries(Object.entries(Tax.CATEGORIES).map(([k, v]) => [v.label, k]));
    for (const [label, val] of lines) {
      if (label === 'Total') { assert.equal(val, euro(calc.total)); continue; }
      assert.equal(val, euro(calc.values[labels[label]]), label);
    }
    // the open-years table shows the same 2025 numbers
    const yr = await p.$eval('#yearsTable tr.current', (r) => [...r.cells].map((c) => c.textContent));
    assert.deepEqual(yr.slice(0, 4), ['2025', '7', euro(7669.44), euro(6869.44)]);

    // USC and PRSI, each person separately (2025):
    //   you 75,000: 60.06 + 307.40 + 1,279.86 + 4,956 × 8% 396.48 = 2,043.80 USC; PRSI 75,000 × 4.125% = 3,093.75
    //   spouse 30,000: 60.06 + 307.40 + 2,618 × 3% 78.54 = 446.00 USC; PRSI 30,000 × 4.125% = 1,237.50
    // Total taken: 9,730.56 + 2,489.80 + 4,331.25 = 16,551.61 → take-home 105,000 − 16,551.61 = 88,448.39
    const charges = await p.$$eval('#chargesTable tr', (r) => r.map((x) => [...x.cells].map((c) => c.textContent)));
    assert.deepEqual(charges[1].slice(0, 2), ['Income tax', euro(9730.56)]);
    assert.deepEqual(charges[2].slice(0, 2), ['USC', euro(2489.8)]);
    assert.deepEqual(charges[3].slice(0, 2), ['PRSI', euro(4331.25)]);
    assert.deepEqual(charges[4].slice(0, 2), ['Total', euro(16551.61)]);
    assert.deepEqual(charges[5].slice(0, 2), ['Take-home pay', euro(88448.39)]);
    // entering USC paid: €300 too much → added to the refund
    await p.click('[data-tab=profile]');
    await p.fill('#yearForm [name=youUscPaid]', '2343.80');
    await p.fill('#yearForm [name=spouseUscPaid]', '446');
    await p.press('#yearForm [name=spouseUscPaid]', 'Tab');
    await p.click('[data-tab=dashboard]');
    assert.equal(await p.$eval('#stats .stat:nth-child(2) .stat-value', (n) => n.textContent), euro(7169.44));
    const usc = await p.$$eval('#chargesTable tr', (r) => [...r[2].cells].map((c) => c.textContent));
    assert.deepEqual(usc, ['USC', euro(2489.8), euro(2789.8), `${euro(300)} overpaid`]);
    // a medical card puts the spouse on the reduced rate: 60.06 + 17,988 × 2% = 419.82
    await p.click('[data-tab=profile]');
    await p.check('#yearForm [name=spouseMedicalCard]');
    await p.click('[data-tab=dashboard]');
    assert.match(await text(p, '#chargesNote'), /your spouse €419\.82 USC/);
    await p.click('[data-tab=profile]');
    await p.uncheck('#yearForm [name=spouseMedicalCard]');
    await p.fill('#yearForm [name=youUscPaid]', '');
    await p.fill('#yearForm [name=spouseUscPaid]', '');
    await p.press('#yearForm [name=spouseUscPaid]', 'Tab');
  });

  it('guide steps and quiz track progress', async () => {
    await p.click('[data-tab=guide]');
    const chips = await p.$$eval('.step .chip', (n) => n.map((x) => x.textContent));
    assert.deepEqual(chips, ['Done', 'Done', 'Done', 'Done', 'Done', 'Do this next']);
    await p.click('.quiz-item:has-text("college fees") >> text=Yes');
    assert.match(await text(p, '.quiz-item:has-text("college fees")'), /Add another \(1 added\)/);
    await p.click('#routePick >> text=Form 11');
    assert.match(await text(p, '#claimSteps'), /Register for ROS.*Form 11/);
    assert.match(await text(p, '.step:nth-child(6)'), /ROS login/);
    await p.check('.step:nth-child(6) input[type=checkbox]');
    assert.equal(await text(p, '.step:nth-child(6) .chip'), 'Done');
  });

  it('checklist ticks are saved per year', async () => {
    await p.click('[data-tab=checklist]');
    await p.check('#checklist li:has-text("Rent Tax Credit") input');
    assert.equal((await stored(p)).checklist['2025:rent'], true);
    await p.selectOption('#yearSelect', '2024');
    assert.equal(await p.isChecked('#checklist li:has-text("Rent Tax Credit") input'), false);
    await p.selectOption('#yearSelect', '2025');
  });

  it('backup, CSV, copy, restore and delete-all work without dialogs', async () => {
    await p.click('[data-tab=data]');
    await p.click('#exportCsvBtn');
    const csv = await p.inputValue('#dataBox');
    assert.equal(csv.split('\n').length, 8);
    assert.match(csv, /^year,date,category/);
    await p.click('#exportBtn');
    const backup = await p.inputValue('#dataBox');
    assert.equal(JSON.parse(backup).expenses.length, 7);
    await p.click('#copyBtn');
    assert.equal(await p.evaluate(() => navigator.clipboard.readText()), backup);
    await p.click('#resetBtn');
    assert.equal((await stored(p)).expenses.length, 7, 'first click only arms');
    await p.click('#resetBtn');
    assert.equal((await stored(p)).expenses.length, 0);
    await p.fill('#dataBox', '{"not": "a backup"}');
    await p.click('#restoreBtn');
    assert.match(await text(p, '#dataStatus'), /not a Taxback backup/);
    await p.fill('#dataBox', backup);
    await p.click('#restoreBtn');
    await p.click('#restoreBtn');
    assert.equal((await stored(p)).expenses.length, 7);
    await p.reload();
    assert.equal((await stored(p)).expenses.length, 7, 'survives reload');
    assert.deepEqual(p.errors, []);
  });
});

describe('pay and tax for a year that is not over', () => {
  it('scales pay and tax together and warns on the Overview', async () => {
    const p = await newPage();
    const y = new Date().getFullYear();
    await p.selectOption('#yearSelect', String(y));
    await p.click('[data-tab=profile]');
    await p.click('[data-help=youGross] summary');
    assert.equal(await p.inputValue('#calcYtdMonths'), String(new Date().getMonth() + 1));
    // 10 months: 50,000 pay and 9,333.33 tax so far → 60,000 and 11,200 for the year
    await p.fill('#calcYtdPay', '50000');
    await p.fill('#calcYtdTax', '9333.33');
    await p.fill('#calcYtdMonths', '10');
    await p.click('[data-help=youGross] >> text=Use these numbers');
    const yd = (await stored(p)).years[String(y)];
    assert.deepEqual([yd.youGross, yd.youTaxPaid], [60000, 11200]);
    await p.click('[data-tab=dashboard]');
    assert.equal(await p.isVisible('#yearNote'), true);
    if (y !== 2026) { await p.context().close(); return; }
    // with the 2026 rates, someone on track is owed (almost) nothing, not underpaid
    const refund = await p.$eval('#stats .stat:nth-child(2) .stat-value', (n) => n.textContent);
    assert.equal(refund, '€0.00');
    await p.context().close();
  });

  it('shows social welfare as its own line', async () => {
    const p = await newPage();
    await p.selectOption('#yearSelect', '2025');
    await p.click('[data-tab=profile]');
    await p.fill('#yearForm [name=youGross]', '30000');
    await p.fill('#yearForm [name=youWelfare]', '10000');
    await p.fill('#yearForm [name=youTaxPaid]', '4500');
    await p.press('#yearForm [name=youTaxPaid]', 'Tab');
    await p.click('[data-tab=dashboard]');
    const rows = await p.$$eval('#calcTable tr', (r) => r.map((x) => [...x.cells].map((c) => c.textContent)));
    assert.deepEqual(rows.slice(0, 3), [['Pay from work', '€30,000.00'], ['Taxable social welfare', '€10,000.00'], ['Total income', '€40,000.00']]);
    assert.equal(await p.$eval('#stats .stat:nth-child(2) .stat-value', (n) => n.textContent), '€500.00');
    assert.equal(await p.isVisible('#yearNote'), false);
    await p.context().close();
  });
});

describe('downloads', () => {
  it('uses the viewer downloads permission when available', async () => {
    const p = await newPage({
      init: () => {
        window.__saved = [];
        window.claude = { use: async (n) => (n === 'downloads' ? { save: async (req) => { window.__saved.push(req); return { status: 'saved' }; } } : null) };
      },
    });
    await p.click('[data-tab=data]');
    await p.click('#exportCsvBtn');
    await p.click('#downloadBtn');
    await p.waitForFunction(() => window.__saved.length === 1);
    const saved = await p.evaluate(() => window.__saved[0]);
    assert.equal(saved.filename, 'taxback-receipts.csv');
    assert.match(saved.data, /^year,date/);
    assert.match(await text(p, '#dataStatus'), /Saved taxback-receipts\.csv/);
    await p.click('#exportBtn');
    await p.click('#downloadBtn');
    await p.waitForFunction(() => window.__saved.length === 2);
    assert.match(await p.evaluate(() => window.__saved[1].filename), /^taxback-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await p.context().close();
  });

  it('reports a declined save', async () => {
    const p = await newPage({
      init: () => { window.claude = { use: async () => ({ save: async () => { throw { code: 'declined' }; } }) }; },
    });
    await p.click('[data-tab=data]');
    await p.click('#downloadBtn');
    await p.waitForFunction(() => /cancelled/.test(document.querySelector('#dataStatus').textContent));
    await p.context().close();
  });

  it('falls back to a normal download outside the viewer', async () => {
    const p = await newPage({ context: { acceptDownloads: true } });
    await p.click('[data-tab=data]');
    await p.click('#exportBtn');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#downloadBtn')]);
    assert.match(dl.suggestedFilename(), /^taxback-backup-.*\.json$/);
    const body = fs.readFileSync(await dl.path(), 'utf8');
    assert.equal(JSON.parse(body).expenses.length, 0);
    await p.context().close();
  });
});

describe('month-by-month pay', () => {
  it('adds months, weekly sums, estimates the year and switches back', async () => {
    const p = await newPage();
    await p.selectOption('#yearSelect', '2025');
    await p.click('[data-tab=profile]');
    await p.fill('#yearForm [name=youGross]', '1234');
    await p.press('#yearForm [name=youGross]', 'Tab');
    await p.click('#modeMonth');
    await p.fill('#m-gross-1', '4000');
    await p.fill('#m-tax-1', '600');
    await p.press('#m-tax-1', 'Tab');
    await p.fill('#m-gross-2', '1000 + 1000 + 1000 + 1000');
    await p.press('#m-gross-2', 'Tab');
    await p.fill('#m-tax-2', '150 + 150 + 150 + 150');
    await p.press('#m-tax-2', 'Tab');
    await p.fill('#m-gross-3', 'oops');
    await p.press('#m-gross-3', 'Tab');
    assert.equal(await p.getAttribute('#m-gross-3', 'class'), 'month-input bad');
    let yd = (await stored(p)).years['2025'];
    assert.deepEqual([yd.youGross, yd.youTaxPaid], [8000, 1200]);
    // estimate: 8,000 / 2 × 12 = 48,000; 1,200 / 2 × 12 = 7,200
    await p.check('#projectYear');
    yd = (await stored(p)).years['2025'];
    assert.deepEqual([yd.youGross, yd.youTaxPaid], [48000, 7200]);
    assert.equal(await p.getAttribute('#yearForm [name=youGross]', 'readonly'), '');
    await p.uncheck('#projectYear');
    await p.click('#fillMonths');
    yd = (await stored(p)).years['2025'];
    assert.equal(yd.youGross, 4000 * 11 + 4000); // month 1 copied into 10 empty months (3–12), plus Feb's 4,000
    await p.click('#modeYear');
    assert.equal(await p.inputValue('#yearForm [name=youGross]'), '1234', 'yearly total restored');
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });

  it('reads PDF payslips, including password-protected ones', { skip: !PDFJS && 'pdf.js not installed locally' }, async () => {
    const p = await newPage();
    await p.selectOption('#yearSelect', '2025');
    await p.click('[data-tab=profile]');
    await p.click('#modeMonth');
    await p.setInputFiles('#payslipFile', path.join(FIX, 'payslip.pdf'));
    await p.waitForSelector('#slipGross', { timeout: 20000 });
    assert.equal(await p.inputValue('#slipGross'), '4987.5');
    assert.equal(await p.inputValue('#slipTax'), '1095.83');
    assert.equal(await p.inputValue('#slipUsc'), '201.4');
    assert.equal(await p.inputValue('#slipPrsi'), '210');
    assert.equal(await p.inputValue('#slipMonth'), '2');
    assert.equal(await p.inputValue('#slipYear'), '2025');
    await p.click('text=Save to this month');
    await p.setInputFiles('#payslipFile', path.join(FIX, 'payslip-locked.pdf'));
    await p.waitForSelector('#slipPassword');
    await p.fill('#slipPassword', 'wrong');
    await p.click('text=Open payslip');
    await p.waitForFunction(() => /didn’t work/.test(document.querySelector('#payslipResult').textContent));
    await p.fill('#slipPassword', '1234567T');
    await p.click('text=Open payslip');
    await p.waitForSelector('#slipGross');
    assert.equal(await p.inputValue('#slipMonth'), '3');
    await p.click('text=Save to this month');
    const yd = (await stored(p)).years['2025'];
    assert.equal(yd.youGross, 9975);
    assert.equal(yd.youTaxPaid, 2191.66);
    assert.equal(yd.youUscPaid, 402.8);
    assert.equal(yd.youPrsiPaid, 420);
    // not a PDF
    const png = path.join(require('os').tmpdir(), 'taxback-photo.png');
    fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
    await p.setInputFiles('#payslipFile', png);
    assert.match(await text(p, '#payslipResult'), /Only PDF payslips/);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});

describe('layout', () => {
  for (const scheme of ['light', 'dark']) {
    it(`no sideways scrolling at phone width (${scheme})`, async () => {
      const p = await newPage({ context: { viewport: { width: 375, height: 800 }, colorScheme: scheme } });
      await p.selectOption('#yearSelect', '2025');
      for (const tab of ['guide', 'dashboard', 'expenses', 'profile', 'checklist', 'data']) {
        await p.click(`[data-tab=${tab}]`);
        if (tab === 'profile') await p.click('#modeMonth');
        await p.$$eval('details', (d) => d.forEach((x) => { x.open = true; }));
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, tab);
      }
      const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(bg === 'rgb(12, 18, 16)', scheme === 'dark');
      assert.deepEqual(p.errors, []);
      await p.context().close();
    });
  }
});
