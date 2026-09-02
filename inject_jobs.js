/* Adds a Jobs view to the plan page: nav button, section, styles, renderer,
   and two new state keys. `jobs` is content (the daily sweep rewrites it);
   `pipeline` is hers (applications she is tracking) and must survive a
   republish, so merge_state.js carries it in FROM_LIVE. */
const fs = require('fs');
const [,, IN, OUT] = process.argv;
let h = fs.readFileSync(IN, 'utf8');

const at = (needle) => {
  const n = h.split(needle).length - 1;
  if (n !== 1) throw new Error(`anchor "${needle.slice(0,60)}" found ${n} times, need exactly 1`);
  return true;
};

/* 1 — nav button, second position: Today | Jobs | Board | Vision | Path */
const NAV = '<button type="button" role="tab" data-view="board" aria-selected="false">Board</button>';
at(NAV);
h = h.replace(NAV,
  '<button type="button" role="tab" data-view="jobs" aria-selected="false">Jobs</button>' + NAV);

/* 2 — the section itself, ahead of the board view */
const SEC = '<section id="view-board"';
at(SEC);
h = h.replace(SEC,
  '<section id="view-jobs" hidden>' +
    '<header class="hero">' +
      '<p class="greet">The way in</p>' +
      '<p class="name serif">Jobs</p>' +
      '<p class="role" id="jdate"></p>' +
      '<div class="rule"></div>' +
    '</header>' +
    '<p class="jnote" id="jnote"></p>' +
    '<div id="jrows"></div>' +
    '<h3 class="jhead">What you have going</h3>' +
    '<p class="jsub">Yours to move. Nothing here changes on its own.</p>' +
    '<div id="jpipe"></div>' +
  '</section>' + SEC);

/* 3 — styles, in the page's own tokens */
const ENDSHEET = '</style>';
const CSS = `
.jnote{margin:0 0 18px;color:var(--ink-2);font-size:14.5px;line-height:1.55}
.jhead{font-family:var(--display);font-size:19px;margin:34px 0 4px;color:var(--ink)}
.jsub{margin:0 0 14px;color:var(--ink-3);font-size:13px}
.jsect{font-family:var(--display);font-size:15.5px;margin:26px 0 10px;color:var(--ink-2);
  letter-spacing:.01em}
.jsect:first-child{margin-top:0}
.job{background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:16px 17px;margin:0 0 12px;box-shadow:var(--shadow)}
.job[data-s="blocked"]{background:var(--panel-2)}
.job[data-s="gated"]{background:transparent;box-shadow:none;padding:11px 14px}
.job .jr{font-family:var(--display);font-size:16.5px;line-height:1.3;color:var(--ink);margin:0}
.job .je{color:var(--ink-2);font-size:13.5px;margin:3px 0 0}
.job .jw{color:var(--ink-3);font-size:12.5px;margin:1px 0 0}
.job .jwhy{color:var(--ink);font-size:14px;line-height:1.55;margin:11px 0 0}
.job .jgate{color:var(--ink-3);font-size:12.5px;line-height:1.5;margin:9px 0 0;
  padding-left:10px;border-left:2px solid var(--line-2)}
.jchips{display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 0}
.jchip{font-size:11.5px;letter-spacing:.02em;padding:3px 9px;border-radius:999px;
  background:var(--panel-2);color:var(--ink-2);border:1px solid var(--line)}
.jchip[data-k="key"]{background:var(--sage-bg);color:var(--sage-ink);border-color:var(--sage-edge)}
.jchip[data-k="wait"]{background:var(--kraft-bg);color:var(--kraft-ink);border-color:var(--kraft-edge)}
.jgo{display:inline-block;margin:13px 0 0;font-size:13.5px;font-weight:600;
  color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-bright);padding-bottom:1px}
.jcontact{margin:10px 0 0;font-size:13px;color:var(--ink-2)}
.jcontact b{color:var(--ink);font-weight:600}
.jopen{margin:9px 0 0;font-size:12.5px;color:var(--ink-3)}
.pipe{background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:13px 15px;margin:0 0 10px}
.pipe .pr{font-family:var(--display);font-size:15px;color:var(--ink);margin:0}
.pipe .pe{color:var(--ink-3);font-size:12.5px;margin:2px 0 0}
.pstage{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 0}
.pstage span{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);
  color:var(--ink-3);background:transparent}
.pstage span[data-on="1"]{background:var(--blush-bg);color:var(--blush-ink);
  border-color:var(--blush-edge);font-weight:600}
.pempty{color:var(--ink-3);font-size:13.5px;line-height:1.55;margin:0;padding:14px 0}
`;
at(ENDSHEET);
h = h.replace(ENDSHEET, CSS + ENDSHEET);

/* 4 — setView: allow the new view and toggle it */
const SV = 'if(v!=="board"&&v!=="vision"&&v!=="path"&&v!=="today") v="today";';
at(SV);
h = h.replace(SV, 'if(v!=="board"&&v!=="vision"&&v!=="path"&&v!=="today"&&v!=="jobs") v="today";');

const HID = 'document.getElementById("view-board").hidden=(v!=="board");';
at(HID);
h = h.replace(HID, HID + '\n    document.getElementById("view-jobs").hidden=(v!=="jobs");');

/* 5 — renderer, in the file's own idiom */
const ANCHOR = '  function renderTrack(){';
at(ANCHOR);
const FN = `  function renderJobs(){
    var J=STATE.jobs;
    if(!J) return;
    document.getElementById("jdate").textContent=J.updated?("Swept "+J.updated):"";
    document.getElementById("jnote").textContent=J.note||"";
    var rows=J.rows||[];
    var groups=[
      {s:"open",   h:"Open to you now"},
      {s:"blocked",h:"Yours in November"},
      {s:"gated",  h:"Needs a credential first"}
    ];
    document.getElementById("jrows").innerHTML=groups.map(function(g){
      var set=rows.filter(function(r){ return r.s===g.s; });
      if(!set.length) return "";
      return '<h3 class="jsect">'+esc(g.h)+'</h3>'+set.map(function(r){
        return '<article class="job" data-s="'+esc(r.s)+'">'+
          '<p class="jr">'+esc(r.role)+'</p>'+
          '<p class="je">'+esc(r.employer)+'</p>'+
          '<p class="jw">'+esc(r.where||"")+(r.mi?(" \\u00b7 "+r.mi+" miles"):"")+'</p>'+
          (r.chips&&r.chips.length?'<div class="jchips">'+r.chips.map(function(c){
            return '<span class="jchip"'+(c.k?' data-k="'+esc(c.k)+'"':"")+'>'+esc(c.t)+'</span>';
          }).join("")+'</div>':"")+
          (r.why?'<p class="jwhy">'+esc(r.why)+'</p>':"")+
          (r.contact?'<p class="jcontact">Ask for <b>'+esc(r.contact.name)+'</b>'+
            (r.contact.phone?" \\u00b7 "+esc(r.contact.phone):"")+'</p>':"")+
          (r.gate?'<p class="jgate">'+esc(r.gate)+'</p>':"")+
          (r.opens?'<p class="jopen">'+esc(r.opens)+'</p>':"")+
          (r.url?'<a class="jgo" href="'+esc(r.url)+'" target="_blank" rel="noopener">'+
            esc(r.link||"Open this")+'</a>':"")+
        '</article>';
      }).join("");
    }).join("");
    var P=STATE.pipeline||[];
    var el=document.getElementById("jpipe");
    if(!P.length){
      el.innerHTML='<p class="pempty">Nothing tracked yet. When you apply to something, tell me and it lands here.</p>';
      return;
    }
    var ST=["Spotted","Applied","Heard back","Interview","Decision"];
    el.innerHTML=P.map(function(p){
      var at=ST.indexOf(p.stage); if(at<0) at=0;
      return '<div class="pipe">'+
        '<p class="pr">'+esc(p.role)+'</p>'+
        '<p class="pe">'+esc(p.employer||"")+(p.at?(" \\u00b7 "+esc(p.at)):"")+'</p>'+
        '<div class="pstage">'+ST.map(function(s,i){
          return '<span data-on="'+(i<=at?"1":"0")+'">'+esc(s)+'</span>';
        }).join("")+'</div>'+
      '</div>';
    }).join("");
  }
`;
h = h.replace(ANCHOR, FN + ANCHOR);

/* 6 — call it */
const RA = 'renderBoard(); renderFixed();';
at(RA);
h = h.replace(RA, 'renderBoard(); renderJobs(); renderFixed();');

fs.writeFileSync(OUT, h);
console.log('injected -> ' + OUT + ' (' + Buffer.byteLength(h) + ' bytes)');
