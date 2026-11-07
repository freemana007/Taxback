/*
 * Plain-language help for people new to tax: where to find each number, how
 * to work it out, and how to make the claim. Content only; app.js renders it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Guide = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MYACCOUNT = 'https://www.revenue.ie/en/online-services/services/manage-your-record/myaccount.aspx';

  // Help shown under each field in "Income & settings".
  const FIELDS = {
    status: {
      title: 'Which one am I?',
      body: [
        'Pick **Single** if you are not married or in a civil partnership, or if you and your partner are taxed separately.',
        'Pick **Married / civil partners, jointly assessed** if you are married or in a civil partnership and taxed together. This is the usual setup, and it lets you share tax credits.',
        'Not sure? Look at your **Tax Credit Certificate** in myAccount (PAYE Services → View tax credit certificate). If it says “Married Person or Civil Partner Tax Credit”, you are jointly assessed.',
      ],
    },
    youDob: {
      title: 'Why do you need this?',
      body: ['Your age decides how much you can put into a pension and still get tax back. It is only used for that, and it stays on this device.'],
    },
    youGross: {
      title: 'Where do I find my gross pay?',
      steps: [
        'Sign in to **myAccount** on revenue.ie.',
        'Click **PAYE Services**, then **Review your tax**.',
        'Pick the year, then open **Employment Detail Summary**.',
        'Copy the figure called **Gross pay** (sometimes “Pay for income tax”). If you had more than one job, add them together.',
      ],
      body: [
        '**No myAccount?** Use your last payslip of the year (December). Look for **Taxable pay to date** or **Gross pay for tax YTD**.',
        '**For this year, before it ends:** take “Taxable pay to date” from your latest payslip, divide by the months so far, and multiply by 12. The calculator below does this for you.',
        'Use pay **after** any pension that comes out of your wages. The Employment Detail Summary already shows it that way.',
      ],
      calc: 'annualise',
    },
    youTaxPaid: {
      title: 'Where do I find the tax I paid?',
      steps: [
        'In the same **Employment Detail Summary** (myAccount → PAYE Services → Review your tax → pick the year).',
        'Copy **Tax deducted** (also called “Income tax paid”). Do not include USC or PRSI.',
      ],
      body: [
        'On a payslip it is **Tax to date** or **PAYE YTD**. Ignore the USC and PRSI lines.',
        'You can leave this empty. The app will still show what your claims are worth, just not the refund total.',
      ],
    },
    wfhDays: {
      title: 'How do I count my days at home?',
      body: [
        'Count the days you **worked** from home in the year. Weekends, holidays and sick days do not count.',
        'Easy way: weeks you worked (most people work about 46 or 47 weeks a year after holidays) × days a week you were at home. Use the calculator below.',
        'If your employer already pays you a daily remote-working allowance, check with Revenue before claiming, as you may not be able to claim as well.',
      ],
      calc: 'wfhDays',
    },
    mortgageInterest2022: {
      title: 'Where do I find my 2022 mortgage interest?',
      steps: [
        'Find your lender’s **annual mortgage statement for 2022**. Most banks put it in online banking under statements or documents. You can also phone and ask for it.',
        'Copy the **total interest paid** for 2022 (not the total repayments, which include the loan itself).',
      ],
      body: [
        'Only needed if you have a mortgage on the home you live in. The relief is on the **extra** interest you paid compared with 2022, so leave this empty if you have no mortgage.',
      ],
    },
    homeCarer: {
      title: 'What is a home carer?',
      body: [
        'One of you stays at home to care for a child who gets Child Benefit, someone aged 65 or over, or someone with a long-term illness or disability.',
        'The carer can earn a little themselves. The full credit applies up to €7,200 of their own income, and it reduces above that.',
      ],
    },
    carerIncome: {
      title: 'What counts as the carer’s income?',
      body: ['Their own income for the year, such as part-time wages. Enter 0 if they had none. Child Benefit does not count.'],
    },
  };

  // Guide for each receipt category.
  const CATEGORIES = {
    health: {
      counts: ['GP and consultant visits', 'Prescription medicines', 'Physio, and hospital charges', 'Non-routine dental: crowns, root canals, braces for children, implants'],
      notCounts: ['Check-ups, cleaning, fillings, extractions', 'Glasses, contact lenses and eye tests', 'Cosmetic treatment', 'Anything your health insurer paid back to you'],
      find: [
        'Gather receipts from your GP, consultant and hospital.',
        'For medicines, ask your **pharmacy for a yearly print-out**. Most pharmacies print one for free.',
        'For special dental work, ask your dentist for a signed **Med 2 form**. It shows the amount.',
      ],
      calc: 'Add up what you paid yourself. If your health insurer paid some back, subtract that part.',
      keep: 'Keep receipts for 6 years. Revenue does not ask for them when you claim but can ask later.',
    },
    medicalInsurance: {
      counts: ['Health insurance your **employer pays for you** (it appears on your payslip as a benefit)'],
      notCounts: ['Health insurance you pay for yourself: your insurer already took 20% off the price, so there is nothing more to claim'],
      find: [
        'Check your payslip for a line like “Medical insurance BIK” or “Health insurance benefit”.',
        'Your insurer’s **renewal letter or policy schedule** shows the full (gross) premium and who is covered.',
      ],
      calc: 'Enter the full yearly premium. The app limits it to €1,000 per adult and €500 per child.',
      keep: 'Keep the renewal letter or policy schedule.',
    },
    rent: {
      counts: ['Rent for the home you live in', 'Rent you pay for a child in college (digs or student accommodation)'],
      notCounts: ['Rent paid to a parent or close relative', 'Rent paid through social housing schemes (HAP, RAS) or to a local authority'],
      find: [
        'Your **tenancy agreement** shows your monthly rent.',
        'Your **bank statements** show what you actually paid.',
        'When you claim, Revenue asks for your landlord’s name and address, and the **RTB registration number** for the tenancy. Ask your landlord, or search the RTB register online.',
      ],
      calc: 'Monthly rent × number of months you paid it in the year. Use the calculator below.',
      keep: 'Keep the tenancy agreement and bank statements.',
    },
    tuition: {
      counts: ['Fees for approved college courses (undergraduate, postgraduate, some part-time courses)'],
      notCounts: ['Registration, exam and student contribution parts covered by a grant', 'Courses that are not on Revenue’s approved list', 'Books, accommodation and travel'],
      find: ['Your college’s **fee receipt or statement**. The college can confirm if the course is approved.'],
      calc: 'Enter the fees you paid, minus any grant or scholarship. Add one entry per course, and tick “Part-time course” where it applies.',
      keep: 'Keep the fee receipts.',
    },
    mortgageInterest: {
      counts: ['Interest on a mortgage for the home you live in, if the loan balance on 31 December 2022 was between €80,000 and €500,000'],
      notCounts: ['Buy-to-let mortgages', 'The part of your repayments that pays off the loan itself'],
      find: ['Your lender’s **annual mortgage statement** for the year. It shows “interest paid”.'],
      calc: 'Enter the total interest paid in the year. Also enter your 2022 interest in Income & settings, as the relief is on the increase.',
      keep: 'Keep the annual statements for this year and 2022.',
    },
    pension: {
      counts: ['Extra pension contributions you pay **directly** to a provider: AVCs (additional voluntary contributions) or a PRSA'],
      notCounts: ['Pension that comes out of your wages: you already got tax back on it through payroll'],
      find: ['Your pension provider’s **annual statement** or the receipt for a one-off payment.'],
      calc: 'Enter what you paid in the year. The app checks it against the limit for your age.',
      keep: 'Keep the provider’s statement or receipt.',
    },
    remoteWorking: {
      counts: ['Electricity, heating (gas, oil, etc.) and broadband bills for the home you work from'],
      notCounts: ['Phone bills', 'Bills your employer pays', 'Other people’s share of shared bills'],
      find: [
        'Log in to your electricity, gas and broadband providers’ websites. Most have a **yearly statement** or a list of bills.',
        'Or add up the bills you got in the year.',
      ],
      calc: 'Add up a year of bills. If you share bills, enter only your share. Set your days worked from home in Income & settings. The app works out the 30% for those days.',
      keep: 'Keep the bills.',
    },
    nursingHome: {
      counts: ['Fees for a nursing home that gives 24-hour care, paid for yourself or a relative'],
      notCounts: ['Any part paid by the HSE or the Fair Deal scheme'],
      find: ['The nursing home’s **invoices or yearly statement**.'],
      calc: 'Add up what you paid, minus anything the state paid.',
      keep: 'Keep the invoices.',
    },
    flatRate: {
      counts: ['A set allowance for certain jobs, such as nurses, teachers, shop workers and tradespeople'],
      notCounts: ['Jobs not on Revenue’s list'],
      find: [
        'Search revenue.ie for **“flat rate expenses”** and find your job in the list.',
        'Check your Tax Credit Certificate first. It is often already given to you, so only add it if it is missing.',
      ],
      calc: 'Enter the amount shown for your job.',
      keep: 'Nothing to keep.',
    },
  };

  // Questions to help people find what they can claim.
  const QUIZ = [
    ['health', 'Did you pay for a doctor, consultant, prescriptions, physio or special dental work?'],
    ['rent', 'Do you rent the home you live in?'],
    ['remoteWorking', 'Did you work from home on some days?'],
    ['medicalInsurance', 'Does your employer pay for your health insurance?'],
    ['tuition', 'Did you pay college fees for yourself or someone else?'],
    ['mortgageInterest', 'Do you have a mortgage on your home?'],
    ['pension', 'Did you pay extra into a pension yourself, outside your wages?'],
    ['flatRate', 'Are you a nurse, teacher, shop worker, or in a trade?'],
    ['nursingHome', 'Did you pay nursing home fees for yourself or a relative?'],
  ];

  // How to make the claim on myAccount.
  const CLAIM_STEPS = [
    {
      title: 'Sign in to myAccount',
      text: 'Go to revenue.ie and click **Sign in to myAccount**. No account yet? Click **Register**. You need your PPS number, date of birth, phone number, email and address. Sometimes Revenue posts you a code, which takes about 5 days.',
      link: MYACCOUNT,
    },
    {
      title: 'Check your bank details',
      text: 'Click **Profile**, then **Manage my bank accounts**, and make sure your bank account is there. This is where the refund is paid.',
    },
    {
      title: 'For a past year',
      text: 'Click **PAYE Services**, then **Review your tax**. Pick the year and click **Request** or **Complete Income Tax Return**. Check your income is right, then go to **Tax Credits and Reliefs** and add each claim using the amounts from this app. Submit at the end.',
    },
    {
      title: 'For this year',
      text: 'Click **PAYE Services**, then **Manage your tax** for this year, then **Claim tax credits**. Pick the credit (for example Health expenses or Rent Tax Credit) and enter the amount. Your tax is adjusted in your next pay packets.',
    },
    {
      title: 'Get your refund',
      text: 'For a past year, Revenue sends a **Statement of Liability** to myAccount and pays any refund to your bank, usually within about 5 working days.',
    },
  ];

  const GLOSSARY = [
    ['Tax year', 'Runs from 1 January to 31 December. You can claim for the last 4 years.'],
    ['Gross pay', 'Your pay before tax is taken off.'],
    ['Income tax', 'The main tax on your pay. Your employer takes it from your wages (that is what PAYE means: Pay As You Earn).'],
    ['USC and PRSI', 'Two other charges on your pay. Claims in this app do not change them.'],
    ['Tax credit', 'Money off your tax bill. A €100 credit means €100 less tax.'],
    ['Tax relief', 'The general word for tax you get back for something you paid.'],
    ['Deduction', 'An amount taken off your income before tax is worked out. You save 20% or 40% of it, depending on your rate.'],
    ['20% and 40% rates', 'You pay 20% on income up to a limit, and 40% on anything above it. The rate on your last euro of income is your “marginal rate”.'],
    ['Jointly assessed', 'A married couple or civil partners taxed together, so they can share credits.'],
    ['Employment Detail Summary', 'A page in myAccount showing your pay and tax for a year. It replaced the P60.'],
    ['Statement of Liability', 'Revenue’s end-of-year summary of the tax you owed and paid. It shows your refund.'],
    ['PPS number', 'Your personal public service number. It is on your payslip and Tax Credit Certificate.'],
  ];

  return { FIELDS, CATEGORIES, QUIZ, CLAIM_STEPS, GLOSSARY, MYACCOUNT };
});
