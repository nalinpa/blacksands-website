// Requires `playwright` (with Chromium installed via `npx playwright install chromium`)
// available on NODE_PATH or run from a directory where it's installed — not a repo dependency.

const { chromium } = require('playwright');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

function parseArgs(argv) {
  const args = { viewport: 'desktop', fullPage: false, settleMs: 500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--viewport') args.viewport = argv[++i];
    else if (a === '--wait-selector') args.waitSelector = argv[++i];
    else if (a === '--scroll-y') args.scrollY = parseInt(argv[++i], 10);
    else if (a === '--settle-ms') args.settleMs = parseInt(argv[++i], 10);
    else if (a === '--full-page') args.fullPage = true;
  }
  if (!args.url || !args.out) {
    console.error('Usage: node capture.js --url <url> --out <path> [--viewport desktop|mobile] [--wait-selector <css>] [--scroll-y <px>] [--settle-ms <ms>] [--full-page]');
    process.exit(1);
  }
  if (!VIEWPORTS[args.viewport]) {
    console.error(`Unknown viewport "${args.viewport}", expected "desktop" or "mobile"`);
    process.exit(1);
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORTS[args.viewport] });

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[page console error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[page error] ${err.message}`));

  await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });

  if (args.waitSelector) {
    await page.waitForSelector(args.waitSelector, { timeout: 15000 });
  }
  if (args.scrollY) {
    await page.evaluate((y) => window.scrollTo(0, y), args.scrollY);
  }
  await page.waitForTimeout(args.settleMs);

  await page.screenshot({ path: args.out, fullPage: args.fullPage });
  await browser.close();
  console.log(`saved ${args.out}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
