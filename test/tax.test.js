const test = require('node:test');
const assert = require('node:assert/strict');
const Tax = require('../tax.js');

const single = (gross, extra = {}) => Object.assign({
  year: 2025, status: 'single',
  people: { you: { gross, taxPaid: '', dob: '1985-06-01' } },
  settings: {}, expenses: [],
}, extra);

test('single earner at standard rate with only personal + employee credits', () => {
  const r = Tax.computeYear(single(40000));
  assert.equal(r.grossTax, 8000);
  assert.equal(r.totalCredits, 4000);
  assert.equal(r.liability, 4000);
  assert.equal(r.marginalRate, 0.2);
});

test('single earner above band pays 40% on excess', () => {
  const r = Tax.computeYear(single(60000));
  // 44,000 @20% + 16,000 @40% = 8,800 + 6,400
  assert.equal(r.grossTax, 15200);
  assert.equal(r.liability, 11200);
  assert.equal(r.marginalRate, 0.4);
});

test('married two earners get increased band', () => {
  const r = Tax.computeYear({
    year: 2025, status: 'married',
    people: { you: { gross: 70000 }, spouse: { gross: 30000 } },
    expenses: [],
  });
  assert.equal(r.band, 53000 + 30000);
  // 83,000 @20% + 17,000 @40%
  assert.equal(r.grossTax, 16600 + 6800);
  assert.equal(r.credits.personal, 4000);
  assert.equal(r.credits.employee, 4000);
});

test('health expenses give 20% credit', () => {
  const r = Tax.claimValues(single(60000, {
    expenses: [{ year: 2025, category: 'health', amount: 1000 }],
  }));
  assert.equal(r.values.health, 200);
});

test('medical insurance capped at 1,000 per adult and 500 per child', () => {
  const r = Tax.computeYear(single(60000, {
    expenses: [{ year: 2025, category: 'medicalInsurance', amount: 3000, adults: 2, children: 1 }],
  }));
  assert.equal(r.credits.medicalInsurance, 500); // 20% of 2,500
});

test('rent credit capped per year and status', () => {
  assert.equal(Tax.computeYear(single(50000, {
    expenses: [{ year: 2025, category: 'rent', amount: 18000 }],
  })).credits.rent, 1000);
  assert.equal(Tax.computeYear(single(50000, {
    year: 2022, expenses: [{ year: 2022, category: 'rent', amount: 18000 }],
  })).credits.rent, 500);
});

test('pension relief at marginal rate within age limit', () => {
  // age 40 in 2025 -> 25% of 60,000 = 15,000 limit
  const r = Tax.claimValues(single(60000, {
    expenses: [{ year: 2025, category: 'pension', amount: 20000 }],
  }));
  assert.equal(r.base.detail.pension.you.limit, 15000);
  assert.equal(r.base.deductions.pension, 15000);
  // 16,000 above band; deduction of 15,000 all at 40%
  assert.equal(r.values.pension, 6000);
});

test('pension earnings cap of 115,000', () => {
  assert.equal(Tax.pensionLimit(62, 200000), 46000);
});

test('remote working: 30% of bills pro-rated by WFH days', () => {
  const r = Tax.computeYear(single(60000, {
    settings: { wfhDays: 146 },
    expenses: [{ year: 2025, category: 'remoteWorking', amount: 3650 }],
  }));
  assert.equal(r.deductions.remoteWorking, 438); // 3650 * 146/365 * 0.3
});

test('tuition: disregard applies, part-time only gets lower disregard', () => {
  const ft = Tax.computeYear(single(50000, {
    expenses: [{ year: 2025, category: 'tuition', amount: 8000 }],
  }));
  assert.equal(ft.credits.tuition, 800); // (7000 - 3000) * 20%
  const pt = Tax.computeYear(single(50000, {
    expenses: [{ year: 2025, category: 'tuition', amount: 4000, partTime: true }],
  }));
  assert.equal(pt.credits.tuition, 500); // (4000 - 1500) * 20%
});

test('mortgage interest relief: 20% of increase over 2022, capped', () => {
  const r = Tax.computeYear(single(60000, {
    year: 2024, settings: { mortgageInterest2022: 3000 },
    expenses: [{ year: 2024, category: 'mortgageInterest', amount: 6000 }],
  }));
  assert.equal(r.credits.mortgageInterest, 600);
  const capped = Tax.computeYear(single(60000, {
    year: 2025, settings: { mortgageInterest2022: 1000 },
    expenses: [{ year: 2025, category: 'mortgageInterest', amount: 11000 }],
  }));
  assert.equal(capped.credits.mortgageInterest, 625);
});

test('home carer credit tapers on carer income', () => {
  const base = { year: 2025, status: 'married',
    people: { you: { gross: 80000 }, spouse: { gross: 0 } }, expenses: [] };
  assert.equal(Tax.computeYear({ ...base, settings: { homeCarer: true, carerIncome: 0 } }).credits.homeCarer, 1950);
  assert.equal(Tax.computeYear({ ...base, settings: { homeCarer: true, carerIncome: 9200 } }).credits.homeCarer, 950);
});

test('refund = tax paid minus liability', () => {
  const r = Tax.computeYear(single(40000, {
    people: { you: { gross: 40000, taxPaid: 4500 } },
    expenses: [{ year: 2025, category: 'health', amount: 500 }],
  }));
  assert.equal(r.liability, 3900);
  assert.equal(r.refund, 600);
});

test('liability never negative; expenses from other years ignored', () => {
  const r = Tax.computeYear(single(10000, {
    expenses: [{ year: 2024, category: 'health', amount: 99999 }],
  }));
  assert.equal(r.liability, 0);
  assert.equal(r.credits.health, 0);
});

test('4-year claim deadline', () => {
  const d = Tax.claimDeadline(2022);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getDate(), 31);
  assert.deepEqual(Tax.openYears(new Date(2026, 10, 7)), [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(Tax.openYears(new Date(2027, 0, 2)), [2023, 2024, 2025, 2026, 2027]);
});
