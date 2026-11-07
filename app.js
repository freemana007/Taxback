/* Taxback UI. State lives in localStorage; calculations come from tax.js. */
(function () {
  'use strict';

  const STORE_KEY = 'taxback.v1';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
  const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtDate = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

  const CLAIM_LABELS = Object.assign(
    Object.fromEntries(Object.entries(Tax.CATEGORIES).map(([k, v]) => [k, v.label])),
    { homeCarer: 'Home carer credit' });

  // ---------- State ----------
  function defaultState() {
    return {
      profile: { status: 'single', youDob: '', spouseDob: '' },
      years: {},
      expenses: [],
      checklist: {},
      selectedYear: new Date().getFullYear(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  let state = load();
  let editingId = null;

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { setStatus('This browser would not save your changes. Copy a backup from Rates & data to keep them.', true); }
  }

  function yearData(y) {
    if (!state.years[y]) state.years[y] = {};
    return state.years[y];
  }

  function married() { return state.profile.status === 'married'; }

  function inputFor(y) {
    const yd = state.years[y] || {};
    return {
      year: y,
      status: state.profile.status,
      people: {
        you: { gross: yd.youGross, taxPaid: yd.youTaxPaid, dob: state.profile.youDob },
        spouse: { gross: yd.spouseGross, taxPaid: yd.spouseTaxPaid, dob: state.profile.spouseDob },
      },
      settings: {
        wfhDays: yd.wfhDays,
        mortgageInterest2022: yd.mortgageInterest2022,
        homeCarer: !!yd.homeCarer,
        carerIncome: yd.carerIncome,
      },
      expenses: state.expenses,
    };
  }

  // ---------- Helpers ----------
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach((c) => n.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return n;
  }

  function rows(table, data) {
    table.replaceChildren(...data.map((r) => {
      const tr = el('tr', { class: r.cls });
      r.cells.forEach((c, i) => tr.append(el(r.head ? 'th' : 'td', { class: i > 0 ? 'num' : '' }, [c])));
      return tr;
    }));
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ---------- Year selector ----------
  function renderYearSelect() {
    const sel = $('#yearSelect');
    const open = Tax.openYears(new Date());
    sel.replaceChildren(...Tax.YEARS.map((y) => el('option', { value: y, selected: y === Number(state.selectedYear) },
      [y + (open.includes(y) ? '' : y > new Date().getFullYear() ? ' (planning)' : ' (closed)')])));
  }

  // ---------- Deadline banner ----------
  function renderDeadline() {
    const now = new Date();
    const oldest = Tax.openYears(now)[0];
    const days = Tax.daysUntil(Tax.claimDeadline(oldest), now);
    const box = $('#deadlineBanner');
    if (days > 120) { box.replaceChildren(); return; }
    const v = Tax.claimValues(inputFor(oldest));
    const worth = v.total > 0 ? ` You have ${eur.format(v.total)} of claims logged for ${oldest}.` : '';
    box.replaceChildren(el('div', { class: 'banner' }, [
      el('strong', { text: `${days} day${days === 1 ? '' : 's'} left to claim for ${oldest}.` }),
      ` Claims for ${oldest} close on 31 December ${oldest + 4}.${worth} `,
      el('a', { href: '#', text: `Go to ${oldest}`, onclick: (e) => { e.preventDefault(); selectYear(oldest); } }),
    ]));
  }

  // ---------- Overview ----------
  function renderDashboard() {
    const y = Number(state.selectedYear);
    const { base, values, total } = Tax.claimValues(inputFor(y));
    const count = state.expenses.filter((e) => Number(e.year) === y).length;
    const deadline = Tax.claimDeadline(y);
    const days = Tax.daysUntil(deadline, new Date());

    const stats = [
      { label: 'Your claims are worth', value: eur.format(total), note: `${count} receipt${count === 1 ? '' : 's'} logged` },
    ];
    if (base.hasTaxPaid) {
      stats.push({
        label: base.refund >= 0 ? 'Estimated refund' : 'Estimated underpaid',
        value: eur.format(Math.abs(base.refund)),
        note: `Paid ${eur0.format(base.taxPaid)} · owed ${eur0.format(base.liability)}`,
        cls: base.refund >= 0 ? 'good' : 'bad',
      });
    } else {
      stats.push({ label: 'Estimated refund', value: '—', note: 'Add tax paid in Income & settings' });
    }
    stats.push({
      label: 'Claim deadline',
      value: days > 0 ? fmtDate.format(deadline) : 'Closed',
      note: days > 0 ? `${days} days left` : 'Over 4 years ago',
      cls: days > 0 && days <= 120 ? 'warn' : '',
    });
    $('#stats').replaceChildren(...stats.map((s) => el('div', { class: 'stat ' + (s.cls || '') }, [
      el('div', { class: 'stat-label', text: s.label }),
      el('div', { class: 'stat-value', text: s.value }),
      el('div', { class: 'stat-note', text: s.note }),
    ])));

    const claimRows = Object.entries(values).filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ cells: [CLAIM_LABELS[k], eur.format(v)] }));
    if (!claimRows.length) {
      const msg = count && !base.totalGross
        ? `Add your ${y} gross pay under Income & settings to value these receipts.`
        : 'No claims yet. Add receipts to see what they save you.';
      rows($('#claimTable'), [{ cells: [msg, ''], cls: 'empty' }]);
    } else {
      claimRows.push({ cells: ['Total', eur.format(total)], cls: 'total' });
      rows($('#claimTable'), claimRows);
    }

    const calc = [
      { cells: ['Gross income', eur.format(base.totalGross)] },
    ];
    Object.entries(base.deductions).forEach(([k, v]) => { if (v) calc.push({ cells: ['less ' + CLAIM_LABELS[k], '−' + eur.format(v)] }); });
    calc.push({ cells: ['Taxable income', eur.format(base.taxable)], cls: 'sub' });
    calc.push({ cells: [`20% on first ${eur0.format(Math.min(base.taxable, base.band))}`, eur.format(Math.min(base.taxable, base.band) * 0.2)] });
    if (base.taxable > base.band) calc.push({ cells: [`40% on balance ${eur0.format(base.taxable - base.band)}`, eur.format((base.taxable - base.band) * 0.4)] });
    calc.push({ cells: ['Gross tax', eur.format(base.grossTax)], cls: 'sub' });
    const creditNames = { personal: 'Personal credit', employee: 'Employee (PAYE) credit' };
    Object.entries(base.credits).forEach(([k, v]) => { if (v) calc.push({ cells: ['less ' + (creditNames[k] || CLAIM_LABELS[k]), '−' + eur.format(v)] }); });
    calc.push({ cells: ['Income tax due', eur.format(base.liability)], cls: 'total' });
    if (base.hasTaxPaid) calc.push({ cells: ['Income tax paid', eur.format(base.taxPaid)] });
    calc.push({ cells: ['Marginal rate', (base.marginalRate * 100) + '%'], cls: 'muted' });
    rows($('#calcTable'), calc);

    const now = new Date();
    const yearRows = [{ head: true, cells: ['Year', 'Receipts', 'Claims worth', 'Est. refund', 'Deadline'] }];
    Tax.openYears(now).forEach((yr) => {
      const r = Tax.claimValues(inputFor(yr));
      const n = state.expenses.filter((e) => Number(e.year) === yr).length;
      const d = Tax.daysUntil(Tax.claimDeadline(yr), now);
      const link = el('a', { href: '#', text: String(yr), onclick: (e) => { e.preventDefault(); selectYear(yr); } });
      yearRows.push({
        cls: yr === y ? 'current' : '',
        cells: [link, n, n && !r.base.totalGross ? 'Add income' : eur.format(r.total),
          r.base.hasTaxPaid ? eur.format(r.base.refund) : '—',
          `${fmtDate.format(Tax.claimDeadline(yr))} (${d}d)`],
      });
    });
    rows($('#yearsTable'), yearRows);
  }

  // ---------- Receipts ----------
  function renderCategoryOptions() {
    const opts = Object.entries(Tax.CATEGORIES).map(([k, v]) => el('option', { value: k, text: v.label }));
    $('#catSelect').replaceChildren(...opts);
    $('#expFilter').replaceChildren(el('option', { value: '', text: 'All categories' }),
      ...Object.entries(Tax.CATEGORIES).map(([k, v]) => el('option', { value: k, text: v.label })));
  }

  function updateFormForCategory() {
    const cat = $('#catSelect').value;
    if ($('#catGuide').dataset.cat !== cat) renderCatGuide(cat);
    $$('.med-only').forEach((n) => { n.hidden = cat !== 'medicalInsurance'; });
    $$('.rent-only').forEach((n) => { n.hidden = cat !== 'rent'; });
    $('#medSelfNotice').hidden = !(cat === 'medicalInsurance' && $('#paidBySelect').value === 'self');
    $('#paidBySelect').required = cat === 'medicalInsurance';
    $$('.tuition-only').forEach((n) => { n.hidden = cat !== 'tuition'; });
    const perPerson = cat === 'pension';
    $$('.person-field').forEach((n) => { n.hidden = !married(); });
    $('#expenseForm').person.title = perPerson ? 'Pension limits are per person' : '';
  }

  function defaultDateFor(y) {
    const today = new Date();
    if (today.getFullYear() === y) return today.toISOString().slice(0, 10);
    return `${y}-12-31`;
  }

  function resetExpenseForm() {
    const f = $('#expenseForm');
    f.reset();
    editingId = null;
    f.date.value = defaultDateFor(Number(state.selectedYear));
    $('#expSubmit').textContent = 'Add receipt';
    $('#expCancel').hidden = true;
    updateAmountTotal();
    updateFormForCategory();
  }

  function onExpenseSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const amount = parseAmount(f.amount.value);
    if (!(amount > 0)) {
      $('#amountTotal').textContent = 'Enter an amount in euro, like 60 or 60 + 45.';
      $('#amountTotal').classList.add('error');
      f.amount.focus(); return;
    }
    if (f.category.value === 'medicalInsurance' && f.paidBy.value === 'self') {
      $('#medSelfNotice').hidden = false; $('#medSelfNotice').scrollIntoView({ block: 'nearest' }); return;
    }
    const date = f.date.value;
    const item = {
      id: editingId || uid(),
      category: f.category.value,
      amount: Math.round(amount * 100) / 100,
      date,
      year: Number(date.slice(0, 4)),
      person: married() ? f.person.value : 'you',
      description: f.description.value.trim(),
    };
    if (item.category === 'medicalInsurance') {
      item.adults = Number(f.adults.value) || 0;
      item.children = Number(f.children.value) || 0;
      item.paidBy = f.paidBy.value || 'employer';
    }
    if (item.category === 'tuition') item.partTime = f.partTime.checked;
    if (editingId) {
      state.expenses = state.expenses.map((x) => (x.id === editingId ? item : x));
    } else {
      state.expenses.push(item);
    }
    if (item.year !== Number(state.selectedYear) && Tax.YEARS.includes(item.year)) state.selectedYear = item.year;
    save();
    resetExpenseForm();
    renderAll();
  }

  function startEdit(item) {
    const f = $('#expenseForm');
    editingId = item.id;
    f.category.value = item.category;
    f.amount.value = item.amount;
    f.date.value = item.date;
    f.person.value = item.person || 'you';
    f.description.value = item.description || '';
    f.adults.value = item.adults == null ? 1 : item.adults;
    f.children.value = item.children || 0;
    f.partTime.checked = !!item.partTime;
    f.paidBy.value = item.category === 'medicalInsurance' ? (item.paidBy || 'employer') : '';
    updateAmountTotal();
    $('#expSubmit').textContent = 'Save changes';
    $('#expCancel').hidden = false;
    updateFormForCategory();
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.amount.focus();
  }

  function renderExpenses() {
    const y = Number(state.selectedYear);
    $('#expYearLabel').textContent = y;
    const filter = $('#expFilter').value;
    const items = state.expenses
      .filter((e) => Number(e.year) === y && (!filter || e.category === filter))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const list = $('#expenseList');
    if (!items.length) {
      list.replaceChildren(el('p', { class: 'muted empty', text: `No receipts for ${y} yet.` }));
      return;
    }
    const groups = {};
    items.forEach((e) => { (groups[e.category] = groups[e.category] || []).push(e); });
    list.replaceChildren(...Object.entries(groups).map(([cat, arr]) => {
      const total = arr.reduce((a, b) => a + Number(b.amount), 0);
      return el('div', { class: 'group' }, [
        el('div', { class: 'group-head' }, [
          el('span', { text: Tax.CATEGORIES[cat] ? Tax.CATEGORIES[cat].label : cat }),
          el('span', { class: 'num', text: eur.format(total) }),
        ]),
        el('ul', { class: 'items' }, arr.map((e) => el('li', {}, [
          el('div', { class: 'item-main' }, [
            el('span', { class: 'item-desc', text: e.description || '(no description)' }),
            el('span', { class: 'item-meta', text: [
              e.date ? fmtDate.format(new Date(e.date)) : '',
              married() ? (e.person === 'spouse' ? 'Spouse' : 'You') : '',
              e.category === 'medicalInsurance' ? `${e.adults ?? 1} adult(s), ${e.children || 0} child(ren)${e.paidBy === 'self' ? ', paid by you (not claimable)' : ', paid by employer'}` : '',
              e.category === 'tuition' ? (e.partTime ? 'Part-time' : 'Full-time') : '',
            ].filter(Boolean).join(' · ') }),
          ]),
          el('span', { class: 'num', text: eur.format(e.amount) }),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'link', text: 'Edit', onclick: () => startEdit(e) }),
            el('button', { class: 'link danger', text: 'Delete', onclick: (ev) => armConfirm(ev.currentTarget, 'Confirm delete', () => {
              state.expenses = state.expenses.filter((x) => x.id !== e.id);
              if (editingId === e.id) resetExpenseForm();
              save(); renderAll();
            }) }),
          ]),
        ]))),
      ]);
    }));
  }

  // ---------- Profile / year settings ----------
  function renderProfile() {
    const pf = $('#profileForm');
    pf.status.value = state.profile.status;
    pf.youDob.value = state.profile.youDob || '';
    pf.spouseDob.value = state.profile.spouseDob || '';
    const y = Number(state.selectedYear);
    $$('.yr').forEach((n) => { n.textContent = y; });
    const yf = $('#yearForm');
    const yd = state.years[y] || {};
    ['youGross', 'youTaxPaid', 'spouseGross', 'spouseTaxPaid', 'wfhDays', 'mortgageInterest2022', 'carerIncome']
      .forEach((k) => { if (document.activeElement !== yf[k]) yf[k].value = yd[k] ?? ''; });
    yf.homeCarer.checked = !!yd.homeCarer;
    $$('.spouse-only').forEach((n) => { n.hidden = !married(); });
    $$('.carer-only').forEach((n) => { n.hidden = !married() || !yd.homeCarer; });
    const monthly = yd.payMode === 'month';
    ['youGross', 'youTaxPaid', 'spouseGross', 'spouseTaxPaid'].forEach((k) => {
      yf[k].readOnly = monthly;
      yf[k].title = monthly ? 'Worked out from your monthly figures' : '';
    });
    $('#modeYear').classList.toggle('on', !monthly); $('#modeYear').setAttribute('aria-pressed', String(!monthly));
    $('#modeMonth').classList.toggle('on', monthly); $('#modeMonth').setAttribute('aria-pressed', String(monthly));
    $('#monthsBox').hidden = !monthly;
    if (monthly) renderMonths();
  }

  // ---------- Month-by-month pay ----------
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let monthPerson = 'you';
  let monthsKey = '';

  function monthsOf(yd, person) {
    yd.months = yd.months || {};
    yd.months[person] = yd.months[person] || {};
    return yd.months[person];
  }

  function monthTotals(yd, person) {
    const m = (yd.months && yd.months[person]) || {};
    let gross = 0; let tax = 0; let count = 0;
    Object.values(m).forEach((v) => {
      if (Number(v.gross) > 0 || Number(v.tax) > 0) count++;
      gross += Number(v.gross) || 0; tax += Number(v.tax) || 0;
    });
    const factor = yd.project && count > 0 && count < 12 ? 12 / count : 1;
    return { gross: Math.round(gross * factor * 100) / 100, tax: Math.round(tax * factor * 100) / 100, count, projected: factor !== 1, rawGross: gross, rawTax: tax };
  }

  // Copies monthly totals into the yearly figures the tax calculation uses.
  function applyMonthTotals(yd) {
    if (yd.payMode !== 'month') return;
    ['you', 'spouse'].forEach((p) => {
      const t = monthTotals(yd, p);
      yd[p + 'Gross'] = t.count ? t.gross : '';
      yd[p + 'TaxPaid'] = t.count ? t.tax : '';
    });
  }

  function setPayMode(mode) {
    const yd = yearData(Number(state.selectedYear));
    if (mode === 'month' && yd.payMode !== 'month') {
      // Keep any yearly totals already typed, in case they switch back.
      yd.yearTotals = { youGross: yd.youGross, youTaxPaid: yd.youTaxPaid, spouseGross: yd.spouseGross, spouseTaxPaid: yd.spouseTaxPaid };
    }
    if (mode === 'year' && yd.payMode === 'month' && yd.yearTotals) Object.assign(yd, yd.yearTotals);
    yd.payMode = mode;
    applyMonthTotals(yd);
    monthsKey = '';
    save(); renderAll();
  }

  function fmtNum(v) { return v === '' || v == null ? '' : String(v); }

  function renderMonths() {
    const y = Number(state.selectedYear);
    const yd = yearData(y);
    if (!married()) monthPerson = 'you';
    $('#monthPerson').hidden = !married();
    $('#monthPerson').replaceChildren(...[['you', 'You'], ['spouse', 'Spouse']].map(([k, label]) => el('button', {
      type: 'button', class: 'seg' + (k === monthPerson ? ' on' : ''), 'aria-pressed': String(k === monthPerson), text: label,
      onclick: () => { monthPerson = k; monthsKey = ''; renderMonths(); },
    })));
    const months = monthsOf(yd, monthPerson);
    const key = `${y}:${monthPerson}`;
    const table = $('#monthsTable');
    if (monthsKey !== key) {
      monthsKey = key;
      const head = el('tr', {}, [el('th', { text: 'Month' }), el('th', { class: 'num', text: 'Pay (taxable / gross) €' }), el('th', { class: 'num', text: 'Income tax (PAYE) €' })]);
      const body = MONTH_NAMES.map((name, i) => {
        const m = i + 1;
        const mk = (field) => {
          const input = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'month-input',
            id: `m-${field}-${m}`, 'aria-label': `${name} ${field === 'gross' ? 'pay' : 'income tax'}`, 'data-month': m, 'data-field': field });
          input.addEventListener('change', onMonthInput);
          return input;
        };
        return el('tr', { 'data-month': m }, [
          el('td', {}, [name, el('span', { class: 'from-slip', 'data-slip': m })]),
          el('td', { class: 'num' }, [mk('gross')]),
          el('td', { class: 'num' }, [mk('tax')]),
        ]);
      });
      table.replaceChildren(el('thead', {}, [head]), el('tbody', {}, body), el('tfoot', { id: 'monthsFoot' }));
    }
    $$('.month-input', table).forEach((inp) => {
      const v = months[inp.dataset.month] || {};
      if (document.activeElement !== inp) inp.value = fmtNum(v[inp.dataset.field]);
      inp.classList.remove('bad');
    });
    $$('.from-slip', table).forEach((n) => { n.textContent = (months[n.dataset.slip] || {}).fromPayslip ? ' · from payslip' : ''; });
    const t = monthTotals(yd, monthPerson);
    const foot = [el('tr', { class: 'total' }, [
      el('td', { text: `Total (${t.count} month${t.count === 1 ? '' : 's'})` }),
      el('td', { class: 'num', text: eur.format(t.rawGross) }), el('td', { class: 'num', text: eur.format(t.rawTax) })])];
    if (t.projected) {
      foot.push(el('tr', { class: 'sub' }, [el('td', { text: 'Estimated full year' }),
        el('td', { class: 'num', text: eur.format(t.gross) }), el('td', { class: 'num', text: eur.format(t.tax) })]));
    }
    $('#monthsFoot').replaceChildren(...foot);
    $('#projectWrap').hidden = !(t.count > 0 && t.count < 12);
    $('#projectYear').checked = !!yd.project;
  }

  function onMonthInput(e) {
    const inp = e.target;
    const raw = inp.value.trim();
    const yd = yearData(Number(state.selectedYear));
    const months = monthsOf(yd, monthPerson);
    const m = inp.dataset.month;
    const v = raw === '' ? '' : parseAmount(raw);
    if (Number.isNaN(v)) { inp.classList.add('bad'); inp.title = 'Use numbers, and + to add several'; return; }
    months[m] = Object.assign({}, months[m], { [inp.dataset.field]: v });
    if (months[m].gross === '' && months[m].tax === '') delete months[m];
    applyMonthTotals(yd);
    save(); renderAll();
  }

  function fillEmptyMonths() {
    const yd = yearData(Number(state.selectedYear));
    const months = monthsOf(yd, monthPerson);
    const first = Object.keys(months).map(Number).sort((a, b) => a - b)[0];
    if (!first) { $('#m-gross-1').focus(); return; }
    for (let m = 1; m <= 12; m++) if (!months[m]) months[m] = { gross: months[first].gross, tax: months[first].tax };
    applyMonthTotals(yd);
    monthsKey = '';
    save(); renderAll();
  }

  // ---------- Payslip upload ----------
  let pendingFile = null;

  function slipStatus(children, cls) {
    $('#payslipResult').replaceChildren(el('div', { class: 'slip-box ' + (cls || '') }, children));
  }

  async function readPayslip(file, password) {
    pendingFile = file;
    slipStatus([el('p', { text: `Reading ${file.name}…` })]);
    try {
      const r = await Payslip.readFile(file, password);
      showSlipResult(r, file.name);
    } catch (e) {
      if (e.name === 'NeedsPassword') return askSlipPassword(e.message);
      slipStatus([el('p', { text: e.message })], 'error');
    }
  }

  function askSlipPassword(msg) {
    const pw = el('input', { type: 'password', id: 'slipPassword', autocomplete: 'off' });
    const open = el('button', { type: 'button', class: 'primary', text: 'Open payslip', onclick: () => readPayslip(pendingFile, pw.value) });
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open.click(); } });
    slipStatus([
      el('p', { text: msg }),
      el('p', { class: 'muted small', text: 'Payslip passwords are often your PPS number or date of birth. Your payroll provider can tell you.' }),
      el('div', { class: 'calc-row' }, [el('label', { for: 'slipPassword' }, ['Password', pw]), open]),
    ]);
    pw.focus();
  }

  function showSlipResult(r, name) {
    const foundAny = r.grossPeriod || r.taxPeriod || r.grossYTD || r.taxYTD;
    const textView = el('details', { class: 'help' }, [el('summary', { text: 'Show the text we read' }),
      el('pre', { class: 'slip-text', text: r.lines.join('\n') })]);
    if (!foundAny) {
      slipStatus([el('p', { text: `We couldn’t find pay or tax figures in ${name}. Type them into the month below instead.` }), textView], 'error');
      return;
    }
    const selYear = Number(state.selectedYear);
    let year = r.payDate && Tax.YEARS.includes(r.payDate.year) ? r.payDate.year : selYear;
    const month = el('select', { id: 'slipMonth' }, MONTH_NAMES.map((n, i) => el('option', { value: i + 1, text: n, selected: r.payDate ? r.payDate.month === i + 1 : i === new Date().getMonth() })));
    const yearSel = el('select', { id: 'slipYear' }, Tax.YEARS.map((yy) => el('option', { value: yy, text: yy, selected: yy === year })));
    const person = el('select', { id: 'slipPerson' }, [el('option', { value: 'you', text: 'You' }), el('option', { value: 'spouse', text: 'Spouse' })]);
    person.value = monthPerson;
    const gross = el('input', { type: 'text', inputmode: 'decimal', id: 'slipGross', value: r.grossPeriod ?? '' });
    const tax = el('input', { type: 'text', inputmode: 'decimal', id: 'slipTax', value: r.taxPeriod ?? '' });
    const save2 = (mode) => () => {
      const g = gross.value.trim() === '' ? 0 : parseAmount(gross.value);
      const t = tax.value.trim() === '' ? 0 : parseAmount(tax.value);
      if (Number.isNaN(g) || Number.isNaN(t) || !(g > 0 || t > 0)) { gross.focus(); return; }
      const yy = Number(yearSel.value); const mm = Number(month.value); const pp = married() ? person.value : 'you';
      const yd = yearData(yy);
      if (yd.payMode !== 'month') {
        yd.yearTotals = { youGross: yd.youGross, youTaxPaid: yd.youTaxPaid, spouseGross: yd.spouseGross, spouseTaxPaid: yd.spouseTaxPaid };
        yd.payMode = 'month';
      }
      const months = monthsOf(yd, pp);
      const cur = months[mm] || {};
      const add = mode === 'add';
      months[mm] = {
        gross: Math.round(((add ? Number(cur.gross) || 0 : 0) + g) * 100) / 100,
        tax: Math.round(((add ? Number(cur.tax) || 0 : 0) + t) * 100) / 100,
        fromPayslip: true,
      };
      applyMonthTotals(yd);
      state.selectedYear = yy; monthPerson = pp; monthsKey = '';
      save(); renderAll();
      slipStatus([el('p', { text: `Saved to ${MONTH_NAMES[mm - 1]} ${yy}: pay ${eur.format(months[mm].gross)}, tax ${eur.format(months[mm].tax)}. Choose another payslip to add more.` })], 'ok');
    };
    const ytd = (r.grossYTD || r.taxYTD)
      ? el('p', { class: 'muted small', text: `This payslip also shows year-to-date totals: pay ${r.grossYTD ? eur.format(r.grossYTD) : '—'}, tax ${r.taxYTD ? eur.format(r.taxYTD) : '—'}. On your last payslip of the year, these are your yearly totals.` })
      : '';
    const freq = r.frequency && r.frequency !== 'monthly'
      ? el('p', { class: 'muted small', text: `This looks like a ${r.frequency} payslip. Use “Add to month” for each one so the month adds them up.` }) : '';
    slipStatus([
      el('p', {}, [el('strong', { text: 'Check these numbers against your payslip, then save.' }), ` Read from ${name}.`]),
      el('div', { class: 'slip-grid' }, [
        el('label', { for: 'slipMonth' }, ['Month', month]),
        el('label', { for: 'slipYear' }, ['Year', yearSel]),
        married() ? el('label', { for: 'slipPerson' }, ['Whose', person]) : '',
        el('label', { for: 'slipGross' }, ['Pay this payslip (€)', gross]),
        el('label', { for: 'slipTax' }, ['Income tax this payslip (€)', tax]),
      ]),
      freq, ytd,
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'primary', text: 'Save to this month', onclick: save2('replace') }),
        el('button', { type: 'button', text: 'Add to what’s already in this month', onclick: save2('add') }),
        el('button', { type: 'button', text: 'Cancel', onclick: () => $('#payslipResult').replaceChildren() }),
      ]),
      textView,
    ]);
  }

  function onProfileChange(e) {
    const f = e.currentTarget;
    state.profile.status = f.status.value;
    state.profile.youDob = f.youDob.value;
    state.profile.spouseDob = f.spouseDob.value;
    save(); renderAll();
  }

  function onYearChange(e) {
    const f = e.currentTarget;
    const yd = yearData(Number(state.selectedYear));
    ['youGross', 'youTaxPaid', 'spouseGross', 'spouseTaxPaid', 'wfhDays', 'mortgageInterest2022', 'carerIncome']
      .forEach((k) => { yd[k] = f[k].value === '' ? '' : Number(f[k].value); });
    yd.homeCarer = f.homeCarer.checked;
    save(); renderAll();
  }

  // ---------- Checklist ----------
  const CHECKLIST = [
    { title: 'Claim through myAccount (Review your tax)', items: [
      ['rent', 'Rent Tax Credit', 'If you rent your home. €1,000 per person / €2,000 per couple for 2024–2026; €1,150 / €2,300 for 2027 and 2028.'],
      ['health', 'Health expenses', '20% back on GP, consultant, prescriptions, physio, non-routine dental. Keep receipts; claim yearly or in-year.'],
      ['medins', 'Medical insurance relief', '20% on premiums up to €1,000 per adult. Claim it even if your employer pays: it is often missed.'],
      ['remote', 'Remote working relief', '30% of electricity, heating and broadband, pro-rated for days worked from home.'],
      ['pension', 'Pension AVC / PRSA top-up', 'Relief at your marginal rate, up to 15%–40% of earnings (age-based), earnings capped at €115,000.'],
      ['tuition', 'Tuition fees', '20% on approved fees up to €7,000, less a €3,000 (full-time) or €1,500 (part-time) disregard.'],
      ['mortgage', 'Mortgage interest relief', 'Relief on the increase in interest over 2022, up to €625 credit. Check the years it is available.'],
      ['carer', 'Home Carer Credit', '€1,950 for 2026 (€2,050 for 2027) if one spouse cares for a dependant at home.'],
      ['other', 'Other credits that may apply', 'Dependent Relative Credit, nursing home fees, Flat Rate Expenses for your occupation.'],
    ] },
    { title: 'Check your credits are right', items: [
      ['joint', 'Jointly assessed?', 'Married couples should check joint assessment is set so credits and the rate band can be shared.'],
      ['credits', 'Tax credit certificate', 'Check your personal and employee credits on your Tax Credit Certificate for the current year.'],
    ] },
    { title: 'Through your employer', items: [
      ['cycle', 'Cycle to Work scheme', 'Buy a bike through salary sacrifice.'],
      ['taxsaver', 'TaxSaver commuter ticket', 'Annual public transport ticket through payroll.'],
      ['vouchers', 'Small benefit vouchers', 'Up to €1,500 a year tax-free, across a maximum of five vouchers.'],
    ] },
    { title: 'Property', items: [
      ['rentaroom', 'Rent-a-Room Relief', 'Tax-free threshold rises from €14,000 to €16,000 a year from 1 January 2027. Not modelled in this app.'],
      ['htb', 'Help to Buy', 'Up to €35,000 refund for first-time buyers of new builds.'],
    ] },
  ];

  function renderChecklist() {
    const y = Number(state.selectedYear);
    const key = (id) => `${y}:${id}`;
    $('#checklist').replaceChildren(...CHECKLIST.map((sec) => {
      const done = sec.items.filter(([id]) => state.checklist[key(id)]).length;
      return el('div', { class: 'card' }, [
        el('div', { class: 'row-between' }, [
          el('h2', { text: sec.title }),
          el('span', { class: 'pill', text: `${done}/${sec.items.length} for ${y}` }),
        ]),
        el('ul', { class: 'checklist' }, sec.items.map(([id, title, desc]) => {
          const cb = el('input', { type: 'checkbox', checked: !!state.checklist[key(id)], onchange: (e) => {
            state.checklist[key(id)] = e.target.checked; save(); renderChecklist();
          } });
          return el('li', {}, [el('label', {}, [cb, el('span', {}, [
            el('strong', { text: title }), el('span', { class: 'muted small', text: desc }),
          ])])]);
        })),
      ]);
    }));
  }

  // ---------- Rates & data ----------
  function renderRates() {
    const years = Tax.YEARS;
    const fields = [
      ['personalSingle', 'Personal credit (single)'], ['personalMarried', 'Personal credit (married)'],
      ['employee', 'Employee credit'], ['bandSingle', '20% band (single)'],
      ['bandMarriedOneEarner', '20% band (married, one earner)'], ['bandSecondEarnerMax', 'Band increase, second earner (max)'],
      ['rentCreditSingle', 'Rent credit (single)'], ['rentCreditCouple', 'Rent credit (couple)'],
      ['homeCarer', 'Home carer credit'], ['mortgageInterestMax', 'Mortgage interest credit (max)'],
    ];
    const data = [{ head: true, cells: ['', ...years.map((y) => y + (Tax.RATES[y].verify ? ' (check)' : ''))] }];
    fields.forEach(([k, label]) => data.push({ cells: [label, ...years.map((y) => {
      const v = Tax.RATES[y][k];
      return v ? eur0.format(v) : '—';
    })] }));
    rows($('#ratesTable'), data);
  }

  // Two-step confirmation inside the page (browser dialogs are not always available).
  function armConfirm(btn, label, action) {
    if (btn.dataset.armed) {
      clearTimeout(Number(btn.dataset.armed));
      delete btn.dataset.armed;
      action();
      return;
    }
    const original = btn.textContent;
    btn.textContent = label;
    btn.classList.add('armed');
    btn.dataset.armed = String(setTimeout(() => {
      delete btn.dataset.armed; btn.textContent = original; btn.classList.remove('armed');
    }, 4000));
  }

  function setStatus(msg, isError) {
    const n = $('#dataStatus');
    if (!n) return;
    n.textContent = msg;
    n.classList.toggle('error', !!isError);
  }

  let boxKind = 'json';

  function backupJson() { return JSON.stringify(state, null, 2); }

  function receiptsCsv() {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['year', 'date', 'category', 'person', 'amount', 'description', 'adults', 'children', 'partTime'];
    return [head.join(',')].concat(state.expenses
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((e) => [e.year, e.date, Tax.CATEGORIES[e.category]?.label || e.category, e.person, e.amount,
        e.description, e.adults ?? '', e.children ?? '', e.partTime ? 'yes' : ''].map(esc).join(','))).join('\n');
  }

  function showBackup() {
    boxKind = 'json'; $('#dataBox').value = backupJson();
    setStatus(`Backup of ${state.expenses.length} receipts is in the box. Copy it somewhere safe.`);
  }

  function showCsv() {
    boxKind = 'csv'; $('#dataBox').value = receiptsCsv();
    setStatus('Receipts as CSV are in the box. Paste into a spreadsheet.');
  }

  async function copyBox() {
    const box = $('#dataBox');
    if (!box.value) showBackup();
    try {
      await navigator.clipboard.writeText(box.value);
      setStatus('Copied.');
    } catch (e) {
      box.focus(); box.select();
      setStatus('Text selected. Press Ctrl+C (or Cmd+C) to copy.');
    }
  }

  function downloadBox() {
    const box = $('#dataBox');
    if (!box.value) showBackup();
    const csv = boxKind === 'csv';
    const name = csv ? 'taxback-receipts.csv' : `taxback-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([box.value], { type: csv ? 'text/csv' : 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus('If no file appeared, use Copy instead.');
  }

  function parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('the text is not a Taxback backup (it is not valid JSON).'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.expenses)) throw new Error('the text is not a Taxback backup.');
    return data;
  }

  function restoreFromBox(btn) {
    const text = $('#dataBox').value.trim();
    if (!text) { setStatus('Paste a backup into the box first.', true); return; }
    let data;
    try { data = parseBackup(text); } catch (e) { setStatus('Could not restore: ' + e.message, true); return; }
    armConfirm(btn, 'Replace my data', () => {
      state = Object.assign(defaultState(), data);
      save(); resetExpenseForm(); renderAll();
      setStatus(`Restored ${state.expenses.length} receipts.`);
    });
    if (btn.dataset.armed) setStatus(`Backup has ${data.expenses.length} receipts. Click again to replace your current data.`);
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      $('#dataBox').value = reader.result; boxKind = 'json';
      try { parseBackup(reader.result); setStatus('Backup loaded into the box. Click “Restore from text” to use it.'); }
      catch (e) { setStatus('Could not read that file: ' + e.message, true); }
    };
    reader.readAsText(file);
  }

  // ---------- Plain-language guide ----------

  // Turns "**bold** text" into nodes without using innerHTML.
  function rich(text) {
    const out = [];
    String(text).split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (!part) return;
      if (part.startsWith('**')) out.push(el('strong', { text: part.slice(2, -2) }));
      else out.push(document.createTextNode(part));
    });
    return out;
  }

  function parseAmount(str) {
    const clean = String(str || '').replace(/[€\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
    if (!clean) return NaN;
    const parts = clean.split('+');
    let total = 0;
    for (const p of parts) {
      if (!/^\d+(\.\d+)?$/.test(p)) return NaN;
      total += Number(p);
    }
    return Math.round(total * 100) / 100;
  }

  function updateAmountTotal() {
    const raw = $('#amountInput').value;
    const out = $('#amountTotal');
    out.classList.remove('error');
    if (raw.includes('+')) {
      const v = parseAmount(raw);
      out.textContent = Number.isNaN(v) ? 'Use numbers and + only, like 60 + 45.' : `Total: ${eur.format(v)}`;
      out.classList.toggle('error', Number.isNaN(v));
    } else {
      out.textContent = 'Several bills? Type them with + between, e.g. 85 + 120.';
    }
  }

  // A small "a × b = result, use it" calculator.
  function multiplyCalc(opts) {
    const a = el('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', id: opts.id + 'A', value: opts.aDefault ?? '' });
    const b = el('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', id: opts.id + 'B', value: opts.bDefault ?? '' });
    const result = el('output', { class: 'calc-result' });
    const use = el('button', { type: 'button', class: 'small-btn', text: 'Use this number', disabled: true });
    let value = 0;
    const update = () => {
      value = opts.compute(Number(a.value) || 0, Number(b.value) || 0);
      result.textContent = value > 0 ? '= ' + opts.format(value) : '';
      use.disabled = !(value > 0);
    };
    a.addEventListener('input', update); b.addEventListener('input', update);
    use.addEventListener('click', () => opts.use(value));
    update();
    return el('div', { class: 'calc-box' }, [
      el('p', { class: 'calc-title', text: opts.title }),
      el('div', { class: 'calc-row' }, [
        el('label', { for: a.id }, [opts.aLabel, a]),
        el('span', { class: 'calc-op', text: opts.op || '×' }),
        el('label', { for: b.id }, [opts.bLabel, b]),
        result, use,
      ]),
    ]);
  }

  function setYearField(name, value) {
    const f = $('#yearForm');
    f[name].value = value;
    f.dispatchEvent(new Event('change'));
    f[name].focus();
  }

  const FIELD_CALCS = {
    annualise: () => multiplyCalc({
      id: 'calcAnnual', title: 'Estimate a full year from your latest payslip',
      aLabel: 'Taxable pay to date (€)', bLabel: 'Months paid so far', op: '÷ months × 12',
      bDefault: new Date().getMonth() + 1,
      compute: (a, b) => (b > 0 ? Math.round((a / b) * 12) : 0),
      format: (v) => eur0.format(v),
      use: (v) => setYearField('youGross', v),
    }),
    wfhDays: () => multiplyCalc({
      id: 'calcWfh', title: 'Work out your days at home',
      aLabel: 'Weeks you worked', bLabel: 'Days a week at home', aDefault: 46,
      compute: (a, b) => Math.min(366, Math.round(a * Math.min(b, 7))),
      format: (v) => `${v} days`,
      use: (v) => setYearField('wfhDays', v),
    }),
  };

  function helpBlock(g, key) {
    const parts = [];
    (g.steps ? [el('ol', { class: 'help-steps' }, g.steps.map((t) => el('li', {}, rich(t))))] : []).forEach((n) => parts.push(n));
    (g.body || []).forEach((t) => parts.push(el('p', {}, rich(t))));
    if (g.calc && FIELD_CALCS[g.calc]) parts.push(FIELD_CALCS[g.calc]());
    return el('details', { class: 'help', 'data-help': key }, [
      el('summary', { text: g.title || 'Where do I find this?' }),
      el('div', { class: 'help-body' }, parts),
    ]);
  }

  // Wraps each field in Income & settings with its help box.
  function attachFieldHelp() {
    Object.entries(Guide.FIELDS).forEach(([name, g]) => {
      const input = $(`#profileForm [name=${name}], #yearForm [name=${name}]`);
      if (!input) return;
      const label = input.closest('label');
      const wrap = el('div', { class: 'field ' + label.className });
      label.className = label.classList.contains('check') ? 'check' : '';
      label.replaceWith(wrap);
      wrap.append(label, helpBlock(g, name));
    });
  }

  function renderCatGuide(cat) {
    const g = Guide.CATEGORIES[cat];
    const box = $('#catGuide');
    box.dataset.cat = cat;
    if (!g) { box.replaceChildren(el('p', { class: 'hint', text: Tax.CATEGORIES[cat].hint })); return; }
    const list = (items, cls) => el('ul', { class: cls }, items.map((t) => el('li', {}, rich(t))));
    box.replaceChildren(
      el('h3', { text: `About ${Tax.CATEGORIES[cat].label.toLowerCase()}` }),
      el('div', { class: 'cg-grid' }, [
        el('div', {}, [el('h4', { text: 'Counts' }), list(g.counts, 'yes-list')]),
        el('div', {}, [el('h4', { text: 'Doesn’t count' }), list(g.notCounts, 'no-list')]),
      ]),
      el('h4', { text: 'Where to find the amount' }),
      el('ol', { class: 'help-steps' }, g.find.map((t) => el('li', {}, rich(t)))),
      el('h4', { text: 'How to work it out' }),
      el('p', {}, rich(g.calc)),
      el('p', { class: 'muted small' }, rich(g.keep)),
    );
  }

  function buildRentCalc() {
    $('#rentCalc').replaceChildren(multiplyCalc({
      id: 'calcRent', title: 'Work out a year of rent',
      aLabel: 'Monthly rent (€)', bLabel: 'Months paid this year', bDefault: 12,
      compute: (a, b) => Math.round(a * b * 100) / 100,
      format: (v) => eur.format(v),
      use: (v) => { $('#amountInput').value = v; updateAmountTotal(); $('#amountInput').focus(); },
    }));
  }

  function goTo(tab, focusSel) {
    showTab(tab);
    window.scrollTo({ top: 0 });
    if (focusSel) {
      const n = $(focusSel);
      if (n) { n.focus({ preventScroll: true }); n.scrollIntoView({ block: 'center' }); }
    }
  }

  function addReceipt(cat) {
    resetExpenseForm();
    $('#catSelect').value = cat;
    updateFormForCategory();
    goTo('expenses', '#amountInput');
  }

  function renderGuide() {
    const y = Number(state.selectedYear);
    const yd = state.years[y] || {};
    const receipts = state.expenses.filter((e) => Number(e.year) === y).length;
    const total = Tax.claimValues(inputFor(y)).total;
    const claimedKey = `${y}:claimed`;
    const steps = [
      {
        title: 'Tell us about you',
        text: 'Are you single or married, and when were you born? Two quick answers.',
        need: 'Nothing',
        done: !!state.profile.youDob,
        action: ['Answer 2 questions', () => goTo('profile', '#profileForm [name=status]')],
      },
      {
        title: `Find your pay and tax for ${y}`,
        text: 'Two numbers: how much you earned, and how much income tax was taken. Both are on one page in Revenue’s myAccount or your last payslip of the year. Or enter your pay month by month, or upload PDF payslips and let the app read them.',
        need: 'myAccount login, or your payslips',
        done: yd.youGross > 0,
        action: ['Enter pay and tax', () => goTo('profile', '#yearForm [name=youGross]')],
      },
      {
        title: 'Find what you can claim',
        text: 'Answer the yes/no questions below. Each “yes” is a type of receipt to add.',
        need: 'A couple of minutes',
        done: receipts > 0 || Guide.QUIZ.some(([cat]) => state.checklist[`${y}:quiz:${cat}`]),
        action: ['Show the questions', () => $('#quizCard').scrollIntoView({ behavior: 'smooth' })],
      },
      {
        title: 'Add your receipts',
        text: 'For each thing you paid for, add the amount. The app tells you where to find each one and adds up bills for you.',
        need: 'Receipts, bills, bank statements',
        done: receipts > 0,
        action: ['Add a receipt', () => goTo('expenses', '#catSelect')],
      },
      {
        title: 'See what you’re owed',
        text: 'The Overview shows what each claim is worth and your likely refund.',
        need: 'Nothing',
        done: total > 0,
        action: ['Open Overview', () => goTo('dashboard')],
      },
      {
        title: 'Claim it from Revenue',
        text: claimRoute() === 'ros'
          ? 'Enter your totals in your Form 11 tax return on ROS. The steps are below. Tick this when you’ve submitted it.'
          : 'Copy your totals into myAccount. The steps are below. Tick this when you’ve sent it.',
        need: claimRoute() === 'ros' ? 'ROS login (digital certificate and password)' : 'myAccount login',
        done: !!state.checklist[claimedKey],
        action: ['Show how to claim', () => $('#claimSteps').scrollIntoView({ behavior: 'smooth' })],
        tick: claimedKey,
      },
    ];
    const next = steps.findIndex((s) => !s.done);
    $('#guideSteps').replaceChildren(...steps.map((s, i) => {
      const status = s.done ? 'done' : i === next ? 'next' : 'todo';
      const btn = el('button', { type: 'button', class: status === 'next' ? 'primary' : '', text: s.action[0], onclick: s.action[1] });
      const extra = s.tick ? el('label', { class: 'check tick' }, [
        el('input', { type: 'checkbox', checked: !!state.checklist[s.tick], onchange: (e) => {
          state.checklist[s.tick] = e.target.checked; save(); renderAll();
        } }), `I’ve claimed for ${y}`,
      ]) : null;
      return el('li', { class: 'step ' + status }, [
        el('span', { class: 'step-num', 'aria-hidden': 'true', text: s.done ? '✓' : String(i + 1) }),
        el('div', { class: 'step-body' }, [
          el('div', { class: 'step-head' }, [
            el('h3', { text: s.title }),
            el('span', { class: 'chip ' + status, text: status === 'done' ? 'Done' : status === 'next' ? 'Do this next' : 'To do' }),
          ]),
          el('p', { text: s.text }),
          el('p', { class: 'muted small', text: 'You’ll need: ' + s.need }),
          el('div', { class: 'actions' }, [btn].concat(extra ? [extra] : [])),
        ]),
      ]);
    }));

    $('#quiz').replaceChildren(...Guide.QUIZ.map(([cat, q]) => {
      const key = `${y}:quiz:${cat}`;
      const ans = state.checklist[key];
      const count = state.expenses.filter((e) => Number(e.year) === y && e.category === cat).length;
      const choose = (v) => () => { state.checklist[key] = v; save(); renderGuide(); };
      return el('li', { class: 'quiz-item' + (ans === 'yes' ? ' yes' : ans === 'no' ? ' no' : '') }, [
        el('p', { class: 'quiz-q', text: q }),
        el('div', { class: 'quiz-a' }, [
          el('button', { type: 'button', class: 'seg' + (ans === 'yes' ? ' on' : ''), 'aria-pressed': String(ans === 'yes'), text: 'Yes', onclick: choose('yes') }),
          el('button', { type: 'button', class: 'seg' + (ans === 'no' ? ' on' : ''), 'aria-pressed': String(ans === 'no'), text: 'No', onclick: choose('no') }),
          ans === 'yes' ? el('button', { type: 'button', class: 'primary', text: count ? `Add another (${count} added)` : `Add ${Tax.CATEGORIES[cat].label.toLowerCase()}`, onclick: () => addReceipt(cat) }) : '',
        ]),
      ]);
    }));
  }

  function claimRoute() { return state.profile.claimVia === 'ros' ? 'ros' : 'myaccount'; }

  function renderClaimSteps() {
    const route = claimRoute();
    $('#routePick').replaceChildren(...Object.entries(Guide.ROUTES).map(([k, r]) => el('button', {
      type: 'button', class: 'seg' + (k === route ? ' on' : ''), 'aria-pressed': String(k === route), text: r.label,
      onclick: () => { state.profile.claimVia = k; save(); renderClaimSteps(); renderGuide(); },
    })));
    $('#routeWho').replaceChildren(...rich(Guide.ROUTES[route].who));
    const steps = route === 'ros' ? Guide.ROS_STEPS : Guide.CLAIM_STEPS;
    $('#claimSteps').replaceChildren(...steps.map((s) => el('li', {}, [
      el('strong', { text: s.title }),
      el('p', {}, rich(s.text).concat(s.link ? [' ', el('a', { href: s.link, target: '_blank', rel: 'noopener', text: s.linkText || 'Open myAccount' })] : [])),
    ])));
    $('#receiptsApp').replaceChildren(...rich(Guide.RECEIPTS_APP));
  }

  function renderGuideStatic() {
    renderClaimSteps();
    $('#glossary').replaceChildren(...Guide.GLOSSARY.flatMap(([t, d]) => [el('dt', { text: t }), el('dd', { text: d })]));
  }

  // ---------- Navigation ----------
  function showTab(name) {
    $$('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + name; });
    try { sessionStorage.setItem('taxback.tab', name); } catch (e) { /* ignore */ }
  }

  function selectYear(y) {
    state.selectedYear = Number(y);
    save();
    if (!editingId) $('#expenseForm').date.value = defaultDateFor(Number(y));
    renderAll();
  }

  function renderAll() {
    renderYearSelect();
    renderDeadline();
    renderDashboard();
    renderExpenses();
    renderProfile();
    renderChecklist();
    renderGuide();
    updateFormForCategory();
  }

  // ---------- Init ----------
  function init() {
    if (!Tax.YEARS.includes(Number(state.selectedYear))) state.selectedYear = Tax.openYears(new Date()).slice(-1)[0];
    renderCategoryOptions();
    renderRates();
    attachFieldHelp();
    buildRentCalc();
    renderGuideStatic();
    $('#amountInput').addEventListener('input', updateAmountTotal);
    $('#modeYear').addEventListener('click', () => setPayMode('year'));
    $('#modeMonth').addEventListener('click', () => setPayMode('month'));
    $('#fillMonths').addEventListener('click', fillEmptyMonths);
    $('#projectYear').addEventListener('change', (e) => {
      const yd = yearData(Number(state.selectedYear)); yd.project = e.target.checked;
      applyMonthTotals(yd); save(); renderAll();
    });
    $('#payslipFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readPayslip(f); });
    $('#paidBySelect').addEventListener('change', updateFormForCategory);
    $('#yearSelect').addEventListener('change', (e) => selectYear(e.target.value));
    $$('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#catSelect').addEventListener('change', updateFormForCategory);
    $('#expenseForm').addEventListener('submit', onExpenseSubmit);
    $('#expCancel').addEventListener('click', resetExpenseForm);
    $('#expFilter').addEventListener('change', renderExpenses);
    $('#profileForm').addEventListener('change', onProfileChange);
    $('#yearForm').addEventListener('change', onYearChange);
    $('#exportBtn').addEventListener('click', showBackup);
    $('#exportCsvBtn').addEventListener('click', showCsv);
    $('#copyBtn').addEventListener('click', copyBox);
    $('#downloadBtn').addEventListener('click', downloadBox);
    $('#restoreBtn').addEventListener('click', (e) => restoreFromBox(e.currentTarget));
    $('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; });
    $('#resetBtn').addEventListener('click', (e) => {
      armConfirm(e.currentTarget, 'Click again to delete everything', () => {
        state = defaultState(); save(); resetExpenseForm(); renderAll();
        setStatus('All data deleted.');
      });
    });
    const hasData = state.expenses.length > 0 || Object.keys(state.years).length > 0;
    let tab = hasData ? 'dashboard' : 'guide';
    try { tab = sessionStorage.getItem('taxback.tab') || tab; } catch (e) { /* ignore */ }
    showTab(tab);
    resetExpenseForm();
    renderAll();
  }

  init();
})();
