const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
const SIG=(sel)=>{const r=document.querySelector(sel);if(!r)return'MISSING';const o=[];
  (function w(n,d){for(const c of n.children){o.push(d+c.tagName.toLowerCase()+(typeof c.className==='string'&&c.className?'.'+c.className.trim().split(/\s+/).join('.'):''));w(c,d+1);}})(r,0);return o.join('\n');};
(async()=>{
  const b=await chromium.launch(); let pass=0,fail=0;
  const open=async f=>{const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.route('**://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await p.route('**://fonts.gstatic.com/**',r=>r.abort());
    await p.goto('file://'+path.join(__dirname,f)); await p.waitForTimeout(900); return {p,errs};};
  const A=await open('live_after_pass2.html'), B=await open('artifact.html');
  const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
  ok(B.errs.length===0,'repaired page loads clean'+(B.errs.length?': '+B.errs[0]:''));
  for(const v of ['today','jobs','vision','path','therapy']){
    const x=await A.p.evaluate(SIG,'#view-'+v), y=await B.p.evaluate(SIG,'#view-'+v);
    ok(x===y,'#view-'+v+' structure identical to her current live state ('+y.split('\n').length+' nodes)');
  }
  // the thing that was broken: is the page actually styled now?
  const styled=await B.p.evaluate(()=>{const s=getComputedStyle(document.querySelector('.switch'));return s.position==='sticky'&&s.display==='flex';});
  const unstyled=await A.p.evaluate(()=>{const s=getComputedStyle(document.querySelector('.switch'));return s.position==='sticky'&&s.display==='flex';});
  ok(styled,'repaired: .switch is styled (sticky flex)');
  ok(!unstyled,'live-before-repair: .switch is NOT styled — confirms the page really was broken');
  ok(await B.p.evaluate(()=>!!document.getElementById('sheet')&&document.getElementById('sheet').textContent.includes('.lanechip{')),'repaired: #sheet element present with lane rules');
  await b.close(); console.log('\n=== '+pass+' passed, '+fail+' failed ==='); process.exit(fail?1:0);
})();
