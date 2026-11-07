/*
 * Payslip reader. Pulls pay and tax figures out of a PDF payslip, entirely in
 * the browser: the file is never uploaded anywhere.
 *
 * parseText(lines) is pure and tested in Node. readPdf(file) loads pdf.js
 * from cdnjs on first use and returns the text lines of the PDF.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Payslip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PDFJS_VERSION = '3.11.174';
  const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const YTD = /(to[\s-]*date|\bytd\b|y\.t\.d|cumulative|year[\s-]*to)/i;
  const GROSS_RULES = [
    { re: /(taxable\s*pay|pay\s*for\s*(income\s*)?tax|gross\s*(pay\s*)?for\s*tax)/i, rank: 1 },
    { re: /(gross\s*pay|total\s*gross|gross\s*earnings|total\s*pay|^\s*gross\b)/i, rank: 2 },
  ];
  const GROSS_EXCLUDE = /\b(net|usc|prsi|deduction)/i;
  const TAX_RULES = [
    { re: /(\bpaye\b|income\s*tax|tax\s*deducted|tax\s*paid)/i, rank: 1 },
    { re: /(^\s*tax\b)/i, rank: 2 },
  ];
  const USC_RULES = [{ re: /(\busc\b|universal\s*social(\s*charge)?)/i, rank: 1 }];
  const USC_EXCLUDE = /(rate|band|cut[\s-]*off|exempt|employer|\ber\b)/i;
  const PRSI_RULES = [{ re: /(\bprsi\b(\s*\(?\s*(ee|employee)\s*\)?)?)/i, rank: 1 }];
  const PRSI_EXCLUDE = /(class|employer|\ber\b|insurable|week|credit|rate)/i;
  const TAX_EXCLUDE = /(tax\s*(year|week|month|period)\b(?!\s*to)|credit|cut[\s-]*off|band|basis|\busc\b|prsi|allowance|taxable|code|refund|number|\bno\b|reference|pay\s*for\s*tax|gross)/i;

  // Money: 1,234.56 or 1234.56 or 1,234 (not percentages or dates).
  const MONEY = /(?<![\d/.\-])€?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d{2,})(?![\d/%]|\.\d)/g;

  function numbersIn(line) {
    const out = [];
    let m;
    MONEY.lastIndex = 0;
    while ((m = MONEY.exec(line))) {
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 2);
      if (/^\s?%/.test(after)) continue;
      out.push(Number(m[1].replace(/,/g, '')));
    }
    return out;
  }

  // Strip the label text so digits inside it (e.g. "Tax 2026") don't count.
  function afterLabel(line, re) {
    const m = line.match(re);
    return m ? line.slice(m.index + m[0].length) : line;
  }

  function classify(line, rules, exclude) {
    if (exclude.test(line)) return null;
    for (const r of rules) if (r.re.test(line)) return r;
    return null;
  }

  function parseDate(text) {
    const labelled = text.match(/(pay(ment)?\s*date|date\s*(of\s*)?pa(id|yment)|period\s*end(ing)?|process(ed)?\s*date|pay\s*period)[^\d\n]{0,20}(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/i);
    const any = labelled ? null : text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
    const m = labelled ? labelled.slice(-3) : any ? any.slice(1, 4) : null;
    if (m) {
      const day = Number(m[0]);
      const month = Number(m[1]);
      let year = Number(m[2]);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
    }
    const named = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/i);
    if (named) return { year: Number(named[2]), month: MONTHS.indexOf(named[1].toLowerCase()) + 1, day: null };
    return null;
  }

  /**
   * Find pay and tax figures in payslip text.
   * @param {string[]} lines text lines, top to bottom
   * @returns {{grossPeriod, taxPeriod, grossYTD, taxYTD, payDate, frequency}}
   */
  function parseText(lines) {
    const clean = lines.map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
    const found = { gross: {}, tax: {}, usc: {}, prsi: {} };
    const KINDS = [['gross', GROSS_RULES, GROSS_EXCLUDE], ['tax', TAX_RULES, TAX_EXCLUDE],
      ['usc', USC_RULES, USC_EXCLUDE], ['prsi', PRSI_RULES, PRSI_EXCLUDE]];
    const isLabel = (l) => KINDS.some(([, rules, ex]) => classify(l, rules, ex));

    const take = (kind, slot, value, rank) => {
      if (value == null || !(value > 0)) return;
      const cur = found[kind][slot];
      if (!cur || rank < cur.rank) found[kind][slot] = { value, rank };
    };

    clean.forEach((line, i) => {
      KINDS.forEach(([kind, rules, exclude]) => {
        const rule = classify(line, rules, exclude);
        if (!rule) return;
        let nums = numbersIn(afterLabel(line, rule.re));
        if (!nums.length && clean[i + 1] && !isLabel(clean[i + 1])) {
          nums = numbersIn(clean[i + 1]);
        }
        if (!nums.length) return;
        if (YTD.test(line)) {
          take(kind, 'ytd', nums[0], rule.rank);
        } else {
          take(kind, 'period', nums[0], rule.rank);
          if (nums.length >= 2) take(kind, 'ytd', nums[nums.length - 1], rule.rank + 0.5);
        }
      });
    });

    const text = clean.join('\n');
    // Emergency or Week 1 / Month 1 basis is usually printed on the payslip.
    let basis = null;
    if (/\bemergency\b/i.test(text)) basis = 'emergency';
    else if (/(\b(week|month|wk|mth)\s*1\b(\s*basis)?|\b[wm]1\b|non[\s-]?cumulative|temporary\s*basis)/i.test(text)) basis = 'week1';
    const freq = text.match(/\b(weekly|fortnightly|monthly|4[\s-]*weekly)\b/i);
    const val = (o) => (o ? o.value : null);
    return {
      grossPeriod: val(found.gross.period),
      taxPeriod: val(found.tax.period),
      grossYTD: val(found.gross.ytd),
      taxYTD: val(found.tax.ytd),
      uscPeriod: val(found.usc.period),
      prsiPeriod: val(found.prsi.period),
      uscYTD: val(found.usc.ytd),
      prsiYTD: val(found.prsi.ytd),
      payDate: parseDate(text),
      frequency: freq ? freq[1].toLowerCase().replace(/\s|-/g, '') : null,
      basis,
    };
  }

  /**
   * Find the main figures on a Revenue Statement of Liability: total income,
   * total tax credits, liability after credits and tax paid. Returns nulls
   * for anything not found.
   */
  function parseStatement(lines) {
    const clean = lines.map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
    const rules = {
      income: /(total\s*(gross\s*)?income|gross\s*income|total\s*income)/i,
      credits: /(total\s*(tax\s*)?credits|tax\s*credits\s*total)/i,
      liability: /(total\s*(tax\s*)?liability|liability\s*after\s*credits|tax\s*liability|net\s*tax\s*(due|liability)|income\s*tax\s*due)/i,
      paid: /(tax\s*(paid|deducted)|total\s*(tax\s*)?paid|paye\s*(paid|deducted))/i,
    };
    const out = { income: null, credits: null, liability: null, paid: null };
    clean.forEach((line, i) => {
      Object.entries(rules).forEach(([k, re]) => {
        if (out[k] != null || !re.test(line)) return;
        if (k === 'income' && /(usc|prsi|non[\s-]?paye)/i.test(line)) return;
        let nums = numbersIn(afterLabel(line, re));
        if (!nums.length && clean[i + 1]) nums = numbersIn(clean[i + 1]);
        if (nums.length) out[k] = nums[nums.length - 1];
      });
    });
    const text = clean.join('\n');
    const over = text.match(/(overpa(id|yment)|refund)[^\d\n]{0,30}(€?\s?[\d,]+\.\d{2})/i);
    const under = text.match(/(underpa(id|yment))[^\d\n]{0,30}(€?\s?[\d,]+\.\d{2})/i);
    out.overpaid = over ? numbersIn(over[3])[0] : null;
    out.underpaid = under ? numbersIn(under[3])[0] : null;
    return out;
  }

  async function readStatement(file, password) {
    const lines = await readPdf(file, password);
    if (!lines.join('').trim()) throw new Error('This PDF has no readable text. Type the figures in instead.');
    return Object.assign(parseStatement(lines), { lines });
  }

  // ---------- Browser: PDF loading ----------
  let loading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the PDF reader. Check your internet connection and try again.'));
      document.head.append(s);
    });
  }

  function loadPdfJs() {
    if (!loading) {
      // Loading the worker as a plain script lets pdf.js run on the page
      // itself, so no separate worker file has to be fetched.
      loading = loadScript(PDFJS_BASE + 'pdf.min.js')
        .then(() => loadScript(PDFJS_BASE + 'pdf.worker.min.js'))
        .then(() => {
          const lib = self.pdfjsLib;
          lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
          return lib;
        })
        .catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  class NeedsPassword extends Error {
    constructor(wrong) {
      super(wrong ? 'That password didn’t work. Try again.' : 'This payslip is password protected.');
      this.name = 'NeedsPassword';
      this.wrong = wrong;
    }
  }

  /** Read a PDF File and return its text, grouped into lines. */
  async function readPdf(file, password) {
    const lib = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    let doc;
    try {
      doc = await lib.getDocument({ data, password: password || undefined, isEvalSupported: false }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new NeedsPassword(!!password);
      throw new Error('This file could not be opened as a PDF.');
    }
    const lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map();
      content.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = Math.round(it.transform[5] / 3) * 3; // items within ~3pt share a line
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: it.transform[4], s: it.str });
      });
      [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
        lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' '));
      });
    }
    return lines;
  }

  async function readFile(file, password) {
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      const err = new Error('Only PDF payslips can be read. For a photo or scan, type the figures into the month instead.');
      err.name = 'NotPdf';
      throw err;
    }
    const lines = await readPdf(file, password);
    if (!lines.join('').trim()) {
      throw new Error('This PDF has no readable text (it may be a scan). Type the figures into the month instead.');
    }
    return Object.assign(parseText(lines), { lines });
  }

  return { parseText, parseStatement, numbersIn, parseDate, readFile, readStatement, NeedsPassword, PDFJS_BASE };
});
