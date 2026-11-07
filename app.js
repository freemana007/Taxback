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
    { homeCarer: 'Home carer credit', ageCredit: 'Age credit (65+)', singleParent: 'Single Person Child Carer Credit',
      widowedParent: 'Widowed Parent Credit', blind: 'Blind Person’s Credit', incapChild: 'Incapacitated Child Credit', depRelative: 'Dependent Relative Credit' });

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

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { setStatus('This browser would not save your changes. Copy a backup from the Backup tab to keep them.', true); }
  }

  function save() {
    state.updatedAt = Date.now();
    persist();
    schedulePush();
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
        you: personInput(yd, 'you'),
        spouse: personInput(yd, 'spouse'),
      },
      settings: {
        wfhDays: yd.wfhDays,
        mortgageInterest2022: yd.mortgageInterest2022,
        homeCarer: !!yd.homeCarer,
        carerIncome: yd.carerIncome,
      },
      expenses: state.expenses,
      situation: {
        singleParent: state.profile.status !== 'married' && !!state.profile.singleParent,
        children: state.profile.children,
        bereavementYear: state.profile.bereavementYear,
        blind: { you: !!state.profile.blindYou, spouse: !!state.profile.blindSpouse },
        incapChildren: state.profile.incapChildren,
        depRelatives: state.profile.depRelatives,
      },
    };
  }

  function personInput(yd, p) {
    return {
      gross: yd[p + 'Gross'], taxPaid: yd[p + 'TaxPaid'], welfare: yd[p + 'Welfare'],
      pensionFromWages: yd[p + 'PensionWages'], uscPaid: yd[p + 'UscPaid'], prsiPaid: yd[p + 'PrsiPaid'],
      medicalCard: !!yd[p + 'MedicalCard'], dob: state.profile[p + 'Dob'],
    };
  }

  const PROFILE_NUM = ['bereavementYear', 'children', 'incapChildren', 'depRelatives'];
  const PROFILE_CHECK = ['singleParent', 'blindYou', 'blindSpouse'];

  const YEAR_NUMBER_FIELDS = ['youGross', 'youTaxPaid', 'youWelfare', 'youPensionWages', 'youUscPaid', 'youPrsiPaid',
    'spouseGross', 'spouseTaxPaid', 'spouseWelfare', 'spousePensionWages', 'spouseUscPaid', 'spousePrsiPaid',
    'wfhDays', 'mortgageInterest2022', 'carerIncome'];
  const YEAR_CHECK_FIELDS = ['homeCarer', 'youMedicalCard', 'spouseMedicalCard'];


  // ---------- Icons (24×24, drawn with the current text colour) ----------
  const ICON_PATHS = {
    home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
    chart: 'M4 20h16M7 16v-4M12 16V8M17 16v-7',
    receipt: 'M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5 6 19.2zM9 8h6M9 11.5h6M9 15h3.5',
    wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01',
    check: 'M5 12.5l4 4L19 7',
    shield: 'M12 3.5 5 6v5.5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6zM9 12l2 2 4-4',
    plus: 'M12 5v14M5 12h14',
    search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
    camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM12 9.5v5M9.5 12h5',
    medicalInsurance: 'M12 3.5 5 6v5.5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6zM12 9v6M9 12h6',
    rent: 'M4 11 12 4.5l8 6.5M6 9.5V20h12V9.5M10 20v-5h4v5',
    tuition: 'M3 9l9-4.5L21 9l-9 4.5zM7 11v4.5c1.4 1.3 3.1 2 5 2s3.6-.7 5-2V11M21 9v5',
    mortgageInterest: 'M4 20h16M5 10h14M12 4l8 6H4zM7 10v7M12 10v7M17 10v7',
    pension: 'M5 13.5C5 9.9 8.1 7 12 7s7 2.9 7 6.5c0 1.6-.7 3-1.8 4.1V20h-3v-1.2a8 8 0 0 1-4.4 0V20h-3v-2.4A5.6 5.6 0 0 1 5 13.5zM12 7V4.5M15 11h.01',
    remoteWorking: 'M4 6h16v10H4zM2.5 19h19M10 16v3M14 16v3',
    nursingHome: 'M3 18V8M3 14h18v4M21 14v-2a2 2 0 0 0-2-2h-7v4M7 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    flatRate: 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 12h16',
  };

  function icon(name, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.receipt);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
  }

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(children) {
    const t = $('#toast');
    t.replaceChildren(...[].concat(children));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
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
      // PRSI is left out: it's worked out on an average week, so small
      // differences from payslips are expected and rarely refundable.
      const uscDiff = base.uscPaid == null ? 0 : r2(base.uscPaid - base.usc.total);
      const totalRefund = r2(base.refund + uscDiff);
      stats.push({
        label: totalRefund >= 0 ? 'Estimated refund' : 'Estimated underpaid',
        value: eur.format(Math.abs(totalRefund)),
        note: base.uscPaid == null
          ? `Income tax: paid ${eur0.format(base.taxPaid)} · owed ${eur0.format(base.liability)}`
          : `Income tax ${eur0.format(base.refund)} · USC ${eur0.format(uscDiff)}`,
        cls: totalRefund >= 0 ? 'good' : 'bad',
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

    // A refund estimate for a year that isn't over only works if pay and tax
    // are both full-year estimates (or both figures to date).
    const yd = state.years[y] || {};
    const running = y >= new Date().getFullYear() && base.hasTaxPaid && !(yd.payMode === 'month' && yd.project);
    const note = $('#yearNote');
    note.hidden = !running;
    if (running) {
      note.replaceChildren(el('strong', { text: `${y} isn’t over yet. ` }),
        'This refund is only right if your pay and tax paid are both full-year estimates. ',
        el('a', { href: '#', text: 'Estimate both from your latest payslip', onclick: (e) => {
          e.preventDefault(); goTo('profile'); const d = $('[data-help=youGross]'); d.open = true; d.scrollIntoView({ block: 'center' });
        } }), '.');
    }

    const claimRows = Object.entries(values).filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ cells: [CLAIM_LABELS[k], eur.format(v)] }));
    if (base.detail.remoteBills > 0 && !base.detail.wfhDays) {
      const link = el('a', { href: '#', text: 'Add your days worked from home', onclick: (e) => { e.preventDefault(); goTo('profile', '#yearForm [name=wfhDays]'); } });
      claimRows.unshift({ cells: [el('span', {}, [link, ' to count your remote working bills.']), ''], cls: 'note' });
    }
    if (!claimRows.length) {
      const msg = count && !base.totalGross
        ? `Add your ${y} gross pay under Income & settings to value these receipts.`
        : 'No claims yet. Add receipts to see what they save you.';
      rows($('#claimTable'), [{ cells: [msg, ''], cls: 'empty' }]);
    } else {
      claimRows.push({ cells: ['Total', eur.format(total)], cls: 'total' });
      rows($('#claimTable'), claimRows);
    }

    const calc = base.totalWelfare
      ? [{ cells: ['Pay from work', eur.format(base.totalGross - base.totalWelfare)] },
        { cells: ['Taxable social welfare', eur.format(base.totalWelfare)] },
        { cells: ['Total income', eur.format(base.totalGross)], cls: 'sub' }]
      : [{ cells: ['Gross income', eur.format(base.totalGross)] }];
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
    renderCharges(base);

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

  // ---------- Income tax, USC and PRSI ----------
  function renderCharges(base) {
    const y = Number(state.selectedYear);
    const yd = state.years[y] || {};
    const diffCell = (paid, due) => {
      if (paid == null) return '—';
      const d = r2(paid - due);
      if (Math.abs(d) < 1) return 'About right';
      return d > 0 ? `${eur.format(d)} overpaid` : `${eur.format(-d)} underpaid`;
    };
    const lines = [
      ['Income tax', base.liability, base.hasTaxPaid ? base.taxPaid : null],
      ['USC', base.usc.total, base.uscPaid],
      ['PRSI', base.prsi.total, base.prsiPaid],
    ];
    const totalDue = r2(lines.reduce((a, l) => a + l[1], 0));
    const allPaid = lines.every((l) => l[2] != null) ? r2(lines.reduce((a, l) => a + l[2], 0)) : null;
    const data = [{ head: true, cells: ['', 'Due (estimate)', 'Paid', 'Difference'] }];
    lines.forEach(([label, due, paid]) => data.push({ cells: [label, eur.format(due), paid == null ? '—' : eur.format(paid), diffCell(paid, due)] }));
    data.push({ cls: 'total', cells: ['Total', eur.format(totalDue), allPaid == null ? '—' : eur.format(allPaid), ''] });
    const who = married() ? ['you', 'spouse'] : ['you'];
    const pension = who.reduce((a, p) => a + (Number(yd[p + 'PensionWages']) || 0), 0);
    const payAndWelfare = who.reduce((a, p) => a + (base.uscPrsiDetail[p] ? base.uscPrsiDetail[p].payBeforePension : 0), 0) + base.totalWelfare;
    if (payAndWelfare > 0) {
      const takeHome = r2(payAndWelfare - totalDue - pension);
      data.push({ cls: 'sub', cells: [pension ? 'Take-home pay (after pension)' : 'Take-home pay', eur.format(takeHome), '', ''] });
      data.push({ cls: 'muted', cells: ['Share of income taken', `${Math.round((totalDue / payAndWelfare) * 1000) / 10}%`, '', ''] });
    }
    rows($('#chargesTable'), data);

    const notes = [];
    if (married()) notes.push(`USC and PRSI are worked out for each of you: you ${eur.format(base.usc.you)} USC and ${eur.format(base.prsi.you)} PRSI, your spouse ${eur.format(base.usc.spouse)} USC and ${eur.format(base.prsi.spouse)} PRSI.`);
    who.forEach((p) => {
      const d = base.uscPrsiDetail[p];
      if (!d) return;
      const name = p === 'you' ? 'You' : 'Your spouse';
      if (d.reducedUsc) notes.push(`${name} pay the reduced USC rate (medical card or age 70+).`);
      if (d.prsiExempt) notes.push(`${name} pay no PRSI (age 66 or over).`);
    });
    if (base.uscPaid != null && base.uscPaid - base.usc.total >= 1) notes.push('You may have overpaid USC. Check you gave the right details (medical card, age), then ask Revenue to review it through myAccount.');
    notes.push('PRSI is worked out on your average week, so it can differ by a few euro from your payslips.');
    if (!yd.youPensionWages && !yd.spousePensionWages) notes.push('If pension comes out of your wages, add it under Income & settings: USC and PRSI are charged before it comes off.');
    $('#chargesNote').textContent = notes.join(' ');
  }

  // ---------- Receipts ----------
  function renderCategoryOptions() {
    const opts = Object.entries(Tax.CATEGORIES).map(([k, v]) => el('option', { value: k, text: v.label }));
    $('#catSelect').replaceChildren(...opts);
    $('#catTiles').replaceChildren(...Object.entries(Tax.CATEGORIES).map(([k, v]) => {
      const b = el('button', { type: 'button', class: 'cat-tile', 'data-cat': k, 'aria-pressed': 'false', onclick: () => {
        $('#catSelect').value = k;
        updateFormForCategory();
        $('#amountInput').focus({ preventScroll: true });
      } }, [v.label]);
      b.prepend(icon(k));
      return b;
    }));
    $('#expFilter').replaceChildren(el('option', { value: '', text: 'All categories' }),
      ...Object.entries(Tax.CATEGORIES).map(([k, v]) => el('option', { value: k, text: v.label })));
  }

  function updateFormForCategory() {
    const cat = $('#catSelect').value;
    $$('#catTiles .cat-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
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
    pendingPhoto = null;
    showPhotoPreview(null);
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
    const old = editingId ? state.expenses.find((x) => x.id === editingId) : null;
    if (pendingPhoto instanceof Blob) {
      item.photo = true;
      photoPut(item.id, pendingPhoto).catch(() => toast('This browser wouldn’t store the photo. The receipt is saved without it.'));
    } else if (pendingPhoto === 'remove') {
      photoDel(item.id);
    } else if (old && old.photo) {
      item.photo = true;
    }
    const valueBefore = Tax.YEARS.includes(item.year) ? Tax.claimValues(inputFor(item.year)).total : 0;
    const wasEditing = !!editingId;
    if (editingId) {
      state.expenses = state.expenses.map((x) => (x.id === editingId ? item : x));
    } else {
      state.expenses.push(item);
    }
    if (item.year !== Number(state.selectedYear) && Tax.YEARS.includes(item.year)) state.selectedYear = item.year;
    save();
    resetExpenseForm();
    renderAll();
    const label = Tax.CATEGORIES[item.category].label.toLowerCase();
    if (!Tax.YEARS.includes(item.year)) {
      toast(`Saved ${eur.format(item.amount)} ${label}. ${item.year} isn’t a tax year this app covers.`);
      return;
    }
    const after = Tax.claimValues(inputFor(item.year));
    const gain = Math.round((after.total - valueBefore) * 100) / 100;
    const yd = state.years[item.year] || {};
    if (!(Number(yd.youGross) > 0 || Number(yd.spouseGross) > 0)) {
      toast([`${wasEditing ? 'Updated' : 'Added'} ${eur.format(item.amount)} ${label}. `, el('strong', { text: 'Add your pay' }), ' to see what it’s worth.']);
    } else if (gain > 0) {
      toast([`${wasEditing ? 'Updated' : 'Added'} ${label}. `, el('strong', { text: `Saves you ${eur.format(gain)}` }), ` · ${item.year} total ${eur.format(after.total)}`]);
    } else {
      toast(`${wasEditing ? 'Updated' : 'Added'} ${label}. It doesn’t change your tax for ${item.year} (you may have reached a limit).`);
    }
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
    pendingPhoto = null;
    showPhotoPreview(null, item.photo ? 'Loading photo…' : '');
    if (item.photo) photoGet(item.id).then((b) => { if (editingId === item.id && !pendingPhoto) showPhotoPreview(b, b ? '' : 'Photo is on another device.'); });
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
          el('span', { class: 'group-icon' }, [icon(cat)]),
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
          el('span', { class: 'num' }, [e.photo ? el('button', { type: 'button', class: 'link photo-link', 'aria-label': 'View photo', title: 'View photo', onclick: () => openPhoto(e.id) }, [icon('camera', 18)]) : '', eur.format(e.amount)]),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'link', text: 'Edit', onclick: () => startEdit(e) }),
            el('button', { class: 'link danger', text: 'Delete', onclick: (ev) => armConfirm(ev.currentTarget, 'Confirm delete', () => {
              state.expenses = state.expenses.filter((x) => x.id !== e.id);
              if (e.photo) photoDel(e.id);
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
    PROFILE_NUM.forEach((k) => { if (document.activeElement !== pf[k]) pf[k].value = state.profile[k] ?? ''; });
    PROFILE_CHECK.forEach((k) => { pf[k].checked = !!state.profile[k]; });
    $$('.widowed-only').forEach((n) => { n.hidden = state.profile.status !== 'widowed'; });
    $$('.not-married-only').forEach((n) => { n.hidden = married(); });
    const y = Number(state.selectedYear);
    $$('.yr').forEach((n) => { n.textContent = y; });
    const yf = $('#yearForm');
    const yd = state.years[y] || {};
    YEAR_NUMBER_FIELDS.forEach((k) => { if (document.activeElement !== yf[k]) yf[k].value = yd[k] ?? ''; });
    YEAR_CHECK_FIELDS.forEach((k) => { yf[k].checked = !!yd[k]; });
    $$('.spouse-only').forEach((n) => { n.hidden = !married(); });
    $$('.carer-only').forEach((n) => { n.hidden = !married() || !yd.homeCarer; });
    const monthly = yd.payMode === 'month';
    MONTH_FIELDS.flatMap(([f]) => ['you', 'spouse'].map((p) => p + YEAR_KEY[f])).forEach((k) => {
      yf[k].readOnly = monthly;
      yf[k].title = monthly ? 'Worked out from your monthly figures' : '';
    });
    $('#modeYear').classList.toggle('on', !monthly); $('#modeYear').setAttribute('aria-pressed', String(!monthly));
    $('#modeMonth').classList.toggle('on', monthly); $('#modeMonth').setAttribute('aria-pressed', String(monthly));
    $('#monthsBox').hidden = !monthly;
    if (monthly) renderMonths();
    syncAutoMonths();
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

  // Columns of the monthly table and the yearly field each one adds up into.
  const MONTH_FIELDS = [['gross', 'Pay (taxable / gross) €', 'pay'], ['tax', 'Income tax (PAYE) €', 'income tax'],
    ['usc', 'USC €', 'USC'], ['prsi', 'PRSI €', 'PRSI']];
  const YEAR_KEY = { gross: 'Gross', tax: 'TaxPaid', usc: 'UscPaid', prsi: 'PrsiPaid' };
  const r2 = (n) => Math.round(n * 100) / 100;

  function monthTotals(yd, person) {
    const m = (yd.months && yd.months[person]) || {};
    const raw = {}; const has = {};
    MONTH_FIELDS.forEach(([f]) => { raw[f] = 0; has[f] = false; });
    let count = 0;
    Object.values(m).forEach((v) => {
      if (Number(v.gross) > 0 || Number(v.tax) > 0) count++;
      MONTH_FIELDS.forEach(([f]) => {
        if (v[f] !== '' && v[f] != null) has[f] = true;
        raw[f] += Number(v[f]) || 0;
      });
    });
    const factor = yd.project && count > 0 && count < 12 ? 12 / count : 1;
    const est = {};
    MONTH_FIELDS.forEach(([f]) => { est[f] = r2(raw[f] * factor); });
    return { raw, est, has, count, projected: factor !== 1 };
  }

  // Copies monthly totals into the yearly figures the tax calculation uses.
  function applyMonthTotals(yd) {
    if (yd.payMode !== 'month') return;
    ['you', 'spouse'].forEach((p) => {
      const t = monthTotals(yd, p);
      MONTH_FIELDS.forEach(([f]) => { yd[p + YEAR_KEY[f]] = t.count && t.has[f] ? t.est[f] : ''; });
    });
  }

  function saveYearTotals(yd) {
    yd.yearTotals = {};
    MONTH_FIELDS.forEach(([f]) => ['you', 'spouse'].forEach((p) => { yd.yearTotals[p + YEAR_KEY[f]] = yd[p + YEAR_KEY[f]]; }));
  }

  function setPayMode(mode) {
    const yd = yearData(Number(state.selectedYear));
    if (mode === 'month' && yd.payMode !== 'month') {
      // Keep any yearly totals already typed, in case they switch back.
      saveYearTotals(yd);
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
      const head = el('tr', {}, [el('th', { text: 'Month' }), ...MONTH_FIELDS.map(([, label]) => el('th', { class: 'num', text: label }))]);
      const body = MONTH_NAMES.map((name, i) => {
        const m = i + 1;
        const mk = (field) => {
          const input = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'month-input',
            id: `m-${field}-${m}`, 'aria-label': `${name} ${MONTH_FIELDS.find((x) => x[0] === field)[2]}`, 'data-month': m, 'data-field': field });
          input.addEventListener('change', onMonthInput);
          return input;
        };
        return el('tr', { 'data-month': m }, [
          el('td', {}, [name, el('span', { class: 'from-slip', 'data-slip': m })]),
          ...MONTH_FIELDS.map(([f]) => el('td', { class: 'num' }, [mk(f)])),
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
      ...MONTH_FIELDS.map(([f]) => el('td', { class: 'num', text: eur.format(t.raw[f]) }))])];
    if (t.projected) {
      foot.push(el('tr', { class: 'sub' }, [el('td', { text: 'Estimated full year' }),
        ...MONTH_FIELDS.map(([f]) => el('td', { class: 'num', text: eur.format(t.est[f]) }))]));
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
    if (MONTH_FIELDS.every(([f]) => months[m][f] === '' || months[m][f] == null)) delete months[m];
    applyMonthTotals(yd);
    save(); renderAll();
  }

  function fillEmptyMonths() {
    const yd = yearData(Number(state.selectedYear));
    const months = monthsOf(yd, monthPerson);
    const first = Object.keys(months).map(Number).sort((a, b) => a - b)[0];
    if (!first) { $('#m-gross-1').focus(); return; }
    for (let m = 1; m <= 12; m++) {
      if (!months[m]) months[m] = Object.fromEntries(MONTH_FIELDS.map(([f]) => [f, months[first][f] ?? '']));
    }
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
    const usc = el('input', { type: 'text', inputmode: 'decimal', id: 'slipUsc', value: r.uscPeriod ?? '' });
    const prsi = el('input', { type: 'text', inputmode: 'decimal', id: 'slipPrsi', value: r.prsiPeriod ?? '' });
    const save2 = (mode) => () => {
      const read = (inp) => (inp.value.trim() === '' ? 0 : parseAmount(inp.value));
      const g = read(gross); const t = read(tax); const u = read(usc); const pr = read(prsi);
      if ([g, t, u, pr].some(Number.isNaN) || !(g > 0 || t > 0)) { gross.focus(); return; }
      const yy = Number(yearSel.value); const mm = Number(month.value); const pp = married() ? person.value : 'you';
      const yd = yearData(yy);
      if (yd.payMode !== 'month') {
        saveYearTotals(yd);
        yd.payMode = 'month';
      }
      const months = monthsOf(yd, pp);
      const cur = months[mm] || {};
      const add = mode === 'add';
      months[mm] = {
        gross: Math.round(((add ? Number(cur.gross) || 0 : 0) + g) * 100) / 100,
        tax: Math.round(((add ? Number(cur.tax) || 0 : 0) + t) * 100) / 100,
        usc: Math.round(((add ? Number(cur.usc) || 0 : 0) + u) * 100) / 100,
        prsi: Math.round(((add ? Number(cur.prsi) || 0 : 0) + pr) * 100) / 100,
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
    const basisNote = r.basis
      ? el('p', { class: 'flag bad', text: r.basis === 'emergency'
        ? 'This payslip says emergency tax. You’re probably overpaying: see the Review tab for how to fix it.'
        : 'This payslip is on Week 1 / Month 1 basis, so unused credits aren’t carried forward. See the Review tab.' })
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
        el('label', { for: 'slipUsc' }, ['USC this payslip (€)', usc]),
        el('label', { for: 'slipPrsi' }, ['PRSI this payslip (€)', prsi]),
      ]),
      basisNote, freq, ytd,
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
    PROFILE_NUM.forEach((k) => { state.profile[k] = f[k].value === '' ? '' : Number(f[k].value); });
    PROFILE_CHECK.forEach((k) => { state.profile[k] = f[k].checked; });
    save(); renderAll();
  }

  function onYearChange(e) {
    const f = e.currentTarget;
    const yd = yearData(Number(state.selectedYear));
    YEAR_NUMBER_FIELDS.forEach((k) => { yd[k] = f[k].value === '' ? '' : Number(f[k].value); });
    YEAR_CHECK_FIELDS.forEach((k) => { yd[k] = f[k].checked; });
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
      ['spccc', 'Single Person Child Carer Credit'], ['blind', 'Blind person’s credit'],
      ['incapChild', 'Incapacitated child credit'], ['depRelative', 'Dependent relative credit'],
    ];
    const data = [{ head: true, cells: ['', ...years.map((y) => y + (Tax.RATES[y].verify ? ' (check)' : ''))] }];
    fields.forEach(([k, label]) => data.push({ cells: [label, ...years.map((y) => {
      const v = Tax.RATES[y][k];
      const check = (Tax.RATES[y].verifyFields || []).includes(k) || (Tax.RATES[y].verify && k === 'mortgageInterestMax');
      return (v ? eur0.format(v) : '—') + (check && v ? ' (check)' : '');
    })] }));
    const pct = (n) => `${Math.round(n * 100000) / 1000}%`;
    const uscText = (y) => {
      const b = Tax.USC_PRSI[y].usc;
      return `${pct(b[0][1])} to ${eur0.format(b[0][0])}, ${pct(b[1][1])} to ${eur0.format(b[1][0])}, ${pct(b[2][1])} to ${eur0.format(b[2][0])}, ${pct(b[3][1])} above`;
    };
    data.push({ cells: ['USC', ...years.map((y) => uscText(y) + (Tax.USC_PRSI[y].verify ? ' (check)' : ''))] });
    data.push({ cells: ['Employee PRSI (year average)', ...years.map((y) => pct(Tax.USC_PRSI[y].prsi) + (Tax.USC_PRSI[y].verify || Tax.USC_PRSI[y].verifyPrsi ? ' (check)' : ''))] });
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

  // In the hosted viewer, files are saved through its downloads permission
  // (the viewer confirms each save). Opened as a local file, a normal
  // browser download is used.
  async function downloadBox() {
    const box = $('#dataBox');
    if (!box.value) showBackup();
    const csv = boxKind === 'csv';
    const filename = csv ? 'taxback-receipts.csv' : `taxback-backup-${new Date().toISOString().slice(0, 10)}.json`;
    let downloads = null;
    if (window.claude && typeof window.claude.use === 'function') {
      setStatus('Preparing your file…');
      try { downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; }
    }
    if (downloads) {
      try {
        await downloads.save({ filename, data: box.value });
        setStatus(`Saved ${filename}.`);
      } catch (e) {
        if (e && e.code === 'declined') setStatus('Download cancelled. Your data is unchanged.');
        else if (e && e.code === 'rate_limited') setStatus('A save is already waiting for your answer. Finish that one first.', true);
        else setStatus('This view can’t save files. Use Copy and paste the text somewhere safe instead.', true);
      }
      return;
    }
    const blob = new Blob([box.value], { type: csv ? 'text/csv' : 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus(`Downloading ${filename}. If no file appears, use Copy instead.`);
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
      state = Object.assign(defaultState(), data); tccKey = '';
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

  // Turns "so far this year" payslip figures into full-year estimates,
  // scaling pay and tax together so they stay comparable.
  function ytdCalc(person) {
    const id = person === 'you' ? 'calcYtd' : 'calcYtdSp';
    const field = (sfx, label) => el('label', { for: id + sfx }, [label,
      el('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', id: id + sfx })]);
    const pay = field('Pay', 'Taxable pay to date (€)');
    const tax = field('Tax', 'Income tax (PAYE) to date (€)');
    const months = field('Months', 'Months paid so far');
    const monthsInput = months.querySelector('input');
    monthsInput.classList.add('auto-months');
    const result = el('output', { class: 'calc-result' });
    const use = el('button', { type: 'button', class: 'small-btn', text: 'Use these numbers', disabled: true });
    let est = null;
    const val = (lab) => Number(lab.querySelector('input').value) || 0;
    const update = () => {
      const m = Math.min(val(months), 12);
      const p = val(pay);
      const t = val(tax);
      est = m > 0 && p > 0 ? { pay: Math.round((p / m) * 12 * 100) / 100, tax: Math.round((t / m) * 12 * 100) / 100 } : null;
      result.textContent = est ? `Full year: pay ${eur0.format(est.pay)}, tax ${eur0.format(est.tax)}` : '';
      use.disabled = !est;
    };
    [pay, tax, months].forEach((l) => l.querySelector('input').addEventListener('input', update));
    monthsInput.addEventListener('input', (e) => { if (e.isTrusted) monthsInput.classList.remove('auto-months'); });
    use.addEventListener('click', () => {
      const f = $('#yearForm');
      f[person + 'Gross'].value = est.pay;
      f[person + 'TaxPaid'].value = est.tax;
      f.dispatchEvent(new Event('change'));
    });
    return el('div', { class: 'calc-box' }, [
      el('p', { class: 'calc-title', text: 'From a payslip: estimate pay and tax for the full year' }),
      el('p', { class: 'muted small', text: 'Use the “to date” (or “YTD”) figures on your latest payslip. On your last payslip of the year, put 12 months.' }),
      el('div', { class: 'calc-row' }, [pay, tax, months]),
      el('div', { class: 'calc-row' }, [result, use]),
    ]);
  }

  // Default "months so far": 12 for a finished year, otherwise the current month,
  // unless the person has typed their own number.
  function syncAutoMonths() {
    const y = Number(state.selectedYear);
    const now = new Date();
    const m = String(y < now.getFullYear() ? 12 : now.getMonth() + 1);
    $$('input.auto-months').forEach((i) => {
      if (i.value !== m) { i.value = m; i.dispatchEvent(new Event('input')); }
    });
  }

  const FIELD_CALCS = {
    ytdYou: () => ytdCalc('you'),
    ytdSpouse: () => ytdCalc('spouse'),
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

  function renderHero(steps) {
    const y = Number(state.selectedYear);
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);
    const deadline = Tax.claimDeadline(y);
    const open = Tax.daysUntil(deadline, new Date()) > 0;
    $('#heroEyebrow').textContent = `Tax year ${y} · ${open ? `claim by ${fmtDate.format(deadline)}` : 'claims closed'}`;
    const fill = el('div', { class: 'progress-fill' });
    fill.style.width = `${Math.round((done / steps.length) * 100)}%`;
    $('#heroNext').replaceChildren(
      el('div', { class: 'progress' }, [
        el('span', { class: 'progress-label', text: done === steps.length ? `All ${steps.length} steps done for ${y}` : `${done} of ${steps.length} steps done${next ? ` · next: ${next.title.toLowerCase()}` : ''}` }),
        el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(done) }, [fill]),
      ]),
      next ? el('button', { type: 'button', class: 'primary', text: next.action[0], onclick: () => { showTab('guide'); next.action[1](); } }) : '',
    );
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
    renderHero(steps);
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


  // =====================================================================
  // Review: Tax Credit Certificate, emergency tax, payslips, assessment,
  // Statement of Liability
  // =====================================================================
  let reviewPerson = 'you';
  let tccKey = '';
  const BASIS = { cumulative: 'Cumulative (normal)', week1: 'Week 1 / Month 1', emergency: 'Emergency' };

  function tccOf(yd, p) {
    yd.tcc = yd.tcc || {};
    yd.tcc[p] = yd.tcc[p] || [];
    return yd.tcc[p];
  }

  function tccTotals(yd, p) {
    const jobs = (yd.tcc && yd.tcc[p]) || [];
    return {
      count: jobs.length,
      credits: r2(jobs.reduce((a, j) => a + (Number(j.credits) || 0), 0)),
      band: r2(jobs.reduce((a, j) => a + (Number(j.band) || 0), 0)),
      basis: jobs.find((j) => j.basis === 'emergency') ? 'emergency' : jobs.find((j) => j.basis === 'week1') ? 'week1' : 'cumulative',
    };
  }

  function personLabel(p) { return p === 'you' ? 'You' : 'Your spouse'; }

  function renderPersonTabs(box, current, onPick) {
    box.hidden = !married();
    box.replaceChildren(...[['you', 'You'], ['spouse', 'Spouse']].map(([k, label]) => el('button', {
      type: 'button', class: 'seg' + (k === current ? ' on' : ''), 'aria-pressed': String(k === current), text: label,
      onclick: () => onPick(k),
    })));
  }

  // What the person (or this person's share, for a couple) should have.
  function expectedFor(y, p) {
    const input = inputFor(y);
    if (married()) return Tax.suggestSplit(input)[p];
    const e = Tax.entitlement(input);
    return { credits: e.credits, band: e.band };
  }

  function renderTcc() {
    const y = Number(state.selectedYear);
    const yd = yearData(y);
    if (!married()) reviewPerson = 'you';
    renderPersonTabs($('#tccPerson'), reviewPerson, (k) => { reviewPerson = k; renderReview(); });
    const jobs = tccOf(yd, reviewPerson);
    const key = `${y}:${reviewPerson}:${jobs.length}:${married()}`;
    const num = (v) => (v === '' || v == null ? '' : String(v));
    const rows = key === tccKey ? null : jobs.map((j, i) => {
      // Editing a box saves and refreshes the results, but keeps the form in place.
      const upd = (field) => (e) => {
        const v = e.target.value;
        j[field] = field === 'employer' || field === 'basis' ? v : (v === '' ? '' : Number(v));
        save(); renderDashboard(); renderReview(); renderSaveTips();
      };
      return el('div', { class: 'job-row' }, [
        el('label', {}, ['Employer', el('input', { type: 'text', value: j.employer || '', id: `job-employer-${i}`, onchange: upd('employer'), placeholder: 'e.g. Main job' })]),
        el('label', {}, ['Yearly tax credits (€)', el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', id: `job-credits-${i}`, value: num(j.credits), onchange: upd('credits') })]),
        el('label', {}, ['Yearly rate band (€)', el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', id: `job-band-${i}`, value: num(j.band), onchange: upd('band') })]),
        el('label', {}, ['Basis', el('select', { id: `job-basis-${i}`, onchange: upd('basis') },
          Object.entries(BASIS).map(([k, label]) => el('option', { value: k, text: label, selected: (j.basis || 'cumulative') === k })))]),
        el('button', { type: 'button', class: 'link danger', text: 'Remove', onclick: (ev) => armConfirm(ev.currentTarget, 'Confirm remove', () => {
          jobs.splice(i, 1); save(); renderAll();
        }) }),
      ]);
    });
    if (rows) {
      tccKey = key;
      $('#tccJobs').replaceChildren(...(rows.length ? rows : [el('p', { class: 'muted small', text: `No jobs added for ${personLabel(reviewPerson).toLowerCase()} yet. Add each job on the certificate.` })]));
    }

    // Result: compare with what you should have.
    const result = $('#tccResult');
    const t = tccTotals(yd, reviewPerson);
    if (!t.count) { result.replaceChildren(); return; }
    const exp = expectedFor(y, reviewPerson);
    const lines = [];
    const creditGap = r2(exp.credits - t.credits);
    const bandGap = r2(exp.band - t.band);
    const row = (label, have, want) => el('tr', {}, [el('td', { text: label }), el('td', { class: 'num', text: eur.format(have) }),
      el('td', { class: 'num', text: eur.format(want) })]);
    const table = el('table', { class: 'tbl' }, [
      el('tr', {}, [el('th', { text: '' }), el('th', { class: 'num', text: 'On certificate' }), el('th', { class: 'num', text: married() ? 'Suggested' : 'Expected' })]),
      row('Tax credits', t.credits, exp.credits), row('20% rate band', t.band, exp.band),
    ]);
    if (creditGap >= 1) {
      lines.push(el('p', { class: 'flag bad' }, [el('strong', { text: `Up to ${eur.format(creditGap)} of credits may be missing. ` }),
        married() ? 'Between you, check the married credit is shared as suggested (myAccount → Manage your tax → Allocate tax credits).' : 'Check you’re getting every credit listed below, and claim any that are missing in myAccount.']));
    } else if (creditGap <= -1) {
      lines.push(el('p', { class: 'flag ok', text: 'Your certificate has more than the standard credits, usually because you’ve already claimed something this year, such as the rent credit or health expenses. That’s fine.' }));
    } else {
      lines.push(el('p', { class: 'flag ok', text: 'Your credits look right.' }));
    }
    if (bandGap >= 1) {
      lines.push(el('p', { class: 'flag bad', text: `Your 20% band is ${eur.format(bandGap)} lower than ${married() ? 'suggested' : 'expected'}, so more of your pay is taxed at 40% than should be.` }));
    }
    if (t.count > 1) {
      lines.push(el('p', { class: 'flag', text: 'With more than one job, put most of your credits and band on the job that pays most. Any job with no credits pays 20% or 40% on every euro. Change the split in myAccount → Manage your tax → Jobs and pensions.' }));
    }
    const e = Tax.entitlement(inputFor(y)).detail;
    const names = { personal: 'Personal credit', employee: 'Employee (PAYE) credit', ageCredit: 'Age credit', singleParent: 'Single Person Child Carer Credit',
      widowedParent: 'Widowed Parent Credit', blind: 'Blind Person’s Credit', incapChild: 'Incapacitated Child Credit', depRelative: 'Dependent Relative Credit', homeCarer: 'Home carer credit' };
    const list = Object.entries(names).filter(([k]) => e[k] > 0).map(([k, n]) => el('li', {}, [n, ': ', el('strong', { text: eur.format(e[k]) })]));
    result.replaceChildren(el('div', { class: 'scroll' }, [table]), ...lines,
      el('details', { class: 'help' }, [el('summary', { text: married() ? 'Credits you’re entitled to between you' : 'Credits you’re entitled to' }),
        el('div', { class: 'help-body' }, [el('ul', { class: 'help-steps' }, list),
          el('p', { class: 'muted small', text: 'Credits for receipts (health, rent and so on) come on top once claimed.' })])]));
  }

  function monthlyGross(yd, p) {
    const months = (yd.months && yd.months[p]) || {};
    const arr = [];
    for (let m = 1; m <= 12; m++) arr.push(Number((months[m] || {}).gross) || 0);
    return arr;
  }

  function renderEmergency() {
    const y = Number(state.selectedYear);
    const yd = yearData(y);
    const card = $('#emergencyCard');
    const who = married() ? ['you', 'spouse'] : ['you'];
    const affected = who.map((p) => [p, tccTotals(yd, p)]).filter(([, t]) => t.basis !== 'cumulative');
    if (!affected.length) { card.hidden = true; return; }
    card.hidden = false;
    const parts = [el('h2', { text: affected.some(([, t]) => t.basis === 'emergency') ? 'You may be on emergency tax' : 'You’re on Week 1 / Month 1 basis' })];
    affected.forEach(([p, t]) => {
      const exp = expectedFor(y, p);
      // A typical month: the average of months entered, or the yearly pay ÷ 12.
      const paidMonths = monthlyGross(yd, p).filter((g) => g > 0);
      const month = yd.payMode === 'month' && paidMonths.length
        ? paidMonths.reduce((a, b) => a + b, 0) / paidMonths.length
        : (Number(yd[p + 'Gross']) || 0) / 12;
      if (t.basis === 'emergency') {
        const normal = Tax.month1Paye(month, exp.credits, exp.band);
        const emergency = Tax.emergencyPaye(y, month, 2, true);
        const extra = r2(emergency - normal);
        parts.push(el('p', {}, [el('strong', { text: `${personLabel(p)}: ` }),
          month > 0 ? `on about ${eur0.format(month)} a month, emergency tax takes about ${eur.format(emergency)} instead of ${eur.format(normal)}, roughly ${eur.format(extra)} too much each month.`
            : 'emergency tax means no credits and 40% on almost everything. Add your pay under Income to see how much.']));
      } else {
        parts.push(el('p', {}, [el('strong', { text: `${personLabel(p)}: ` }),
          'each payday is taxed on its own, so credits you didn’t use earlier in the year aren’t given back. You’re not overpaying each month, but you won’t get a catch-up refund until the year ends or the basis changes.']));
      }
    });
    parts.push(el('ol', { class: 'help-steps' }, [
      el('li', {}, rich('Sign in to **myAccount** → PAYE Services → **Manage your tax** → **Jobs and pensions**.')),
      el('li', {}, rich('Check the job is listed with the right start date. If not, **Add job**.')),
      el('li', {}, rich('Revenue sends your employer your credits within a few days. The extra tax is refunded through your next pay packets.')),
    ]));
    parts.push(el('p', { class: 'muted small', text: 'If you’ve left the job, claim the refund instead through myAccount → Review your tax after the year ends.' }));
    card.replaceChildren(...parts);
  }

  function renderPayslipCheck() {
    const y = Number(state.selectedYear);
    const yd = yearData(y);
    const p = married() ? reviewPerson : 'you';
    const box = $('#payslipCheck');
    const months = (yd.months && yd.months[p]) || {};
    const paid = Object.keys(months).map(Number).filter((m) => Number(months[m].gross) > 0).sort((a, b) => a - b);
    if (yd.payMode !== 'month' || !paid.length) {
      box.replaceChildren(el('p', { class: 'muted small' }, ['Enter pay month by month (or read your payslips) under ',
        el('a', { href: '#', text: 'Income', onclick: (e) => { e.preventDefault(); goTo('profile'); } }), ' to check each one.']));
      return;
    }
    const t = tccTotals(yd, p);
    const basisOf = t.count ? t.basis : 'cumulative';
    const exp = t.count ? { credits: t.credits, band: t.band } : expectedFor(y, p);
    const gross = monthlyGross(yd, p);
    let expected;
    if (basisOf === 'cumulative') expected = Tax.cumulativePaye(gross, exp.credits, exp.band);
    else if (basisOf === 'week1') expected = gross.map((g) => (g ? Tax.month1Paye(g, exp.credits, exp.band) : 0));
    else { let n = 0; expected = gross.map((g) => (g ? Tax.emergencyPaye(y, g, ++n, true) : 0)); }
    const rows = [el('tr', {}, ['Month', 'Pay', 'Tax taken', 'Should be', ''].map((h, i) => el('th', { class: i ? 'num' : '', text: h })))];
    let flagged = 0;
    for (let m = 1; m <= 12; m++) {
      const v = months[m];
      if (!v || !(Number(v.gross) > 0)) continue;
      const taken = v.tax === '' || v.tax == null ? null : Number(v.tax);
      const diff = taken == null ? null : r2(taken - expected[m - 1]);
      const bad = diff != null && Math.abs(diff) >= 5;
      if (bad) flagged++;
      rows.push(el('tr', { class: bad ? 'flag-row' : '' }, [
        el('td', { text: MONTH_NAMES[m - 1] }), el('td', { class: 'num', text: eur.format(Number(v.gross)) }),
        el('td', { class: 'num', text: taken == null ? '—' : eur.format(taken) }), el('td', { class: 'num', text: eur.format(expected[m - 1]) }),
        el('td', { class: 'num', text: diff == null ? '' : Math.abs(diff) < 5 ? 'OK' : diff > 0 ? `${eur.format(diff)} too much` : `${eur.format(-diff)} too little` }),
      ]));
    }
    const note = t.count
      ? `Using the credits (${eur.format(exp.credits)}) and band (${eur.format(exp.band)}) on your certificate, ${BASIS[basisOf].toLowerCase()} basis.`
      : `Using the credits (${eur.format(exp.credits)}) and band (${eur.format(exp.band)}) you should have. Add your Tax Credit Certificate above for an exact check.`;
    box.replaceChildren(el('div', { class: 'scroll' }, [el('table', { class: 'tbl' }, rows)]),
      el('p', { class: flagged ? 'flag bad' : 'flag ok', text: flagged
        ? `${flagged} payslip${flagged === 1 ? '' : 's'} took a different amount than expected. Small differences can come from bonuses, benefits or a credit change during the year; bigger ones are worth asking your payroll about.`
        : 'Every payslip matches what your credits and band should give.' }),
      el('p', { class: 'muted small', text: note }));
  }

  function renderAssessment() {
    const card = $('#assessCard');
    if (!married()) { card.hidden = true; return; }
    const y = Number(state.selectedYear);
    const c = Tax.compareAssessment(inputFor(y));
    card.hidden = false;
    const better = c.difference > 0 ? 'Joint assessment saves you' : c.difference < 0 ? 'Separate assessment would save you' : '';
    $('#assessResult').replaceChildren(
      el('div', { class: 'scroll' }, [el('table', { class: 'tbl' }, [
        el('tr', {}, [el('td', { text: 'Taxed together (joint)' }), el('td', { class: 'num', text: eur.format(c.joint) })]),
        el('tr', {}, [el('td', { text: 'Taxed separately' }), el('td', { class: 'num', text: eur.format(c.separate) })]),
      ])]),
      el('p', { class: c.difference >= 0 ? 'flag ok' : 'flag bad' }, better
        ? [el('strong', { text: `${better} ${eur.format(Math.abs(c.difference))}` }), c.difference > 0 ? '. Keep joint assessment.' : '. Ask Revenue about separate assessment.']
        : ['Both ways come to the same tax.']),
      el('p', { class: 'muted small', text: 'Joint assessment lets you share credits and the 20% band, so it usually wins when one of you earns more. Separate assessment uses each person’s own receipts (receipts not marked as your spouse’s count as yours).' }));
  }

  function renderStatement() {
    const y = Number(state.selectedYear);
    const yd = yearData(y);
    const sol = yd.sol || {};
    const f = $('#solForm');
    ['solIncome', 'solCredits', 'solLiability', 'solPaid'].forEach((k) => { if (document.activeElement !== f[k]) f[k].value = sol[k] ?? ''; });
    const box = $('#solResult');
    if (!['solIncome', 'solCredits', 'solLiability', 'solPaid'].some((k) => sol[k] !== '' && sol[k] != null)) { box.replaceChildren(); return; }
    const base = Tax.computeYear(inputFor(y));
    const lines = [];
    const cmp = (label, theirs, ours) => {
      if (theirs === '' || theirs == null) return null;
      const d = r2(Number(theirs) - ours);
      return el('tr', {}, [el('td', { text: label }), el('td', { class: 'num', text: eur.format(Number(theirs)) }), el('td', { class: 'num', text: eur.format(ours) }),
        el('td', { class: 'num', text: Math.abs(d) < 1 ? 'Same' : (d > 0 ? '+' : '−') + eur.format(Math.abs(d)) })]);
    };
    const rows = [
      el('tr', {}, ['', 'Revenue', 'Taxback', 'Difference'].map((h, i) => el('th', { class: i ? 'num' : '', text: h }))),
      cmp('Income', sol.solIncome, base.totalGross),
      cmp('Tax credits', sol.solCredits, base.totalCredits),
      cmp('Tax after credits', sol.solLiability, base.liability),
      cmp('Tax paid', sol.solPaid, base.taxPaid),
    ].filter(Boolean);
    if (sol.solIncome !== '' && sol.solIncome != null && Math.abs(Number(sol.solIncome) - base.totalGross) >= 1) {
      lines.push(el('p', { class: 'flag', text: 'Revenue has a different income. Check every job, taxable benefit and social welfare payment is entered under Income, or that Revenue isn’t missing one.' }));
    }
    if (sol.solCredits !== '' && sol.solCredits != null && base.totalCredits - Number(sol.solCredits) >= 1) {
      const missing = r2(base.totalCredits - Number(sol.solCredits));
      lines.push(el('p', { class: 'flag bad', text: `Revenue gave ${eur.format(missing)} fewer credits than Taxback expects. You may not have claimed everything: compare with “Your numbers for myAccount” on the Start page and add what’s missing to your return.` }));
    }
    if (sol.solLiability !== '' && sol.solPaid !== '' && sol.solLiability != null && sol.solPaid != null) {
      const bal = r2(Number(sol.solPaid) - Number(sol.solLiability));
      lines.push(el('p', { class: bal >= 0 ? 'flag ok' : 'flag bad', text: bal >= 0
        ? `Revenue’s figures mean you overpaid ${eur.format(bal)}. It’s paid to your bank account, usually within about 5 working days.`
        : `Revenue’s figures mean you underpaid ${eur.format(-bal)}. Revenue usually collects this by reducing your credits over up to 4 years. You can also pay it at once in myAccount.` }));
    }
    box.replaceChildren(el('div', { class: 'scroll' }, [el('table', { class: 'tbl' }, rows)]), ...lines);
  }

  async function readStatementFile(file, password) {
    const status = (msg, bad) => $('#solResult').replaceChildren(el('p', { class: bad ? 'flag bad' : 'muted small', text: msg }));
    status(`Reading ${file.name}…`);
    try {
      const r = await Payslip.readStatement(file, password);
      const found = ['income', 'credits', 'liability', 'paid'].filter((k) => r[k] != null);
      if (!found.length) { status('We couldn’t find the figures in that PDF. Type them in from your Statement of Liability instead.', true); return; }
      const yd = yearData(Number(state.selectedYear));
      yd.sol = Object.assign({}, yd.sol, {
        solIncome: r.income ?? yd.sol?.solIncome ?? '', solCredits: r.credits ?? yd.sol?.solCredits ?? '',
        solLiability: r.liability ?? yd.sol?.solLiability ?? '', solPaid: r.paid ?? yd.sol?.solPaid ?? '',
      });
      save(); renderAll();
      toast(`Read ${found.length} figure${found.length === 1 ? '' : 's'} from your Statement. Check them against the PDF.`);
    } catch (e) {
      if (e.name === 'NeedsPassword') {
        const pw = el('input', { type: 'password', id: 'solPassword', autocomplete: 'off' });
        $('#solResult').replaceChildren(el('p', { text: e.message }), el('div', { class: 'calc-row' }, [el('label', { for: 'solPassword' }, ['Password', pw]),
          el('button', { type: 'button', class: 'primary', text: 'Open', onclick: () => readStatementFile(file, pw.value) })]));
        return;
      }
      status(e.message, true);
    }
  }

  function renderReview() {
    renderTcc();
    renderEmergency();
    renderPayslipCheck();
    renderAssessment();
    renderStatement();
  }

  // =====================================================================
  // Start page extras: myAccount sheet, life events, reminders
  // =====================================================================
  function renderClaimSheet() {
    const y = Number(state.selectedYear);
    const input = inputFor(y);
    const base = Tax.computeYear(input);
    const sum = (cat, filter) => r2(state.expenses.filter((e) => Number(e.year) === y && e.category === cat && (!filter || filter(e))).reduce((a, e) => a + Number(e.amount), 0));
    const yd = state.years[y] || {};
    const items = [
      ['Health expenses', 'Health and Medical Expenses → amount you paid', sum('health')],
      ['Medical insurance (employer-paid)', 'Medical Insurance → gross premium your employer paid', sum('medicalInsurance', (e) => e.paidBy !== 'self')],
      ['Rent Tax Credit', 'Rent Tax Credit → rent paid, with your landlord’s details and RTB number', sum('rent')],
      ['Remote working relief', `Remote Working Expenses → total bills, and ${yd.wfhDays || 0} days worked from home`, sum('remoteWorking')],
      ['Tuition fees', 'Tuition Fees → fees paid, college and course name', sum('tuition')],
      ['Pension (AVC / PRSA)', 'Pension contributions → amount paid outside your wages', sum('pension')],
      ['Nursing home fees', 'Health and Medical Expenses → nursing home', sum('nursingHome')],
      ['Flat rate expenses', 'Employment Expenses → flat rate expenses for your job', sum('flatRate')],
      ['Mortgage interest', 'Mortgage Interest Tax Credit → interest paid this year and in 2022', sum('mortgageInterest')],
    ].filter(([, , v]) => v > 0);
    const credits = [
      ['Home carer credit', base.credits.homeCarer], ['Single Person Child Carer Credit', base.credits.singleParent],
      ['Widowed Parent Credit', base.credits.widowedParent], ['Age credit', base.credits.ageCredit], ['Blind Person’s Credit', base.credits.blind],
      ['Incapacitated Child Credit', base.credits.incapChild], ['Dependent Relative Credit', base.credits.depRelative],
    ].filter(([, v]) => v > 0);
    const box = $('#claimSheet');
    if (!items.length && !credits.length) {
      box.replaceChildren(el('p', { class: 'muted small', text: `Add receipts for ${y} and your numbers for myAccount will appear here, ready to copy.` }));
      return;
    }
    const copyBtn = (v) => el('button', { type: 'button', class: 'link', text: 'Copy', onclick: async (e) => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(String(v)); b.textContent = 'Copied'; } catch (err) { b.textContent = String(v); }
      setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    } });
    box.replaceChildren(
      el('h3', { text: `Your numbers for myAccount, ${y}` }),
      el('p', { class: 'muted small', text: 'In the Income Tax Return, go to Tax Credits and Reliefs and enter these. Amounts are what you paid; Revenue works out the credit.' }),
      el('div', { class: 'scroll' }, [el('table', { class: 'tbl sheet-table' }, [
        ...items.map(([name, where, v]) => el('tr', {}, [el('td', {}, [el('strong', { text: name }), el('span', { class: 'item-meta', text: where })]),
          el('td', { class: 'num', text: v.toFixed(2) }), el('td', { class: 'num' }, [copyBtn(v.toFixed(2))])])),
        ...credits.map(([name, v]) => el('tr', {}, [el('td', {}, [el('strong', { text: name }), el('span', { class: 'item-meta', text: 'You and your family → claim the credit (no amount to enter)' })]),
          el('td', { class: 'num', text: eur.format(v) }), el('td', {})])),
      ])]));
  }

  function renderLifeEvents() {
    $('#lifeEvents').replaceChildren(...Guide.LIFE_EVENTS.map((ev) => el('details', { class: 'acc' }, [
      el('summary', { text: ev.title }),
      el('div', { class: 'acc-body' }, ev.text.map((t) => el('p', {}, rich(t)))),
    ])));
  }

  function nextDate(month, day) {
    const now = new Date();
    let d = new Date(now.getFullYear(), month - 1, day);
    if (d < now) d = new Date(now.getFullYear() + 1, month - 1, day);
    return d;
  }

  function renderReminders() {
    const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const iso = (d) => d.toISOString().slice(0, 10);
    $('#reminders').replaceChildren(...Guide.REMINDERS.map((r) => {
      const d = nextDate(r.month, r.day);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const google = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + `&text=${encodeURIComponent('Taxback: ' + r.title)}&dates=${ymd(d)}/${ymd(end)}`
        + `&details=${encodeURIComponent(r.detail)}&recur=${encodeURIComponent('RRULE:FREQ=YEARLY')}`;
      const outlook = 'https://outlook.live.com/calendar/0/deeplink/compose?allday=true'
        + `&subject=${encodeURIComponent('Taxback: ' + r.title)}&startdt=${iso(d)}&enddt=${iso(end)}&body=${encodeURIComponent(r.detail)}`;
      return el('li', {}, [
        el('div', { class: 'rem-date' }, [el('span', { text: d.toLocaleDateString('en-IE', { day: 'numeric' }) }), el('small', { text: d.toLocaleDateString('en-IE', { month: 'short' }) })]),
        el('div', { class: 'rem-body' }, [el('strong', { text: r.title }), el('span', { class: 'muted small', text: r.detail }),
          el('span', { class: 'rem-links' }, [el('a', { href: google, target: '_blank', rel: 'noopener', text: 'Add to Google Calendar' }), ' · ',
            el('a', { href: outlook, target: '_blank', rel: 'noopener', text: 'Add to Outlook' })])]),
      ]);
    }));
  }

  function renderBenefits() {
    $('#benefits').replaceChildren(...Guide.BENEFITS.flatMap(([t, d]) => [el('dt', { text: t }), el('dd', { text: d })]));
  }

  // =====================================================================
  // Overview extras: ways to pay less, underpayment explainer
  // =====================================================================
  function renderSaveTips() {
    const y = Number(state.selectedYear);
    const input = inputFor(y);
    const base = Tax.computeYear(input);
    const tips = [];
    if (base.totalGross > 0) {
      const plan = Tax.avcPlan(input);
      if (plan.at40 >= 100) {
        tips.push(el('li', {}, [el('strong', { text: `Pay up to ${eur0.format(plan.at40)} more into a pension (AVC or PRSA) and save ${eur0.format(plan.saving)} in tax. ` }),
          `That part of your income is taxed at 40%, so each €100 you put in costs you only €60. ${y < new Date().getFullYear() ? `For ${y}, it must be paid by 31 October ${y + 1}.` : 'Payments by 31 October next year can still count for this year.'}`]));
      } else if (plan.totalRoom >= 100) {
        tips.push(el('li', {}, [el('strong', { text: 'Pension top-ups save 20% for you this year. ' }),
          `You have room for about ${eur0.format(plan.totalRoom)} more, but none of your income is taxed at 40%, so it saves less.`]));
      }
    }
    const yes = Guide.QUIZ.filter(([cat]) => state.checklist[`${y}:quiz:${cat}`] === 'yes' && !state.expenses.some((e) => Number(e.year) === y && e.category === cat));
    if (yes.length) {
      tips.push(el('li', {}, [el('strong', { text: 'You said yes to things you haven’t added yet: ' }),
        yes.map(([cat]) => Tax.CATEGORIES[cat].label.toLowerCase()).join(', ') + '. ',
        el('a', { href: '#', text: 'Add them', onclick: (e) => { e.preventDefault(); addReceipt(yes[0][0]); } })]));
    }
    if (!married() && !state.profile.singleParent && Number(state.profile.children) > 0) {
      tips.push(el('li', {}, [el('strong', { text: 'Single parent? ' }), 'If a child lives with you for most of the year, tick it under Income → Your situation. It’s worth up to €1,900 a year and an extra €4,000 taxed at 20%.']));
    }
    if (y >= new Date().getFullYear() && state.expenses.some((e) => Number(e.year) === y && e.category === 'rent')) {
      tips.push(el('li', {}, [el('strong', { text: 'Claim the rent credit now. ' }), 'You don’t have to wait for the year to end: myAccount → Manage your tax → Claim tax credits → Rent Tax Credit.']));
    }
    if (married()) {
      const c = Tax.compareAssessment(input);
      if (c.difference < -1) tips.push(el('li', {}, [el('strong', { text: `Separate assessment could save ${eur0.format(-c.difference)}. ` }), 'See the Review tab.']));
    }
    $('#saveCard').hidden = !tips.length;
    $('#saveTips').replaceChildren(el('ul', { class: 'tips' }, tips));
  }

  // =====================================================================
  // Receipt photos (kept in this browser with IndexedDB)
  // =====================================================================
  let pendingPhoto = null; // Blob waiting to be saved with the receipt, or 'remove'

  function photoDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('taxback-photos', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function photoOp(mode, fn) {
    const d = await photoDb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }
  const photoPut = (id, blob) => photoOp('readwrite', (s) => s.put(blob, id));
  const photoGet = (id) => photoOp('readonly', (s) => s.get(id)).catch(() => null);
  const photoDel = (id) => photoOp('readwrite', (s) => s.delete(id)).catch(() => null);

  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((resolve) => c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.82));
    } catch (e) {
      return file;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function showPhotoPreview(blob, note) {
    const box = $('#photoPreview');
    if (!blob) { box.replaceChildren(note ? el('span', { class: 'muted small', text: note }) : ''); return; }
    const url = URL.createObjectURL(blob);
    const img = el('img', { src: url, alt: 'Receipt photo' });
    img.onload = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
    box.replaceChildren(img, el('button', { type: 'button', class: 'link danger', text: 'Remove photo', onclick: () => { pendingPhoto = 'remove'; showPhotoPreview(null); } }));
  }

  async function openPhoto(id) {
    const blob = await photoGet(id);
    const viewer = el('div', { class: 'viewer', role: 'dialog', 'aria-label': 'Receipt photo', onclick: (e) => { if (e.target === viewer) viewer.remove(); } });
    const close = el('button', { type: 'button', class: 'viewer-close', text: 'Close', onclick: () => viewer.remove() });
    if (blob) {
      const url = URL.createObjectURL(blob);
      viewer.append(el('img', { src: url, alt: 'Receipt photo' }), close);
    } else {
      viewer.append(el('p', { class: 'viewer-msg', text: 'This photo is on another device. Photos stay on the device they were taken on.' }), close);
    }
    document.body.append(viewer);
    close.focus();
    viewer.addEventListener('keydown', (e) => { if (e.key === 'Escape') viewer.remove(); });
  }

  // =====================================================================
  // Sync across devices (the hosted page's private per-person storage)
  // =====================================================================
  const sync = { ref: null, on: false, busy: false, again: false, timer: 0, unsub: null, status: 'local' };

  function syncPref() { try { return localStorage.getItem('taxback.sync') !== 'off'; } catch (e) { return true; } }
  function setSyncPref(on) { try { localStorage.setItem('taxback.sync', on ? 'on' : 'off'); } catch (e) { /* ignore */ } }

  function setSync(status) {
    sync.status = status;
    const text = {
      local: 'Sync works on the hosted Taxback page. Here, your data stays in this browser.',
      unavailable: 'Sync isn’t available in this view. Your data stays in this browser.',
      connecting: 'Connecting…',
      slow: 'Can’t reach the sync service yet. Changes are saved in this browser and will sync when it’s back.',
      on: 'On. Your figures and receipts are saved privately to your account and appear wherever you open this page. Only you can see them.',
      saving: 'Saving…',
      off: 'Off. Your data stays in this browser only.',
      error: 'Sync stopped. Your data is still saved in this browser. Reload the page to try again.',
    }[status];
    $('#syncText').textContent = text;
    const t = $('#syncToggle');
    t.disabled = status === 'local' || status === 'unavailable';
    t.checked = sync.on;
    $('#syncBox').classList.toggle('on', sync.on && status !== 'error');
  }

  async function syncInit() {
    if (!(window.claude && typeof window.claude.use === 'function')) { setSync('local'); return; }
    let db = null; let user = null;
    try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch (e) { /* unavailable */ }
    if (!db || typeof db.doc !== 'function' || !user || typeof user.id !== 'function') { setSync('unavailable'); return; }
    let id = null;
    try { id = await user.id(); } catch (e) { id = null; }
    if (!id) { setSync('unavailable'); return; }
    try { sync.ref = db.doc(`data/users/${id}/taxback`); } catch (e) { setSync('unavailable'); return; }
    if (!syncPref()) { setSync('off'); return; }
    startSync();
  }

  async function startSync() {
    sync.on = true;
    setSync('connecting');
    const slow = setTimeout(() => { if (sync.status === 'connecting') setSync('slow'); }, 10000);
    try {
      const snap = await sync.ref.get();
      clearTimeout(slow);
      applyRemote(snap, true);
    } catch (e) {
      clearTimeout(slow); sync.on = false; setSync('error'); return;
    }
    sync.unsub = sync.ref.onSnapshot((snap) => {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      applyRemote(snap, false);
    }, () => { sync.on = false; setSync('error'); });
  }

  function stopSync() {
    sync.on = false;
    if (sync.unsub) { sync.unsub(); sync.unsub = null; }
    setSync('off');
  }

  function hasData() { return state.expenses.length > 0 || Object.keys(state.years).length > 0; }

  function applyRemote(snap, first) {
    const remote = snap && snap.exists ? snap.data() : null;
    const remoteAt = remote ? Number(remote.updatedAt) || 0 : 0;
    const localAt = Number(state.updatedAt) || 0;
    if (remote && typeof remote.state === 'string' && remoteAt > localAt) {
      try {
        state = Object.assign(defaultState(), JSON.parse(remote.state));
        state.updatedAt = remoteAt;
        tccKey = '';
        persist();
        resetExpenseForm(); renderAll();
        toast(first ? 'Loaded your data from your other devices.' : 'Updated with changes from another device.');
      } catch (e) { /* ignore a bad copy */ }
    } else if (first && localAt > remoteAt && hasData()) {
      push();
    }
    if (sync.status !== 'saving') setSync('on');
  }

  async function push() {
    if (!sync.on || !sync.ref) return;
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    setSync('saving');
    try {
      await sync.ref.set({ state: JSON.stringify(state), updatedAt: Number(state.updatedAt) || Date.now() });
      setSync('on');
    } catch (e) {
      if (e && e.code === 'quota_exceeded') toast('Your synced copy is full. Delete some old receipts, or turn sync off.');
      setSync(e && e.code === 'unavailable' ? 'slow' : 'error');
    }
    sync.busy = false;
    if (sync.again) { sync.again = false; push(); }
  }

  function schedulePush() {
    if (!sync.on) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(push, 1200);
  }

  // ---------- Navigation ----------
  function showTab(name) {
    $$('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + name; });
    $('#fab').hidden = name !== 'dashboard';
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
    renderReview();
    renderClaimSheet();
    renderSaveTips();
    updateFormForCategory();
  }

  // ---------- Init ----------
  function init() {
    if (!Tax.YEARS.includes(Number(state.selectedYear))) state.selectedYear = Tax.openYears(new Date()).slice(-1)[0];
    $$('.tabs [data-icon]').forEach((b) => b.prepend(icon(b.dataset.icon)));
    $('#fab').addEventListener('click', () => { resetExpenseForm(); goTo('expenses'); $('#catTiles .cat-tile[aria-pressed="true"]').focus(); });
    renderCategoryOptions();
    renderRates();
    renderLifeEvents();
    renderReminders();
    renderBenefits();
    $('#addJob').addEventListener('click', () => {
      const jobs = tccOf(yearData(Number(state.selectedYear)), married() ? reviewPerson : 'you');
      jobs.push({ employer: jobs.length ? `Job ${jobs.length + 1}` : 'Main job', credits: '', band: '', basis: 'cumulative' });
      save(); renderAll();
      const i = jobs.length - 1;
      const c = document.getElementById(`job-credits-${i}`);
      if (c) c.focus();
    });
    $('#solForm').addEventListener('change', (e) => {
      const f = e.currentTarget;
      const yd = yearData(Number(state.selectedYear));
      yd.sol = {};
      ['solIncome', 'solCredits', 'solLiability', 'solPaid'].forEach((k) => { yd.sol[k] = f[k].value === '' ? '' : Number(f[k].value); });
      save(); renderAll();
    });
    $('#solFile').addEventListener('change', (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) readStatementFile(file); });
    $('#photoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('Choose a photo (JPEG, PNG or HEIC).'); return; }
      showPhotoPreview(null, 'Preparing photo…');
      pendingPhoto = await shrinkImage(file);
      showPhotoPreview(pendingPhoto);
    });
    $('#syncToggle').addEventListener('change', (e) => {
      setSyncPref(e.target.checked);
      if (e.target.checked) startSync(); else stopSync();
    });
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
        state = defaultState(); tccKey = ''; save(); resetExpenseForm(); renderAll();
        setStatus('All data deleted.');
      });
    });
    const hasData = state.expenses.length > 0 || Object.keys(state.years).length > 0;
    let tab = hasData ? 'dashboard' : 'guide';
    try { tab = sessionStorage.getItem('taxback.tab') || tab; } catch (e) { /* ignore */ }
    showTab(tab);
    resetExpenseForm();
    renderAll();
    syncInit();
  }

  init();
})();
