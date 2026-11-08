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
      spccc: 1650, blind: 1650, blindBoth: 3300, incapChild: 3300, depRelative: 245,
      personalSingle: 1700, personalMarried: 3400, employee: 1700,
      bandSingle: 36800, bandMarriedOneEarner: 45800, bandSecondEarnerMax: 27800,
      rentCreditSingle: 500, rentCreditCouple: 1000,
      homeCarer: 1600, mortgageInterestMax: 0,
    },
    2023: {
      spccc: 1750, blind: 1650, blindBoth: 3300, incapChild: 3300, depRelative: 245,
      verifyFields: ['incapChild', 'blind'],
      personalSingle: 1775, personalMarried: 3550, employee: 1775,
      bandSingle: 40000, bandMarriedOneEarner: 49000, bandSecondEarnerMax: 31000,
      rentCreditSingle: 750, rentCreditCouple: 1500,
      homeCarer: 1700, mortgageInterestMax: 1250,
    },
    2024: {
      spccc: 1750, blind: 1950, blindBoth: 3900, incapChild: 3500, depRelative: 245,
      verifyFields: ['incapChild', 'blind'],
      personalSingle: 1875, personalMarried: 3750, employee: 1875,
      bandSingle: 42000, bandMarriedOneEarner: 51000, bandSecondEarnerMax: 33000,
      rentCreditSingle: 1000, rentCreditCouple: 2000,
      homeCarer: 1800, mortgageInterestMax: 1250,
    },
    2025: {
      spccc: 1900, blind: 1950, blindBoth: 3900, incapChild: 3800, depRelative: 305,
      personalSingle: 2000, personalMarried: 4000, employee: 2000,
      bandSingle: 44000, bandMarriedOneEarner: 53000, bandSecondEarnerMax: 35000,
      rentCreditSingle: 1000, rentCreditCouple: 2000,
      homeCarer: 1950, mortgageInterestMax: 625,
      verifyFields: ['mortgageInterestMax', 'blind'],
    },
    2026: {
      spccc: 1900, blind: 1950, blindBoth: 3900, incapChild: 3800, depRelative: 305,
      personalSingle: 2000, personalMarried: 4000, employee: 2000,
      bandSingle: 44000, bandMarriedOneEarner: 53000, bandSecondEarnerMax: 35000,
      rentCreditSingle: 1000, rentCreditCouple: 2000,
      homeCarer: 1950, mortgageInterestMax: 625,
      verify: true,
    },
    2027: {
      spccc: 1900, blind: 1950, blindBoth: 3900, incapChild: 3800, depRelative: 305,
      personalSingle: 2125, personalMarried: 4250, employee: 2125,
      bandSingle: 44000, bandMarriedOneEarner: 53000, bandSecondEarnerMax: 35000,
      rentCreditSingle: 1150, rentCreditCouple: 2300,
      homeCarer: 2050, mortgageInterestMax: 0,
      verify: true,
    },
  };

  const YEARS = Object.keys(RATES).map(Number);

  // Credits that have not changed across the years covered.
  const AGE_CREDIT_SINGLE = 245;
  const AGE_CREDIT_MARRIED = 490;
  const WIDOWED_EXTRA = 540; // widowed, no dependent children: single credit + 540
  const WIDOWED_PARENT = [3600, 3150, 2700, 2250, 1800]; // years 1-5 after bereavement
  const SPCCC_BAND = 4000; // extra 20% band for the Single Person Child Carer Credit
  const AGE_EXEMPT_SINGLE = 18000;
  const AGE_EXEMPT_MARRIED = 36000;
  const AGE_EXEMPT_CHILD = [575, 575]; // first two children; 830 for each after
  const AGE_EXEMPT_CHILD_MORE = 830;

  // USC: bands are [upper limit, rate]. Nobody pays USC if their income for
  // USC is €13,000 or less. Medical card holders and people aged 70+ with
  // income up to €60,000 pay at most 2%.
  // PRSI (Class A employees): `rate` is the year's average where the rate
  // changed in October (4% → 4.1% on 1 Oct 2024, → 4.2% on 1 Oct 2025,
  // → 4.35% on 1 Oct 2026). No PRSI on weekly pay of €352 or less; a PRSI
  // credit of up to €12 a week tapers away by 1/6 of pay above €352.
  const USC_PRSI = {
    2022: { usc: [[12012, 0.005], [21295, 0.02], [70044, 0.045], [Infinity, 0.08]], prsi: 0.04 },
    2023: { usc: [[12012, 0.005], [22920, 0.02], [70044, 0.045], [Infinity, 0.08]], prsi: 0.04 },
    2024: { usc: [[12012, 0.005], [25760, 0.02], [70044, 0.04], [Infinity, 0.08]], prsi: 0.04 * 0.75 + 0.041 * 0.25 },
    2025: { usc: [[12012, 0.005], [27382, 0.02], [70044, 0.03], [Infinity, 0.08]], prsi: 0.041 * 0.75 + 0.042 * 0.25, verifyPrsi: true },
    2026: { usc: [[12012, 0.005], [28700, 0.02], [70044, 0.03], [Infinity, 0.08]], prsi: 0.042 * 0.75 + 0.0435 * 0.25, verify: true },
    2027: { usc: [[12012, 0.005], [28700, 0.02], [70044, 0.03], [Infinity, 0.08]], prsi: 0.0435, verify: true },
  };
  const USC_EXEMPT_LIMIT = 13000;
  const USC_REDUCED_LIMIT = 60000;
  const PRSI_WEEKLY_THRESHOLD = 352;
  const PRSI_CREDIT_MAX = 12;
  const PRSI_EXEMPT_AGE = 66;

  function uscFor(year, income, reduced) {
    const bands = (USC_PRSI[year] || USC_PRSI[2027]).usc;
    if (!(income > USC_EXEMPT_LIMIT)) return 0;
    const useBands = reduced && income <= USC_REDUCED_LIMIT ? [[bands[0][0], 0.005], [Infinity, 0.02]] : bands;
    let usc = 0;
    let lower = 0;
    for (const [upper, rate] of useBands) {
      if (income > lower) usc += (Math.min(income, upper) - lower) * rate;
      lower = upper;
    }
    return usc;
  }

  // Worked out week by week on the average week, as PRSI is charged per pay period.
  function prsiFor(year, pay, age) {
    if (!(pay > 0) || (age != null && age >= PRSI_EXEMPT_AGE)) return 0;
    const rate = (USC_PRSI[year] || USC_PRSI[2027]).prsi;
    const week = pay / 52;
    if (week <= PRSI_WEEKLY_THRESHOLD) return 0;
    const credit = Math.max(0, PRSI_CREDIT_MAX - (week - PRSI_WEEKLY_THRESHOLD) / 6);
    return Math.max(0, week * rate - credit) * 52;
  }

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
    // Read the year straight from "YYYY-MM-DD": Date parsing can shift it by
    // a day (and a year on 1 January) depending on the time zone.
    const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(dob));
    if (m) return year - Number(m[1]);
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    return year - d.getUTCFullYear();
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
    const widowed = input.status === 'widowed';
    const sit = input.situation || {};
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

    // ---- USC and PRSI (per person; reliefs and claims don't change them) ----
    // Both are charged on pay before pension taken from wages; social welfare
    // payments are exempt from both.
    const usc = {};
    const prsi = {};
    const uscPrsiDetail = {};
    who.forEach((p) => {
      const pp = people[p] || {};
      const payBeforePension = gross[p] + Math.max(0, num(pp.pensionFromWages));
      const age = ageAtYearEnd(pp.dob, year);
      const reduced = !!pp.medicalCard || (age != null && age >= 70);
      usc[p] = uscFor(year, payBeforePension, reduced);
      prsi[p] = prsiFor(year, payBeforePension, age);
      uscPrsiDetail[p] = { payBeforePension, reducedUsc: reduced && payBeforePension <= USC_REDUCED_LIMIT, prsiExempt: age != null && age >= PRSI_EXEMPT_AGE };
    });
    const paidOf = (key) => {
      const entered = who.filter((p) => people[p] && people[p][key] !== '' && people[p][key] != null);
      return entered.length ? sum(entered.map((p) => num(people[p][key]))) : null;
    };

    // ---- Deductions (reduce taxable income) ----
    const deductions = {};

    // Pension: capped per person by age band.
    let pension = 0;
    const pensionDetail = {};
    who.forEach((p) => {
      // Not married: every receipt is yours, even one marked as a spouse's earlier.
      const paid = sum(expensesFor(all, year, 'pension', married ? p : null).map((e) => e.amount));
      const age = ageAtYearEnd(people[p] && people[p].dob, year);
      const limit = pensionLimit(age, gross[p]);
      // Pension taken from wages already used part of the age-related limit.
      const fromWages = Math.max(0, num(people[p] && people[p].pensionFromWages));
      const allowed = Math.max(0, Math.min(paid, limit - fromWages));
      pensionDetail[p] = { paid, limit: round2(limit), fromWages: round2(fromWages), allowed: round2(allowed), age };
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
    // Single Person Child Carer Credit: single or widowed, with a child living with you.
    const spccc = !married && !!sit.singleParent && !skip('singleParent');
    const bandBase = married ? r.bandMarriedOneEarner : r.bandSingle + (spccc ? SPCCC_BAND : 0);
    const bandIncrease = married ? Math.min(Math.min(income.you, income.spouse), r.bandSecondEarnerMax) : 0;
    const taxOn = (b) => Math.min(taxable, b) * STANDARD_RATE + Math.max(0, taxable - b) * HIGHER_RATE;

    // ---- Credits ----
    const credits = {};
    const bereaved = widowed ? Number(sit.bereavementYear) || 0 : 0;
    if (married || (widowed && bereaved === year)) {
      credits.personal = r.personalMarried; // in the year of bereavement the married credit still applies
    } else if (widowed && !sit.singleParent && bereaved && bereaved < year) {
      credits.personal = r.personalSingle + WIDOWED_EXTRA;
    } else {
      credits.personal = r.personalSingle;
    }
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

    // ---- Credits that depend on your circumstances ----
    const ages = who.map((p) => ageAtYearEnd(people[p] && people[p].dob, year));
    const over65 = ages.some((a) => a != null && a >= 65);
    credits.ageCredit = skip('ageCredit') || !over65 ? 0 : (married ? AGE_CREDIT_MARRIED : AGE_CREDIT_SINGLE);
    credits.singleParent = spccc ? r.spccc : 0;
    const yearsSince = widowed && bereaved ? year - bereaved : 0;
    credits.widowedParent = skip('widowedParent') || !(widowed && sit.singleParent && yearsSince >= 1 && yearsSince <= 5)
      ? 0 : WIDOWED_PARENT[yearsSince - 1];
    const blindCount = who.filter((p) => sit.blind && sit.blind[p]).length;
    credits.blind = skip('blind') || !blindCount ? 0 : (blindCount === 2 ? r.blindBoth : r.blind);
    credits.incapChild = skip('incapChild') ? 0 : Math.max(0, Math.floor(num(sit.incapChildren))) * r.incapChild;
    credits.depRelative = skip('depRelative') ? 0 : Math.max(0, Math.floor(num(sit.depRelatives))) * r.depRelative;

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
    let liability = Math.max(0, grossTax - totalCredits);

    // Age exemption (65+): no income tax on income up to the limit, and above it
    // tax is capped at 40% of the excess ("marginal relief"), if that's lower.
    let ageExemption = null;
    if (over65) {
      const kids = Math.max(0, Math.floor(num(sit.children)));
      let limit = married ? AGE_EXEMPT_MARRIED : AGE_EXEMPT_SINGLE;
      for (let k = 0; k < kids; k++) limit += AGE_EXEMPT_CHILD[k] || AGE_EXEMPT_CHILD_MORE;
      const capped = Math.max(0, totalGross - limit) * HIGHER_RATE;
      ageExemption = { limit, capped: round2(capped), applied: capped < liability };
      if (capped < liability) liability = capped;
    }
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
      ageExemption,
      taxPaid: round2(taxPaid),
      hasTaxPaid,
      refund: round2(taxPaid - liability),
      usc: { you: round2(usc.you || 0), spouse: round2(usc.spouse || 0), total: round2(sum(Object.values(usc))) },
      prsi: { you: round2(prsi.you || 0), spouse: round2(prsi.spouse || 0), total: round2(sum(Object.values(prsi))) },
      uscPaid: paidOf('uscPaid'),
      prsiPaid: paidOf('prsiPaid'),
      uscPrsiDetail,
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

  const CLAIM_KEYS = Object.keys(CATEGORIES).concat(['homeCarer', 'ageCredit', 'singleParent', 'widowedParent', 'blind', 'incapChild', 'depRelative']);

  /**
   * Joint versus separate assessment for a married couple. Under separate
   * assessment each person is taxed like a single person on their own
   * income, with their own receipts (unassigned receipts count as yours),
   * and no home carer credit or shared band.
   */
  function compareAssessment(input) {
    const joint = computeYear(input).liability;
    if (input.status !== 'married') return { joint, separate: null, difference: 0 };
    let separate = 0;
    ['you', 'spouse'].forEach((p) => {
      const sit = input.situation || {};
      separate += computeYear({
        year: input.year, status: 'single',
        people: { you: (input.people || {})[p] || {} },
        settings: Object.assign({}, input.settings, { homeCarer: false }),
        situation: { blind: { you: !!(sit.blind && sit.blind[p]) },
          incapChildren: p === 'you' ? sit.incapChildren : 0, depRelatives: p === 'you' ? sit.depRelatives : 0 },
        expenses: (input.expenses || []).filter((e) => (e.person || 'you') === p).map((e) => Object.assign({}, e, { person: 'you' })),
      }).liability;
    });
    return { joint: round2(joint), separate: round2(separate), difference: round2(separate - joint) };
  }

  /**
   * The credits and 20% band a person (or couple) should see on their Tax
   * Credit Certificate: the standard ones that don't depend on receipts.
   */
  function entitlement(input) {
    const r = computeYear(Object.assign({}, input, { expenses: [] }));
    const c = r.credits;
    const credits = c.personal + c.employee + c.ageCredit + c.singleParent + c.widowedParent + c.blind + c.incapChild + c.depRelative + c.homeCarer;
    return { credits: round2(credits), band: r.band, detail: c };
  }

  /**
   * Income tax a payroll should deduct each month on the cumulative basis.
   * grossByMonth: 12 numbers (0 or blank for months not paid).
   * Returns the expected tax for each month.
   */
  function cumulativePaye(grossByMonth, annualCredits, annualBand) {
    let paidSoFar = 0;
    let grossSoFar = 0;
    return grossByMonth.map((g, i) => {
      grossSoFar += num(g);
      const band = (annualBand / 12) * (i + 1);
      const credits = (annualCredits / 12) * (i + 1);
      const due = round2(Math.max(0, Math.min(grossSoFar, band) * STANDARD_RATE + Math.max(0, grossSoFar - band) * HIGHER_RATE - credits));
      // Payroll refunds within the year too, so a month can be negative.
      const thisMonth = round2(due - paidSoFar);
      paidSoFar = due;
      return thisMonth;
    });
  }

  /** Month 1 (Week 1) basis: each month taxed on its own, no catching up. */
  function month1Paye(gross, annualCredits, annualBand) {
    const band = annualBand / 12;
    return round2(Math.max(0, Math.min(gross, band) * STANDARD_RATE + Math.max(0, gross - band) * HIGHER_RATE - annualCredits / 12));
  }

  /**
   * Emergency tax for a month: no credits. With a PPS number, the first
   * month gets 1/12 of the single band at 20%; after that everything is 40%.
   * Without a PPS number, 40% from the start.
   */
  function emergencyPaye(year, gross, monthNumber, hasPps) {
    const band = monthNumber === 1 && hasPps ? ratesFor(year).bandSingle / 12 : 0;
    return round2(Math.min(gross, band) * STANDARD_RATE + Math.max(0, gross - band) * HIGHER_RATE);
  }

  /**
   * A sensible way for a married couple to split their credits and 20% band
   * between them so neither overpays during the year. The higher earner
   * takes the shared band (up to their income) and the shareable credits
   * (up to what their tax can use); the lower earner keeps the band
   * increase that only they can use, plus whatever is left over.
   */
  function suggestSplit(input) {
    const year = Number(input.year);
    const r = ratesFor(year);
    const people = input.people || {};
    const inc = (p) => num(people[p] && people[p].gross) + num(people[p] && people[p].welfare);
    const ent = entitlement(input);
    const hi = inc('you') >= inc('spouse') ? 'you' : 'spouse';
    const lo = hi === 'you' ? 'spouse' : 'you';
    const shared = r.bandMarriedOneEarner;
    const increase = ent.band - shared;
    const bandHi = Math.min(shared, inc(hi));
    const bandLo = shared - bandHi + increase;
    const emp = (p) => Math.min(r.employee, num(people[p] && people[p].gross) * STANDARD_RATE);
    const shareable = Math.max(0, ent.credits - emp('you') - emp('spouse'));
    const taxHi = Math.min(inc(hi), bandHi) * STANDARD_RATE + Math.max(0, inc(hi) - bandHi) * HIGHER_RATE;
    const toHi = Math.min(shareable, Math.max(0, taxHi - emp(hi)));
    const out = {};
    out[hi] = { credits: round2(emp(hi) + toHi), band: round2(bandHi) };
    out[lo] = { credits: round2(emp(lo) + shareable - toHi), band: round2(bandLo) };
    return out;
  }

  /**
   * How much more pension (AVC) is worth paying for a year: the room left
   * under the age limit, and the part of it that saves 40%.
   */
  function avcPlan(input) {
    const r = computeYear(input);
    const people = input.people || {};
    const who = input.status === 'married' ? ['you', 'spouse'] : ['you'];
    const room = {};
    who.forEach((p) => {
      const d = r.detail.pension[p] || { limit: 0, paid: 0 };
      room[p] = round2(Math.max(0, d.limit - d.paid - num(people[p] && people[p].pensionFromWages)));
    });
    const totalRoom = sum(Object.values(room));
    const above = Math.max(0, r.taxable - r.band);
    const at40 = Math.min(totalRoom, above);
    return { room, totalRoom: round2(totalRoom), at40: round2(at40), saving: round2(at40 * HIGHER_RATE), marginalRate: r.marginalRate };
  }

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
    RATES, YEARS, CATEGORIES, CLAIM_KEYS, USC_PRSI, uscFor, prsiFor,
    STANDARD_RATE, HIGHER_RATE,
    ratesFor, daysInYear, ageAtYearEnd, pensionPercent, pensionLimit,
    claimDeadline, daysUntil, openYears, computeYear, claimValues,
    compareAssessment, entitlement, suggestSplit, cumulativePaye, month1Paye, emergencyPaye, avcPlan,
  };
});
