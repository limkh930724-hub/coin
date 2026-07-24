# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static financial tools site (backtest comparator + compound interest calculator) deployed on Cloudflare, with a single CORS-proxy endpoint for Yahoo Finance data. No build step, no package.json, no framework — plain HTML/CSS/JS files served as-is.

## Deployment architecture (read this before touching routing/proxy code)

This repo is deployed to Cloudflare **Workers** (not Pages), at a `*.workers.dev` / custom domain. That distinction matters a lot here:

- `worker.js` + `wrangler.toml` is the **active** deployment path. `wrangler.toml` configures `[assets] directory = "."` with `binding = "ASSETS"`; `worker.js` routes `/api/proxy` to its own inline proxy handler and forwards everything else to `env.ASSETS.fetch(request)` (i.e. serves the static files in this folder).
- `functions/api/proxy.js` is a **legacy Cloudflare Pages Function** (the `onRequest(context)` export format). It only works if this project is ever redeployed as Cloudflare *Pages* instead of *Workers* — Pages auto-routes the `functions/` directory, Workers does not. Keep both files' proxy logic in sync if you change one (domain whitelist, headers, caching) — `worker.js`'s `handleProxy()` is a duplicate of `functions/api/proxy.js`'s `onRequest()`, adapted to the Workers fetch handler signature.
- To deploy manually: `npx wrangler deploy` (requires Cloudflare auth). If Cloudflare's dashboard has GitHub CI/CD wired to this repo, pushing to `main` auto-deploys.

## CORS proxy

Yahoo Finance has no public CORS headers, so all chart-data fetches in `index.html` go through `/api/proxy?url=<encoded yahoo url>` (see `CORS_PROXY` const in `index.html`). The proxy:
- Only allows hostnames ending in `yahoo.com` (hard whitelist — extend deliberately, not by loosening the suffix check).
- Caches responses 60s, adds permissive CORS headers, handles `OPTIONS` preflight.

## Pages and routing

There is no router/framework. `index.html` is the single-page app root containing **both** tools as tabs:
- Tab state: `?tab=backtest|backtest|compound` query param, falling back to `localStorage['fin-active-tab']`, falling back to `'backtest'`. See `ALLOWED_TABS`, `initTabs()` in `index.html`.
- `privacy.html` is a separate static page (linked via relative path, not absolute — this matters for local file:// testing).
- All internal links use **relative paths** (`privacy.html`, not `/privacy.html`) so the site still works when opened directly from disk without a server.

## Backtest tool internals (index.html)

- Up to 3 symbols (`sym-a`/`sym-b`/`sym-c`, with C toggled via `showSymC()`/`hideSymC()`) are compared over a date range (preset year buttons or a Flatpickr range picker) using either lump-sum (`calcLumpSum`) or DCA (`calcDCA`) investment simulation.
- `fetchStockData(sym, start, end)` pulls Yahoo chart data through the proxy; `fetchSymbolName(sym)` resolves a ticker to a display name on input blur (`setupSymbolLookup`).
- **Korean stock support**: `KR_STOCKS` is a hand-maintained array of `{name, ticker}` for major KOSPI (`.KS`)/KOSDAQ (`.KQ`) tickers. `setupKrAutocomplete(inputId, dropdownId)` wires a type-ahead dropdown on each symbol input (filtered by Korean name substring match). The dropdown's `mousedown` handler calls `preventDefault()` so the click registers before the input's `blur` fires, then sets `input.value` to the ticker and dispatches a synthetic `blur` event to reuse `setupSymbolLookup`'s existing name-resolution logic. `krNameFromTicker(ticker)` reverse-maps a ticker back to its Korean name for display in summary cards/table headers/chart legend, falling back to the raw ticker for non-KR symbols. When adding tickers to `KR_STOCKS`, verify them against `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=5d&interval=1d` first — delistings/mergers do happen (e.g. `091990.KQ` Celltrion Healthcare was removed after its 2023 merger).
- Results render into: summary cards (`renderSummaryCards`), a comparison table (`renderTable`), and a Chart.js line chart (`renderChart`, toggled between cumulative-return % and absolute value via `tab-returns`/`tab-values`).

## Compound calculator tool internals (index.html)

Separate tab, separate render path (`updateCompound`, lazy-inited once via `compoundInited` when the tab is first opened). Pure client-side math, no network calls — compares compound vs. simple vs. straight-line (no interest) growth on sliders for principal/annual addition/rate/years.

## Conventions specific to this repo

- Korean-language UI and comments throughout; keep new user-facing strings in Korean unless told otherwise.
- All money formatting goes through `fmtKRW`/`formatKRW` (₩ with 만/억 abbreviation) — don't introduce a second formatting scheme.
- Emoji characters were deliberately replaced with inline SVG icons everywhere (logo, tab icons, disclaimer bar, favicon) because emoji rendered as `??` in some deployment environments. Do not reintroduce raw emoji into HTML/SVG `<text>` favicons — use inline `<svg>` with `stroke`/`fill` instead.
- `<meta name="google-site-verification">`, the AdSense `<script>` tag (`ca-pub-...`), `ads.txt`, `robots.txt`, and `sitemap.xml` are all live AdSense/Search-Console verification artifacts — don't remove or change the publisher ID without checking with the site owner, since that will break ad serving / search verification.
- Canonical URLs / sitemap / robots.txt currently point at `backtest-lab.pages.dev`; if the production domain changes, update all four together (`index.html` canonical + og:url + JSON-LD url, `privacy.html` canonical, `sitemap.xml`, `robots.txt`).

## No build/test/lint tooling

There is no `package.json`, no test runner, no linter, no bundler. Verify changes by opening `index.html` directly in a browser or via `npx serve .` locally; verify Yahoo Finance data plumbing with direct `curl` calls to the chart API endpoint (see Korean stock verification approach above) rather than assuming UI behavior.
