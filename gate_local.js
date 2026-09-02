// Sandbox shim. The image ships chromium build 1194 at a fixed path and
// forbids `playwright install`, but the npm playwright resolved here expects a
// newer build. Pin executablePath, then hand off to the kit's own runner.
//
//   node gate_local.js gate  <file>   -> run_gate.js  (332 assertions)
//   node gate_local.js track <file>   -> t_track.js   (20 assertions)
//
// Patches launch BEFORE requiring the kit, so run_gate.js wraps this one and
// keeps its font stubbing. No file in publish_kit/ is modified.
const path = require('path');
const pw = require('playwright');
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium';

const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (opts = {}) => orig({ executablePath: CHROME, ...opts });

const [mode, target] = process.argv.slice(2);
if (!mode || !target) {
  console.error('usage: node gate_local.js <gate|track> <html-file>');
  process.exit(2);
}

// Both kit scripts read their input from process.argv[2]; t_track.js also
// resolves build.html relative to cwd, so give it an absolute path either way.
const abs = path.resolve(target);
process.argv = [process.argv[0], process.argv[1], abs];

if (mode === 'gate') require('./publish_kit/run_gate.js');
else if (mode === 'track') require('./publish_kit/t_track.js');
else { console.error('mode must be gate or track'); process.exit(2); }
