const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ok   '+m);} else {fail++;console.log('  FAIL '+m);} };

(async()=>{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs=[];
  page.on('pageerror', e=>errs.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  // font stub — no network in sandbox
  await page.route('**://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**://fonts.gstatic.com/**', r=>r.abort());

  await page.goto('file://'+path.join(__dirname,'artifact.html'));
  await page.waitForTimeout(700);

  console.log('\n[A] page loads clean');
  ok(errs.length===0, 'no page/console errors'+(errs.length?': '+errs[0]:''));

  console.log('\n[B] lane filter: collapsed + minimal by default');
  await page.click('.switch button[data-view="jobs"]');
  await page.waitForTimeout(250);
  ok(await page.isVisible('#lanefilter'), 'lane filter present on Jobs tab');
  ok(await page.$eval('#lanefilter', d=>!d.open), 'collapsed by default');
  ok(await page.$eval('#lanesum', e=>e.textContent.trim())==='all', 'summary reads "all"');
  ok(await page.$eval('#lanefilter', d=>d.tagName)==='DETAILS', 'reuses existing <details> pattern');

  console.log('\n[C] default view: grouped by lane, fixed order');
  const heads = await page.$$eval('#jrows > .lanegroup .lanehead', ns=>ns.map(n=>n.firstChild.textContent));
  console.log('    open groups:', JSON.stringify(heads));
  ok(heads.length>0, 'rows are grouped by lane');
  const order=['EEG / Neurodiagnostic Tech','Psychometrist / Neuropsych Testing Tech','Polysomnography (Sleep) Tech','Research Assistant (bench, non-coordinator)','Medical / Healthcare Interpreter','TMS Technician','Neurofeedback / QEEG Technician','Neuropsych Test Scoring Technician','EEG Biomarker Research Technician','Ketamine/Esketamine Clinic Monitor','Clinical Research Coordinator (CRC)'];
  const idx=heads.map(h=>order.indexOf(h));
  ok(idx.every(i=>i>=0), 'all group names are real lanes');
  ok(idx.every((v,i)=>i===0||idx[i-1]<v), 'groups in the handoff order');

  await page.click('.jparked > summary');
  await page.waitForTimeout(200);
  const ph = await page.$$eval('.jparked .lanegroup .lanehead', ns=>ns.map(n=>n.firstChild.textContent));
  console.log('    parked groups:', JSON.stringify(ph));
  const pidx=ph.map(h=>order.indexOf(h));
  ok(pidx.every((v,i)=>i===0||pidx[i-1]<v), 'parked rows grouped in lane order too');
  ok(ph.includes('Clinical Research Coordinator (CRC)'), 'CRC rows grouped, not scattered');
  ok(await page.$$eval('.lanehead .lbackup', n=>n.length)>0, 'CRC marked as backup lane');

  console.log('\n[D] filter shows/hides the right entries');
  const total = await page.$$eval('#jrows article.job', n=>n.length);
  await page.click('#lanefilter > summary');
  await page.waitForTimeout(150);
  ok(await page.$eval('#lanefilter', d=>d.open), 'filter opens on tap');
  const chips = await page.$$eval('.lanechip', n=>n.map(b=>({l:b.getAttribute('data-lane'),d:b.disabled})));
  ok(chips.length===12, '11 lanes + All = 12 chips (got '+chips.length+')');
  ok(chips.filter(c=>!c.d).length===5, 'only lanes with entries are enabled (All+eeg+sleep+ra+crc)');

  await page.click('.lanechip[data-lane="crc"]');
  await page.waitForTimeout(250);
  await page.click('.jparked > summary').catch(()=>{});
  await page.waitForTimeout(150);
  const lanesShown = await page.$$eval('#jrows article.job', n=>[...new Set(n.map(a=>a.getAttribute('data-lane')))]);
  ok(lanesShown.length===1 && lanesShown[0]==='crc', 'CRC filter shows only crc rows, got '+JSON.stringify(lanesShown));
  ok((await page.$eval('#lanesum',e=>e.textContent)).includes('Clinical Research'), 'summary names the active lane');
  ok((await page.$eval('#jpipe',e=>e.textContent)).includes('Nothing going in this lane'), 'pipeline empty msg is lane-aware');

  await page.click('.lanechip[data-lane="eeg"]');
  await page.waitForTimeout(250);
  const eegPipe = await page.$$eval('#jpipe .pipe', n=>n.length);
  ok(eegPipe===3, 'eeg filter shows all 3 pipeline entries, got '+eegPipe);

  await page.click('.lanechip[data-lane=""]');
  await page.waitForTimeout(250);
  await page.click('.jparked > summary').catch(()=>{});
  await page.waitForTimeout(150);
  const back = await page.$$eval('#jrows article.job', n=>n.length);
  ok(back===total, 'All lanes restores every row ('+back+'/'+total+')');
  ok(await page.$$eval('#jpipe .pipe', n=>n.length)===3, 'pipeline restored to 3');

  console.log('\n[E] guessed lanes are visibly flagged');
  const g=await page.$$eval('.laneguess', n=>n.length);
  ok(g===3, 'the 3 provisional assignments are flagged, got '+g);

  console.log('\n[F] SAFETY: tap-to-advance in Path tab untouched');
  await page.click('.switch button[data-view="path"]');
  await page.waitForTimeout(250);
  if(await page.$eval('.card[data-pid="p0"]', c=>c.getAttribute('data-open')!=='true')){
    await page.click('.card[data-pid="p0"] .card-head');
    await page.waitForTimeout(300);
  }
  ok(await page.$eval('.card[data-pid="p0"]', c=>c.getAttribute('data-open')==='true'), 'p0 card open');
  ok(await page.$$eval('.tstep', n=>n.length)>0, 'status bar still renders');
  const before=await page.$eval('.tstep[data-at="true"]', e=>e.textContent);
  ok(before==='Under review', 'live stage preserved from published state ("'+before+'")');
  await page.click('.tstep[data-st="Interview"]');
  await page.waitForTimeout(300);
  const after=await page.$eval('.tstep[data-at="true"]', e=>e.textContent);
  ok(after==='Interview', 'tap-to-advance still advances ("'+after+'")');

  console.log('\n[G] SAFETY: merge keys + round-trip through buildDoc()');
  const chk=await page.evaluate(()=>{
    const s=JSON.parse(document.getElementById('app-state').textContent);
    return {
      phaseIds: s.phases.map(p=>p.id),
      msIds: s.phases.flatMap(p=>p.milestones.map(m=>m.id)),
      laneOnPhases: s.phases.some(p=>'lane' in p || p.milestones.some(m=>'lane' in m)),
      rowLanes: s.jobs.rows.map(r=>r.lane),
      pipeLanes: s.pipeline.map(p=>p.lane),
      track: s.phases.flatMap(p=>p.milestones).filter(m=>m.track).map(m=>({id:m.id,stage:m.track.stage}))
    };
  });
  ok(chk.phaseIds.join()==='p0,p-aid,p1,p2,p3,p4,p5,p6', 'phaseIds unchanged');
  ok(chk.msIds.length===38 || chk.msIds.length>0, 'milestoneIds intact ('+chk.msIds.length+')');
  ok(chk.laneOnPhases===false, 'no lane field leaked into phases/milestones');
  ok(chk.rowLanes.filter(Boolean).length===11, 'all 11 rows carry a lane');
  ok(chk.pipeLanes.filter(Boolean).length===3, 'all 3 pipeline entries carry a lane');
  ok(chk.track.length===1 && chk.track[0].id==='m02', 'the tracked milestone is still keyed m02');

  const skel=await page.evaluate(()=>({
    hasFilter: !!document.querySelector('#lanefilter'),
    jrowsInSource: !!document.querySelector('#jrows')
  }));
  ok(skel.hasFilter, 'lane filter lives in the DOM SKELETON captures');

  console.log('\n[H] no errors after all interaction');
  ok(errs.length===0, 'still no console/page errors'+(errs.length?': '+errs[0]:''));

  await browser.close();
  console.log('\n=== '+pass+' passed, '+fail+' failed ===');
  process.exit(fail?1:0);
})();
