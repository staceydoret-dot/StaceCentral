// Runs test_path.js with fonts.googleapis.com stubbed, so a network-disabled
// sandbox does not report 3 phantom failures. Does not modify test_path.js.
const pw = require('playwright');
const origLaunch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await origLaunch(...a);
  const origCtx = b.newContext.bind(b);
  b.newContext = async (...c) => {
    const ctx = await origCtx(...c);
    await ctx.route('https://fonts.googleapis.com/**', r =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route('https://fonts.gstatic.com/**', r =>
      r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
    return ctx;
  };
  return b;
};
require('./test_path.js');
