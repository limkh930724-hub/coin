# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static Korean-language financial tools site (backtest comparator + compound interest calculator) deployed on Cloudflare, with a single CORS-proxy endpoint for Yahoo Finance data. No build step, no package.json, no framework, no tests — plain HTML/CSS/JS files served as-is.

## Commands

- Local dev: `node dev-server.js` (default port 8788, override with `node dev-server.js 3000`). This is the only local setup where the backtest actually works — see below.
- Deploy: `npx wrangler deploy` (requires Cloudflare auth). If Cloudflare's dashboard has GitHub CI/CD wired to this repo, pushing to `main` auto-deploys.
- Verify a ticker before adding it to `KR_STOCKS`: `curl 'https://query1.finance.yahoo.com/v8/finance/chart/005930.KS?range=5d&interval=1d'`

There is no test runner, linter, or bundler. Verify data plumbing with direct `curl` calls to the Yahoo chart API rather than assuming UI behavior. To syntax-check the inline JS: `perl -0777 -ne 'print $1 while /<script>(.*?)<\/script>/gs' index.html > /tmp/idx.js && node --check /tmp/idx.js`.

**Local testing:** `/api/proxy` does not exist under a plain static server, so every backtest fetch 404s with `npx serve .` and is blocked outright under `file://`. `dev-server.js` is a ~100-line Node script that reproduces the two things `worker.js` does — the `/api/proxy` yahoo.com-whitelisted proxy and static file serving (plus the `404.html` fallback) — because `wrangler dev` requires Node 22+ and this machine runs 18. It is a dev-only file, never deployed; **keep its `handleProxy` in sync with `worker.js` and `functions/api/proxy.js`.**

## Deployment architecture (read this before touching routing/proxy code)

This repo is deployed to Cloudflare **Workers** (not Pages), despite the `*.pages.dev` domain name. That distinction matters a lot here:

- `worker.js` + `wrangler.toml` is the **active** deployment path. `wrangler.toml` configures `[assets] directory = "."` with `binding = "ASSETS"`; `worker.js` routes `/api/proxy` to its own inline `handleProxy()` and forwards everything else to `env.ASSETS.fetch(request)` (i.e. serves the static files in this folder).
- `functions/api/proxy.js` is a **legacy Cloudflare Pages Function** (the `onRequest(context)` export format). It only works if this project is ever redeployed as Cloudflare *Pages* instead of *Workers* — Pages auto-routes the `functions/` directory, Workers does not. Keep both files' proxy logic in sync if you change one (domain whitelist, headers, caching) — `worker.js`'s `handleProxy()` is a duplicate of `functions/api/proxy.js`'s `onRequest()`, adapted to the Workers fetch handler signature.

## CORS proxy

Yahoo Finance has no public CORS headers, so all chart-data fetches in `index.html` go through `/api/proxy?url=<encoded yahoo url>` (see `CORS_PROXY` const in `index.html`). The proxy:
- Only allows hostnames ending in `yahoo.com` (hard whitelist — extend deliberately, not by loosening the suffix check).
- Caches responses 60s, adds permissive CORS headers, handles `OPTIONS` preflight, spoofs a desktop Chrome `User-Agent` (Yahoo rejects some default agents).

## Pages and routing

There is no router/framework. Every HTML file shares one stylesheet, `style.css` — it holds the whole design system (`:root` tokens, all component classes for both the tool page and the prose pages). The system follows **shadcn/ui defaults**: a neutral zinc palette and black solid buttons (`--primary`), but with a softened radius pair (`--r` 14px for cards/tables/popovers, `--r-sm` 10px for inputs/small buttons, `--r-pill` for tabs and period chips) and real layered shadows (`--sh-sm`/`--sh-md`/`--sh-btn`/`--sh-lift`) on raised elements. Flat elements still separate with a border, not a shadow. Buttons come in three variants — solid (`.run-btn`, `.back-cta a`), outline (`.period-btn`, `.add-sym-btn`), ghost (`.tip-btn`) — and `.main-tabs` / `.radio-group` / `.chart-tabs` all share the shadcn Tabs shape (muted track, white card on the active item). Color is reserved for data only: the `--s1`/`--s2`/`--s3` series and `--pos`/`--neg`. The winner highlight follows that rule through `--win`/`--win-fg`, set per card by the `.a`/`.b`/`.c` class and consumed by `.summary-card.winner`, `.comp-card.winner` and the badges — so the highlight is always the winning symbol's own series color, never a fixed accent (a fixed blue collided with series A whenever B or C won). `--win-fg` exists because white text fails on the light orange series. Change a color, a type size, or the nav/footer look there once; do not reintroduce per-page `<style>` blocks.

Pages at the repo root link `style.css` relatively; files under `posts/` link `../style.css`. `404.html` is the one page that uses absolute paths (`/style.css`, `/posts/…`) — it has to, because Cloudflare serves it for arbitrary URL depths.

- `index.html` — the single-page app root containing **both** tools as tabs. Tab state: `?tab=backtest|compound` query param, falling back to `localStorage['fin-active-tab']`, falling back to `'backtest'`. See `ALLOWED_TABS`, `initTabs()`.
- `posts/index.html` + 9 article pages under `posts/` — the SEO/AdSense content section. Every figure in those articles was computed from real Yahoo data using the same `calcLumpSum`/`calcDCA` logic as the tool, and each article ends with a deep link that reproduces its numbers. **Changing those functions silently makes the published articles wrong** — re-derive the figures if you touch them.
- `guide.html`, `about.html`, `terms.html`, `contact.html`, `privacy.html` — static prose pages.
- `404.html` — served by `not_found_handling = "404-page"` in `wrangler.toml` (and by `dev-server.js` locally).

Internal links use **relative paths** (`privacy.html`, `../style.css`) so the site still works when opened directly from disk. `404.html` is the sole exception and must stay absolute.

The nav and footer markup is duplicated in every page (no templating). Adding a page means editing every file's nav/footer plus `sitemap.xml`.

## Backtest tool internals (index.html)

- Up to 3 symbols (`sym-a`/`sym-b`/`sym-c`, with C toggled via `showSymC()`/`hideSymC()`) are compared over a date range (preset year buttons or a Flatpickr range picker) using either lump-sum (`calcLumpSum`) or DCA (`calcDCA`) investment simulation.
- `fetchStockData(sym, start, end)` pulls Yahoo chart data through the proxy; `fetchSymbolName(sym)` resolves a ticker to a display name on input blur (`setupSymbolLookup`).
- **Shareable URLs:** `applyUrlParams()` runs in `DOMContentLoaded` right after `initTabs()` and fills the form from `?a=&b=&c=&amt=&type=&years=`; `syncUrl()` writes those params back after every successful run so the address bar is always a shareable link. Articles under `posts/` link into the tool with these params. `initTabs()` separately owns `?tab=`, and neither function touches the other's params. A hand-picked Flatpickr date range is deliberately not encoded — only the preset year buttons round-trip.
- **Auto-run on load:** `DOMContentLoaded` calls `runBacktest({ autorun: true })` whenever **both symbol inputs are non-empty**. Because that runs after `applyUrlParams()`, every `?a=&b=` deep link from `posts/` fires a run on load too — not just the SPY-vs-QQQ default. It exists so the first paint isn't an empty page (an AdSense content requirement). The `autorun` flag exists solely to suppress the `scrollIntoView` jump; don't reuse it for other behavior.
- **Korean stock support**: `KR_STOCKS` is a hand-maintained array of `{name, ticker}` for major KOSPI (`.KS`)/KOSDAQ (`.KQ`) tickers. `setupKrAutocomplete(inputId, dropdownId)` wires a type-ahead dropdown on each symbol input (filtered by Korean name substring match). The dropdown's `mousedown` handler calls `preventDefault()` so the click registers before the input's `blur` fires, then sets `input.value` to the ticker and dispatches a synthetic `blur` event to reuse `setupSymbolLookup`'s existing name-resolution logic. `krNameFromTicker(ticker)` reverse-maps a ticker back to its Korean name for display in summary cards/table headers/chart legend, falling back to the raw ticker for non-KR symbols. When adding tickers, verify them against the chart API first — delistings/mergers do happen (e.g. `091990.KQ` Celltrion Healthcare was removed after its 2023 merger).
- **Comparison table on mobile:** the `.comp-table` is transposed (rows = metrics, columns = symbols), which cannot be turned into per-symbol cards with CSS alone. `renderCompCards()` — called at the end of `renderTable()` — fills `#comp-cards` with one card per symbol from the same data. Under 640px the table is hidden and the cards shown; above it, the reverse. Both views must stay in sync, so add any new metric to `renderTable` **and** `renderCompCards`.
- Results render into: summary cards (`renderSummaryCards`), a comparison table (`renderTable`), and a Chart.js line chart (`renderChart`, toggled between cumulative-return % and absolute value via `tab-returns`/`tab-value`). `renderChart` downsamples long series before plotting.
- Both charts' ₩ axes go through `axisKRW(v, ticks)`, **not** `fmtKRW`/`formatKRW`. It picks one unit (만 or 억) from the axis maximum and applies it to every tick, because per-tick formatting produced axes that flipped units mid-scale (`₩8,000만` directly under `₩1.00억`), which makes tick spacing unreadable. A new ₩ axis must use it.
- `showStatus()` reveals `#status-box` **without scrolling to it**, while the success path ends with `scrollIntoView`. On a tall form the loading and error messages therefore render off-screen and the run looks like it did nothing. Anything added to the error path inherits that.

### 하단 해설 아코디언

The `.seo-prose` block at the bottom of `index.html` is five `<details class="seo-prose-section">` elements — native disclosure widgets, no JS, **default collapsed** (never add an `open` attribute). Each `<summary>` wraps the section `<h2>`; the chevron is a CSS-only `summary::after` that rotates on `[open]`. Collapsed content still lives in the DOM, so crawlers and AdSense see all of it. Styling for these lives under "하단 해설 아코디언" in `style.css`, and `.seo-prose { gap: 0 }` at the very end of that file must stay after the shared `.prose, .seo-prose` rule to win on source order.

Mobile ordering is deliberate: hero (one short line) → tabs → tool, with `.tool-desc-banner` moved *below* the tool panels. The tool must be reachable without scrolling past prose. Don't move descriptive copy back above `.main-tabs`.

`.form-rows` is a plain vertical stack on mobile but becomes a **two-column grid above 768px**, so its children auto-place in pairs (투자방식 + 금액, then 기간 + 날짜) and "비교 시작" stays on the same screen as the form. Adding or removing a row therefore reflows the desktop pairing — check both widths, and give anything that must span both columns `grid-column: 1 / -1` (as `.error-msg` does).

## Compound calculator tool internals (index.html)

Separate tab, separate render path (`updateCompound`, lazy-inited once via `compoundInited` when the tab is first opened — `initCompoundTool()` constructs the Chart.js instance, so it must not run before the panel is visible). Pure client-side math, no network calls — compares compound vs. simple vs. straight-line (no interest) growth on sliders for principal/annual addition/rate/years.

`.slider-value` has a **fixed 190px width**, sized to the longest string the row can produce (`₩5,000만 (월 ₩417만)` at the 연간 투자금 maximum). It is not cosmetic: the row is a flex line, so a value wider than its box shortens that row's track and the four sliders stop lining up. If a value string can get longer, widen the box to match. `.slider-row` is likewise capped at 720px so the track doesn't stretch label and value to opposite edges of a wide card.

## Conventions specific to this repo

- Korean-language UI and comments throughout; keep new user-facing strings in Korean unless told otherwise.
- All money formatting goes through `fmtKRW`/`formatKRW` (₩ with 만/억 abbreviation) — don't introduce a second formatting scheme.
- Emoji characters were deliberately replaced with inline SVG icons everywhere (logo, tab icons, disclaimer bar, favicon) because emoji rendered as `??` in some deployment environments. Do not reintroduce raw emoji into HTML/SVG `<text>` favicons — use inline `<svg>` with `stroke`/`fill` instead.
- Chart.js and Flatpickr load from `cdn.jsdelivr.net` as unpinned `defer` scripts. All code that touches them therefore runs from `DOMContentLoaded` or later — don't move initialization earlier. The base typeface is Pretendard Variable (dynamic subset, also jsDelivr) with the system stack as fallback; there is no Google Fonts request — theme fonts come from `@fontsource` on the same jsDelivr host (see "Theme modes" below).
- Chart colors are **not** hardcoded any more: `chartColors()` in `index.html` reads `--s1`/`--s2`/`--s3` plus `--chart-grid`/`--chart-tick`/`--chart-dim` off `:root` with `getComputedStyle`, so both charts follow the active theme automatically. The summary-card dots, table header dots, and legend dots use the same tokens inline (`style="background:var(--s1)"`). Change a series color in `style.css` only — never reintroduce a hex into the Chart.js configs or the markup.
- Never set an input's `font-size` below `1rem` — iOS Safari zooms the page on focus below 16px.
- `<meta name="google-site-verification">`, the AdSense `<script>` tag (`ca-pub-...`), `ads.txt`, `robots.txt`, and `sitemap.xml` are all live AdSense/Search-Console verification artifacts — don't remove or change the publisher ID without checking with the site owner, since that will break ad serving / search verification.
- **Canonical domain is `coin-3av.pages.dev`.** It appears in the `<link rel="canonical">` of every page, in `index.html`'s og:url / og:image / twitter:image / JSON-LD `url`, in each article's Article JSON-LD (`mainEntityOfPage`), in every `<loc>` in `sitemap.xml`, and in the `Sitemap:` line of `robots.txt`. If it changes, sweep them all: `grep -rl 'coin-3av.pages.dev' .`. Adding a new page means adding a `<loc>` to `sitemap.xml` too.
- `og-image.png` still uses the old gold/cream design and no longer matches the site. Regenerate it if social previews matter.

## First-visit tour (tour.js)

`index.html` only — the other pages have no form to explain. `tour.js` is a
`defer`red script that spotlights five targets in order (`#sym-ab-grid`,
`#step-type`, `.amount-row`, `#step-period`, `#run-btn`) with a bubble beside
each. `#step-type` and `#step-period` exist *solely* as tour anchors: both are
plain `.form-row` divs and there is no other way to tell them apart. Renaming or
removing them silently drops a step (`show()` skips a missing target).

- The spotlight is one absolutely-positioned div with `box-shadow: 0 0 0 9999px`
  — no four-rect overlay, no SVG mask. It is positioned in **document**
  coordinates (`rect + window.scrollY`), which is why nothing listens for scroll:
  the hole travels with the page on its own. Only `resize` re-runs `place()`.
- `pointer-events: none` on the hole keeps the form usable during the tour, so
  the tour is never a trap.
- It auto-runs once, on `load` + 600ms so it isn't explaining a page that hasn't
  drawn its first result yet. Two dismissals with different weights: `다시 안 보기`
  and finishing the last step write `localStorage['fin-tour-done']` (permanent),
  while `오늘 하루 안 보기` and Esc write `fin-tour-snooze` — a timestamp for
  tonight's midnight, not now-plus-24h, so the label is literally true. Esc is
  deliberately the soft one; a stray keypress should not retire the tour forever.
  Reloading mid-tour without touching either still brings it back.
- `scrollIntoView` is **instant, not smooth**. `place()` runs right after it and
  reads `window.scrollY`, which during a smooth scroll is still the old value —
  the viewport clamp then computes against the wrong origin and the bubble lands
  off-screen. The motion comes from the hole's CSS transition instead.
- Replay paths: the `처음부터 단계별로 안내받기` button inside the 사용 팁 popover
  (`onclick="startTour()"`, exposed as `window.startTour`), or `?tour=1`.
  `startTour()` closes any open tip popover first — the class is `.open`, not
  `.show`.
- The step chips (`.step-num` / `.step-opt`) in the form are a separate,
  always-on affordance and share nothing with the tour but the numbering.

## Theme modes (theme.js + the `[data-theme]` blocks in style.css)

Two modes ship: `base` (the shadcn default) and `riso` (paper ground, 3px ink
borders, hard offset shadows, riso blue/orange inks, Black Han Sans headings, and
a pictogram icon treatment). A third `terminal` mode existed briefly and was
removed — `saved()` in `theme.js` falls back to `base` for any stored value not in
`THEMES`, so a visitor with `fin-theme=terminal` still in localStorage lands on
base with no error. Don't add a migration for it.

**Layout is identical in both modes.** A theme block may change how an element is
*painted* — color, typeface, border width, shadow, radius, and how an icon is
stroked or filled — but must not change the page's layout structure: no
repositioning, no reordering, no new breakpoints, nothing that changes which
element sits where. That is what keeps one set of markup and one responsive pass
valid for both.

- `theme.js` is loaded **synchronously** in every page's `<head>`, immediately before
  the `style.css` link. It must not be `defer`red: it sets `<html data-theme>` from
  `localStorage['fin-theme']` before first paint, and deferring it makes the base theme
  flash first. It also injects the switcher into `.topnav` on `DOMContentLoaded` and
  updates `<meta name="theme-color">`.
- Theme fonts load lazily: `theme.js` appends the `@fontsource` stylesheet for the
  active theme only, so the base theme costs no extra request. Riso pulls
  `black-han-sans`; base pulls nothing.
- Everything a theme needs must be a token. When adding a component, use the existing
  tokens (`--bg`, `--ink*`, `--border*`, `--sh-*`, `--r*`, `--font*`, `--s1..3`) rather
  than a literal color/radius/shadow, or it will look wrong in riso.
  `--font-display` and `--font-num` default to `inherit`, so applying them is a no-op
  in the base theme.
- **The pictogram layer** (the "리소: 픽토그램" block) restyles the shared inline SVG
  icons without touching markup, which works because a CSS `stroke-width` /
  `stroke-linecap` / `fill` rule beats the same-named SVG presentation attribute. Riso
  redraws every icon heavy with square caps and miter joins, fills the warning
  triangle solid (targeting its `path` and `line` children separately), turns the round
  series dots square with a `box-shadow` ring (a ring, not a border, so the dot's size
  is unchanged), and adds an ink square before card and chart titles. A new icon needs
  its class added to those selector lists or it will stay thin-lined in riso.
- Charts keep their colors in JS objects, so they cannot follow CSS on their own:
  `theme.js` fires a `themechange` event and `index.html` listens for it — it re-runs
  `renderChart` from the stashed `_chartData` and patches `compoundChartInstance` in
  place. A new chart must be hooked into that listener too.
- Adding a page means adding the `theme.js` script tag along with the nav/footer markup
  (`../theme.js` under `posts/`, absolute `/theme.js` in `404.html`).
