const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../state.js');

const rec = (id, amount, extra = {}) => Object.assign({ id, year: 2025, date: '2025-03-01', category: 'health', amount, person: 'you' }, extra);

test('a thin new copy does not wipe the synced one: receipts are combined', () => {
  // the synced copy has 3 receipts; a new device added 1 before it loaded, and saved later
  const cloud = { updatedAt: 100, expenses: [rec('a', 10), rec('b', 20), rec('c', 30)], years: { 2025: { youGross: 50000, youTaxPaid: 9000 } } };
  const device = { updatedAt: 200, expenses: [rec('d', 40)], years: {} };
  const m = S.merge(device, cloud);
  assert.deepEqual(m.expenses.map((e) => e.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(m.years['2025'].youGross, 50000);
  assert.equal(m.updatedAt, 200);
});

test('the newer copy wins for the same receipt or figure; older fills the gaps', () => {
  const older = { updatedAt: 100, expenses: [rec('a', 10)], years: { 2025: { youGross: 40000, wfhDays: 50 } }, profile: { status: 'single', youDob: '1980-01-01' } };
  const newer = { updatedAt: 300, expenses: [rec('a', 99)], years: { 2025: { youGross: 45000 } }, profile: { status: 'married' } };
  const m = S.merge(older, newer);
  assert.equal(m.expenses[0].amount, 99);
  assert.deepEqual(m.years['2025'], { youGross: 45000, wfhDays: 50 });
  assert.equal(m.profile.status, 'married');
  assert.equal(m.profile.youDob, '1980-01-01');
});

test('a receipt deleted on either device stays deleted', () => {
  const a = { updatedAt: 100, expenses: [rec('a', 10), rec('b', 20)] };
  const b = { updatedAt: 200, expenses: [rec('a', 10)], deleted: { b: 150 } };
  assert.deepEqual(S.merge(a, b).expenses.map((e) => e.id), ['a']);
  // even when the device that deleted it is the older copy
  assert.deepEqual(S.merge({ updatedAt: 300, expenses: [rec('a', 10), rec('b', 20)] }, b).expenses.map((e) => e.id).sort(), ['a']);
});

test('bad saved data is cleaned instead of breaking the app', () => {
  const s = S.sanitize({ years: null, profile: 'oops', expenses: [null, { amount: 5 }, rec('ok', 12), { category: 'health', amount: 'abc' }], selectedYear: 'x', checklist: [] });
  assert.deepEqual(s.years, {});
  assert.equal(s.profile.status, 'single');
  assert.deepEqual(s.expenses.map((e) => e.id), ['ok']);
  assert.ok(s.selectedYear > 2000);
  assert.deepEqual(s.checklist, {});
  assert.equal(S.sanitize('nonsense').expenses.length, 0);
  // year keys must be years
  assert.deepEqual(Object.keys(S.sanitize({ years: { 2025: {}, foo: {}, 2024: 5 } }).years), ['2025']);
});

test('same() ignores when a copy was saved', () => {
  assert.equal(S.same({ updatedAt: 1, expenses: [rec('a', 1)] }, { updatedAt: 9, expenses: [rec('a', 1)] }), true);
  assert.equal(S.same({ expenses: [rec('a', 1)] }, { expenses: [rec('a', 2)] }), false);
});
