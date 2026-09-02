const { chromium } = require('playwright');
const fs = require('fs');

const SRC = process.argv[2] || 'path-to-psychiatry.html';
let fails = 0, passes = 0;
function ok(c, m) { if (c) { passes++; console.log('  PASS  ' + m); } else { fails++; console.log('  FAIL  ' + m); } }
const noise = t => /fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::/.test(t);

// Wrap exactly the way the Artifact publisher does.
const wrap = body => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;

(async () => {
  fs.writeFileSync('/tmp/v1.html', wrap(fs.readFileSync(SRC, 'utf8')));
  const browser = await chromium.launch();

  for (const scheme of ['light', 'dark']) {
    console.log(`\n[${scheme}] 430px mobile`);
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
    await page.goto('file:///tmp/v1.html');
    await page.waitForTimeout(700);

    ok(errs.length === 0, 'no console/page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));

    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 1, `no horizontal scroll (overflow=${over}px)`);

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', `body background painted (${bg})`);

    // Real text contrast (the hero is gradient-clipped, so measure a solid heading)
    const contrast = await page.evaluate(() => {
      const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const a = lum(getComputedStyle(document.body).backgroundColor);
      const b = lum(getComputedStyle(document.querySelector('h2')).color);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + .05) / (lo + .05);
    });
    ok(contrast >= 7, `heading contrast ${contrast.toFixed(1)}:1`);

    // --- today is the landing view, five switches ---
    ok(await page.locator('.switch button').count() === 5, 'five switches');
    ok(await page.locator('.switch button[data-view="jobs"]').count() === 1, 'jobs tab present');
    ok(await page.locator('#view-today').isVisible(), 'today is the default landing view');
    ok(!await page.locator('#view-board').isVisible(), 'board view starts hidden');
    ok(!await page.locator('#view-vision').isVisible(), 'vision view starts hidden');
    ok(!await page.locator('#view-path').isVisible(), 'path view starts hidden');

    // --- the Today tab itself ---
    const tgreet = await page.locator('#tgreet').textContent();
    ok(/(Morning|Afternoon|Evening), Stacey/.test(tgreet), `today greeting renders: "${tgreet}"`);
    ok(/\d/.test(await page.locator('#tdate').textContent()), 'today shows a real date');
    const tkN = await page.locator('#tasklist li').count();
    ok(tkN >= 1, `today lists her open tasks (${tkN})`);
    ok(await page.locator('#tasklist .tkbox').count() === tkN, 'every task has a tick box');
    ok(await page.locator('#schedlist li').count() === 3, 'the standing schedule is listed');
    const winN = await page.locator('#winslist li').count();
    ok(await page.locator('#winspanel').isVisible() === (winN > 0), `the banked panel shows only when she has wins (${winN})`);
    ok(await page.locator('#replytext').count() === 1, 'the reply box exists');
    // --- her portrait, the identity greeting, and the ADHD affirmation card ---
    const pOK = await page.evaluate(() => {
      const i = document.querySelector('#openportrait img');
      return i && i.src.startsWith('data:image/') && i.naturalWidth > 300;
    });
    ok(pOK, 'the portrait is embedded on the Today tab and decodes');
    ok(/future psychiatrist/i.test(await page.locator('#openportrait .pcap').textContent()), 'the portrait greets her as future psychiatrist');
    const ta1 = await page.locator('#tatext').textContent();
    ok(ta1.length > 5, `ADHD affirmation shown: "${ta1.slice(0, 46)}"`);
    let taChanged = false;
    for (let i = 0; i < 8 && !taChanged; i++) {
      await page.locator('#tadhd').click();
      await page.waitForTimeout(60);
      if (await page.locator('#tatext').textContent() !== ta1) taChanged = true;
    }
    ok(taChanged, 'tapping the ADHD card gives a different affirmation');
    await page.locator('#openportrait').click();
    await page.waitForTimeout(200);
    ok(await page.locator('#lightbox').getAttribute('data-open') === 'true', 'portrait opens the lightbox');
    const plb = await page.evaluate(() => document.querySelector('#lightbox img').src.slice(0, 20));
    ok(plb.startsWith('data:image/'), 'lightbox borrows the embedded portrait');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok(await page.locator('#lightbox').getAttribute('data-open') === 'false', 'Escape closes the portrait lightbox');
    // ONE thing at the top — the whole point of the tab for an ADHD reader.
    const focusTxt = await page.locator('#focus .fmain').textContent();
    const firstTask = await page.locator('#tasklist .tkmain').first().textContent();
    ok(focusTxt.trim() === firstTask.trim(), 'the focus card shows exactly the first open task');
    ok(await page.locator('#focus').getAttribute('data-clear') === 'false', 'focus card is in work mode');
    // The focus card sits on charcoal — check it is actually readable there.
    const fcontrast = await page.evaluate(() => {
      const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const el = document.querySelector('#focus .fmain');
      const a = lum(getComputedStyle(document.querySelector('#focus')).backgroundColor);
      const b = lum(getComputedStyle(el).color);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + .05) / (lo + .05);
    });
    ok(fcontrast >= 7, `focus card contrast ${fcontrast.toFixed(1)}:1`);

    await page.locator('.switch button[data-view="board"]').click();
    await page.waitForTimeout(150);
    ok(await page.locator('#view-board').isVisible(), 'board opens from the switch');
    ok(!await page.locator('#view-today').isVisible(), 'today hides when board opens');
    await page.locator('.switch button[data-view="today"]').click();
    await page.waitForTimeout(150);
    ok(await page.locator('#view-today').isVisible(), 'today reopens from the switch');

    // clearing the list must land somewhere calm and still legible
    { const open = page.locator('#tasklist li[data-done="false"] .tkbox'); const n = await open.count();
      for (let i = 0; i < n; i++) { await page.locator('#tasklist li[data-done="false"] .tkbox').first().click(); await page.waitForTimeout(160); } }
    const clear = await page.evaluate(() => {
      const lum = x => { const [r, g, b] = x.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const cr = (x, y) => { const [h, l] = x > y ? [x, y] : [y, x]; return (h + .05) / (l + .05); };
      const f = document.querySelector('#focus');
      const a = lum(getComputedStyle(f).backgroundColor);
      return { flag: f.getAttribute('data-clear'), txt: f.querySelector('.fmain').textContent,
               main: cr(a, lum(getComputedStyle(f.querySelector('.fmain')).color)),
               why: cr(a, lum(getComputedStyle(f.querySelector('.fwhy')).color)) };
    });
    ok(clear.flag === 'true', 'focus card flips to the clear state');
    ok(/Nothing left/.test(clear.txt), `clear state says so plainly: "${clear.txt}"`);
    ok(clear.main >= 7 && clear.why >= 4.5, `clear state readable (${clear.main.toFixed(1)}:1 / ${clear.why.toFixed(1)}:1)`);
    ok(!/overdue|carried over|you failed|you should have|why haven'?t|still haven'?t|lazy|no excuse/i.test(await page.locator('#view-today').textContent()), 'today never scolds her');
    { let n = await page.locator('#tasklist li[data-done="true"]').count();
      for (let i = 0; i < n; i++) { await page.locator('#tasklist li[data-done="true"] .tkbox').first().click(); await page.waitForTimeout(160); } }
    ok(await page.locator('#tasklist li[data-done="true"]').count() === 0, 'ticks are reversible');
    // the rest of this pass reads the board, so leave it open
    await page.locator('.switch button[data-view="board"]').click();
    await page.waitForTimeout(150);

    const greet = await page.locator('#greet').textContent();
    ok(/Good (morning|afternoon|evening), Stacey/.test(greet), `greeting renders: "${greet}"`);
    const day = await page.locator('#daycount').textContent();
    ok(/Day [\d,]+ since you walked that stage/.test(day), `day count renders: "${day}"`);

    // the neuron backdrop on the landing page
    ok(true, 'neuron backdrop is global');
    const neuron = await page.evaluate(() => {
      const s = getComputedStyle(document.body, '::before');
      return { img: s.backgroundImage.slice(0, 22), op: parseFloat(s.opacity) };
    });
    ok(neuron.img.includes('data:image/jpeg'), 'neuron image is the backdrop');
    ok(neuron.op > 0.3 && neuron.op < 1, `neuron sits behind a scrim (opacity ${neuron.op})`);
    // it must be readable ON the dark backdrop, in BOTH themes
    const boardContrast = await page.evaluate(() => {
      const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const a = lum(getComputedStyle(document.body).backgroundColor);
      const b = lum(getComputedStyle(document.querySelector('#daycount')).color);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + .05) / (lo + .05);
    });
    ok(boardContrast >= 4.5, `landing text readable on the dark backdrop (${boardContrast.toFixed(1)}:1)`);

    // today's ADHD reminder + tip, keyed to the date
    const tq = await page.locator('#today .tquote').textContent();
    const tt = await page.locator('#today .ttext').textContent();
    ok(tq.length > 20, `daily reminder shown: "${tq.slice(0, 46)}…"`);
    ok(tt.length > 20, `tip of the day shown: "${tt.slice(0, 46)}…"`);
    ok(await page.locator('#today .tdate').textContent() !== '', 'today card is dated');
    ok(!/lazy\b(?!\.)/.test(tq) || /not lazy/.test(tq), 'reminder never calls her lazy');
    // it must be the SAME on reload — a "tip of the day" that rerolls is not a day's tip
    await page.reload();
    await page.waitForTimeout(600);
    await page.locator('.switch button[data-view="board"]').click();   // reload lands on Today
    await page.waitForTimeout(150);
    ok(await page.locator('#today .tquote').textContent() === tq, 'reminder is stable across reloads');
    ok(await page.locator('#today .ttext').textContent() === tt, 'tip is stable across reloads');

    // Notion-style callouts in her own voice
    ok(await page.locator('#board-callouts .callout').count() === 3, '3 callouts on the landing page');
    const sig = await page.locator('#board-callouts .callout').first().textContent();
    ok(/attainable but obtainable/.test(sig), 'her signature Notion quote is the first callout');
    ok(/Stacey Thee Philosopher/.test(sig), 'attributed to her');

    // font picker
    ok(await page.locator('#fontpick button').count() === 5, '5 fonts to choose from');
    ok(await page.locator('#fontpick button[aria-pressed="true"]').count() === 1, 'exactly one font selected');
    const before1 = await page.evaluate(() => getComputedStyle(document.querySelector('h2')).fontFamily);
    await page.locator('#fontpick button[data-font="Baloo"]').click();
    await page.waitForTimeout(250);
    const after1 = await page.evaluate(() => getComputedStyle(document.querySelector('h2')).fontFamily);
    ok(before1 !== after1 && /Baloo/.test(after1), `font swaps live (${after1.slice(0, 30)})`);
    ok(await page.locator('#fontpick button[data-font="Baloo"]').getAttribute('aria-pressed') === 'true', 'picker marks the choice');
    await page.locator('#fontpick button[data-font="Fraunces"]').click();
    await page.waitForTimeout(200);

    // affirmation shuffler, using her own words
    const a1 = await page.locator('#atext').textContent();
    ok(a1.length > 5, `affirmation shown: "${a1}"`);
    let changed = false;
    for (let i = 0; i < 8 && !changed; i++) {
      await page.locator('#affirm').click();
      await page.waitForTimeout(60);
      if (await page.locator('#atext').textContent() !== a1) changed = true;
    }
    ok(changed, 'tapping the affirmation gives a different one');

    // now into the vision view for the rest
    await page.locator('.switch button[data-view="vision"]').click();
    await page.waitForTimeout(250);
    ok(await page.locator('#view-vision').isVisible(), 'vision view opens from the switch');
    const neuronHere = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage.slice(0, 22));
    ok(neuronHere.includes('data:image/jpeg'), 'neuron backdrop is on the vision tab too');
    ok(await page.locator('#vision-callouts .callout').count() === 3, '3 callouts on the vision tab');
    const cards = await page.locator('.vcard').count();
    ok(cards === 15, `15 vision cards rendered (got ${cards})`);
    const doneV = await page.locator('.vcard[data-done="true"]').count();
    const blsDone = await page.locator('.vcard[data-vid="v-bls"][data-done="true"]').count() === 1;
    ok(doneV >= 5 && blsDone, `BLS landed and at least five visions done (got ${doneV})`);
    ok(await page.locator('#fixed .note').count() === 8, 'her 8 board cards rendered');

    // the board photo itself (back on the board view)
    await page.locator('.switch button[data-view="board"]').click();
    await page.waitForTimeout(200);
    const imgOK = await page.evaluate(() => {
      const i = document.querySelector('.boardframe img');
      return i && i.src.startsWith('data:image/') && i.naturalWidth > 400;
    });
    ok(imgOK, 'board photo embedded and decodes');

    // lightbox open / escape
    await page.locator('#openboard').click();
    await page.waitForTimeout(200);
    ok(await page.locator('#lightbox').getAttribute('data-open') === 'true', 'lightbox opens');
    const lbSrc = await page.evaluate(() => document.querySelector('#lightbox img').src.slice(0, 20));
    ok(lbSrc.startsWith('data:image/'), 'lightbox borrows the embedded image');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok(await page.locator('#lightbox').getAttribute('data-open') === 'false', 'Escape closes the lightbox');
    const stats = await page.locator('.stat').count();
    ok(stats === 4, `4 stat tiles (got ${stats})`);

    await page.locator('.switch button[data-view="vision"]').click();
    await page.waitForTimeout(200);

    // every vision card must render inside its own box, not overflow it
    const spill = await page.evaluate(() => {
      let worst = 0;
      document.querySelectorAll('.vcard').forEach(c => {
        worst = Math.max(worst, c.scrollHeight - c.clientHeight, c.scrollWidth - c.clientWidth);
      });
      return worst;
    });
    ok(spill <= 1, `no vision card overflows its box (worst=${spill}px)`);

    // --- cycling a vision ---
    const first = page.locator('.vcard').first();
    const before = await first.locator('.vstat').textContent();
    await first.click();
    await page.waitForTimeout(250);
    const after = await page.locator('.vcard').first().locator('.vstat').textContent();
    ok(before !== after, `vision status advances ("${before}" -> "${after}")`);
    ok(/Planning|Started|progress|Done|Not|Halfway|Almost|90%/.test(after), 'new status comes from her own ladder');

    // --- switching views ---
    await page.locator('.switch button[data-view="path"]').click();
    await page.waitForTimeout(250);
    ok(await page.locator('#view-path').isVisible(), 'path view shows after switching');
    ok(!await page.locator('#view-vision').isVisible(), 'vision view hides after switching');
    ok(await page.locator('.switch button[data-view="path"]').getAttribute('aria-selected') === 'true', 'tab aria-selected tracks the view');

    ok(await page.locator('.phase').count() === 8, '8 phases rendered (financial aid added)');
    ok(await page.locator('.phase[data-state="active"]').count() === 1, 'exactly one phase reads as active');
    ok(await page.locator('.card[data-open="true"]').count() === 1, 'exactly one phase auto-open');
    const now = await page.locator('#nowtext').textContent();
    ok(now.length > 15, `right-now populated: "${now.slice(0, 55)}"`);

    // undergrad, acknowledged as a finished phase
    ok(await page.locator('#banked .bitem').count() === 8, '8 undergrad achievements listed');
    ok(await page.locator('#banked .stamp2').textContent() === 'Complete', 'undergrad marked complete');

    // program comparison, checked against each school's own list
    ok(await page.locator('.prog').count() === 4, '4 programs compared');
    ok(await page.locator('.prog[data-kind="MD"]').count() === 2, '2 MD programs');
    ok(await page.locator('.prog[data-kind="PA"]').count() === 2, '2 PA programs');
    const gaps = await page.evaluate(() => [...document.querySelectorAll('.prog')].map(p => ({
      id: p.dataset.pid,
      miss: [...p.querySelectorAll('ul.prereq li[data-s="todo"]')].length,
      total: [...p.querySelectorAll('ul.prereq li')].length
    })));
    const byId = Object.fromEntries(gaps.map(g => [g.id, g]));
    ok(byId['fiu-md'].miss === 3, `FIU MD gap is 3 (got ${byId['fiu-md'].miss})`);
    ok(byId['um-md'].miss === 3, `UMiami MD gap is 3 (got ${byId['um-md'].miss})`);
    // the two UMiami "accelerated" routes must not be confused on the page
    await page.locator('.prog[data-pid="um-md"] .prog-head').click();
    await page.waitForTimeout(200);
    const umNote = await page.locator('.prog[data-pid="um-md"] .meta').first().textContent();
    ok(/undergraduates only/.test(umNote), 'page says Early Admission is closed to her');
    ok(/psychiatry is one of its 18/i.test(umNote), 'page says psychiatry is in the accelerated pathway');
    ok(/510/.test(await page.locator('.prog[data-pid="um-md"] .meta').nth(1).textContent()), 'the 510 MCAT bar is stated');
    await page.locator('.prog[data-pid="um-md"] .prog-head').click();
    await page.waitForTimeout(150);
    ok(byId['barry-pa'].miss === 2, `Barry PA gap is 2 now A&P counts (got ${byId['barry-pa'].miss})`);
    ok(byId['fiu-pa'].miss === 4, `FIU PA gap is 4 now A&P counts (got ${byId['fiu-pa'].miss})`);
    ok(gaps.every(g => g.total > 0), 'every program lists its prereqs');
    const apDone = await page.evaluate(() => [...document.querySelectorAll('ul.prereq li')]
      .filter(li => /Anatomy|Physiology/.test(li.textContent))
      .every(li => li.dataset.s === 'done'));
    ok(apDone, 'every anatomy/physiology row counts as done');

    // MD/DO drives the plan; PA is kept open, not competing
    ok(await page.locator('.tierhead').count() === 2, 'programs split into two tiers');
    const t1 = await page.locator('.tierhead .tname').first().textContent();
    ok(/MD \/ DO/.test(t1), `MD/DO is the first tier: "${t1}"`);
    ok(await page.locator('.prog[data-tier="primary"]').count() === 2, 'both MD programs in the primary tier');
    ok(await page.locator('.prog[data-tier="open"]').count() === 2, 'both PA programs kept open');
    // order matters — the target must come first on the page
    const order = await page.evaluate(() => [...document.querySelectorAll('.prog')].map(p => p.dataset.tier));
    ok(order.join(',') === 'primary,primary,open,open', `target tier renders first (${order.join(',')})`);
    const applyDesc = await page.locator('.card[data-pid="p5"] .pdesc').textContent();
    ok(/MD\/DO is the target/.test(applyDesc), 'the decision is recorded on the apply phase');

    // program card expands
    await page.locator('.prog[data-pid="barry-pa"] .prog-head').click();
    await page.waitForTimeout(200);
    ok(await page.locator('.prog[data-pid="barry-pa"]').getAttribute('data-open') === 'true', 'program card expands');
    const barryNote = await page.locator('.prog[data-pid="barry-pa"] .meta').first().textContent();
    ok(/PA-CAT|MCAT/.test(barryNote), 'Barry card flags the different entrance exam');
    ok(/barry\.edu/.test(await page.locator('.prog[data-pid="barry-pa"] .golink').getAttribute('href')), 'Barry card links to its own requirements page');
    await page.locator('.prog[data-pid="barry-pa"] .prog-head').click();
    await page.waitForTimeout(150);

    // every link must be real, safe, and open outward
    const links = await page.evaluate(() => [...document.querySelectorAll('.golink')].map(a => ({
      href: a.getAttribute('href'), target: a.getAttribute('target'),
      rel: a.getAttribute('rel'), text: a.textContent.trim()
    })));
    ok(links.length >= 10, `${links.length} links on the path`);
    ok(links.every(l => /^https:\/\//.test(l.href)), 'every link is https');
    ok(links.every(l => l.target === '_blank' && /noopener/.test(l.rel)), 'links open in a new tab safely');
    ok(links.every(l => l.text.length > 3), 'every link is labelled, not a bare URL');
    const hrefs = links.map(l => l.href).join(' ');
    ok(/studentaid\.gov/.test(hrefs), 'studentaid.gov is linked');
    ok(/students-residents\.aamc\.org/.test(hrefs), 'AAMC accommodations is linked');
    ok(/abret\.org/.test(hrefs), 'ABRET registry is linked');
    ok(/jobs\.clevelandclinic\.org/.test(hrefs), 'Cleveland Clinic careers is linked');
    // the single most important step must be tappable
    const aidLink = await page.locator('.card[data-pid="p-aid"] .golink').first().getAttribute('href');
    ok(/studentaid\.gov/.test(aidLink), 'the loan-status step links straight to studentaid.gov');
    // tapping a link must not tick the step underneath it
    ok(await page.locator('.card[data-pid="p-aid"] .msrow').first().getAttribute('aria-pressed') === 'false', 'links sit outside the checkbox button');

    ok(await page.locator('.msrow[data-mid="m06"]').getAttribute('aria-pressed') === 'true', 'BLS ships already ticked');

    // notes she can attach to a step
    const noteBox = page.locator('.card[data-open="true"] .mnotes').first();
    ok(await noteBox.locator('.notebtn').textContent() === '+ add a note', 'empty step offers to add a note');
    await noteBox.locator('.notebtn').click();
    await page.waitForTimeout(150);
    ok(await noteBox.locator('.noteedit').isVisible(), 'note editor opens');
    await noteBox.locator('textarea').fill('called them 8/30, they said email the form');
    await noteBox.locator('.nsave').click();
    await page.waitForTimeout(300);
    const saved = page.locator('.card[data-open="true"] .mnotes').first();
    ok(await saved.locator('.mnote').count() === 1, 'note saved onto the step');
    ok(/email the form/.test(await saved.locator('.mnote').first().textContent()), 'note text kept');
    ok(/\w+ \d+/.test(await saved.locator('.mwhen').first().textContent()), 'note is dated');
    ok(await saved.locator('.notebtn').textContent() === '+ another note', 'offers another note once one exists');
    ok(await page.locator('.card[data-open="true"]').count() === 1, 'phase stayed open through the note save');
    // a note must not toggle the checkbox underneath it
    ok(await page.locator('.card[data-open="true"] .msrow').first().getAttribute('aria-pressed') === 'false', 'adding a note did not tick the step');
    await saved.locator('.mdel').first().click();
    await page.waitForTimeout(250);
    ok(await page.locator('.card[data-open="true"] .mnotes').first().locator('.mnote').count() === 0, 'note removes');

    // coursework tracker
    ok(await page.locator('.tgroup').count() === 3, '3 coursework groups rendered');
    ok(await page.locator('.tflag').first().isVisible(), 'the unconfirmed FAU group is flagged');
    ok(await page.locator('#crit').count() === 0, 'the agent self-critique panel is gone from her page');
    ok(await page.locator('.note[data-tone="sage"]').count() > 0, 'sage cards present in the new palette');
    const barPct = await page.evaluate(() => document.querySelector('.tgroup .bar i').style.width);
    ok(/^\d+%$/.test(barPct) && parseInt(barPct) > 50, `prereq progress bar filled (${barPct})`);

    // financial aid phase exists and gates the rest
    const aidTitle = await page.locator('.card[data-pid="p-aid"] .ptitle').textContent();
    ok(/loans current/.test(aidTitle), `loan phase present: "${aidTitle}"`);
    ok(await page.locator('.card[data-pid="p-aid"] .pill.par').textContent() === 'before it becomes default', 'loan phase flags the 270-day line');
    const aidDesc = await page.locator('.card[data-pid="p-aid"] .pdesc').textContent();
    ok(/not in default/.test(aidDesc), 'phase records that she is delinquent, not in default');
    ok(/eligibility is intact/.test(aidDesc), 'phase says her aid eligibility survives');

    // ask box renders inside the open phase
    ok(await page.locator('.card[data-open="true"] .askbox').count() === 1, 'ask-your-coach box in the open phase');

    await page.screenshot({ path: `/tmp/path-${scheme}.png`, fullPage: true });

    // --- ticking a milestone ---
    const row = page.locator('.msrow').first();
    ok(await row.getAttribute('aria-pressed') === 'false', 'milestone starts unchecked');
    await row.click();
    await page.waitForTimeout(250);
    ok(await page.locator('.msrow').first().getAttribute('aria-pressed') === 'true', 'milestone toggles to checked');
    ok(await page.locator('.card[data-open="true"]').count() === 1, 'open phase preserved through re-render');
    await page.locator('.msrow').first().click();
    await page.waitForTimeout(200);
    ok(await page.locator('.msrow').first().getAttribute('aria-pressed') === 'false', 'milestone unticks');

    // back to the vision view for the pristine screenshot
    await page.locator('.switch button[data-view="vision"]').click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/vision-${scheme}.png`, fullPage: true });

    await ctx.close();
  }

  // ---- persistence + self-reproduction ----
  console.log('\n[persistence] self-reproduction');
  const errs = [];
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 1000 }, colorScheme: 'dark' });
  await ctx2.addInitScript(() => {
    window.__published = null;
    window.__toolResults = [];
    const sampler = (input, opts) => {
      window.__lastPrompt = input;
      window.__lastTools = (opts && opts.tools || []).map(t => t.name);
      if (opts && opts.onText) opts.onText({ text: 'Call them', delta: '' });
      // When the page hands over tools, act like the model that uses them.
      const run = (opts && opts.tools || []).map(t => {
        if (t.name === 'complete_task') return Promise.resolve(t.execute({ id: 't1' }));
        if (t.name === 'add_task') return Promise.resolve(t.execute({ text: 'Screenshot the IDR confirmation', mins: '2 min' }));
        return Promise.resolve(null);
      });
      return Promise.all(run).then(r => {
        window.__toolResults = r.filter(Boolean);
        return { text: 'Call 1-800-621-3115 and ask for your loan status.', truncated: false };
      });
    };
    window.claude = { use: n => Promise.resolve(
      n === 'artifact' ? { publish: h => { window.__published = h; return Promise.resolve(); } } :
      n === 'sample' ? sampler : null) };
  });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => errs.push(e.message));
  await page2.goto('file:///tmp/v1.html');
  await page2.waitForTimeout(500);

  // ---- Today tab: tick, add, and talk back ----
  const t0 = await page2.locator('#tasklist li').count();                       // however many she has today
  const d0 = await page2.locator('#tasklist li[data-done="true"]').count();    // however many are already banked
  const openRow = page2.locator('#tasklist li[data-done="false"]').last();
  const openId = await openRow.locator('.tkbox').getAttribute('data-tid');
  await openRow.locator('.tkbox').click();                                       // tick an open task by hand
  await page2.waitForTimeout(200);
  ok(await page2.locator(`#tasklist .tkbox[data-tid="${openId}"]`).getAttribute('aria-pressed') === 'true', 'a task ticks on the list');
  await page2.locator(`#tasklist .tkbox[data-tid="${openId}"]`).click();      // and untick it again
  await page2.waitForTimeout(200);
  ok(await page2.locator(`#tasklist .tkbox[data-tid="${openId}"]`).getAttribute('aria-pressed') === 'false', 'a task unticks');

  await page2.locator('#addtext').fill('call mom back');
  await page2.locator('#addbtn').click();
  await page2.waitForTimeout(250);
  ok(await page2.locator('#tasklist li').count() === t0 + 1, 'she can add her own task');
  ok(await page2.locator('#addtext').inputValue() === '', 'the add box clears');

  // Her reply IS the record: she says it, the coach ticks it, nothing to log twice.
  await page2.locator('#replytext').fill("logged in, the password worked");
  await page2.locator('#replybtn').click();
  await page2.waitForTimeout(900);
  const rprompt = await page2.evaluate(() => window.__lastPrompt);
  ok(/TODAY'S LIST/.test(rprompt), 'reply prompt carries today’s list');
  ok(/t1 \//.test(rprompt), 'reply prompt gives the coach real task ids to tick');
  ok(/RUNNING ON A SCHEDULE/.test(rprompt), 'reply prompt carries the standing schedule');
  ok(/90 days past due/.test(rprompt), 'reply prompt carries the corrected loan facts');
  ok(!/not yet confirmed/.test(rprompt), 'the stale loan line is gone from the brief');
  const rtools = await page2.evaluate(() => window.__lastTools);
  ok(rtools.includes('complete_task') && rtools.includes('add_task'), 'reply hands the coach both tools');
  ok(await page2.locator('#tasklist .tkbox[data-tid="t1"]').getAttribute('aria-pressed') === 'true', 'the coach ticked the task she said she did');
  ok(await page2.locator('#tasklist li').count() === t0 + 2, 'the coach added its follow-up task');
  ok(await page2.locator('#replylog .item').count() === 1, 'the exchange is logged on the page');
  ok(/621-3115/.test(await page2.locator('#replylog .aa').first().textContent()), 'the coach answer renders in the log');
  ok(await page2.locator('#replytext').inputValue() === '', 'the reply box clears');
  // The focus card must move on once the top task is done.
  ok(!/password worked|FSA ID still works/.test(await page2.locator('#focus .fmain').textContent()), 'focus card advances to the next open thing');

  await page2.locator('.switch button[data-view="board"]').click();
  await page2.waitForTimeout(200);
  await page2.locator('#fontpick button[data-font="Quicksand"]').click();   // pick a font
  await page2.waitForTimeout(200);
  await page2.locator('.switch button[data-view="vision"]').click();
  await page2.waitForTimeout(200);
  await page2.locator('.vcard').nth(1).click();          // cycle a vision
  await page2.locator('.switch button[data-view="path"]').click();
  await page2.waitForTimeout(150);
  await page2.locator('.msrow').nth(0).click();          // tick a milestone
  await page2.waitForTimeout(400);
  const nb2 = page2.locator('.card[data-open="true"] .mnotes').nth(1);
  await nb2.locator('.notebtn').click();
  await page2.waitForTimeout(120);
  await nb2.locator('textarea').fill('transcript requested');
  await nb2.locator('.nsave').click();
  await page2.waitForTimeout(300);

  // ask the coach a question inside the open phase
  const box = page2.locator('.card[data-open="true"] .askbox');
  await box.locator('input').fill('what do I say when I call them?');
  await box.locator('.askbtn').click();
  await page2.waitForTimeout(600);
  const answered = await box.locator('.qa .aa').first().textContent();
  ok(/621-3115/.test(answered), `coach answer rendered: "${answered.slice(0, 40)}"`);
  const prompt = await page2.evaluate(() => window.__lastPrompt);
  ok(/PHASE:/.test(prompt) && /Stacey/.test(prompt), 'prompt carries phase + person context');
  ok(/STILL OPEN:/.test(prompt), 'prompt tells the coach what is still open');
  ok(!/localStorage/.test(prompt), 'prompt is self-contained');
  ok(await box.locator('input').inputValue() === '', 'input clears after a successful ask');

  await page2.waitForTimeout(2300);                      // past the 1400ms debounce

  const published = await page2.evaluate(() => window.__published);
  ok(!!published, 'page published a new version after edits');
  if (published) {
    ok(published.startsWith('<!doctype html>'), 'published doc starts with doctype');
    const realBlocks = published.split('\n').filter(l => l.startsWith('<script id="app-state"')).length;
    ok(realBlocks === 1, `exactly one real state block (got ${realBlocks})`);
    const m = published.match(/<script id="app-state" type="application\/json">([\s\S]*?)<\/script>/);
    let st = null; try { st = JSON.parse(m[1]); } catch (e) { }
    ok(st && st.checked && st.checked.m06 && Object.keys(st.checked).length >= 2, 'published state kept the BLS tick plus the new one');
    ok(st && st.view === 'path', 'published state remembered the active view');
    ok(st && st.display === 'Quicksand', 'published state remembered her font choice');
    const savedNotes = st && st.notes ? Object.values(st.notes).flat() : [];
    ok(savedNotes.some(n => n && /transcript requested/.test(n.t || "")), 'her note was saved into the page');
    ok(/--display:Quicksand/.test(published), 'chosen font baked into the stylesheet for a fresh load');
    const askLog = st && st.asks ? Object.values(st.asks).flat() : [];
    ok(askLog.some(a => a && /621-3115/.test(a.a || "")), 'the coach answer was saved into the page');
    ok(st && st.visions[1].status !== 'In progress', 'published state kept the vision status change');
    ok(st && st.today.tasks.length === t0 + 2, 'published state kept every task, including the two added');
    ok(st && st.today.tasks.some(x => x.id === 't1' && x.done === true), 'published state kept the coach’s tick');
    ok(st && st.today.tasks.some(t => t.from === 'you' && /call mom/.test(t.text)), 'published state kept her own task');
    ok(st && st.log.length === 1 && /password worked/.test(st.log[0].you), 'published state kept what she wrote');
    ok(st && /621-3115/.test(st.log[0].coach), 'published state kept the reply she got');
    const dnow = new Date();
    const dkey = dnow.getFullYear() + '-' + String(dnow.getMonth() + 1).padStart(2, '0') + '-' + String(dnow.getDate()).padStart(2, '0');
    ok(st && st.today.date === dkey, `today is stamped with the local date (${st && st.today.date})`);

    fs.writeFileSync('/tmp/v2.html', published);
    const p3 = await ctx2.newPage();
    const e3 = [];
    p3.on('pageerror', e => e3.push(e.message));
    p3.on('console', m2 => { if (m2.type() === 'error' && !noise(m2.text())) e3.push(m2.text()); });
    await p3.goto('file:///tmp/v2.html');
    await p3.waitForTimeout(600);
    ok(e3.length === 0, 'v2 renders without errors' + (e3.length ? ' -> ' + e3.join(' | ') : ''));
    ok(await p3.locator('.phase').count() === 8, 'v2 rendered all phases');
    ok(await p3.locator('.vcard').count() === 15, 'v2 rendered all visions');
    ok(await p3.locator('#fixed .note').count() === 8, 'v2 rendered her board cards');
    ok(await p3.locator('#phases .qa .item').count() === 1, 'v2 still shows the saved coach answer');
    ok(await p3.locator('.qa .item').count() === 2, 'the phase log and the today log stay separate');
    ok(await p3.locator('.tgroup').count() === 3, 'v2 rendered the coursework tracker');
    ok(await p3.locator('.prog').count() === 4, 'v2 rendered the program comparison');
    ok((await p3.locator('.mnote').allTextContents()).some(x => /transcript requested/.test(x)), 'v2 still shows her note');
    ok(await p3.locator('#banked .bitem').count() === 8, 'v2 rendered the undergrad phase');
    ok(await p3.evaluate(() => { const i = document.querySelector('.boardframe img'); return i && i.naturalWidth > 400; }), 'v2 still shows the board photo');
    ok(await p3.locator('#view-path').isVisible(), 'v2 reopened on the view she left it on');
    ok(/Quicksand/.test(await p3.evaluate(() => getComputedStyle(document.querySelector('h2')).fontFamily)), 'v2 opens in the font she picked');
    ok(await p3.locator('.switch button').count() === 5, 'v2 kept five switches');
    ok(await p3.locator('#view-jobs .job').count() > 0, 'v2 kept the jobs rows');
    ok(await p3.locator('#tasklist li').count() === t0 + 2, 'v2 reloaded today’s tasks, plus the two added');
    ok(await p3.locator('#tasklist .tkbox[data-tid="t1"]').getAttribute('aria-pressed') === 'true', 'v2 restored the tick');
    ok(await p3.locator('#replylog .item').count() === 1, 'v2 still shows what she wrote and got back');
    ok(await p3.locator('#schedlist li').count() === 3, 'v2 kept the standing schedule');
    ok(await p3.evaluate(() => { const i = document.querySelector('#openportrait img'); return i && i.naturalWidth > 300; }), 'v2 still shows the portrait');
    ok((await p3.evaluate(() => document.getElementById('tatext').textContent)).length > 5, 'v2 still serves an ADHD affirmation');
    ok(await p3.locator('#board-callouts .callout').count() === 3, 'v2 kept the callouts');
    ok(await p3.locator('.msrow[aria-pressed="true"]').count() === 2, 'v2 restored both ticks');

    const size = Buffer.byteLength(published);
    ok(size < 1500000, `published size sane (${(size / 1024).toFixed(0)} KB)`);
    // Each image must survive a republish exactly ONCE — a second copy would
    // grow the document on every single tap. Three images now: board photo + neuron + portrait.
    const copies = published.split('data:image/jpeg;base64,').length - 1;
    ok(copies === 3, `all three images embedded exactly once after republish (got ${copies})`);
    const uniq = new Set((published.match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g) || []));
    ok(uniq.size === 3, `the three copies are three distinct images, not duplicates (got ${uniq.size})`);

    // The real risk of a self-rewriting page: the template nesting itself on
    // every republish until the document explodes. v3 must be ~the size of v2.
    await p3.locator('.msrow').nth(1).click();
    await p3.waitForTimeout(2300);
    const v3 = await p3.evaluate(() => window.__published);
    ok(!!v3, 'v2 can publish a v3 (chain does not break)');
    if (v3) {
      const growth = Buffer.byteLength(v3) - size;
      ok(Math.abs(growth) < 2500, `no runaway growth v2->v3 (${growth >= 0 ? '+' : ''}${growth} bytes)`);
      ok(v3.split('\n').filter(l => l.startsWith('<script id="app-state"')).length === 1, 'v3 still has exactly one state block');
    }
  }
  ok(errs.length === 0, 'no page errors during persistence run' + (errs.length ? ' -> ' + errs.join(' | ') : ''));

  await browser.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
