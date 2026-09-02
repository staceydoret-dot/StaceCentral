const fs = require('fs');
const [,, IN, OUT] = process.argv;
const TAG = '<script id="app-state" type="application/json">';
const END = '</' + 'script>';
let h = fs.readFileSync(IN, 'utf8');

let i = -1, real = null;
while ((i = h.indexOf(TAG, i + 1)) !== -1) {
  if (h.slice(i + TAG.length).replace(/^\s*/, '')[0] === '{') real = i;
}
if (real === null) throw new Error('no real app-state block');
const s = real + TAG.length, e = h.indexOf(END, s);
const ST = JSON.parse(h.slice(s, e));

ST.jobs = {
  updated: '2026-09-02',
  note: 'Swept every morning. What you can actually reach sits at the top. Roles that want a credential first are further down — they are a queue, not a verdict.',
  rows: [
    {
      s: 'open', mi: 22,
      role: 'EEG Technician Trainee — full time, days',
      employer: "Nicklaus Children's Health System",
      where: 'Miami, FL',
      chips: [
        { t: 'No experience required', k: 'key' },
        { t: 'BLS — you have it', k: 'key' },
        { t: 'Paediatric' }
      ],
      why: 'BLS is the only hard requirement, and you have held it since 31 August. Live and unchanged on five straight daily checks, which for a trainee posting means they are still reading applications.',
      gate: 'Their words: BLS maintained active throughout employment. High school education or equivalent. No experience requirement listed.',
      url: 'https://careers.nicklaushealth.org/job/miami/eeg-technician-trainee-full-time-day-shift/35874/79749204960',
      link: 'Open this posting'
    },
    {
      s: 'working', mi: 12,
      role: 'EEG Technician Apprentice — paid, 12 months',
      employer: 'Cleveland Clinic',
      where: 'Weston, FL',
      chips: [
        { t: 'Your own employer' },
        { t: 'Under review now', k: 'key' },
        { t: 'Paid for 12 months', k: 'key' }
      ],
      why: 'The Senior Director of Ambulatory Operations is reviewing this with HR — you opened that on 2 September. You meet every stated requirement, the education branch twice over. If the review lands, this cohort is still open. If it does not, the 12 August corrective action clears on 12 November and you apply then.',
      opens: 'This cohort closes 26 September and starts the 28th. The next cohort date has not been published yet — asking for it is part of the ask.',
      url: 'https://jobs.clevelandclinic.org/apprenticeships/',
      link: 'Open the cohort page'
    },
    {
      s: 'gated',
      role: 'EEG Technician (registered)',
      employer: 'Most Broward and Miami-Dade systems',
      why: 'These ask for R. EEG T. registry or a CAAHEP programme. That is the wall, and it is why months of applications came back empty. It was never about your experience. Trainee and apprentice routes exist precisely to get you past it.'
    }
  ]
};

ST.pipeline = [
  {
    role: 'EEG Technician Apprentice',
    employer: 'Cleveland Clinic Weston',
    stage: 'Applied',
    at: 'Returned 2 Sep — an eligibility rule, not a decision about you'
  }
];

const body = '\n' + JSON.stringify(ST, null, 2) + '\n';
const out = h.slice(0, s) + body + h.slice(e);
JSON.parse(out.slice(out.indexOf(TAG) + TAG.length, out.indexOf(END, out.indexOf(TAG))));
fs.writeFileSync(OUT, out);
console.log('seeded jobs(' + ST.jobs.rows.length + ' rows) + pipeline(' + ST.pipeline.length + ') -> ' + OUT);
