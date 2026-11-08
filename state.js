/*
 * Saved-data helpers: make any stored or synced copy safe to load, and merge
 * two copies (this device and the synced one) without losing either side's
 * work. Pure functions; loaded in the browser as window.TaxState and in Node
 * for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaxState = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const KNOWN_CATEGORIES = ['health', 'medicalInsurance', 'rent', 'tuition', 'mortgageInterest', 'pension', 'remoteWorking', 'nursingHome', 'flatRate'];

  function defaults(now) {
    const year = (now || new Date()).getFullYear() - 1;
    return { profile: { status: 'single', youDob: '', spouseDob: '' }, years: {}, expenses: [], checklist: {}, selectedYear: year, dismissed: {}, deleted: {} };
  }

  /**
   * Turn anything (a backup, a synced copy, an old version's data) into a
   * state the app can run on. Bad parts are dropped, not trusted.
   */
  function sanitize(data, now) {
    const d = defaults(now);
    if (!isObj(data)) return d;
    const out = Object.assign({}, d);
    out.profile = Object.assign({}, d.profile, isObj(data.profile) ? data.profile : {});
    if (!['single', 'married', 'widowed'].includes(out.profile.status)) out.profile.status = 'single';
    out.years = {};
    if (isObj(data.years)) {
      Object.entries(data.years).forEach(([y, v]) => { if (/^\d{4}$/.test(y) && isObj(v)) out.years[y] = v; });
    }
    out.expenses = (Array.isArray(data.expenses) ? data.expenses : [])
      .filter((e) => isObj(e) && KNOWN_CATEGORIES.includes(e.category) && Number.isFinite(Number(e.amount)) && Number(e.amount) >= 0)
      .map((e) => Object.assign({}, e, {
        id: typeof e.id === 'string' && e.id ? e.id : `x${Math.random().toString(36).slice(2, 10)}`,
        amount: Number(e.amount),
        year: Number(e.year) || (typeof e.date === 'string' ? Number(e.date.slice(0, 4)) : d.selectedYear),
        person: e.person === 'spouse' ? 'spouse' : 'you',
      }));
    out.checklist = isObj(data.checklist) ? data.checklist : {};
    out.dismissed = isObj(data.dismissed) ? data.dismissed : {};
    out.deleted = isObj(data.deleted) ? data.deleted : {};
    const sel = Number(data.selectedYear);
    out.selectedYear = Number.isInteger(sel) && sel > 2000 && sel < 2100 ? sel : d.selectedYear;
    if (data.claimVia) out.claimVia = data.claimVia;
    out.updatedAt = Number(data.updatedAt) || 0;
    return out;
  }

  /**
   * Merge two copies. Receipts are combined by id (the newer copy's version
   * wins where both have one); receipts deleted on either side stay deleted.
   * For everything else, the newer copy's values win and the older copy fills
   * in anything the newer one doesn't have.
   */
  function merge(a, b) {
    const A = sanitize(a);
    const B = sanitize(b);
    const aIsOlder = (A.updatedAt || 0) <= (B.updatedAt || 0);
    const [older, newer] = aIsOlder ? [A, B] : [B, A];
    // Only fields a copy really has should win: not blanks filled in by sanitize().
    const newerRaw = aIsOlder ? b : a;
    const newerProfile = isObj(newerRaw) && isObj(newerRaw.profile) ? newerRaw.profile : {};
    const deleted = Object.assign({}, older.deleted, newer.deleted);
    const byId = new Map();
    older.expenses.forEach((e) => byId.set(e.id, e));
    newer.expenses.forEach((e) => byId.set(e.id, e));
    const expenses = [...byId.values()].filter((e) => !deleted[e.id]);
    const years = {};
    new Set([...Object.keys(older.years), ...Object.keys(newer.years)]).forEach((y) => {
      years[y] = Object.assign({}, older.years[y] || {}, newer.years[y] || {});
    });
    const profile = Object.assign({}, older.profile, newerProfile);
    if (!['single', 'married', 'widowed'].includes(profile.status)) profile.status = older.profile.status;
    return Object.assign({}, older, newer, {
      profile,
      years,
      expenses,
      checklist: Object.assign({}, older.checklist, newer.checklist),
      dismissed: Object.assign({}, older.dismissed, newer.dismissed),
      deleted,
      updatedAt: Math.max(A.updatedAt || 0, B.updatedAt || 0),
    });
  }

  /** True when two copies hold the same data (ignoring when they were saved). */
  function same(a, b) {
    const strip = (s) => JSON.stringify(Object.assign({}, s, { updatedAt: 0 }));
    return strip(sanitize(a)) === strip(sanitize(b));
  }

  return { sanitize, merge, same, defaults, KNOWN_CATEGORIES };
});
