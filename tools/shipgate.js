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
  check(items.length === 6, `exactly 6 rows (got ${items.length})`);
  const want = [/^Text the Senior Director at Weston/, /9\/14 — APRN appointment/,
                /Submit the completed ADA form/, /Call Absence Management/,
                /9\/17 — Follow up with the Senior Director/, /FMLA/];
  want.forEach((re, i) => check(items[i] && re.test(items[i].text), `row ${i + 1} matches ${re}`));

  console.log('\n[3] the FMLA row is a note, not a to-do');
  const fmla = items[5] || {};
  check(fmla.info === true,  'FMLA row marked data-info');
  check(fmla.hasBox === false, 'FMLA row has NO checkbox');
  check(fmla.hasDel === false, 'FMLA row has no remove button');
  const others = items.slice(0, 5);
  check(others.every(x => x.hasBox), 'the other 5 rows DO have checkboxes');

  console.log('\n[4] "Start here" picks the Senior Director message');
  let focus = await page.textContent('#focus .fmain');
  check(/^Text the Senior Director at Weston/.test(focus.trim()), 'focus card = item 1');

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

  console.log('\n[6] ticking all 5 real tasks never promotes the FMLA note');
  for (let i = 0; i < 5; i++) {
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
  check(/just following up on the EEG apprentice application/.test(note), 'message body saved in the note');
  check(/checked back on the 17th/.test(note), 'asks to check back on the 17th');
  check(/\[Name\]/.test(note), 'name placeholder present so she fills it in');

  console.log('\n[7] completed work from today was preserved as wins');
  const wins = await page.evaluate(() => {
    const s = JSON.parse(document.getElementById('app-state').textContent);
    return s.wins.filter(w => w.at === '2026-09-08').map(w => w.text);
  });
  check(wins.some(t => /Ruth sent me the accomodation request form/.test(t)), 'win: Ruth sent the form');
  check(wins.some(t => /Follow up with Ruth/.test(t)), 'win: followed up with Ruth');

  await browser.close();
  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('GATE CRASHED:', e); process.exit(1); });
