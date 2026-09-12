const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
const SIG=(sel)=>{const r=document.querySelector(sel);if(!r)return[];const o=[];
  (function w(n,d){for(const c of n.children){o.push(d+c.tagName.toLowerCase()+(typeof c.className==='string'&&c.className?'.'+c.className.trim().split(/\s+/).join('.'):'')+(c.textContent&&c.children.length===0?'  «'+c.textContent.trim().slice(0,60)+'»':''));w(c,d+1);}})(r,0);return o;};
(async()=>{
  const b=await chromium.launch();
  const open=async f=>{const p=await b.newPage();
    await p.route('**://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await p.route('**://fonts.gstatic.com/**',r=>r.abort());
    await p.goto('file://'+path.join(__dirname,f)); await p.waitForTimeout(900); return p;};
  const A=await open('live_after_pass2.html'), B=await open('artifact.html');
  const a=await A.evaluate(SIG,'#view-today'), c=await B.evaluate(SIG,'#view-today');
  const setA=new Set(a), setC=new Set(c);
  console.log('nodes before:',a.length,' after:',c.length);
  console.log('\n--- only in BEFORE (removed) ---'); a.filter(x=>!setC.has(x)).forEach(x=>console.log('  -',x));
  console.log('\n--- only in AFTER (added) ---');   c.filter(x=>!setA.has(x)).forEach(x=>console.log('  +',x));
  await b.close();
})();
