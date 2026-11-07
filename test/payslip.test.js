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
