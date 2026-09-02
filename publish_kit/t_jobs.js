/* Focused suite for the Jobs view. Unlike t_track.js this takes the file as
   argv[2] so it can gate a merged file as well as the build. */
const pw = require('playwright');
const path = require('path');
let ok = 0, bad = 0;
const t = (n, c) => c ? (ok++, console.log('  PASS ' + n)) : (bad++, console.log('  FAIL ' + n));
const SRC = path.resolve(process.argv[2] || 'build.html');

(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + SRC);
  await page.waitForTimeout(400);

  const tab = page.locator('.switch button[data-view="jobs"]');
  t('jobs tab exists', await tab.count() === 1);
  t('jobs view starts hidden', await page.locator('#view-jobs').isHidden());

  await tab.click();
  await page.waitForTimeout(200);
  t('jobs view opens on tap', await page.locator('#view-jobs').isVisible());
  t('other views close', await page.locator('#view-today').isHidden()
    && await page.locator('#view-board').isHidden());
  t('tab reads as selected', await tab.getAttribute('aria-selected') === 'true');

  const sects = await page.locator('#jrows .jsect').allTextContents();
  t('three groups render', sects.length === 3);
  t('reachable work is first', /Open to you now/.test(sects[0] || ''));
  t('gated work is last', /credential/i.test(sects[2] || ''));

  const open = page.locator('#jrows .job[data-s="open"]');
  t('one open role', await open.count() === 1);
  t('open role is Nicklaus', /Nicklaus/.test(await open.first().textContent()));
  t('open role links out', (await open.first().locator('a.jgo').getAttribute('href') || '')
    .startsWith('https://careers.nicklaushealth.org/'));
  t('link opens in a new tab', await open.first().locator('a.jgo').getAttribute('target') === '_blank');
  t('open role shows its chips', await open.first().locator('.jchip').count() >= 2);

  const blocked = page.locator('#jrows .job[data-s="blocked"]');
  t('one blocked role', await blocked.count() === 1);
  const bt = await blocked.first().textContent();
  t('blocked role is the apprenticeship', /Apprentice/.test(bt));
  t('blocked role names the date it opens', /12 Nov/.test(bt));
  t('blocked role does not read as a rejection', !/reject|denied|failed/i.test(bt));

  t('gated row explains the wall', /R\. EEG T\.|CAAHEP/.test(
    await page.locator('#jrows .job[data-s="gated"]').first().textContent()));

  t('pipeline renders', await page.locator('#jpipe .pipe').count() === 1);
  t('pipeline shows five stages', await page.locator('#jpipe .pipe').first().locator('.pstage span').count() === 5);
  // A ladder lit end to end reads as a win. Nothing unresolved may render that way.
  t('an unresolved application does not light every stage',
    await page.locator('#jpipe .pipe').first().locator('.pstage span[data-on="1"]').count() < 5);
  t('pipeline says why it stopped, without blame',
    /eligibility rule, not a decision about you/.test(
      await page.locator('#jpipe .pipe').first().textContent()));

  const body = await page.locator('#view-jobs').textContent();
  t('no guilt framing', !/overdue|behind|you failed|should have|missed/i.test(body));

  const over = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  t('no sideways scroll at 430px', over);
  const fits = await page.evaluate(() => {
    const s = document.querySelector('.switch');
    return s.scrollWidth <= s.clientWidth + 1;
  });
  t('five tabs fit without clipping', fits);

  await page.locator('.switch button[data-view="today"]').click();
  await page.waitForTimeout(150);
  await tab.click();
  await page.waitForTimeout(150);
  t('survives a round trip', await page.locator('#jrows .job').count() === 3);

  t('no page errors', errs.length === 0);

  await b.close();
  console.log('\n' + ok + ' passed, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
})();
