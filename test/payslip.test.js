const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../payslip.js');

test('two-column layout: this period and year to date', () => {
  const r = P.parseText([
    'ACME LTD           PAYSLIP',
    'Employee: J Murphy   PPSN 1234567T',
    'Pay Date: 25/03/2026     Tax Year 2026   Tax Month 3   Monthly',
    'Description          This Period     Year to Date',
    'Basic Salary         4,000.00        12,000.00',
    'Gross Pay            4,000.00        12,000.00',
    'Pension (employee)     200.00           600.00',
    'Taxable Pay          3,800.00        11,400.00',
    'PAYE                   512.40         1,537.20',
    'USC                    120.15           360.45',
    'PRSI                   164.00           492.00',
    'Tax Credits            333.33',
    'Tax Cut Off Point    3,666.67',
    'Net Pay              3,003.45',
  ]);
  assert.equal(r.grossPeriod, 3800); // taxable pay preferred over gross
  assert.equal(r.grossYTD, 11400);
  assert.equal(r.taxPeriod, 512.4);
  assert.equal(r.taxYTD, 1537.2);
  assert.deepEqual(r.payDate, { year: 2026, month: 3, day: 25 });
  assert.equal(r.frequency, 'monthly');
});

test('separate YTD section and label on its own line', () => {
  const r = P.parseText([
    'Payment date 14.11.2025',
    'Gross',
    '€2,150.00',
    'Income Tax 260.10',
    'Gross Pay To Date 47,300.00',
    'Tax To Date 5,722.20',
    'Net pay 1,610.32',
  ]);
  assert.equal(r.grossPeriod, 2150);
  assert.equal(r.taxPeriod, 260.1);
  assert.equal(r.grossYTD, 47300);
  assert.equal(r.taxYTD, 5722.2);
  assert.deepEqual(r.payDate, { year: 2025, month: 11, day: 14 });
});

test('weekly payslip with month name date and percentages ignored', () => {
  const r = P.parseText([
    'Week ending: 7 March 2026  Weekly',
    'Total Gross 812.50',
    'Tax @ 20% 162.50',
    'Tax Credit 76.92',
  ]);
  assert.equal(r.grossPeriod, 812.5);
  assert.equal(r.taxPeriod, 162.5);
  assert.equal(r.payDate.month, 3);
  assert.equal(r.frequency, 'weekly');
});

test('nothing found returns nulls', () => {
  const r = P.parseText(['Hello', 'World']);
  assert.equal(r.grossPeriod, null);
  assert.equal(r.taxPeriod, null);
  assert.equal(r.payDate, null);
});

test('USC and PRSI are found, employer PRSI ignored', () => {
  const r = P.parseText([
    'Description   This Period   Year to Date',
    'Taxable Pay   3,800.00   11,400.00',
    'PAYE   512.40   1,537.20',
    'USC   120.15   360.45',
    'PRSI Class A1',
    'PRSI EE   164.00   492.00',
    'PRSI ER   425.00   1,275.00',
  ]);
  assert.equal(r.uscPeriod, 120.15);
  assert.equal(r.uscYTD, 360.45);
  assert.equal(r.prsiPeriod, 164);
  assert.equal(r.prsiYTD, 492);
  assert.equal(r.taxPeriod, 512.4);
});

test('emergency and week 1 basis are spotted', () => {
  assert.equal(P.parseText(['Tax Basis: Emergency', 'PAYE 800.00']).basis, 'emergency');
  assert.equal(P.parseText(['Basis: Week 1', 'PAYE 80.00']).basis, 'week1');
  assert.equal(P.parseText(['Tax Basis: M1']).basis, 'week1');
  assert.equal(P.parseText(['Tax Basis: Cumulative', 'PAYE 512.40']).basis, null);
});

test('Statement of Liability figures', () => {
  const r = P.parseStatement([
    'Statement of Liability 2025',
    'Total Income 52,300.00',
    'Total Tax Credits 4,274.10',
    'Tax Liability after credits 7,445.90',
    'Tax Paid 8,120.00',
    'You have overpaid €674.10',
  ]);
  assert.deepEqual([r.income, r.credits, r.liability, r.paid, r.overpaid], [52300, 4274.1, 7445.9, 8120, 674.1]);
});

// ---------- Fixes from the PR review ----------
test('pay date beats the pay period, and a period uses its end date', () => {
  assert.deepEqual(P.parseDate('Pay Period 25/02/2025 - 24/03/2025\nPay Date 28/03/2025'), { year: 2025, month: 3, day: 28 });
  assert.deepEqual(P.parseDate('Pay Period 25/12/2024 - 24/01/2025'), { year: 2025, month: 1, day: 24 });
  assert.deepEqual(P.parseDate('Period ending 31.01.2025'), { year: 2025, month: 1, day: 31 });
});

test('years, hours and counts are not read as money', () => {
  const r = P.parseText(['Tax 2025 612.00', 'Gross Pay 3,500.00 Hours 160.00']);
  assert.equal(r.taxPeriod, 612);
  assert.equal(r.grossPeriod, 3500);
  assert.equal(r.grossYTD, null);
});

test('"this period … year to date …" on one line is split correctly', () => {
  const r = P.parseText(['Income Tax Paid this period 612.00 Year to date 7,344.00']);
  assert.equal(r.taxPeriod, 612);
  assert.equal(r.taxYTD, 7344);
});
