const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.join(__dirname, 'artifact.html');
let pass = 0, fail = 0;
const ok  = (m) => { console.log('  PASS  ' + m); pass++; };
const bad = (m) => { console.log('  FAIL  ' + m); fail++; };
function check(cond, m) { cond ? ok(m) : bad(m); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();

  // any uncaught error or console error is an automatic gate failure
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') {
    const t = m.text();
    if (!/fonts\.googleapis|ERR_INTERNET|net::ERR|Failed to load resource/i.test(t)) errors.push('console: ' + t);
  }});

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  console.log('\n[1] page boots clean');
  check(errors.length === 0, 'no JS errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

  console.log('\n[2] queue contents and order');
  const items = await page.$$eval('#tasklist li', ls => ls.map(l => ({
    text: (l.querySelector('.tkmain') || {}).textContent || '',
    info: l.getAttribute('data-info') === 'true',
    hasBox: !!l.querySelector('.tkbox'),
    hasDel: !!l.querySelector('.tkdel'),
  })));
  check(items.length === 12, `exactly 12 rows (got ${items.length})`);
  const want = [/^Monday 9\/14 — send the appeal/, /^Text the Senior Director/,
                /^Email HR for the dates/, /^Submit Workday timecard corrections/,
                /9\/14 — APRN appointment/, /Submit the completed ADA form/,
                /Call Absence Management/, /^Call FAU Financial Aid/,
                /9\/17 — Follow up with the Senior Director/, /FMLA — approved 9\/9/,
                /\$119.*payment plan/, /Lori.*grow therapy/i];
  want.forEach((re, i) => check(items[i] && re.test(items[i].text), `row ${i + 1} matches ${re}`));

  console.log('\n[3] the FMLA row is a note, not a to-do');
  /* locate the note by its flag, not by position — the queue reorders often */
  const infoRows = items.filter(x => x.info);
  check(infoRows.length === 1, `exactly one info row (got ${infoRows.length})`);
  const fmla = infoRows[0] || {};
  check(/FMLA — approved 9\/9/.test(fmla.text), 'the info row is the FMLA note');
  check(fmla.hasBox === false, 'FMLA row has NO checkbox');
  check(fmla.hasDel === false, 'FMLA row has no remove button');
  const others = items.filter(x => !x.info);
  check(others.length === 11, `11 real tasks (got ${others.length})`);
  check(others.every(x => x.hasBox), 'the other 11 rows DO have checkboxes');

  console.log('\n[4] "Start here" picks the appeal send-off');
  let focus = await page.textContent('#focus .fmain');
  check(/^Monday 9\/14 — send the appeal/.test(focus.trim()), 'focus card = send the appeal');

  console.log('\n[5] tracker tap data survived (the whole point of the merge)');
  const checked = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    return s.checked;
  });
  const expect = { m06:'2026-08-31', a01:'2026-09-05', m01:'2026-09-05', m05:'2026-09-05',
                   a02:'2026-09-05', a03:'2026-09-05', m11:'2026-09-05' };
  for (const k of Object.keys(expect)) check(checked[k] === expect[k], `checked.${k} = ${expect[k]}`);
  check(Object.keys(checked).length === 7, 'no extra/lost checked entries');

  // and the milestones actually render as ticked on the path tab
  await page.click('.switch button[data-view="path"]');
  await page.waitForTimeout(300);
  const pressed = await page.$$eval('.msrow[aria-pressed="true"]', r => r.length);
  check(pressed === 7, `7 milestones render ticked (got ${pressed})`);
  await page.click('.switch button[data-view="today"]');
  await page.waitForTimeout(300);

  console.log('\n[6] ticking all 11 real tasks never promotes the FMLA note');
  for (let i = 0; i < 11; i++) {
    await page.click('#tasklist li[data-done="false"] .tkbox');
    await page.waitForTimeout(150);
  }
  focus = await page.textContent('#focus .fmain');
  check(!/FMLA/.test(focus), 'FMLA never becomes the focus card');
  check(/Nothing left on today/.test(focus), 'focus shows the cleared state instead');
  const stillThere = await page.$$eval('#tasklist li[data-info="true"]', l => l.length);
  check(stillThere === 1, 'FMLA note still listed after everything else is done');

  console.log('\n[6b] the drafted text is saved on the page');
  const note = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    return (s.today.tasks.find(t => t.id === 't1') || {}).why || '';
  });
  check(/Quick update on the EEG apprentice application/.test(note), 'message body saved in the note');
  check(/FMLA was approved 9\/9, backdated to 8\/26/.test(note), 'leads with the FMLA approval');
  check(/filed a written appeal of the attendance action/.test(note), 'carries the second line she asked for');
  check(/\[Name\]/.test(note), 'name placeholder present so she fills it in');
  /* she asked for 9/26 out of the MESSAGE, not out of her own coaching note —
     so check only the quoted text between the smart quotes */
  const quoted = (note.match(/\u201C([\s\S]*)\u201D/) || [])[1] || '';
  check(quoted.length > 80, 'the quoted message is actually in the note');
  check(!/9\/26/.test(quoted), 'the 9/26 cohort-close date stays out of the message, as she asked');
  check(/before the cohort closes/.test(quoted), 'it still asks about the closing window, without the date');

  console.log('\n[6d] the Senior Director thread is live again, not parked');
  const t1 = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    const q = s.today.tasks; const t = q.find(x => x.id === 't1');
    return { pos: q.indexOf(t), why: (t || {}).why || '', url: (t || {}).url || '' };
  });
  check(t1.pos === 1, `Director follow-up sits beside the appeal (got position ${t1.pos + 1})`);
  check(!/ON HOLD until the appeal resolves/.test(t1.why), 'the old hold reason is gone');
  check(/NO LONGER ON HOLD/.test(t1.why), 'the note says plainly that it is live again');
  check(/cohort closes 9\/26/.test(t1.why), 'her note still tells her the deadline');
  check(/docs\.google\.com/.test(t1.url), 'links out to the drafts doc');

  console.log('\n[6e] the FMLA row reflects the 9/9 approval');
  const t5 = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    const t = s.today.tasks.find(x => x.id === 't5') || {};
    return (t.text || '') + ' ' + (t.why || '');
  });
  check(/approved 9\/9/.test(t5), 'says approved, not pending');
  check(/ILL-1/.test(t5), 'records the ILL-1 timecard code');
  check(!/sitting in their queue/.test(t5), 'stale "in their queue" wording gone');

  console.log('\n[6c] the FAU call script is saved on the page');
  const fau = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    return (s.today.tasks.find(t => t.id === 't7') || {}).why || '';
  });
  check(/Z number/.test(fau), 'reminds her to have the Z number ready');
  check(/rehabilitation agreement release these holds/.test(fau), 'full question script saved');
  check(/Mon–Thu 8am–6pm/.test(fau), 'phone hours saved');

  console.log('\n[7] completed work from today was preserved as wins');
  const wins = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    return s.wins.filter(w => w.at === '2026-09-08').map(w => w.text);
  });
  check(wins.some(t => /Ruth sent me the accomodation request form/.test(t)), 'win: Ruth sent the form');
  check(wins.some(t => /Follow up with Ruth/.test(t)), 'win: followed up with Ruth');
  const w9 = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    return s.wins.filter(w => w.at === '2026-09-09').map(w => w.text);
  });
  check(w9.some(t => /Intermittent FMLA approved/.test(t)), 'win: FMLA approved banked');

  await browser.close();
  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('GATE CRASHED:', e); process.exit(1); });
