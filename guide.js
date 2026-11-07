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
    singleParent: {
      title: 'Who counts for the Single Person Child Carer Credit?',
      body: [
        'You’re not married or living with a partner, and a child lives with you for most of the year (more than half). The child must be under 18, or in full-time education, or permanently incapacitated.',
        'It gives you an extra tax credit **and** an extra €4,000 taxed at 20%. If the child lives with both parents, the main carer gets it but can hand it to the other parent.',
        'Claim it in myAccount: PAYE Services → Manage your tax → Claim tax credits → You and your family.',
      ],
    },
    bereavementYear: {
      title: 'Why does the year matter?',
      body: [
        'In the year your spouse or civil partner died you keep the married person’s credit. After that you get a higher widowed person’s credit.',
        'If you have a dependent child, you instead get the Single Person Child Carer Credit and a Widowed Parent Credit for the 5 years after the year of bereavement (€3,600 in year 1, falling to €1,800 in year 5).',
      ],
    },
    children: {
      title: 'Why ask about children?',
      body: ['If you or your spouse are 65 or over, each child raises the income you can have before paying any income tax (€575 for each of the first two, €830 for each after).'],
    },
    blindYou: {
      title: 'Who gets the Blind Person’s Tax Credit?',
      body: [
        'You’re registered blind, or your sight is severely limited (central vision of 6/60 or less in the better eye with glasses, or a narrow field of vision).',
        'Claim it in myAccount with a report from an ophthalmologist or a letter from Vision Ireland (formerly NCBI). It’s higher if you’re both blind.',
      ],
    },
    incapChildren: {
      title: 'What is the Incapacitated Child Tax Credit?',
      body: [
        'For a child who is permanently incapacitated, physically or mentally, and can’t look after themselves as an adult. The child can be any age if the incapacity began before 21 (or during full-time education).',
        'A doctor fills in a form (Form ICC1). Claim it in myAccount.',
      ],
    },
    depRelatives: {
      title: 'What is the Dependent Relative Tax Credit?',
      body: [
        'For a relative you support who can’t look after themselves because of age or illness, or a widowed parent of you or your spouse, whatever their health. Their own income must be low (under a yearly limit Revenue sets, roughly the full State Pension).',
        'It’s a small credit, but it can be backdated 4 years.',
      ],
    },
    status: {
      title: 'Which one am I?',
      body: [
        'Pick **Single** if you are not married or in a civil partnership, or if you and your partner are taxed separately.',
        'Pick **Married / civil partners, jointly assessed** if you are married or in a civil partnership and taxed together. This is the usual setup, and it lets you share tax credits.',
        'Not sure? Look at your **Tax Credit Certificate** in myAccount (PAYE Services → View tax credit certificate). If it says “Married Person or Civil Partner Tax Credit”, you are jointly assessed.',
        'Pick **Widowed** if your spouse or civil partner has died and you haven’t remarried.',
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
        '**Prefer to go month by month?** Choose “Month by month” above. You can type each month’s pay from your payslips, or upload a PDF payslip and the app reads the numbers for you.',
        '**For this year, before it ends:** your payslip only shows pay and tax **so far**. Estimate both for the full year, or the refund will be wrong. The calculator below does both at once.',
        'Use pay **after** any pension that comes out of your wages. The Employment Detail Summary already shows it that way.',
      ],
      calc: 'ytdYou',
    },
    spouseGross: {
      title: 'Where do I find my spouse’s pay?',
      body: [
        'The same places as yours: your spouse’s own myAccount (PAYE Services → Review your tax → Employment Detail Summary), or their last payslip of the year.',
        'Copy **Gross pay** into this box and **Tax deducted** into “Spouse’s income tax paid”.',
      ],
      calc: 'ytdSpouse',
    },
    youPensionWages: {
      title: 'Why does pension matter here?',
      body: [
        'Pension taken from your wages lowers your income tax, but **not** your USC or PRSI. So the app adds it back to work those out.',
        '**Where to find it:** a line on your payslip called “Pension”, “Superannuation”, “AVC” or similar. For the year, use your last payslip’s “to date” figure, or add up the months.',
        'Leave it empty if nothing for a pension comes out of your pay.',
      ],
    },
    youUscPaid: {
      title: 'Where do I find the USC and PRSI I paid?',
      steps: [
        'In **myAccount**: PAYE Services → Review your tax → pick the year → **Employment Detail Summary**. It lists USC and PRSI for each job.',
        'Or on your **last payslip of the year**: “USC to date” and “PRSI to date” (sometimes “PRSI EE”, meaning the employee’s part). Ignore “PRSI ER”, which your employer pays.',
      ],
      body: [
        'If these match what the app works out, you paid the right amount. A big USC difference is worth checking with Revenue, as it can be refunded.',
      ],
    },
    youMedicalCard: {
      title: 'Why does a medical card matter?',
      body: [
        'If you have a **full medical card** (not a GP visit card), or you’re **70 or over**, and your income is €60,000 or less, you pay a lower rate of USC: at most 2%.',
        'Employers don’t always know this, so people sometimes overpay USC. If so, you can get it back from Revenue.',
      ],
    },
    youWelfare: {
      title: 'What counts as taxable social welfare?',
      body: [
        'Some payments from the Department of Social Protection are taxed: **State Pension (Contributory)**, **Illness Benefit**, **Jobseeker’s Benefit**, **Maternity, Paternity and Parent’s Benefit**, **Invalidity Pension** and **Widow’s, Widower’s or Surviving Civil Partner’s Pension**.',
        'Tax usually isn’t taken from these directly. Instead Revenue reduces your tax credits, so the tax is collected through your wages. Leaving them out would make your refund look bigger than it is.',
        '**Where to find it:** myAccount → PAYE Services → Review your tax → pick the year → **Employment Detail Summary**. Department of Social Protection payments are listed there. Copy the amount Revenue shows (it already leaves out tax-free parts, such as the first weeks of Illness Benefit).',
        'Leave it empty if you didn’t get any of these. Child Benefit and means-tested payments are not taxed.',
      ],
    },
    youTaxPaid: {
      title: 'Where do I find the tax I paid?',
      steps: [
        'In the same **Employment Detail Summary** (myAccount → PAYE Services → Review your tax → pick the year).',
        'Copy **Tax deducted** (also called “Income tax paid”). Do not include USC or PRSI.',
      ],
      body: [
        'On a payslip it is **Tax to date** or **PAYE YTD**. Ignore the USC and PRSI lines.',
        '**For this year, before it ends:** use the calculator under “Your gross pay”. It estimates pay **and** tax for the full year together, so they match.',
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
  // Short guides for changes that affect your tax.
  const LIFE_EVENTS = [
    {
      title: 'Getting married',
      text: [
        'In the year you marry, you’re each taxed as single. Afterwards you can claim back any extra you’d have saved by being taxed together: one of you applies after the year ends (myAccount → Review your tax → the year → Income Tax Return, and tick the box for the year of marriage).',
        'Tell Revenue you’ve married (myAccount → Manage your tax → Your marital status) so your credits and band can be shared from the next year.',
      ],
    },
    {
      title: 'Having a baby',
      text: [
        'There’s no tax credit for children in a two-parent family, but Maternity and Paternity Benefit are taxed. Revenue usually reduces your credits while you get it, so expect a smaller pay packet when you return.',
        'Health expenses for pregnancy and birth (consultant, scans, hospital charges you pay) count for 20% back.',
        'Single parents: claim the Single Person Child Carer Credit.',
      ],
    },
    {
      title: 'Buying a home',
      text: [
        'First-time buyers of a newly built home may get **Help to Buy**: a refund of income tax you paid over the last 4 years, up to a maximum (€30,000 for many years, with higher limits announced since; check revenue.ie). Apply in myAccount before you sign the contract.',
        'Once you own, the Rent Tax Credit stops. Mortgage interest relief only covered certain years, so check if it applies to you.',
      ],
    },
    {
      title: 'Starting a second job or changing jobs',
      text: [
        'Tell Revenue about the new job before your first payday (myAccount → Manage your tax → Jobs and pensions → Add job). Otherwise you’re put on **emergency tax**.',
        'With two jobs, your credits and 20% band are split between them. Put most on the main job; the Review tab shows how.',
      ],
    },
    {
      title: 'Illness, Illness Benefit or time off',
      text: [
        'Illness Benefit is taxable after the first 6 weeks, but it’s paid without tax taken. Revenue reduces your credits on your wages to collect it, so you might see less in your pay.',
        'If the year ends with tax owed, Revenue usually collects it by reducing your credits over up to 4 years. You can ask to pay it at once instead.',
      ],
    },
    {
      title: 'Redundancy',
      text: [
        'Statutory redundancy is tax-free. On extra lump-sum payments, a basic exemption of €10,160 plus €765 for each full year of service is tax-free, and there are higher limits in some cases. Ask your employer for the calculation.',
        'If you’re out of work for part of the year, you’ve likely overpaid tax. Claim it back after the year ends, or during the year after 4 weeks (Form P50 through myAccount).',
      ],
    },
    {
      title: 'Retiring',
      text: [
        'At 65 you get the age credit (€245, or €490 for a couple), and if your income is low you may pay no income tax at all. At 66 you stop paying PRSI. With a medical card or at 70+, USC is at most 2%.',
        'A pension lump sum up to €200,000 is tax-free over your lifetime. The State Pension is taxable but paid without tax taken, so Revenue adjusts your other credits.',
      ],
    },
    {
      title: 'Moving abroad or coming back',
      text: [
        'In the year you arrive or leave, you may be able to treat your Irish and foreign earnings separately (split-year residence). Ask Revenue to apply it.',
        'Tell Revenue about the new or ended job so your credits are set correctly, and claim back overpaid tax for the part of the year you weren’t working here.',
      ],
    },
    {
      title: 'Separation or divorce',
      text: [
        'You can choose how you’re taxed after separation. Maintenance you pay to a former spouse can be deducted from your income if it’s legally enforceable; maintenance for children isn’t.',
        'If a child lives with you, you may get the Single Person Child Carer Credit.',
      ],
    },
  ];

  // Benefits from work: are they taxed?
  const BENEFITS = [
    ['Small benefit vouchers', 'Tax-free up to €1,500 a year, in no more than 5 vouchers or gifts (€1,000 and 2 vouchers in 2023; €1,000 and 1 voucher in 2022). Cash never counts.'],
    ['Cycle to Work', 'Tax-free bike up to €1,250 (€1,500 for an e-bike, €3,000 for a cargo bike) through salary sacrifice, once every 4 years.'],
    ['TaxSaver travel pass', 'Tax-free yearly bus, train or Luas ticket, usually paid from your gross pay so it saves tax, USC and PRSI.'],
    ['Remote working allowance', 'Your employer can pay up to €3.20 a day tax-free. If they do, check with Revenue before also claiming remote working relief.'],
    ['Health insurance from your employer', 'Taxed as a benefit through your pay, but you can claim 20% relief on it. Add it under Receipts.'],
    ['Company car or van', 'Taxed as a benefit based on the car’s value, mileage and emissions. It’s already in your gross pay on your Employment Detail Summary.'],
    ['Pension contributions from your employer', 'Not taxed as a benefit. Your own contributions through payroll already get tax relief.'],
    ['Share schemes and RSUs', 'Usually taxed through payroll when the shares are given to you. Selling them later can mean Capital Gains Tax, which is outside this app.'],
  ];

  // Dates worth a reminder in your calendar. month is 1-12.
  const REMINDERS = [
    { title: 'Claim back last year’s tax', month: 1, day: 20, detail: 'Review last year in myAccount and claim health expenses, rent, remote working and other credits. Taxback has the figures.' },
    { title: 'Check your Tax Credit Certificate', month: 1, day: 10, detail: 'Check the new year’s credits and rate band are right for every job (Taxback → Review).' },
    { title: 'Last day for AVCs to count for last year', month: 10, day: 31, detail: 'Extra pension contributions paid by today can be set against last year’s income.' },
    { title: 'Last day to claim for the oldest open year', month: 12, day: 15, detail: 'Claims close on 31 December for the year four years ago. Claim before then.' },
  ];

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

  // Which online service to claim through.
  const ROUTES = {
    myaccount: {
      label: 'I only have a job or pension (myAccount)',
      who: 'Use **myAccount** if all your income comes through an employer or a pension, with tax taken from your pay. This is most people.',
    },
    ros: {
      label: 'Self-employed or I file a Form 11 (ROS)',
      who: 'Use **ROS** (Revenue Online Service) if you file a yearly **Form 11** tax return: for example you are self-employed, a landlord, a company director, or have other income over €5,000 outside your job. If you only have a job, you can’t switch to ROS; use myAccount.',
    },
  };

  const ROS_STEPS = [
    {
      title: 'Get access to ROS (first time only)',
      text: 'Go to ros.ie and click **Register for ROS**. Enter your PPS number. Revenue posts you a **ROS Access Number**, usually within about 5 working days. Use it on ros.ie to download your **digital certificate** and choose a password. Keep the certificate file safe: you need it to sign in on that computer.',
      link: 'https://www.ros.ie/',
      linkText: 'Open ros.ie',
    },
    {
      title: 'Sign in',
      text: 'On ros.ie click **Sign in to ROS**, pick your certificate and enter your password.',
    },
    {
      title: 'Check your bank details',
      text: 'Go to **Admin Services**, then **Manage bank accounts**, and make sure your account is there for refunds.',
    },
    {
      title: 'Open your tax return',
      text: 'Click **My Services**, then **File a return**. Choose **Income Tax (Form 11)** and the tax year, then **File return online**.',
    },
    {
      title: 'Enter your income and claims',
      text: 'Fill in your income panels. Then open the **Tax credits and reliefs** panel and the **Health expenses** panel, and enter the totals from this app’s Overview (health expenses, rent, remote working, pension, tuition and so on).',
    },
    {
      title: 'Calculate, sign and submit',
      text: 'Click **Calculate** to see if you owe tax or have paid too much. Then **Sign and submit** with your ROS password. The deadline is **31 October** of the following year, usually extended to mid-November when you file and pay online. Any overpayment is refunded to your bank account.',
    },
  ];

  const RECEIPTS_APP = 'Tip: Revenue’s free **Receipts Tracker** phone app lets you photograph receipts as you go. They’re kept for you, and you can use them when you claim in myAccount.';

  const GLOSSARY = [
    ['Tax year', 'Runs from 1 January to 31 December. You can claim for the last 4 years.'],
    ['Gross pay', 'Your pay before tax is taken off.'],
    ['Income tax', 'The main tax on your pay. Your employer takes it from your wages (that is what PAYE means: Pay As You Earn).'],
    ['USC', 'Universal Social Charge: a second charge on pay, from 0.5% to 8%. Nobody pays it on income of €13,000 or less. Tax claims don’t reduce it.'],
    ['PRSI', 'Pay Related Social Insurance: about 4% of pay, which builds your right to the State Pension and other benefits. Not charged on pay of €352 a week or less, or from age 66.'],
    ['Take-home pay', 'What’s left after income tax, USC, PRSI and pension come out of your pay.'],
    ['Tax credit', 'Money off your tax bill. A €100 credit means €100 less tax.'],
    ['Tax relief', 'The general word for tax you get back for something you paid.'],
    ['Deduction', 'An amount taken off your income before tax is worked out. You save 20% or 40% of it, depending on your rate.'],
    ['20% and 40% rates', 'You pay 20% on income up to a limit, and 40% on anything above it. The rate on your last euro of income is your “marginal rate”.'],
    ['Jointly assessed', 'A married couple or civil partners taxed together, so they can share credits.'],
    ['Employment Detail Summary', 'A page in myAccount showing your pay and tax for a year. It replaced the P60.'],
    ['Statement of Liability', 'Revenue’s end-of-year summary of the tax you owed and paid. It shows your refund.'],
    ['ROS', 'Revenue Online Service: Revenue’s website for people who file a Form 11 tax return, such as the self-employed.'],
    ['Form 11', 'The yearly tax return for self-employed people, landlords and others with income outside a job.'],
    ['Payslip', 'The statement you get each payday. It shows your pay, the tax taken, and totals for the year so far (“to date” or “YTD”).'],
    ['Tax Credit Certificate', 'Revenue’s statement of the credits and 20% band you get each year, split between your jobs. Your employer uses it to work out your tax.'],
    ['Emergency tax', 'What your employer must deduct if Revenue hasn’t told them your credits: no credits, and mostly 40%. You get it back once the job is registered.'],
    ['Cumulative basis', 'The normal way: each payday your tax is worked out on your pay for the year so far, so unused credits carry forward and overpayments are repaid.'],
    ['Week 1 / Month 1 basis', 'Each payday is taxed on its own, with no catching up. Common for a short time after starting a job.'],
    ['PPS number', 'Your personal public service number. It is on your payslip and Tax Credit Certificate.'],
  ];

  return { FIELDS, CATEGORIES, QUIZ, CLAIM_STEPS, ROUTES, ROS_STEPS, RECEIPTS_APP, GLOSSARY, MYACCOUNT, LIFE_EVENTS, BENEFITS, REMINDERS };
});
