# Black Sands — Ochi-Level Redesign — Design Spec
**Date:** 2026-08-07
**Status:** Approved

---

## Overview

Redesign the entire blacksands.app site to match the typographic confidence, restrained color discipline, generous whitespace, and layout craft of ochi.design (Obys) — **without** copying its scroll-jacking, WebGL/Three.js interaction, or loading screen. The site must load instantly: no intro animation, only subtle fast (<200ms) transitions on hover/scroll-into-view.

Constraints (fixed, not up for revision during builds):
- Keep Plus Jakarta Sans (400/500/600/700/800) for all UI/display type, Fira Code for mono/code.
- Keep the existing per-app accent-color system (forest/leaf/clay as primary palette; per-app colors — guide-akl `#0E7490`, kai-akl `#1A6FA8`, volcanic-akl `#3D7A5F`, lord-of-the-rings `#e0863a`, platform `#5b53c0`, auckland `#a15a2b` — preserved on their respective surfaces).
- Color direction: **keep current structure, sharpen craft** — dark-hero + light-section pattern stays, forest green stays a dominant surface color. This is not a move to Ochi's near-monochrome palette; it's a sharpening of type/spacing/grid/motion within the existing palette.
- No new loading screen, no scroll-jacking, no WebGL. No new external script/style hosts beyond what CSP already allows (`cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com`).

Full site in scope. Work is split into independently-improvable pieces, each taken through a builder → blind-critic loop until it wins a side-by-side comparison against ochi.design, executed in ordered phases (Section 4).

---

## 1. Design Token Foundation

Built once, before any piece work starts. Every piece inherits these; pieces do not invent their own type sizes/spacing/colors.

**Type scale** — fluid `clamp()`-based scale replacing today's scattered per-section font sizes:
- Display (hero H1): `clamp(2.75rem, 6vw, 6rem)`, weight 800, letter-spacing -0.03 to -0.04em, line-height ~1.0
- H2: `clamp(2rem, 4vw, 3.5rem)`, weight 800, letter-spacing -0.02em, line-height ~1.05
- H3: `clamp(1.375rem, 2.2vw, 1.875rem)`, weight 700
- Body: 1.05–1.15rem, weight 400, line-height 1.6–1.7
- Eyebrow/label: 0.8rem, weight 600, uppercase, letter-spacing 0.1em
- Mono (code/labels only): Fira Code, unchanged

**Spacing scale** — one rem-based scale: 4/8/12/16/24/32/48/64/96/128px, replacing ad hoc padding values. Section vertical rhythm opens to ~120–160px desktop between major sections (Ochi-level whitespace), tightening responsively on mobile.

**Grid** — single 12-column container/gutter system with a defined max-width; eyebrow/heading/body align to a consistent column across all sections and pages.

**Color** — no palette recomposition. Tighten hierarchy: one accent doing one job per surface (e.g. leaf = primary CTA/live-status, clay = eyebrow/secondary accent, per-app colors confined to their own app's pages/cards). Remove decorative noise (unpurposeful glow/blob effects) unless it serves a specific section's identity (e.g. hero glow can stay if restrained).

**Font cleanup** — remove `--font-display: Bricolage Grotesque`, `Public Sans`, `Space Mono` (currently loaded inconsistently on creators/civic/travel-operators only). Standardize `--font-display` and `--font-sans` on Plus Jakarta Sans, `--font-mono` on Fira Code, across every page's `<link>` tags and CSS vars.

**Motion** — no intro/loading screen anywhere (none currently exist — stays that way). Scroll-into-view: vanilla `IntersectionObserver`, opacity/translateY fade, ≤200ms ease, content visible by default (never depends on JS to appear, no FOUC). Respects `prefers-reduced-motion`. No new script dependency — self-hosted under `/assets/`, fits existing `script-src 'self'`.

**Carried forward from the prior (2026-06-13) redesign spec, still load-bearing:**
- Alpine.js pinned `3.15.12`, Lucide pinned `1.18.0`, both with SRI hashes
- `<style>[x-cloak] { display: none !important; }</style>` in `<head>` of every page
- `.catch(() => {})` on navbar/footer fetch chains
- Navbar/footer loaded via Alpine `x-html` fetch pattern — architecture unchanged
- Privacy-policy anchor IDs (`#privacy`, `#support`) untouched — App Store links depend on them
- Privacy "last updated" dates stay hardcoded strings, not `new Date()`
- Footer year stays hardcoded, no `x-data` on footer component
- CSP/security headers in `firebase.json` — not touched by this redesign
- LOTR links stay root-relative (`/lord-of-the-rings`)

---

## 2. Tooling (built once, reused by every piece)

- **Local static server**: tiny Node `http` script (no dependencies) serving `public/` on a local port, so Alpine's `fetch()`-based navbar/footer includes actually resolve when Playwright loads a page. `file://` URLs don't support this fetch pattern.
- **Playwright** (already installed under the session scratchpad; Chromium verified working against live ochi.design): captures the piece's local render and the matching Ochi section, at desktop (1440×900) and mobile (390×844).
- **Ochi reference shots** are captured once per relevant section/page and cached in the scratchpad; reused across critic rounds instead of re-fetching ochi.design every loop. Re-captured only if a critic flags a cached shot as stale or mismatched.
- **Blind comparison packet**: two screenshots placed side-by-side, left/right order randomized per round, no text labels identifying either side. The critic subagent is fresh (new invocation, no memory of the builder's work or self-assessment) and is told only "which of these two is the stronger piece of design, and why" — never which one is "ours." The orchestrating thread decodes which side was ours only after the verdict is given.

## 3. Builder/Critic Workflow

For each piece:
1. **Builder subagent** — scoped to that piece's exact files/CSS classes/HTML block only. Given: the piece's current markup, the token foundation (Section 1), the constraint list, and (round 2+) the prior critic's named gap. Makes the edit.
2. **Critic subagent** — fresh context, no knowledge of prior rounds. Starts the local server if needed, captures the piece's current render, retrieves/captures the matching Ochi reference, views both blind (randomized order, no labels), and states which is the stronger design and why (typographic confidence, whitespace, grid discipline, restraint) — not a numeric score.
3. If the critic prefers Ochi: it names the single biggest gap. That gap, plus the images, goes back to a new builder round. Repeat until the piece's render wins the blind comparison.
4. Once a piece wins, move to the next piece in the phase.

**Integration pass** (end of each phase): load the phase's pieces together in context, confirm they read as one system (consistent tokens, no seams between adjacent pieces, nav/footer consistent across pages touched), and grep the touched files for any reintroduced loading-screen/heavy-animation/scroll-jacking code before reporting.

---

## 4. Piece Inventory and Phasing

Ordered so later phases inherit a settled foundation rather than fighting it. **Report-back happens after each phase's integration pass** — the next phase does not start without the user having seen that report. This is the brake point the user asked for.

1. **Phase 0 — Foundation**: Section 1 token system implemented in `style.css` + font cleanup + Section 2 tooling built. No critic loop (infrastructure, not a visual piece) but verified visually via one full-page screenshot pass to confirm no regressions.
2. **Phase 1 — Global pieces**: Nav (`components/navbar.html`), Footer (`components/footer.html`, folds in the homepage's `final-cta` band since it's one thin adjacent unit).
3. **Phase 2 — Homepage sections**: Hero (folds in the `stat-bar` strip directly beneath it), How-it-works, Creator teaser block (`monetize-band`), Portfolio teaser block (`showcase-section`). Homepage integration pass at the end.
4. **Phase 3 — Named full pages**: `/our-work` (full portfolio grid), `/creators` (full creator program page).
5. **Phase 4 — Remaining standalone pages**: `/civic`, `/travel-operators`, `/product`, `/contact`, `/legal`, `/login`, `/404`.
6. **Phase 5 — App-detail template**: shared structure behind `guide-akl`, `kai-akl`, `volcanic-akl`, `lord-of-the-rings` — one template piece, verified across all four per-app accent themes.
7. **Phase 6 — Blog**: blog index, category-page template, post template — covers ~80 content pages via template reuse, not 80 individual passes.

---

## 5. Out of Scope

- New pages or routes
- Copy/content rewrites beyond what a piece's new layout structurally requires
- Firebase/backend changes
- Any dependency or host not already permitted by the current CSP
- Ochi's scroll-jacking, WebGL/Three.js interaction, and loading screen — explicitly excluded, not a gap to close
