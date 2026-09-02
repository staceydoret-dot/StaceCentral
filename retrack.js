/* The old ladder ended at "Decision", which turns a rejection into a dead end.
   The real sequence has more in it: the review she opened today, and the date
   the door reopens. `stages`/`gaps` are content, so this has to land in
   build.html too or the next merge reverts it. */
const fs = require('fs');
const TAG = '<script id="app-state" type="application/json">';
const END = '</' + 'script>';

const LADDER = ['Watching', 'Applied', 'Not eligible yet', 'Under review', 'Interview', 'Decision'];
const GAPS = { 'Applied': 2, 'Not eligible yet': 7, 'Under review': 7 };

for (const f of process.argv.slice(2)) {
  let h = fs.readFileSync(f, 'utf8');
  let i = -1, real = null;
  while ((i = h.indexOf(TAG, i + 1)) !== -1) {
    if (h.slice(i + TAG.length).replace(/^\s*/, '')[0] === '{') real = i;
  }
  const s = real + TAG.length, e = h.indexOf(END, s);
  const ST = JSON.parse(h.slice(s, e));

  let hit = 0;
  for (const p of ST.phases) for (const m of (p.milestones || [])) {
    if (!m.track) continue;
    m.track.stages = LADDER.slice();
    m.track.gaps = Object.assign({}, GAPS);
    m.track.stage = 'Under review';
    m.track.lastFollow = '2026-09-02';
    m.track.nextFollow = '2026-09-09';
    hit++;
  }
  const out = h.slice(0, s) + '\n' + JSON.stringify(ST, null, 2) + '\n' + h.slice(e);
  fs.writeFileSync(f, out);
  console.log(f + ': ' + hit + ' tracker(s) updated');
}
