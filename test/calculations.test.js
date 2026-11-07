// Hand-worked checks of the tax calculator. Each expected figure is worked
// out in the comment beside it from Revenue's published rates.
const test = require('node:test');
const assert = require('node:assert/strict');
const Tax = require('../tax.js');

const single = (year, gross, expenses = [], extra = {}) => Object.assign({
  year, status: 'single', people: { you: { gross, dob: '1985-06-01' } }, settings: {}, expenses,
}, extra);
const married = (year, you, spouse, expenses = [], settings = {}) => ({
  year, status: 'married',
  people: { you: { gross: you, dob: '1985-06-01' }, spouse: { gross: spouse, dob: '1987-01-01' } },
  settings, expenses,
});
const exp = (year, category, amount, more = {}) => Object.assign({ year, category, amount }, more);

test('single €50,000 in every year', () => {
  // 2022: 36,800@20% + 13,200@40% = 7,360 + 5,280 = 12,640 − (1,700 + 1,700) = 9,240
  assert.equal(Tax.computeYear(single(2022, 50000)).liability, 9240);
  // 2023: 40,000@20% + 10,000@40% = 12,000 − 3,550 = 8,450
  assert.equal(Tax.computeYear(single(2023, 50000)).liability, 8450);
  // 2024: 42,000@20% + 8,000@40% = 11,600 − 3,750 = 7,850
  assert.equal(Tax.computeYear(single(2024, 50000)).liability, 7850);
  // 2025 and 2026: 44,000@20% + 6,000@40% = 11,200 − 4,000 = 7,200
  assert.equal(Tax.computeYear(single(2025, 50000)).liability, 7200);
  assert.equal(Tax.computeYear(single(2026, 50000)).liability, 7200);
  // 2027 planning: same band, credits 2,125 each: 11,200 − 4,250 = 6,950
  assert.equal(Tax.computeYear(single(2027, 50000)).liability, 6950);
});

test('married, two earners (2024): band increased by the lower income', () => {
  // band 51,000 + 20,000 = 71,000. 71,000@20% + 9,000@40% = 14,200 + 3,600 = 17,800
  // credits 3,750 married + 1,875 × 2 employee = 7,500 → 10,300
  const r = Tax.computeYear(married(2024, 60000, 20000));
  assert.equal(r.band, 71000);
  assert.equal(r.grossTax, 17800);
  assert.equal(r.liability, 10300);
});

test('married, second income above the maximum increase (2025)', () => {
  // band 53,000 + 35,000 (max) = 88,000
  assert.equal(Tax.computeYear(married(2025, 70000, 50000)).band, 88000);
});

test('married, one earner (2023)', () => {
  // band 49,000: 9,800 + 21,000@40% 8,400 = 18,200 − (3,550 + 1,775) = 12,875
  const r = Tax.computeYear(married(2023, 70000, 0));
  assert.equal(r.band, 49000);
  assert.equal(r.liability, 12875);
});

test('employee credit is limited to 20% of pay for low earners', () => {
  // 8,000@20% = 1,600 tax; employee credit min(2,000, 1,600) = 1,600; owes nothing
  const r = Tax.computeYear(single(2025, 8000));
  assert.equal(r.credits.employee, 1600);
  assert.equal(r.liability, 0);
});

test('home carer: band increase is better when the carer earns enough', () => {
  // you 60,000, carer 9,200. HCC = 1,950 − (9,200 − 7,200)/2 = 950.
  // Band option: band 62,200 → 12,440 + 7,000@40% 2,800 = 15,240; credits 4,000 + 2,000 + 1,840 = 7,840 → 7,400
  // Carer option: band 53,000 → 10,600 + 16,200@40% 6,480 = 17,080 − 7,840 − 950 = 8,290
  const r = Tax.computeYear(married(2025, 60000, 9200, [], { homeCarer: true, carerIncome: 9200 }));
  assert.equal(r.credits.homeCarer, 0);
  assert.equal(r.liability, 7400);
  assert.equal(r.detail.homeCarerChosen, false);
});

test('home carer: credit is better when the carer earns little', () => {
  // you 60,000, carer 3,000. HCC full 1,950.
  // Band option: band 56,000 → 11,200 + 7,000@40% 2,800 = 14,000 − (4,000 + 2,000 + 600) = 7,400
  // Carer option: band 53,000 → 10,600 + 10,000@40% 4,000 = 14,600 − 6,600 − 1,950 = 6,050
  const r = Tax.computeYear(married(2025, 60000, 3000, [], { homeCarer: true, carerIncome: 3000 }));
  assert.equal(r.credits.homeCarer, 1950);
  assert.equal(r.band, 53000);
  assert.equal(r.liability, 6050);
  // Worth 7,400 − 6,050 = 1,350 compared with not claiming it
  assert.equal(Tax.claimValues(married(2025, 60000, 3000, [], { homeCarer: true, carerIncome: 3000 })).values.homeCarer, 1350);
});

test('home carer credit by year and taper to zero', () => {
  const hcc = (year, income) => Tax.computeYear(married(year, 80000, 0, [], { homeCarer: true, carerIncome: income })).credits.homeCarer;
  assert.equal(hcc(2022, 0), 1600);
  assert.equal(hcc(2023, 0), 1700);
  assert.equal(hcc(2024, 0), 1800);
  assert.equal(hcc(2025, 0), 1950);
  // 1,950 − (11,100 − 7,200)/2 = 0
  assert.equal(hcc(2025, 11100), 0);
});

test('pension age limits', () => {
  const pct = [[29, .15], [30, .20], [39, .20], [40, .25], [49, .25], [50, .30], [54, .30], [55, .35], [59, .35], [60, .40], [70, .40]];
  pct.forEach(([age, p]) => assert.equal(Tax.pensionPercent(age), p, `age ${age}`));
  assert.equal(Tax.ageAtYearEnd('1995-12-31', 2025), 30);
});

test('pension straddling the rate band saves at both rates', () => {
  // gross 45,000 → 1,000 is above the 44,000 band. A 3,000 pension saves 1,000@40% + 2,000@20% = 800
  const v = Tax.claimValues(single(2025, 45000, [exp(2025, 'pension', 3000)]));
  assert.equal(v.values.pension, 800);
});

test('credits can only reduce tax to zero', () => {
  // 25,000 → 5,000 tax − 4,000 credits = 1,000 left. €10,000 health (2,000 credit) can only save 1,000
  const v = Tax.claimValues(single(2025, 25000, [exp(2025, 'health', 10000)]));
  assert.equal(v.base.liability, 0);
  assert.equal(v.values.health, 1000);
});

test('remote working in a leap year', () => {
  // 3,660 × 183/366 × 30% = 549
  const r = Tax.computeYear(single(2024, 60000, [exp(2024, 'remoteWorking', 3660)], { settings: { wfhDays: 183 } }));
  assert.equal(r.deductions.remoteWorking, 549);
});

test('remote working with no days at home gives nothing', () => {
  const r = Tax.computeYear(single(2025, 60000, [exp(2025, 'remoteWorking', 3000)]));
  assert.equal(r.deductions.remoteWorking, 0);
});

test('rent credit caps by year and household', () => {
  const rent = (year, status) => Tax.computeYear(status === 'married'
    ? married(year, 50000, 20000, [exp(year, 'rent', 15000)])
    : single(year, 50000, [exp(year, 'rent', 15000)])).credits.rent;
  assert.equal(rent(2022, 'single'), 500);
  assert.equal(rent(2023, 'single'), 750);
  assert.equal(rent(2023, 'married'), 1500);
  assert.equal(rent(2025, 'married'), 2000);
  assert.equal(rent(2027, 'single'), 1150);
  // small rent: 20% of 3,000 = 600 (below the cap)
  assert.equal(Tax.computeYear(single(2025, 50000, [exp(2025, 'rent', 3000)])).credits.rent, 600);
});

test('medical insurance: employer-paid only, adult and child caps', () => {
  // cap 1 × 1,000 + 2 × 500 = 2,000; premium 1,500 → 20% = 300
  const r = Tax.computeYear(single(2025, 50000, [exp(2025, 'medicalInsurance', 1500, { adults: 1, children: 2, paidBy: 'employer' })]));
  assert.equal(r.credits.medicalInsurance, 300);
  // older entries with no "who pays" are counted
  assert.equal(Tax.computeYear(single(2025, 50000, [exp(2025, 'medicalInsurance', 500)])).credits.medicalInsurance, 100);
  assert.equal(Tax.computeYear(single(2025, 50000, [exp(2025, 'medicalInsurance', 500, { paidBy: 'self' })])).credits.medicalInsurance, 0);
});

test('tuition: per-course cap and one disregard', () => {
  // min(8,000, 7,000) + 5,000 = 12,000 − 3,000 = 9,000 × 20% = 1,800
  const r = Tax.computeYear(single(2025, 60000, [exp(2025, 'tuition', 8000), exp(2025, 'tuition', 5000)]));
  assert.equal(r.credits.tuition, 1800);
  // a mix of part-time and full-time uses the full-time disregard: 4,000 + 2,000 − 3,000 = 3,000 → 600
  const mix = Tax.computeYear(single(2025, 60000, [exp(2025, 'tuition', 4000, { partTime: true }), exp(2025, 'tuition', 2000)]));
  assert.equal(mix.credits.tuition, 600);
  // fees below the disregard give nothing
  assert.equal(Tax.computeYear(single(2025, 60000, [exp(2025, 'tuition', 2500)])).credits.tuition, 0);
});

test('mortgage interest relief: none in 2022, capped later', () => {
  assert.equal(Tax.computeYear(single(2022, 60000, [exp(2022, 'mortgageInterest', 9000)])).credits.mortgageInterest, 0);
  // 2023: (12,000 − 4,000) × 20% = 1,600 → capped at 1,250
  assert.equal(Tax.computeYear(single(2023, 60000, [exp(2023, 'mortgageInterest', 12000)], { settings: { mortgageInterest2022: 4000 } })).credits.mortgageInterest, 1250);
  // interest went down: no relief
  assert.equal(Tax.computeYear(single(2024, 60000, [exp(2024, 'mortgageInterest', 3000)], { settings: { mortgageInterest2022: 4000 } })).credits.mortgageInterest, 0);
});

test('nursing home and flat rate expenses are deductions', () => {
  // 60,000 − 5,000 − 700 = 54,300 taxable; all above band so saves 5,700 × 40% = 2,280
  const v = Tax.claimValues(single(2025, 60000, [exp(2025, 'nursingHome', 5000), exp(2025, 'flatRate', 700)]));
  assert.equal(v.base.taxable, 54300);
  assert.equal(v.total, 2280);
});

test('total of claims equals the sum of each when none interact', () => {
  const v = Tax.claimValues(single(2025, 60000, [exp(2025, 'health', 500), exp(2025, 'rent', 12000), exp(2025, 'pension', 2000)]));
  // health 100, rent 1,000 (capped), pension 2,000 × 40% = 800
  assert.deepEqual([v.values.health, v.values.rent, v.values.pension, v.total], [100, 1000, 800, 1900]);
});

test('underpaid tax shows as a negative refund', () => {
  const r = Tax.computeYear(single(2025, 50000, [], { people: { you: { gross: 50000, taxPaid: 7000 } } }));
  assert.equal(r.refund, -200);
});

test('claim deadlines', () => {
  const now = new Date(2026, 10, 7, 12);
  assert.equal(Tax.daysUntil(Tax.claimDeadline(2022), now), 55);
  assert.equal(Tax.claimDeadline(2025).toDateString(), new Date(2029, 11, 31).toDateString());
});

test('taxable social welfare is taxed but earns no employee credit', () => {
  // 30,000 pay + 10,000 Illness Benefit = 40,000 @20% = 8,000 − (2,000 + 2,000) = 4,000
  const a = Tax.computeYear(single(2025, 30000, [], { people: { you: { gross: 30000, welfare: 10000 } } }));
  assert.equal(a.totalGross, 40000);
  assert.equal(a.liability, 4000);
  // 5,000 pay + 20,000 State Pension: 25,000 @20% = 5,000; employee credit only 20% × 5,000 = 1,000
  const b = Tax.computeYear(single(2025, 5000, [], { people: { you: { gross: 5000, welfare: 20000 } } }));
  assert.equal(b.credits.employee, 1000);
  assert.equal(b.liability, 2000);
  // leaving welfare out would have overstated a refund by 2,000 here
  assert.equal(Tax.computeYear(single(2025, 30000)).liability, 2000);
});

test('married band increase counts the lower earner’s social welfare', () => {
  // spouse has 15,000 Maternity Benefit and no pay → band 53,000 + 15,000
  const r = Tax.computeYear({ year: 2025, status: 'married', expenses: [],
    people: { you: { gross: 60000 }, spouse: { gross: 0, welfare: 15000 } } });
  assert.equal(r.band, 68000);
  assert.equal(r.credits.employee, 2000);
});

test('pension limit is based on pay from work, not social welfare', () => {
  // age 40 → 25% of 10,000 pay = 2,500, even with 30,000 welfare
  const r = Tax.computeYear(single(2025, 10000, [exp(2025, 'pension', 5000)], { people: { you: { gross: 10000, welfare: 30000, dob: '1985-06-01' } } }));
  assert.equal(r.deductions.pension, 2500);
});

// ---------- USC ----------
test('USC on €50,000 in each year', () => {
  // 2022: 12,012 × 0.5% = 60.06 + 9,283 × 2% = 185.66 + 28,705 × 4.5% = 1,291.725 → 1,537.445
  assert.equal(Math.round(Tax.uscFor(2022, 50000) * 100) / 100, 1537.45);
  // 2023: 60.06 + 10,908 × 2% = 218.16 + 27,080 × 4.5% = 1,218.60 → 1,496.82
  assert.equal(Math.round(Tax.uscFor(2023, 50000) * 100) / 100, 1496.82);
  // 2024: 60.06 + 13,748 × 2% = 274.96 + 24,240 × 4% = 969.60 → 1,304.62
  assert.equal(Math.round(Tax.uscFor(2024, 50000) * 100) / 100, 1304.62);
  // 2025: 60.06 + 15,370 × 2% = 307.40 + 22,618 × 3% = 678.54 → 1,046.00
  assert.equal(Math.round(Tax.uscFor(2025, 50000) * 100) / 100, 1046);
  // 2026: 60.06 + 16,688 × 2% = 333.76 + 21,300 × 3% = 639.00 → 1,032.82
  assert.equal(Math.round(Tax.uscFor(2026, 50000) * 100) / 100, 1032.82);
});

test('USC 8% band, exemption limit and reduced rate', () => {
  // 2025 on 100,000: 60.06 + 307.40 + 42,662 × 3% = 1,279.86 + 29,956 × 8% = 2,396.48 → 4,043.80
  assert.equal(Math.round(Tax.uscFor(2025, 100000) * 100) / 100, 4043.8);
  // €13,000 or less: none. Just over: charged on all of it: 60.06 + 989 × 2% = 19.78 → 79.84
  assert.equal(Tax.uscFor(2025, 13000), 0);
  assert.equal(Math.round(Tax.uscFor(2025, 13001) * 100) / 100, 79.84);
  // medical card, income ≤ 60,000: 60.06 + 37,988 × 2% = 759.76 → 819.82
  assert.equal(Math.round(Tax.uscFor(2025, 50000, true) * 100) / 100, 819.82);
  // medical card but income over 60,000: normal rates
  assert.equal(Tax.uscFor(2025, 65000, true), Tax.uscFor(2025, 65000));
});

// ---------- PRSI ----------
test('PRSI by year on €50,000 (no credit at this pay)', () => {
  assert.equal(Tax.prsiFor(2023, 50000, 40), 2000); // 4%
  assert.equal(Math.round(Tax.prsiFor(2024, 50000, 40) * 100) / 100, 2012.5); // 4% × 9 months, 4.1% × 3
  assert.equal(Math.round(Tax.prsiFor(2025, 50000, 40) * 100) / 100, 2062.5); // 4.1% × 9, 4.2% × 3
});

test('PRSI threshold, credit and age exemption', () => {
  // 18,000 a year = 346.15 a week: under 352, no PRSI
  assert.equal(Tax.prsiFor(2022, 18000, 40), 0);
  // 20,000 = 384.62 a week: 15.38 PRSI − credit (12 − 32.62/6 = 6.56) = 8.82 a week × 52 = 458.67
  assert.equal(Math.round(Tax.prsiFor(2022, 20000, 40) * 100) / 100, 458.67);
  // age 66 or over: none
  assert.equal(Tax.prsiFor(2025, 50000, 66), 0);
});

test('USC and PRSI in the yearly result: per person, before pension, not on welfare', () => {
  const r = Tax.computeYear({
    year: 2025, status: 'married', expenses: [],
    people: {
      you: { gross: 47000, pensionFromWages: 3000, welfare: 5000, dob: '1985-01-01', uscPaid: 1100, prsiPaid: 2062.5 },
      spouse: { gross: 20000, dob: '1955-01-01' },
    },
  });
  // you: charged on 47,000 + 3,000 pension = 50,000; welfare ignored
  assert.equal(r.usc.you, 1046);
  assert.equal(r.prsi.you, 2062.5);
  // spouse is 70 in 2025: reduced USC (60.06 + 7,988 × 2% = 159.76 → 219.82) and no PRSI
  assert.equal(r.usc.spouse, 219.82);
  assert.equal(r.prsi.spouse, 0);
  assert.equal(r.usc.total, 1265.82);
  assert.equal(r.uscPaid, 1100);
  // claims never change USC or PRSI
  const withClaims = Tax.computeYear({ year: 2025, status: 'single', people: { you: { gross: 50000 } },
    expenses: [{ year: 2025, category: 'pension', amount: 5000 }, { year: 2025, category: 'health', amount: 900 }] });
  assert.equal(withClaims.usc.total, 1046);
});
