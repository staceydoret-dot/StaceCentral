const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path=require('path'), fs=require('fs');
let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ok   '+m);} else {fail++;console.log('  FAIL '+m);} };

const STUB=()=>{
  window.__published=null;
  window.claude={ use:(n)=>{
    if(n==='artifact') return Promise.resolve({ publish:(doc)=>{ window.__published=doc; return Promise.resolve(); } });
    return Promise.resolve(null);
  }};
};

(async()=>{
  const b=await chromium.launch();
  const page=await b.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**://fonts.gstatic.com/**',r=>r.abort());
  await page.addInitScript(STUB);
  await page.goto('file://'+path.join(__dirname,'artifact.html'));
  await page.waitForTimeout(800);

  console.log('\n[1] simulate her tapping a stage, then the artifact republishing itself');
  await page.click('.switch button[data-view="path"]');
  await page.waitForTimeout(250);
  if(await page.$eval('.card[data-pid="p0"]',c=>c.getAttribute('data-open')!=='true')){
    await page.click('.card[data-pid="p0"] .card-head'); await page.waitForTimeout(300);
  }
  await page.click('.tstep[data-st="Interview"]');
  await page.waitForTimeout(2200); // past the 1400ms debounce
  const doc=await page.evaluate(()=>window.__published);
  ok(!!doc, 'the artifact self-published a new version');
  fs.writeFileSync(path.join(__dirname,'republished.html'), doc||'');
  console.log('    republished size: '+((doc||'').length/1024/1024).toFixed(2)+' MB');

  console.log('\n[2] load the republished doc as a FRESH page — the reset scenario');
  const p2=await b.newPage();
  const errs2=[]; p2.on('pageerror',e=>errs2.push(String(e)));
  p2.on('console',m=>{ if(m.type()==='error') errs2.push('console: '+m.text()); });
  await p2.route('**://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await p2.route('**://fonts.gstatic.com/**',r=>r.abort());
  await p2.addInitScript(STUB);
  await p2.goto('file://'+path.join(__dirname,'republished.html'));
  await p2.waitForTimeout(800);
  ok(errs2.length===0,'republished page loads clean'+(errs2.length?': '+errs2[0]:''));

  const s=await p2.evaluate(()=>JSON.parse(document.getElementById('app-state').textContent));
  console.log('\n[3] tracker tap data survived the republish');
  const tr=s.phases.flatMap(p=>p.milestones).filter(m=>m.track);
  ok(tr.length===1 && tr[0].id==='m02','tracked milestone still m02');
  ok(tr[0].track.stage==='Interview','her tap persisted (stage = "'+tr[0].track.stage+'"), NOT reset to a seeded default');
  ok(tr[0].track.applied==='2026-08-30','applied date preserved');

  console.log('\n[4] lanes survived the republish');
  ok(s.jobs.rows.filter(r=>r.lane).length===18,'all 18 row lanes survived');
  ok(s.pipeline.filter(p=>p.lane).length===3,'all 3 pipeline lanes survived');
  ok(s.jobs.rows.filter(r=>r.laneGuess).length===2,'row guess flags survived');
  ok(s.jobs.rows.filter(r=>r.lane==='ionm').length===2,'the new IONM lane survived');
  ok(s.jobs.rows.some(r=>r.checked&&r.checked.via==='employer'),'employer-verified flag survived');
  ok(s.pipeline.filter(p=>p.laneGuess).length===1,'pipeline guess flag survived');
  ok(!s.phases.some(p=>'lane' in p||p.milestones.some(m=>'lane' in m)),'still no lane leaked into phases');

  console.log('\n[5] lane UI still works on the republished copy');
  await p2.click('.switch button[data-view="jobs"]');
  await p2.waitForTimeout(300);
  ok(await p2.isVisible('#lanefilter'),'lane filter present after republish');
  ok(await p2.$eval('#lanefilter',d=>!d.open),'still collapsed by default');
  ok(await p2.$$eval('.lanechip',n=>n.length)===13,'13 chips after republish');
  await p2.click('#lanefilter > summary'); await p2.waitForTimeout(150);
  await p2.click('.lanechip[data-lane="sleep"]'); await p2.waitForTimeout(300);
  await p2.click('.jparked > summary').catch(()=>{}); await p2.waitForTimeout(150);
  const only=await p2.$$eval('#jrows article.job',n=>[...new Set(n.map(a=>a.getAttribute('data-lane')))]);
  ok(only.length===1&&only[0]==='sleep','filter still works after republish, got '+JSON.stringify(only));
  ok(await p2.$$eval('.lanegroup',n=>n.length)>0,'lane grouping still renders');

  console.log('\n[6] CSS survived (buildDoc rewrites the sheet)');
  ok((await p2.evaluate(()=>document.getElementById('sheet').textContent)).includes('.lanechip'),'lane CSS present in republished sheet');

  await b.close();
  console.log('\n=== '+pass+' passed, '+fail+' failed ===');
  process.exit(fail?1:0);
})();
