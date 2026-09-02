#!/usr/bin/env node
/**
 * merge_state.js — fold Stacey's LIVE artifact state into a fresh build.
 *
 * Why this exists: the published page rewrites itself every time she taps
 * something. A plain republish of the build would erase that. This lifts her
 * input out of LIVE and drops it into the new build, keeping every content
 * fix the build carries.
 *
 * Usage:
 *   node merge_state.js --live live.html --build build.html --out out.html
 *   node merge_state.js --live live.html --build build.html --report-only
 */
const fs = require('fs');

const TAG = '<script id="app-state" type="application/json">';
const END = '</' + 'script>';

/* ---- her input. Anything here is taken from LIVE and never overwritten. ---- */
const FROM_LIVE = ['checked', 'notes', 'asks', 'display', 'log', 'wins', 'today', 'pipeline'];
/* `view` is deliberately NOT in that list. This release makes Today the landing
   view, and the ship gate asserts it. `view` is an ephemeral UI position, not
   her content, so BUILD wins. She lands on Today once; after her first tap the
   page saves her own view again. */
/* ---- content. Always from BUILD: these carry the corrections the gate asserts
       (loan facts, program prereqs, callouts). LIVE's copies are stale. ---- */
const VISION_USER_FIELDS = ['status'];   // visions merge by id: build content + LIVE status

/* ---- application trackers live INSIDE content (phases[].milestones[].track).
       The milestone's label/steps/notes are content (BUILD wins), but the four
       fields below are her taps and must survive a republish. Matched by
       phase id + milestone id, never by array position. ---- */
const TRACK_USER_FIELDS = ['stage', 'applied', 'lastFollow', 'nextFollow'];
const TRACK_BUILD_FIELDS = ['stages', 'gaps'];   // the ladder itself is content

function args() {
  const a = process.argv.slice(2), o = { reportOnly: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--live') o.live = a[++i];
    else if (a[i] === '--build') o.build = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--report-only') o.reportOnly = true;
  }
  if (!o.live || !o.build) { console.error('need --live and --build'); process.exit(2); }
  if (!o.out && !o.reportOnly) { console.error('need --out (or --report-only)'); process.exit(2); }
  return o;
}

/**
 * Find the REAL state block. The tag string occurs twice in a built page:
 * once for real, once inside buildDoc()'s self-publish string literal.
 * Discriminator: the real one is followed by `{` (optionally after
 * whitespace); the decoy is followed by `'`.
 */
function findState(html, whichFile) {
  const hits = [];
  let i = -1;
  while ((i = html.indexOf(TAG, i + 1)) !== -1) {
    const after = html.slice(i + TAG.length);
    const firstChar = after.replace(/^\s*/, '')[0];
    hits.push({ at: i, real: firstChar === '{' });
  }
  const real = hits.filter(h => h.real);
  if (real.length !== 1) {
    throw new Error(`${whichFile}: expected exactly 1 real app-state block, found ${real.length} (of ${hits.length} tag occurrences)`);
  }
  const start = real[0].at + TAG.length;
  const end = html.indexOf(END, start);
  if (end === -1) throw new Error(`${whichFile}: unterminated app-state block`);
  return { start, end, json: html.slice(start, end) };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function merge(live, build, report) {
  const out = {};
  const keys = [...new Set([...Object.keys(build), ...Object.keys(live)])];

  for (const k of keys) {
    const inB = k in build, inL = k in live;

    if (k === 'visions' && Array.isArray(build.visions) && Array.isArray(live.visions)) {
      const byId = Object.fromEntries(live.visions.filter(v => v && v.id).map(v => [v.id, v]));
      let moved = 0;
      out.visions = build.visions.map(v => {
        const l = byId[v.id];
        if (!l) return v;
        const m = { ...v };
        for (const f of VISION_USER_FIELDS) if (f in l) { if (l[f] !== v[f]) moved++; m[f] = l[f]; }
        return m;
      });
      const lost = live.visions.filter(v => v && v.id && !build.visions.some(b => b.id === v.id)).map(v => v.id);
      report.visions = { statusesFromLive: moved, liveOnlyIdsDropped: lost };
      continue;
    }

    if (k === 'phases' && Array.isArray(build.phases) && Array.isArray(live.phases)) {
      // index LIVE tracks by "phaseId/milestoneId"
      const liveTracks = {};
      for (const p of live.phases || []) {
        for (const m of (p && p.milestones) || []) {
          if (m && m.id && m.track && typeof m.track === 'object') {
            liveTracks[(p.id || '?') + '/' + m.id] = m.track;
          }
        }
      }
      const carried = [], seeded = [];
      out.phases = build.phases.map(p => ({
        ...p,
        milestones: ((p && p.milestones) || []).map(m => {
          if (!m || !m.track) return m;                       // no tracker here
          const key = (p.id || '?') + '/' + m.id;
          const lt = liveTracks[key];
          const t = {};
          for (const f of TRACK_BUILD_FIELDS) if (f in m.track) t[f] = m.track[f];
          if (lt) {
            // she has taps on the live page — those win
            for (const f of TRACK_USER_FIELDS) {
              if (f in lt && lt[f] !== null && lt[f] !== undefined) t[f] = lt[f];
              else if (f in m.track) t[f] = m.track[f];
            }
            carried.push(key + ' → ' + (t.stage || '?'));
          } else {
            // first ship of this tracker — take BUILD's seed wholesale
            for (const f of TRACK_USER_FIELDS) if (f in m.track) t[f] = m.track[f];
            seeded.push(key + ' → ' + (t.stage || '?'));
          }
          return { ...m, track: t };
        })
      }));
      const dropped = Object.keys(liveTracks)
        .filter(key => !out.phases.some(p => (p.milestones || [])
          .some(m => ((p.id || '?') + '/' + m.id) === key && m.track)));
      report.tracks = { carried, seeded, dropped };
      if (!eq(live.phases, build.phases)) report.contentDiffs.push('phases (content from BUILD, tracker taps from LIVE)');
      continue;
    }

    if (FROM_LIVE.includes(k)) {
      if (inL && live[k] !== null && live[k] !== undefined) {
        const empty = (Array.isArray(live[k]) && live[k].length === 0) ||
                      (live[k] && typeof live[k] === 'object' && !Array.isArray(live[k]) && Object.keys(live[k]).length === 0);
        if (empty && inB) { out[k] = build[k]; report.buildKeys.push(k + ' (live empty)'); }
        else { out[k] = live[k]; report.liveKeys.push(k); }
      } else if (inB) {
        out[k] = build[k];
        report.buildKeys.push(k + ' (new in build)');
      }
      continue;
    }

    // content
    if (inB) {
      out[k] = build[k];
      if (inL && !eq(live[k], build[k])) report.contentDiffs.push(k);
    } else {
      out[k] = live[k];
      report.liveOnly.push(k);
    }
  }
  out.updated = build.updated || out.updated;
  return out;
}

const o = args();
const liveHtml = fs.readFileSync(o.live, 'utf8');
const buildHtml = fs.readFileSync(o.build, 'utf8');
const L = findState(liveHtml, 'LIVE'), B = findState(buildHtml, 'BUILD');
const live = JSON.parse(L.json), build = JSON.parse(B.json);

const report = { liveKeys: [], buildKeys: [], contentDiffs: [], liveOnly: [], visions: null, tracks: null };
const merged = merge(live, build, report);

console.log('--- merge report ---');
console.log('LIVE state version', live.version, '| BUILD state version', build.version);
console.log('kept from LIVE (her input) :', report.liveKeys.join(', ') || '(none)');
console.log('taken from BUILD           :', report.buildKeys.join(', ') || '(none)');
if (report.visions) console.log('visions                    : ' + report.visions.statusesFromLive + ' status(es) carried from LIVE' +
  (report.visions.liveOnlyIdsDropped.length ? ' | LIVE-only ids dropped: ' + report.visions.liveOnlyIdsDropped.join(',') : ''));
console.log('scalars set                : checked=' + Object.keys(merged.checked || {}).length +
  ' notes=' + Object.values(merged.notes || {}).flat().length +
  ' asks=' + Object.values(merged.asks || {}).flat().length +
  ' tasks=' + ((merged.today && merged.today.tasks || []).length) +
  ' log=' + ((merged.log || []).length) + ' wins=' + ((merged.wins || []).length) +
  ' display=' + JSON.stringify(merged.display) + ' view=' + JSON.stringify(merged.view));
if (report.tracks) {
  const t = report.tracks;
  console.log('app trackers               : ' +
    (t.carried.length ? t.carried.length + ' kept from LIVE [' + t.carried.join('; ') + ']' : '0 kept from LIVE') +
    (t.seeded.length ? ' | ' + t.seeded.length + ' seeded from BUILD [' + t.seeded.join('; ') + ']' : ''));
  if (t.dropped.length) console.log('   !! LIVE tracker(s) with no home in BUILD (LOST): ' + t.dropped.join(', '));
}
if (report.liveOnly.length) console.log('!! KEYS ONLY IN LIVE (kept)  :', report.liveOnly.join(', '));
if (report.contentDiffs.length) {
  console.log('\n!! CONTENT KEYS THAT DIFFER (BUILD wins — these are the fixes):');
  for (const k of report.contentDiffs) console.log('   - ' + k);
  console.log('   Read this list. If any key here holds something SHE changed on the');
  console.log('   live page, stop: the build would overwrite it.');
}

if (o.reportOnly) { console.log('\n--report-only: nothing written.'); process.exit(0); }

const body = '\n' + JSON.stringify(merged, null, 2) + '\n';
const outHtml = buildHtml.slice(0, B.start) + body + buildHtml.slice(B.end);
const check = findState(outHtml, 'OUT');
JSON.parse(check.json);
fs.writeFileSync(o.out, outHtml);
console.log('\nwrote ' + o.out + ' (' + Buffer.byteLength(outHtml) + ' bytes)');
