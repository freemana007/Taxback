# Taxback

A personal Irish PAYE tax manager. Log receipts through the year, see what each
relief is worth, estimate your refund, and keep an eye on the 4-year claim deadline.

Everything runs in your browser and is saved in its local storage. Nothing is
uploaded. Use **Rates & data → Export backup** to keep a copy.

## Use it

Open `index.html` in a browser. No build step and no dependencies.

Or serve it locally: `npm start`, then visit http://localhost:8080.

## What it does

- **Start here**: a 6-step walkthrough for people new to tax. It shows which
  step to do next, has yes/no questions to find what you can claim, explains
  how to claim on Revenue's myAccount, and lists plain-English meanings of tax words.
- **Help on every field**: "Where do I find this?" boxes say exactly where each
  number is (myAccount page, payslip line, bank statement), with calculators
  for a full year's pay, days worked from home and a year of rent.
- **Pay and tax that match**: for a year that isn't over, a calculator turns
  your latest payslip's "to date" figures into full-year pay **and** tax
  together, and the Overview warns if the year is still running. Taxable
  social welfare (State Pension, Illness Benefit, Maternity Benefit and so on)
  has its own box: it's taxed but doesn't earn the employee credit.
- **Pay month by month or from payslips**: enter pay and tax for each month
  (weekly pay can be typed as `812 + 812 + 812 + 812`), optionally estimate the
  full year from the months entered, or choose a PDF payslip and the app reads
  the pay, tax and pay date from it. Password-protected PDFs are supported.
  Payslips are read in the browser and never uploaded or stored; pdf.js is
  loaded from cdnjs the first time a payslip is opened. Photos and scans
  can't be read.
- **Two ways to claim**: step-by-step instructions for myAccount (employees)
  and ROS / Form 11 (self-employed, landlords, directors), with a note on
  which one applies to you.
- **Receipt guides**: for each type of receipt, what counts, what doesn't,
  where to find the amount and how to work it out. The amount box adds up
  several bills typed as `85 + 120 + 60`.

- **Overview**: the value of your claims, an estimated refund (once you enter
  tax paid from your Employment Detail Summary), a full income tax calculation,
  and every open year with its deadline. A banner warns when the oldest open
  year is about to close (2022 claims close on 31 December 2026).
- **Receipts**: log health expenses, medical insurance, rent, tuition fees,
  mortgage interest, pension AVC/PRSA contributions, remote working bills,
  nursing home fees and flat rate expenses. The year comes from the receipt date.
- **Income & settings**: single or jointly assessed, dates of birth (for pension
  limits), gross pay and tax paid per year, days worked from home, 2022 mortgage
  interest, home carer.
- **Checklist**: credits to claim on myAccount, credits to check, employer
  schemes and property schemes, ticked off per year.
- **Rates & data**: rates used for each year, JSON backup and restore, CSV export.

## How reliefs are calculated

| Relief | Treatment |
| --- | --- |
| Health expenses | 20% credit |
| Medical insurance | Employer-paid premiums only (self-paid ones already get 20% off at source): 20% credit up to €1,000 per adult, €500 per child |
| Rent tax credit | 20% of rent, capped per year (€1,000 single / €2,000 couple for 2024–26) |
| Tuition fees | 20% of fees (max €7,000 per course) less €3,000 / €1,500 disregard |
| Mortgage interest | 20% of the increase over 2022 interest, capped per year |
| Home carer | Fixed credit, reduced by half the carer's income over €7,200. Given instead of the married couple's increased rate band when that saves more, never both |
| Pension AVC / PRSA (paid outside payroll) | Deduction within 15%–40% age limit of earnings up to €115,000 |
| Remote working | Deduction of 30% × bills × days WFH / days in year |
| Nursing home, flat rate expenses | Deduction |

Credits come off your tax bill directly. Deductions reduce taxable income, so
they are worth 20% or 40% depending on your marginal rate. Each claim's value is
the difference in tax with and without it.

Rates live in `tax.js` (`RATES`). Help text lives in `guide.js`, and the payslip reader in `payslip.js`. Years flagged "check" (2026 and 2027) use
budget figures that should be confirmed on revenue.ie.

## Not covered

USC and PRSI, self-assessed (Form 11) income, rental income, Rent-a-Room relief,
Help to Buy, separate assessment, and less common credits (dependent relative,
single person child carer, etc.).

This is an estimate to help organise claims, not tax advice.

## Web-link version

`npm run build` bundles everything into `dist/taxback.html`, a single page used
for the hosted link.

## Tests

```
npm test          # calculator and payslip parser (41 checks, hand-worked figures)
npm run test:e2e  # whole app in a real browser (needs Playwright + Chromium)
```

The browser test serves the bundled page with a strict content policy like the
hosted viewer's and with browser dialogs disabled. Its payslip tests need
pdf.js locally (`npm i --no-save pdfjs-dist@3.11.174`) and are skipped
otherwise.
