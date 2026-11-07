# Taxback

A personal Irish PAYE tax manager. Log receipts through the year, see what each
relief is worth, estimate your refund, and keep an eye on the 4-year claim deadline.

Everything runs in your browser and is saved in its local storage. Nothing is
uploaded. Use **Rates & data → Export backup** to keep a copy.

## Use it

Open `index.html` in a browser. No build step and no dependencies.

Or serve it locally: `npm start`, then visit http://localhost:8080.

## What it does

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
| Medical insurance | 20% credit on premium up to €1,000 per adult, €500 per child |
| Rent tax credit | 20% of rent, capped per year (€1,000 single / €2,000 couple for 2024–26) |
| Tuition fees | 20% of fees (max €7,000 per course) less €3,000 / €1,500 disregard |
| Mortgage interest | 20% of the increase over 2022 interest, capped per year |
| Home carer | Fixed credit, reduced by half the carer's income over €7,200 |
| Pension AVC / PRSA | Deduction within 15%–40% age limit of earnings up to €115,000 |
| Remote working | Deduction of 30% × bills × days WFH / days in year |
| Nursing home, flat rate expenses | Deduction |

Credits come off your tax bill directly. Deductions reduce taxable income, so
they are worth 20% or 40% depending on your marginal rate. Each claim's value is
the difference in tax with and without it.

Rates live in `tax.js` (`RATES`). Years flagged "check" (2026 and 2027) use
budget figures that should be confirmed on revenue.ie.

## Not covered

USC and PRSI, self-assessed (Form 11) income, rental income, Rent-a-Room relief,
Help to Buy, separate assessment, and less common credits (dependent relative,
single person child carer, etc.).

This is an estimate to help organise claims, not tax advice.

## Tests

```
npm test
```
