/*
 * Irish PAYE tax rules and calculator.
 *
 * Pure functions only: no DOM, no storage. Loaded in the browser as a classic
 * script (exposes window.Tax) and in Node via require() for tests.
 *
 * All figures are annual and in euro. Rates are best-effort from Revenue and
 * Budget publications; anything marked `verify: true` should be checked on
 * revenue.ie before relying on it. Edit RATES to update a figure.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tax = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STANDARD_RATE = 0.2;
  const HIGHER_RATE = 0.4;

  // Per-year figures. 2027 is included for planning only.
  const RATES = {
    2022: {
      personalSingle: 1700, personalMarried: 3400, employee: 1700,
      bandSingle: 36800, bandMarriedOneEarner: 45800, bandSecondEarnerMax: 27800,
      rentCreditSingle: 500, rentCreditCouple: 1000,
      homeCarer: 1600, mortgageInterestMax: 0,
    },
    2023: {
      personalSingle: 1775, personalMarried: 3550, employee: 1775,
      bandSingle: 40000, bandMarriedOneEarner: 49000, bandSecondEarnerMax: 31000,
      rentCreditSingle: 750, rentCreditCouple: 1500,
      homeCarer: 1700, mortgageInterestMax: 1250,
    },
    2024: {
      personalSingle: 1875, personalMarried: 3750, employee: 1875,
      bandSingle: 42000, bandMarriedOneEarner: 51000, bandSecondEarnerMax: 33000,
      rentCreditSingle: 1000, rentCreditCouple: 2000,
      homeCarer: 1800, mortgageInterestMax: 1250,
    },
    2025: {
      personalSingle: 2000, personalMarried: 4000, employee: 2000,
      bandSingle: 44000, bandMarriedOneEarner: 53000, bandSecondEarnerMax: 35000,
      rentCreditSingle: 1000, rentCreditCouple: 2000,
      homeCarer: 1950, mortgageInterestMax: 625,
      verifyFields: ['mortgageInterestMax'],
    },
    2026: {
      personalSingle: 2000, personalMarried: 4000, employee: 2000,
      bandSingle: 44000, bandMarriedOneEarner: 53000, bandSecondEarnerMax: 35000,
      rentCreditSingle: 1000, rentCreditCouple: 2000,
      homeCarer: 1950, mortgageInterestMax: 625,
      verify: true,
    },
    2027: {
      personalSingle: 2125, personalMarried: 4250, employee: 2125,
      bandSingle: 44000, bandMarriedOneEarner: 53000, bandSecondEarnerMax: 35000,
      rentCreditSingle: 1150, rentCreditCouple: 2300,
      homeCarer: 2050, mortgageInterestMax: 0,
      verify: true,
    },
  };

  const YEARS = Object.keys(RATES).map(Number);

  // Constants that have not changed across the years covered.
  const MED_INSURANCE_CAP_ADULT = 1000;
  const MED_INSURANCE_CAP_CHILD = 500;
  const REMOTE_WORKING_SHARE = 0.3;
  const TUITION_MAX_PER_COURSE = 7000;
  const TUITION_DISREGARD_FULL_TIME = 3000;
  const TUITION_DISREGARD_PART_TIME = 1500;
  const PENSION_EARNINGS_CAP = 115000;
  const HOME_CARER_INCOME_THRESHOLD = 7200;

  // Expense categories the user can log. `kind` decides how relief is given:
  //   credit    -> 20% tax credit, reduces tax directly
  //   deduction -> reduces taxable income, relief at marginal rate
  const CATEGORIES = {
    health: { label: 'Health expenses', kind: 'credit',
      hint: 'GP, consultant, prescriptions, physio, non-routine dental (crowns, root canal). Not routine dental, optical or cosmetic.' },
    medicalInsurance: { label: 'Medical insurance', kind: 'credit',
      hint: 'Only premiums your employer pays for you. If you pay it yourself, the insurer already took 20% off. Capped at €1,000 per adult and €500 per child.' },
    rent: { label: 'Rent (your home)', kind: 'credit',
      hint: 'Rent paid on your main residence. Credit is 20% of rent up to the yearly maximum.' },
    tuition: { label: 'Tuition fees', kind: 'credit',
      hint: 'Approved course fees, up to €7,000 per course. A €3,000 (full-time) or €1,500 (part-time only) disregard applies.' },
    mortgageInterest: { label: 'Mortgage interest', kind: 'credit',
      hint: 'Interest paid in the year. Relief is 20% of the increase over 2022 interest (set 2022 interest in the year settings).' },
    pension: { label: 'Pension (AVC / PRSA)', kind: 'deduction',
      hint: 'Contributions you pay directly to a pension provider. Not ones taken from your wages (those already get relief).' },
    remoteWorking: { label: 'Remote working bills', kind: 'deduction',
      hint: 'Electricity, heating and broadband bills. 30% of cost x days worked from home / days in year.' },
    nursingHome: { label: 'Nursing home fees', kind: 'deduction',
      hint: 'Fees for an approved nursing home. Relief at your marginal rate.' },
    flatRate: { label: 'Flat rate expenses', kind: 'deduction',
      hint: 'Occupation-specific allowance (e.g. nurses, teachers). Enter the allowance amount for your job.' },
  };

  function round2(n) { return Math.round(n * 100) / 100; }
  function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  function ratesFor(year) {
    return RATES[year] || RATES[YEARS[YEARS.length - 1]];
  }

  function daysInYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  }

  /** Age on 31 December of the tax year, or null if dob unknown. */
  function ageAtYearEnd(dob, year) {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    return year - d.getFullYear();
  }

  /** Age-related percentage limit for pension relief. */
  function pensionPercent(age) {
    if (age == null) return 0.15; // conservative default
    if (age < 30) return 0.15;
    if (age < 40) return 0.20;
    if (age < 50) return 0.25;
    if (age < 55) return 0.30;
    if (age < 60) return 0.35;
    return 0.40;
  }

  function pensionLimit(age, gross) {
    return pensionPercent(age) * Math.min(num(gross), PENSION_EARNINGS_CAP);
  }

  /** Last day to claim a refund for a tax year (4-year rule). */
  function claimDeadline(year) {
    return new Date(year + 4, 11, 31, 23, 59, 59);
  }

  function daysUntil(date, now) {
    const ms = date.getTime() - (now || new Date()).getTime();
    return Math.ceil(ms / 86400000);
  }

  /** Years you can still claim for, as of `now`. Current year can be claimed in-year for some reliefs. */
  function openYears(now) {
    const y = (now || new Date()).getFullYear();
    return YEARS.filter((yr) => yr <= y && yr >= y - 4);
  }

  function expensesFor(expenses, year, category, person) {
    return (expenses || []).filter((e) =>
      Number(e.year) === Number(year) &&
      (category == null || e.category === category) &&
      (person == null || (e.person || 'you') === person));
  }

  /**
   * Compute income tax for one tax year.
   *
   * @param {object} input
   *   year: number
   *   status: 'single' | 'married'  (married = jointly assessed)
   *   people: { you: {gross, taxPaid, dob}, spouse: {gross, taxPaid, dob} }
   *   settings: { wfhDays, mortgageInterest2022, homeCarer, carerIncome }
   *   expenses: [{year, category, amount, person, adults, children, partTime}]
   *   exclude: optional category key (or 'all') to leave out, used to value each claim
   */
  function computeYear(input) {
    const year = Number(input.year);
    const r = ratesFor(year);
    const married = input.status === 'married';
    const people = input.people || {};
    const settings = input.settings || {};
    const exclude = input.exclude;
    const skip = (cat) => exclude === 'all' || exclude === cat;
    const all = (input.expenses || []).filter((e) => Number(e.year) === year);
    const who = married ? ['you', 'spouse'] : ['you'];

    // gross = pay from employment (PAYE); welfare = taxable social welfare
    // payments such as State Pension (Contributory) or Illness Benefit. Both
    // are taxed, but only employment pay earns the employee credit and counts
    // towards the pension limit.
    const gross = {};
    const welfare = {};
    const income = {};
    who.forEach((p) => {
      gross[p] = Math.max(0, num(people[p] && people[p].gross));
      welfare[p] = Math.max(0, num(people[p] && people[p].welfare));
      income[p] = gross[p] + welfare[p];
    });
    const totalGross = sum(who.map((p) => income[p]));
    const totalWelfare = sum(who.map((p) => welfare[p]));

    // ---- Deductions (reduce taxable income) ----
    const deductions = {};

    // Pension: capped per person by age band.
    let pension = 0;
    const pensionDetail = {};
    who.forEach((p) => {
      const paid = sum(expensesFor(all, year, 'pension', p).map((e) => e.amount));
      const age = ageAtYearEnd(people[p] && people[p].dob, year);
      const limit = pensionLimit(age, gross[p]);
      const allowed = Math.min(paid, limit);
      pensionDetail[p] = { paid, limit: round2(limit), allowed: round2(allowed), age };
      pension += allowed;
    });
    deductions.pension = skip('pension') ? 0 : pension;

    // Remote working: 30% of bills, pro-rated by days worked from home.
    const wfhDays = Math.min(Math.max(num(settings.wfhDays), 0), daysInYear(year));
    const remoteBills = sum(expensesFor(all, year, 'remoteWorking').map((e) => e.amount));
    const remote = remoteBills * (wfhDays / daysInYear(year)) * REMOTE_WORKING_SHARE;
    deductions.remoteWorking = skip('remoteWorking') ? 0 : remote;

    deductions.nursingHome = skip('nursingHome') ? 0 :
      sum(expensesFor(all, year, 'nursingHome').map((e) => e.amount));
    deductions.flatRate = skip('flatRate') ? 0 :
      sum(expensesFor(all, year, 'flatRate').map((e) => e.amount));

    const totalDeductions = sum(Object.values(deductions));
    const taxable = Math.max(0, totalGross - totalDeductions);

    // ---- Rate band ----
    // Married: the one-earner band, increased by the lower earner's income up to a maximum.
    const bandBase = married ? r.bandMarriedOneEarner : r.bandSingle;
    const bandIncrease = married ? Math.min(Math.min(income.you, income.spouse), r.bandSecondEarnerMax) : 0;
    const taxOn = (b) => Math.min(taxable, b) * STANDARD_RATE + Math.max(0, taxable - b) * HIGHER_RATE;

    // ---- Credits ----
    const credits = {};
    credits.personal = married ? r.personalMarried : r.personalSingle;
    // Employee credit per earner, limited to 20% of that person's PAYE income.
    credits.employee = sum(who.map((p) => Math.min(r.employee, gross[p] * STANDARD_RATE)));

    const health = sum(expensesFor(all, year, 'health').map((e) => e.amount));
    credits.health = skip('health') ? 0 : health * STANDARD_RATE;

    // Premiums you pay yourself already get 20% off at source from the insurer,
    // so only employer-paid premiums (a benefit-in-kind) are claimed from Revenue.
    const medEligible = sum(expensesFor(all, year, 'medicalInsurance')
      .filter((e) => e.paidBy !== 'self').map((e) => {
      const adults = e.adults == null || e.adults === '' ? 1 : num(e.adults);
      const children = num(e.children);
      const cap = adults * MED_INSURANCE_CAP_ADULT + children * MED_INSURANCE_CAP_CHILD;
      return Math.min(num(e.amount), cap);
    }));
    credits.medicalInsurance = skip('medicalInsurance') ? 0 : medEligible * STANDARD_RATE;

    const rentPaid = sum(expensesFor(all, year, 'rent').map((e) => e.amount));
    const rentCap = married ? r.rentCreditCouple : r.rentCreditSingle;
    credits.rent = skip('rent') ? 0 : Math.min(rentPaid * STANDARD_RATE, rentCap);

    const tuitionItems = expensesFor(all, year, 'tuition');
    let tuition = 0;
    if (tuitionItems.length) {
      const fees = sum(tuitionItems.map((e) => Math.min(num(e.amount), TUITION_MAX_PER_COURSE)));
      const allPartTime = tuitionItems.every((e) => e.partTime);
      const disregard = allPartTime ? TUITION_DISREGARD_PART_TIME : TUITION_DISREGARD_FULL_TIME;
      tuition = Math.max(0, fees - disregard) * STANDARD_RATE;
    }
    credits.tuition = skip('tuition') ? 0 : tuition;

    const interest = sum(expensesFor(all, year, 'mortgageInterest').map((e) => e.amount));
    const increase = Math.max(0, interest - num(settings.mortgageInterest2022));
    credits.mortgageInterest = skip('mortgageInterest') ? 0 :
      Math.min(increase * STANDARD_RATE, r.mortgageInterestMax);

    // Home carer credit (married couples only), tapered on carer's own income.
    let homeCarer = 0;
    if (married && settings.homeCarer) {
      const carerIncome = num(settings.carerIncome);
      homeCarer = Math.max(0, r.homeCarer - Math.max(0, carerIncome - HOME_CARER_INCOME_THRESHOLD) / 2);
    }
    if (skip('homeCarer')) homeCarer = 0;

    // Revenue gives either the Home Carer Credit or the increased rate band,
    // whichever is better for the couple, never both.
    const otherCredits = sum(Object.values(credits));
    const withBand = Math.max(0, taxOn(bandBase + bandIncrease) - otherCredits);
    const withCarer = Math.max(0, taxOn(bandBase) - otherCredits - homeCarer);
    const useCarer = homeCarer > 0 && withCarer < withBand;
    const band = useCarer ? bandBase : bandBase + bandIncrease;
    credits.homeCarer = useCarer ? homeCarer : 0;
    const grossTax = taxOn(band);
    const marginalRate = taxable > band ? HIGHER_RATE : STANDARD_RATE;

    const totalCredits = sum(Object.values(credits));
    const liability = Math.max(0, grossTax - totalCredits);
    const taxPaid = sum(who.map((p) => num(people[p] && people[p].taxPaid)));
    const hasTaxPaid = who.some((p) => people[p] && people[p].taxPaid !== '' && people[p].taxPaid != null);

    return {
      year, married, rates: r,
      totalGross: round2(totalGross),
      totalWelfare: round2(totalWelfare),
      deductions: mapRound(deductions),
      totalDeductions: round2(totalDeductions),
      taxable: round2(taxable),
      band, marginalRate,
      grossTax: round2(grossTax),
      credits: mapRound(credits),
      totalCredits: round2(totalCredits),
      liability: round2(liability),
      taxPaid: round2(taxPaid),
      hasTaxPaid,
      refund: round2(taxPaid - liability),
      detail: {
        pension: pensionDetail, wfhDays, remoteBills, rentPaid, rentCap, interest, increase,
        homeCarerAvailable: round2(homeCarer), homeCarerChosen: useCarer, bandIncrease,
      },
    };
  }

  function mapRound(o) {
    const out = {};
    Object.keys(o).forEach((k) => { out[k] = round2(o[k]); });
    return out;
  }

  const CLAIM_KEYS = Object.keys(CATEGORIES).concat(['homeCarer']);

  /**
   * How much tax each claim saves for a year: liability without it minus
   * liability with everything. Also returns the total value of all claims.
   */
  function claimValues(input) {
    const base = computeYear(input);
    const values = {};
    CLAIM_KEYS.forEach((k) => {
      const without = computeYear(Object.assign({}, input, { exclude: k }));
      values[k] = round2(without.liability - base.liability);
    });
    const none = computeYear(Object.assign({}, input, { exclude: 'all' }));
    return { base, values, total: round2(none.liability - base.liability) };
  }

  return {
    RATES, YEARS, CATEGORIES, CLAIM_KEYS,
    STANDARD_RATE, HIGHER_RATE,
    ratesFor, daysInYear, ageAtYearEnd, pensionPercent, pensionLimit,
    claimDeadline, daysUntil, openYears, computeYear, claimValues,
  };
});
