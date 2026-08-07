# Ochi-Level Redesign — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on Tasks 6-7:** these are orchestration tasks. Whoever executes them must personally use the Agent tool to dispatch the builder and critic subagents described in each step — the task is not "write the CSS yourself," it's "run the loop." If executing this plan via subagent-driven-development, the dispatched worker for Tasks 6-7 needs Agent-tool access; if that's not available, run those two tasks inline from the main thread instead.

**Goal:** Build the reusable design-review tooling, the shared token/motion foundation, and land the Nav and Footer(+final-cta) pieces at Ochi-level craft, each verified via a blind screenshot comparison against ochi.design.

**Architecture:** A tiny local static server + a Playwright CLI capture reusable, unstyled-opinion screenshots of any local page or live ochi.design section. A builder subagent edits one piece's scoped files; a fresh, unbiased critic subagent picks the stronger of two randomized, unlabeled screenshots. Loop until the local piece wins, then move on.

**Tech Stack:** Vanilla Node.js (no framework) for tooling scripts, Playwright + Chromium for capture (already installed under the session scratchpad — `npm install playwright` was run there; this plan does not add it as a repo dependency since it's dev-only tooling never shipped to `public/`).

## Global Constraints

- Fonts: Plus Jakarta Sans (400/500/600/700/800) for all UI/display type; Fira Code for mono/code only. No Bricolage Grotesque, Public Sans, or Space Mono anywhere in the repo.
- Palette: `--forest: #0F3D24`, `--forest-2: #0A2B19`, `--leaf: #3FA65C`, `--clay: #E0863A`, `--sand: #F1E8D8`, `--cream: #FBF6EC`, `--ink: #16241C`, `--muted: #717A6F`, `--line: #E2D7C2` — dark-hero + light-section structure stays. No palette recomposition.
- Per-app accents preserved (not touched this phase, must not regress): guide-akl `#0E7490`, kai-akl `#1A6FA8`, volcanic-akl `#3D7A5F`, lord-of-the-rings `#e0863a`, platform `#5b53c0`, auckland `#a15a2b`.
- No loading screen, no scroll-jacking, no WebGL, anywhere on the site.
- All hover/scroll-into-view transitions ≤200ms.
- No new external script/style/font host beyond the current CSP allow-list: `cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `'self'`.
- Alpine.js stays pinned `3.15.12` with its existing SRI hash; Lucide stays pinned `1.18.0` with its existing SRI hash — do not change version or hash.
- `<style>[x-cloak]{display:none!important}</style>` stays in `<head>` of every page touched.
- `.catch(() => {})` stays on the navbar/footer `fetch()` chains.
- Navbar/footer stay loaded via the Alpine `x-html` fetch-injection pattern — architecture unchanged.

---

## File Structure

**Create:**
- `scripts/design-review/server.js` — zero-dependency static file server for `public/`, mirrors Firebase's `cleanUrls: true` behavior (serves `/our-work` from `our-work.html`).
- `scripts/design-review/capture.js` — Playwright screenshot CLI, works against both `http://localhost:*` and live `https://ochi.design`.
- `public/assets/scroll-reveal.js` — vanilla `IntersectionObserver` fade-in for `[data-reveal]` elements, no-JS/no-motion-preference safe by default.

**Modify:**
- `public/assets/style.css` — add type-scale/spacing-scale/motion tokens to `:root`; fix `--font-display`/`--font-body-1b`/`--font-mono-1b`; rewrite nav CSS (`.bs-navbar`, `.navbar-1b`, `.bs-nav-*`, `.bs-brand*`, `.bs-btn-signup-1b`, `.bs-mobile-toggle`) and footer/final-cta CSS (`.bs-global-footer`, `.footer-1b`, `.footer-*`, `.final-cta*`) during the piece loops; add `[data-reveal]` rules.
- `public/components/navbar.html` — Nav piece.
- `public/components/footer.html` — Footer piece.
- `public/index.html` — `.final-cta` section markup (folds into the Footer piece since it's the adjacent band directly above the footer); add the `js-reveal` bootstrap snippet and `scroll-reveal.js` include.
- `public/civic.html`, `public/creators.html`, `public/travel-operators.html` — strip the `Bricolage+Grotesque` family from the Google Fonts `<link>`.
- `public/blog/auckland/index.html`, `public/blog/lord-of-the-rings/index.html`, `public/blog/kai-akl/index.html`, `public/blog/platform/index.html`, `public/blog/guide-akl/index.html`, `public/blog/volcanic-akl/index.html` — strip `Bricolage+Grotesque`/`Public+Sans`/`Space+Mono`, standardize on the same Fira Code + Plus Jakarta Sans `<link>` every other page uses.

---

### Task 1: Local static server for design-review capture

**Files:**
- Create: `scripts/design-review/server.js`

**Interfaces:**
- Produces: a process listening on `http://localhost:<port>` (default `4173`, overridable via `argv[2]`) serving `public/` with clean-URL fallback (`/our-work` → `our-work.html`), consumed by Task 2's capture CLI and every piece loop after it.

- [ ] **Step 1: Write the server**

```js
// scripts/design-review/server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'public');
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, data, contentType) {
  res.writeHead(status, contentType ? { 'Content-Type': contentType } : undefined);
  res.end(data);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const resolved = path.join(ROOT, rel);

  if (!resolved.startsWith(ROOT)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (!err) {
      send(res, 200, data, MIME[path.extname(resolved)] || 'application/octet-stream');
      return;
    }
    if (!path.extname(resolved)) {
      fs.readFile(resolved + '.html', (err2, data2) => {
        if (err2) {
          send(res, 404, 'Not found');
          return;
        }
        send(res, 200, data2, MIME['.html']);
      });
      return;
    }
    send(res, 404, 'Not found');
  });
});

server.listen(PORT, () => {
  console.log(`design-review server listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Verify it serves both a real file and a clean URL**

Run (PowerShell, from repo root):
```powershell
node scripts/design-review/server.js 4173
```
In a second terminal:
```powershell
(Invoke-WebRequest http://localhost:4173/index.html -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:4173/our-work -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:4173/components/navbar.html -UseBasicParsing).Content
```
Expected: both status codes are `200`, and the third command's output contains `bs-navbar`. Stop the server (Ctrl+C in the first terminal) once confirmed.

- [ ] **Step 3: Commit**

```bash
git add scripts/design-review/server.js
git commit -m "feat: add zero-dependency static server for design-review capture"
```

---

### Task 2: Playwright screenshot capture CLI

**Files:**
- Create: `scripts/design-review/capture.js`

**Interfaces:**
- Consumes: a running server from Task 1 (for local captures) or any public URL (for ochi.design).
- Produces: a CLI — `node capture.js --url <url> --out <path> [--viewport desktop|mobile] [--wait-selector <css>] [--scroll-y <px>] [--settle-ms <ms>] [--full-page]` — that writes a PNG to `<path>` and exits 0, or prints an error and exits 1. Any browser console error or page error is printed with a `[page console error]`/`[page error]` prefix. Used by every piece loop in Tasks 6+ to capture both the local render and the Ochi reference.

- [ ] **Step 1: Write the capture script**

```js
// scripts/design-review/capture.js
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
```

- [ ] **Step 2: Verify against the local server**

With the Task 1 server running (`node scripts/design-review/server.js 4173`), run from the scratchpad (where `playwright` was installed — see Task 3 for the exact working directory):
```powershell
node capture.js --url http://localhost:4173/index.html --out nav-check.png --wait-selector ".bs-navbar" --settle-ms 300
```
Expected: prints `saved nav-check.png`, no `[page console error]` or `[page error]` lines, and the file exists and is larger than 20KB (`(Get-Item nav-check.png).Length -gt 20000`).

- [ ] **Step 3: Verify against live ochi.design past its loading screen**

```powershell
node capture.js --url https://ochi.design --out ochi-check.png --settle-ms 9000
```
Expected: prints `saved ochi-check.png`. Read the resulting PNG and confirm it shows real hero content, not a "Loading: NN%" card — if still loading, rerun with a higher `--settle-ms`.

- [ ] **Step 4: Move the script into the repo and commit**

The script itself is repo tooling (commit it), but it depends on the `playwright` package which is intentionally *not* added to any repo `package.json` — it's dev-only tooling run from the scratchpad's `node_modules` (or reinstalled ad hoc in future sessions). Note this in a one-line header comment so a future reader isn't confused about the missing dependency:

```js
// Requires `playwright` (with Chromium installed via `npx playwright install chromium`)
// available on NODE_PATH or run from a directory where it's installed — not a repo dependency.
```

```bash
git add scripts/design-review/capture.js
git commit -m "feat: add Playwright screenshot capture CLI for design-review"
```

---

### Task 3: Confirm the tooling round-trips end-to-end

This is a smoke test of Tasks 1+2 working together exactly as the piece loops in Tasks 6-7 will use them — not new code.

**Files:** none (verification only).

- [ ] **Step 1: Run both scripts together**

Terminal A:
```powershell
node scripts/design-review/server.js 4173
```
Terminal B (from the scratchpad directory holding the `playwright` install):
```powershell
node capture.js --url http://localhost:4173/index.html --out home-desktop.png --wait-selector ".bs-navbar" --viewport desktop
node capture.js --url http://localhost:4173/index.html --out home-mobile.png --wait-selector ".bs-navbar" --viewport mobile
```

- [ ] **Step 2: Read both screenshots and confirm they show the full current homepage**

Use the Read tool on `home-desktop.png` and `home-mobile.png`. Expected: both show the current forest-green hero, nav, and homepage sections fully rendered — this is today's baseline, confirming the pipeline captures real, complete pages before any redesign work starts. Stop the Terminal A server once confirmed.

- [ ] **Step 3: No commit** — this task produces no repo changes, only confirms Tasks 1-2 work together.

---

### Task 4: Design token foundation + font cleanup

**Files:**
- Modify: `public/assets/style.css:4-37` (the `:root` block)
- Modify: `public/civic.html:10`, `public/creators.html:10`, `public/travel-operators.html:10`
- Modify: `public/blog/auckland/index.html:12`, `public/blog/lord-of-the-rings/index.html:12`, `public/blog/kai-akl/index.html:12`, `public/blog/platform/index.html:12`, `public/blog/guide-akl/index.html:12`, `public/blog/volcanic-akl/index.html:12`

**Interfaces:**
- Produces: `--text-display`, `--text-h2`, `--text-h3`, `--text-body`, `--text-small`, `--text-eyebrow`, `--leading-display`, `--leading-h2`, `--leading-body`, `--tracking-display`, `--tracking-h2`, `--tracking-eyebrow`, `--space-1` through `--space-32`, `--section-padding-y`, `--transition-fast` — every later piece task (6+) uses these instead of inventing new sizes/spacing.

- [ ] **Step 1: Replace the font vars and add the type/spacing/motion scale**

In `public/assets/style.css`, replace:

```css
    --font-display: 'Bricolage Grotesque', var(--font-sans);
    --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-mono: 'Fira Code', monospace;
    --font-body-1b: 'Public Sans', var(--font-sans);
    --font-mono-1b: 'Space Mono', var(--font-mono);
```

with:

```css
    --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-display: var(--font-sans);
    --font-mono: 'Fira Code', monospace;
    --font-body-1b: var(--font-sans);
    --font-mono-1b: var(--font-mono);

    /* Type scale */
    --text-display: clamp(2.75rem, 6vw, 6rem);
    --text-h2: clamp(2rem, 4vw, 3.5rem);
    --text-h3: clamp(1.375rem, 2.2vw, 1.875rem);
    --text-body: 1.05rem;
    --text-small: 0.875rem;
    --text-eyebrow: 0.8rem;

    --leading-display: 1.0;
    --leading-h2: 1.05;
    --leading-body: 1.65;

    --tracking-display: -0.035em;
    --tracking-h2: -0.02em;
    --tracking-eyebrow: 0.1em;

    /* Spacing scale */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-6: 1.5rem;
    --space-8: 2rem;
    --space-12: 3rem;
    --space-16: 4rem;
    --space-24: 6rem;
    --space-32: 8rem;
    --section-padding-y: clamp(4rem, 10vw, 9rem);

    /* Motion */
    --transition-fast: 160ms ease;
```

`--font-body-1b`/`--font-mono-1b` are kept (aliased, not deleted) because they're still referenced elsewhere in this file — matches the file's existing "Legacy aliases" pattern immediately above this block.

- [ ] **Step 2: Strip Bricolage Grotesque from the three site-page font links**

In `public/civic.html`, `public/creators.html`, `public/travel-operators.html`, replace:

```html
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

with:

```html
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Strip Bricolage Grotesque / Public Sans / Space Mono from the six blog category font links**

In `public/blog/auckland/index.html`, `public/blog/lord-of-the-rings/index.html`, `public/blog/kai-akl/index.html`, `public/blog/platform/index.html`, `public/blog/guide-akl/index.html`, `public/blog/volcanic-akl/index.html`, replace:

```html
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Public+Sans:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

with:

```html
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Verify no references remain**

Run:
```powershell
Get-ChildItem -Recurse public -Include *.html,*.css | Select-String -Pattern "Bricolage|Public\+Sans|Space\+Mono|Public Sans|Space Mono" 
```
Expected: no output.

- [ ] **Step 5: Visual regression check**

With the Task 1 server running, capture `civic.html` and `index.html` again (same commands as Task 3, swap the URL path) and Read both PNGs. Expected: pages still render fully (headings now fall back to Plus Jakarta Sans 800 instead of Bricolage Grotesque — a font-family shift only, no broken layout, no missing content).

- [ ] **Step 6: Commit**

```bash
git add public/assets/style.css public/civic.html public/creators.html public/travel-operators.html public/blog/auckland/index.html public/blog/lord-of-the-rings/index.html public/blog/kai-akl/index.html public/blog/platform/index.html public/blog/guide-akl/index.html public/blog/volcanic-akl/index.html
git commit -m "refactor: add type/spacing/motion token scale, remove Bricolage/Public Sans/Space Mono"
```

---

### Task 5: Motion foundation — scroll-reveal

**Files:**
- Create: `public/assets/scroll-reveal.js`
- Modify: `public/assets/style.css` (append `[data-reveal]` rules)

**Interfaces:**
- Produces: a `.js-reveal` class added to `<html>` (only when JS runs), and a `[data-reveal]` / `.is-revealed` CSS contract — any element with `data-reveal` on it fades/rises in the first time it's ≥15% in viewport, respecting `prefers-reduced-motion`, and is fully visible with zero JS. Task 7 (Footer piece) is the first consumer.

- [ ] **Step 1: Write the reveal script**

```js
// public/assets/scroll-reveal.js
(function () {
  document.documentElement.classList.add('js-reveal');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  els.forEach(function (el) { observer.observe(el); });
})();
```

- [ ] **Step 2: Add the CSS contract**

Append to `public/assets/style.css`:

```css
/* Scroll-into-view reveal. Gated behind .js-reveal so content stays fully
   visible with no JS — never depends on script execution to appear. */
.js-reveal [data-reveal] {
    opacity: 0;
    transform: translateY(12px);
    transition: opacity var(--transition-fast), transform var(--transition-fast);
}
.js-reveal [data-reveal].is-revealed {
    opacity: 1;
    transform: none;
}
@media (prefers-reduced-motion: reduce) {
    .js-reveal [data-reveal] {
        opacity: 1;
        transform: none;
        transition: none;
    }
}
```

- [ ] **Step 3: Wire the include into `public/index.html`**

Add the class-bootstrap snippet right after the existing `<style>[x-cloak]...</style>` line in `<head>`:

```html
<script>document.documentElement.classList.add('js-reveal');</script>
```

Add the deferred script before the closing `</body>`, alongside the existing Lucide script tag:

```html
<script src="/assets/scroll-reveal.js" defer></script>
```

(Do not wire this into other pages yet — they get it when their own phase touches them, per the spec's phasing.)

- [ ] **Step 4: Verify no-JS-safe default and reveal behavior**

With the Task 1 server running, use Playwright directly (from the scratchpad) to check both states:

```powershell
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:4173/index.html', { waitUntil: 'networkidle' });
  const hasJsReveal = await page.evaluate(() => document.documentElement.classList.contains('js-reveal'));
  console.log('js-reveal class present:', hasJsReveal);
  await browser.close();
})();
"
```
Expected: `js-reveal class present: true`. (There are no `[data-reveal]` elements on the page yet — Task 7 adds the first one — so this step only confirms the bootstrap class lands; the fade behavior itself gets verified in Task 7 once something actually uses it.)

- [ ] **Step 5: Commit**

```bash
git add public/assets/scroll-reveal.js public/assets/style.css public/index.html
git commit -m "feat: add no-JS-safe scroll-into-view reveal mechanism"
```

---

### Task 6: Nav piece — builder/critic loop

**Files:**
- Modify: `public/components/navbar.html`
- Modify: `public/assets/style.css` (nav-related rule blocks: `.bs-navbar`, `.navbar-1b`, `.bs-nav-left`, `.bs-nav-menu`, `.bs-nav-links`, `.bs-auth-links`, `.bs-brand*`, `.bs-btn-signup-1b`, `.bs-mobile-toggle`)

**Interfaces:**
- Consumes: tokens from Task 4 (`--text-*`, `--space-*`, `--transition-fast`), the existing Alpine contract in `navbar.html` (`x-data="{ mobileMenuOpen: false }"`, `:class="{ 'active': mobileMenuOpen }"`, `x-show`/`x-cloak` on the toggle icons) — this contract must not change, since it's the mechanism the mobile menu depends on.
- Produces: the same `.bs-navbar` root structure every page's injected-component fetch expects — no page-specific markup changes needed elsewhere.

- [ ] **Step 1: Dispatch the builder subagent (round 1)**

Use the Agent tool with a prompt equivalent to:

> Redesign `public/components/navbar.html` and its CSS in `public/assets/style.css` (search for `.bs-navbar`, `.navbar-1b`, `.bs-nav-*`, `.bs-brand*`, `.bs-btn-signup-1b`, `.bs-mobile-toggle`) to match the typographic confidence and restrained layout craft of ochi.design's navigation — generous horizontal padding, a confident wordmark treatment, minimal and precisely-spaced link list, no heavy shadows/gradients.
>
> Hard constraints: use only the design tokens already defined in `:root` in `public/assets/style.css` (read the file — look for `--text-*`, `--space-*`, `--font-*`, `--forest`/`--leaf`/`--clay`/`--sand`/`--cream`/`--ink`/`--muted`/`--line`, `--transition-fast`). Do not invent new colors or font families. Any transition must use `--transition-fast` (160ms) or be faster. Do not change the Alpine directives already in the file (`x-data="{ mobileMenuOpen: false }"`, the `:class="{ 'active': mobileMenuOpen }"` binding, the `x-show`/`x-cloak` toggle-icon pattern) — only the visual design around them. Keep the root element's `bs-navbar` class (other CSS may reference it). No loading states, no scroll-jacking.
>
> Read `public/components/navbar.html` and the current nav CSS in `public/assets/style.css` first, then make the edit.

- [ ] **Step 2: Capture the local render**

Start the Task 1 server, then:
```powershell
node capture.js --url http://localhost:4173/index.html --out nav-ours-round1-desktop.png --wait-selector ".bs-navbar" --viewport desktop
node capture.js --url http://localhost:4173/index.html --out nav-ours-round1-mobile.png --wait-selector ".bs-navbar" --viewport mobile
```

- [ ] **Step 3: Capture or reuse the Ochi reference**

If not already cached from a prior round:
```powershell
node capture.js --url https://ochi.design --out ochi-nav-ref-desktop.png --viewport desktop --settle-ms 9000
node capture.js --url https://ochi.design --out ochi-nav-ref-mobile.png --viewport mobile --settle-ms 9000
```
These capture Ochi's default (unopened-menu) top bar — the directly comparable state to Black Sands' nav, which shows its links inline rather than behind a trigger.

- [ ] **Step 4: Build the blind comparison and dispatch the critic**

Randomly choose which screenshot is "left" and which is "right" (e.g. flip a coin yourself) and copy the two desktop PNGs to generic names — `left.png` / `right.png` — in a scratch folder, privately noting which name maps to which source. Do the same for the mobile pair. Dispatch a **fresh** Agent tool call (new subagent, no prior context) with a prompt equivalent to:

> You're comparing two navigation bar screenshots: `left.png` and `right.png` (read both with the Read tool). One is from a live design agency site, one is a work-in-progress. You don't know which is which and it doesn't matter — judge purely on what you see.
>
> Which of the two is the stronger piece of design — typographic confidence, whitespace discipline, grid/alignment precision, restraint? Pick one side and say why in 2-4 sentences. If you pick a side, also name the single biggest gap the other side has that's holding it back.

Decode the verdict using your private left/right mapping.

- [ ] **Step 5: Branch on the verdict**

If the critic preferred the local render (ours): commit (Step 6) and this task is done.

If the critic preferred Ochi: take the named gap, go back to Step 1 with a new builder subagent, passing the current `navbar.html`/CSS state plus the critic's exact gap description as round-2 context. Repeat Steps 1-4 up to 4 total rounds. If round 4 still doesn't win, stop, commit the best version reached, and flag it in the phase report to the user rather than looping further — do not keep iterating past that without a check-in.

- [ ] **Step 6: Commit**

```bash
git add public/components/navbar.html public/assets/style.css
git commit -m "feat: redesign nav to Ochi-level typographic/layout craft"
```

---

### Task 7: Footer (+ final-cta) piece — builder/critic loop

**Files:**
- Modify: `public/components/footer.html`
- Modify: `public/index.html` (the `.final-cta` section, lines ~186-192)
- Modify: `public/assets/style.css` (footer/final-cta rule blocks: `.bs-global-footer`, `.footer-1b`, `.footer-main`, `.footer-grid`, `.footer-brand`, `.footer-col*`, `.footer-bottom-1b`, `.final-cta*`)

**Interfaces:**
- Consumes: tokens from Task 4, the `[data-reveal]`/`js-reveal` mechanism from Task 5.
- Produces: the same `.bs-global-footer` root structure every page's injected-component fetch expects.

- [ ] **Step 1: Dispatch the builder subagent (round 1)**

Use the Agent tool with a prompt equivalent to:

> Redesign `public/components/footer.html` and the `.final-cta` section in `public/index.html` (currently around line 186-192), plus their CSS in `public/assets/style.css` (search for `.bs-global-footer`, `.footer-1b`, `.footer-main`, `.footer-grid`, `.footer-brand`, `.footer-col`, `.footer-bottom-1b`, `.final-cta`), to match ochi.design's footer-level craft — treat the final-cta band and the footer immediately below it as one visually unified closing unit, with generous whitespace and confident large-scale type on the CTA headline.
>
> Hard constraints: only the tokens already in `:root` in `public/assets/style.css` (`--text-*`, `--space-*`, `--font-*`, `--forest`/`--leaf`/`--clay`/`--sand`/`--cream`/`--ink`/`--muted`/`--line`, `--transition-fast`). Add `data-reveal` to the final-cta section's root element (or the footer's top zone) so it fades in on scroll via the existing mechanism in `public/assets/scroll-reveal.js` and the `.js-reveal [data-reveal]` CSS rule already in `style.css` — do not build a new motion mechanism. Keep the footer's copyright/contact content, mailto/tel links, and the "Black Sands Digital © 2026" text as-is (hardcoded year, no `x-data`). No loading states, no scroll-jacking.
>
> Read `public/components/footer.html`, the `.final-cta` section in `public/index.html`, and the current footer/final-cta CSS in `public/assets/style.css` first, then make the edit.

- [ ] **Step 2: Capture the local render**

```powershell
node capture.js --url http://localhost:4173/index.html --out footer-ours-round1-desktop.png --wait-selector ".bs-global-footer" --viewport desktop --full-page
node capture.js --url http://localhost:4173/index.html --out footer-ours-round1-mobile.png --wait-selector ".bs-global-footer" --viewport mobile --full-page
```
(Full-page capture, then note the footer sits at the bottom — the critic prompt in Step 4 should ask the reader to focus on the bottom section of each image.)

- [ ] **Step 3: Capture or reuse the Ochi reference**

Ochi is a single continuous scroll-jacked page; scroll to its final section/footer before capturing:
```powershell
node capture.js --url https://ochi.design --out ochi-footer-ref-desktop.png --viewport desktop --settle-ms 9000 --full-page
node capture.js --url https://ochi.design --out ochi-footer-ref-mobile.png --viewport mobile --settle-ms 9000 --full-page
```
If Ochi's full-page capture doesn't reach the footer in one shot (its scroll is JS-driven, not native), instead use `--scroll-y` with a large value (try `20000`, then adjust based on what the resulting screenshot shows) against the non-full-page capture to land on the closing section.

- [ ] **Step 4: Build the blind comparison and dispatch the critic**

Same randomized left/right, unlabeled, private-mapping process as Task 6 Step 4. Dispatch a fresh Agent tool call:

> You're comparing two website closing-section screenshots (footer/final-CTA area): `left.png` and `right.png` (read both). One is from a live design agency site, one is a work-in-progress. You don't know which is which — judge purely on what you see.
>
> Which is the stronger design — typographic confidence, whitespace discipline, grid/alignment precision, restraint? Pick a side, explain in 2-4 sentences, and if you pick a side, name the single biggest gap holding the other one back.

Decode using your private mapping.

- [ ] **Step 5: Branch on the verdict**

Same loop-and-cap-at-4-rounds policy as Task 6 Step 5.

- [ ] **Step 6: Commit**

```bash
git add public/components/footer.html public/index.html public/assets/style.css
git commit -m "feat: redesign footer and final-cta band to Ochi-level craft"
```

---

### Task 8: Phase 0+1 integration pass and report

**Files:** none created/modified beyond what Tasks 1-7 already touched — this is verification only.

- [ ] **Step 1: Confirm the pieces read as one system**

With the Task 1 server running, capture the full homepage again:
```powershell
node capture.js --url http://localhost:4173/index.html --out phase-0-1-integration-desktop.png --wait-selector ".bs-navbar" --viewport desktop --full-page
node capture.js --url http://localhost:4173/index.html --out phase-0-1-integration-mobile.png --wait-selector ".bs-navbar" --viewport mobile --full-page
```
Read both. Confirm: nav and footer/final-cta use consistent type scale and spacing against the unchanged middle-of-page sections (they'll look more refined than the rest — that's expected, the rest is future-phase work — but there should be no jarring seam like mismatched font weight, broken alignment, or a color that clashes with `--forest`/`--leaf`/`--clay`).

- [ ] **Step 2: Confirm no motion/loading regressions crept in anywhere touched**

```powershell
Get-ChildItem -Recurse public -Include *.html,*.css,*.js | Select-String -Pattern "loading-screen|preloader|scroll-jack|webgl|three\.js" -CaseSensitive:$false
```
Expected: no output. Also check every `transition`/`animation` duration added in Tasks 4-7:
```powershell
Select-String -Path public/assets/style.css -Pattern "transition:|animation:" | Select-String -Pattern "\d{3,}ms" 
```
Expected: any match shown is ≤200ms (the existing 4150-line file may have older unrelated transitions above 200ms outside the sections this plan touched — those are out of scope for this phase, don't fix them here).

- [ ] **Step 3: Confirm the fonts are clean site-wide**

Re-run Task 4 Step 4's grep — expected: still no output (nothing reintroduced it).

- [ ] **Step 4: Report to the user**

Summarize: which pieces landed, how many rounds each took, the final verdict on each, screenshots referenced, and explicitly state that Phase 2 (homepage sections: hero, how-it-works, creator teaser, portfolio teaser) has not started and awaits their go-ahead, per the spec's phase-gate.

- [ ] **Step 5: No commit** — Tasks 1-7 already committed their own work; this task is a checkpoint, not a change.

---

## Self-Review Notes

- **Spec coverage:** Section 1 (tokens, font cleanup, motion) → Tasks 4-5. Section 2 (tooling) → Tasks 1-3. Section 3 (workflow) → Tasks 6-7's step structure. Section 4 Phase 0 → Tasks 1-5. Phase 1 (Nav, Footer+final-cta) → Tasks 6-7. Integration pass + report-back gate → Task 8.
- **Type consistency:** `--transition-fast` (Task 4) is the single motion-duration token referenced by Task 5's CSS and both builder prompts in Tasks 6-7 — no competing duration value introduced anywhere in this plan.
- **Round cap:** both piece loops cap at 4 rounds and surface to the user instead of looping indefinitely — consistent with the spec's "I am the brake" framing.
