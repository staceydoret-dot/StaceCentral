const pw = require('playwright');
let ok = 0, bad = 0;
const t = (n, c) => c ? (ok++, console.log('  PASS ' + n)) : (bad++, console.log('  FAIL ' + n));

(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext();
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.cwd() + '/build.html');
  await page.waitForTimeout(400);

  // get to the board, open phase 0
  const sw = page.locator('.switch button[data-view="path"]');
  if (await sw.count()) { await sw.click(); await page.waitForTimeout(200); }
  const head = page.locator('.card[data-pid="p0"] .card-head');
  if (await head.getAttribute('aria-expanded') !== 'true') { await head.click(); await page.waitForTimeout(200); }

  const bar = page.locator('.mtrack .tbar');
  t('tracker renders exactly once', await bar.count() === 1);
  t('six stages on the bar', await page.locator('.mtrack .tstep').count() === 6);

  const cur = page.locator('.mtrack .tstep[data-at="true"]');
  t('seeded at "Under review"', (await cur.textContent()) === 'Under review');
  t('three stages show as past', await page.locator('.mtrack .tstep[data-past="true"]').count() === 3);

  const dates = await page.locator('.mtrack .tdates').textContent();
  t('applied date shown (Aug 30)', /applied\s*Aug 30/.test(dates));
  t('last reached out shown (Sep 2)', /last reached out\s*Sep 2/.test(dates));
  t('next nudge shown (Sep 9)', /next nudge\s*Sep 9/.test(dates));
  t('Sep 9 not flagged due yet', await page.locator('.mtrack .tnext[data-due="true"]').count() === 0);

  // notes box still lives on the same step
  t('note button still on this step', await page.locator('.mnotes[data-mid="m02"] .notebtn').count() === 1);

  // tap into the terminal rung -> chasing stops, no next date is offered
  await page.locator('.mtrack .tstep[data-st="Interview"]').click();
  await page.waitForTimeout(250);
  const pretty = iso => { const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const d=new Date(iso+"T00:00:00"); return M[d.getMonth()]+" "+d.getDate(); };
  const today = new Date().toISOString().slice(0, 10);
  const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  let dt = await page.locator('.mtrack .tdates').textContent();
  t('tap moved stage to Interview', (await page.locator('.mtrack .tstep[data-at="true"]').textContent()) === 'Interview');
  t('a terminal stage stops asking for a nudge', !/next nudge/.test(dt));
  t('reaching Interview does not restamp the reach-out', dt.includes('last reached out Sep 2'));
  t('applied date untouched by the tap', dt.includes('applied Aug 30'));
  t('four stages now read as past', await page.locator('.mtrack .tstep[data-past="true"]').count() === 4);

  // tap back to Applied -> resets the +2 day rhythm
  await page.locator('.mtrack .tstep[data-st="Applied"]').click();
  await page.waitForTimeout(250);
  dt = await page.locator('.mtrack .tdates').textContent();
  t('back to Applied re-stamps applied date', dt.includes('applied ' + pretty(today)));
  t('back to Applied sets +2 day follow-up', dt.includes('next nudge ' + pretty(shift(2))));

  // the checkbox on the row must still work independently
  await page.locator('.msrow[data-mid="m02"]').click();
  await page.waitForTimeout(250);
  t('row checkbox still ticks', await page.locator('.msrow[data-mid="m02"]').getAttribute('aria-pressed') === 'true');
  t('tracker survives the tick', await page.locator('.mtrack .tbar').count() === 1);

  // no guilt language anywhere in the tracker
  const txt = (await page.locator('.mtrack').textContent()).toLowerCase();
  t('no guilt framing in tracker', !/overdue|late|missed|behind|carried over|failed/.test(txt));

  t('no page errors', errs.length === 0);
  if (errs.length) console.log(errs);

  console.log('\n' + ok + ' passed, ' + bad + ' failed');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
