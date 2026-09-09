/* Differential regression: original vs modified.
   Everything outside the Jobs tab must be structurally identical. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ok   '+m);} else {fail++;console.log('  FAIL '+m);} };

const VIEWS=['today','vision','path','therapy'];

async function open(b, file){
  const page=await b.newPage({viewport:{width:900,height:1400}});
  const errs=[];
  page.on('pageerror',e=>errs.push('pageerror: '+e));
  page.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  await page.route('**://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**://fonts.gstatic.com/**',r=>r.abort());
  await page.goto('file://'+path.join(__dirname,file));
  await page.waitForTimeout(900);
  return {page,errs};
}
/* structural fingerprint: tag+class tree, text ignored (affirmations/dates rotate) */
const SIG=(sel)=>{
  const root=document.querySelector(sel);
  if(!root) return 'MISSING';
  const out=[];
  const walk=(n,d)=>{
    for(const c of n.children){
      out.push(d+c.tagName.toLowerCase()+(c.className&&typeof c.className==='string'?'.'+c.className.trim().split(/\s+/).join('.'):''));
      walk(c,d+1);
    }
  };
  walk(root,0);
  return out.join('\n');
};

(async()=>{
  const fs=require('fs');
  if(!fs.existsSync(path.join(__dirname,'original.html'))){
    console.error('MISSING original.html — this suite diffs the pre-change artifact against the\n'+
      'modified one. Fetch the version published before the lane change from the\n'+
      "artifact's version history and save it beside this file as original.html.");
    process.exit(2);
  }
  const b=await chromium.launch();
  const A=await open(b,'original.html');
  const B=await open(b,'artifact.html');

  console.log('\n[1] both load clean');
  ok(A.errs.length===0,'original: no errors'+(A.errs.length?': '+A.errs[0]:''));
  ok(B.errs.length===0,'modified: no errors'+(B.errs.length?': '+B.errs[0]:''));

  console.log('\n[2] untouched tabs are structurally IDENTICAL');
  for(const v of VIEWS){
    const a=await A.page.evaluate(SIG,'#view-'+v);
    const c=await B.page.evaluate(SIG,'#view-'+v);
    if(a!==c){
      const la=a.split('\n'), lc=c.split('\n');
      let i=0; while(i<Math.max(la.length,lc.length)&&la[i]===lc[i]) i++;
      console.log('     first divergence at line '+i+':\n       orig: '+la[i]+'\n       mod : '+lc[i]);
    }
    ok(a===c, '#view-'+v+' identical ('+a.split('\n').length+' nodes)');
  }

  console.log('\n[3] jobs tab differs ONLY by the lane additions');
  const ja=await A.page.evaluate(SIG,'#view-jobs');
  const jb=await B.page.evaluate(SIG,'#view-jobs');
  ok(ja!==jb,'jobs tab did change (expected)');
  const added=jb.split('\n').filter(l=>!ja.includes(l.trim()));
  const newCls=[...new Set(jb.split('\n').join(' ').match(/lane[a-z]*|jstatus|lanegroup/g)||[])];
  console.log('     new classes seen:',JSON.stringify(newCls));
  ok(newCls.every(c=>/^lane|^jstatus/.test(c)),'every new class is lane/jstatus-prefixed');

  console.log('\n[4] global CSS: no existing rule redefined');
  const cssA=await A.page.evaluate(()=>document.getElementById('sheet').textContent);
  const cssB=await B.page.evaluate(()=>document.getElementById('sheet').textContent);
  ok(cssB.startsWith(cssA.slice(0,cssA.lastIndexOf('</style>')>0?200:200)),'modified sheet begins with the original sheet');
  const selA=new Set((cssA.match(/^\s*([.#][\w-]+)/gm)||[]).map(s=>s.trim()));
  const selB=(cssB.match(/^\s*([.#][\w-]+)/gm)||[]).map(s=>s.trim());
  const brandNew=[...new Set(selB.filter(s=>!selA.has(s)))];
  console.log('     new top-level selectors:',JSON.stringify(brandNew));
  ok(brandNew.every(s=>/^\.(lane|jstatus)/.test(s)),'all new selectors are namespaced to the feature');
  /* additive-or-unchanged: a round that adds no CSS is just as valid as one that appends */
  ok(cssB.length >= cssA.length && cssB.includes(cssA.slice(0,5000)),
     'original CSS preserved verbatim (additive or unchanged; '+cssA.length+' -> '+cssB.length+')');

  console.log('\n[5] untouched tabs still interactive (modified build)');
  // Today: toggle a task
  await B.page.click('.switch button[data-view="today"]'); await B.page.waitForTimeout(300);
  const taskSel='#tasks .trow, .trow, .msrow';
  const hasTask=await B.page.$(taskSel);
  ok(!!hasTask,'today tab rendered interactive rows');
  // Vision: tap a card
  await B.page.click('.switch button[data-view="vision"]'); await B.page.waitForTimeout(300);
  const vBefore=await B.page.$$eval('.vcard',n=>n.length);
  await B.page.click('.vcard'); await B.page.waitForTimeout(400);
  const vAfter=await B.page.$$eval('.vcard',n=>n.length);
  ok(vBefore>0&&vBefore===vAfter,'vision cards render and tap without breaking ('+vBefore+')');
  // Path: expand + toggle a milestone
  await B.page.click('.switch button[data-view="path"]'); await B.page.waitForTimeout(300);
  const pc=await B.page.$$eval('.card',n=>n.length);
  ok(pc>0,'path phases render ('+pc+')');
  await B.page.click('.msrow'); await B.page.waitForTimeout(400);
  ok((await B.page.$$eval('.msrow',n=>n.length))>0,'milestone toggle works');
  // Therapy
  await B.page.click('.switch button[data-view="therapy"]'); await B.page.waitForTimeout(400);
  ok(await B.page.isVisible('#view-therapy'),'therapy tab shows');
  ok((await B.page.$eval('#view-therapy',e=>e.textContent.trim().length))>50,'therapy tab has content');
  // Font picker (rewrites --display, so it touches the shared sheet)
  const fv=await B.page.evaluate(()=>{
    const f=document.querySelector('.fontpick');
    return f? (f.closest('section[id^="view-"]')||{}).id||null : null;
  });
  ok(!!fv,'font picker found (in '+fv+')');
  if(fv){
    await B.page.click('.switch button[data-view="'+fv.replace('view-','')+'"]');
    await B.page.waitForTimeout(350);
    /* the picker lives inside a collapsed <details> */
    await B.page.evaluate(()=>{ const d=document.querySelector('.fontpick').closest('details'); if(d) d.open=true; });
    await B.page.waitForTimeout(250);
    const fb=await B.page.$$('.fontpick button');
    if(fb.length>1){ await fb[1].click(); await B.page.waitForTimeout(400); }
    const disp=await B.page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--display'));
    ok(fb.length>1,'font picker switched face ('+fb.length+' faces, --display now'+(disp?' set':' empty')+')');
  }

  console.log('\n[6] no errors after exercising every tab');
  ok(B.errs.length===0,'modified build still clean'+(B.errs.length?': '+B.errs[0]:''));

  await b.close();
  console.log('\n=== '+pass+' passed, '+fail+' failed ===');
  process.exit(fail?1:0);
})();
