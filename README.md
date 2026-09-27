# Futures Signal Terminal (prototype)

A single-file, browser-only dashboard for crypto perpetual futures (BTC, ETH, SOL, XRP, DOGE, BNB; USDT-margined).
It pulls live candles, funding and open interest from public exchange APIs, computes the indicators in JavaScript, and runs a
rule-based "expert trader" signal engine that gives a **LONG / SHORT / DON'T TRADE** verdict (green / red / gray banner with
plain-English reasons), a −100…+100 score, a market-condition label (chop detector), a multi-timeframe strip, a factor-by-factor
breakdown, a trade plan, a position-size calculator, expert notes, a backtest with an out-of-sample check, an optional
**A+ setups only** mode, an in-browser **AI probability model**, an optional **AI analyst** chat (bring your own API key), and a
**My trades** tracker that gives rules-based recommendations on positions you enter yourself.
Works on phones and installs as a PWA.

> Educational tool. The signals are rule-based, not financial advice. Leveraged futures can lose more than you expect.

## Run it

No backend, no API keys, no build step needed. `index.html` is self-contained (it loads only the
TradingView *lightweight-charts* library from unpkg).

```bash
cd crypto-signals/dist
python3 -m http.server 8000      # then open http://localhost:8000/
```

Opening `index.html` directly (`file://`) also works in Chromium (both exchanges answer CORS for the `null` origin); the
service worker / install option only exist over `https://` or `http://localhost`.

### Deploy (static hosting) and install on your phone

`dist/` is the deployable folder: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, `.nojekyll`. Upload it to any
static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, S3…). All paths are relative, so a sub-path like
`https://you.github.io/signals/` works. The exchange APIs send CORS headers for any origin (checked with
`Origin: https://example.github.io`: OKX reflects the origin, Gate.io sends `*`), so no proxy is needed.

* **iPhone (Safari):** open the site → Share → **Add to Home Screen**.
* **Android (Chrome):** open the site → ⋮ menu → **Install app** (or "Add to Home screen").

The service worker caches only the app shell (network-first) and the versioned chart library (cache-first). Exchange API
calls and AI-provider calls are never cached, so market data is always live or visibly failing ("offline"/"data error").

### Mobile layout

≤ 1024 px switches to one column in this order: verdict → chart → trade plan → position size → tabs. 44 px+ tap targets,
scrollable symbol/timeframe pills, sticky tab bar, collapsible plan/size cards, 16 px `inputmode="decimal"` inputs (no iOS
zoom), tables reflow into cards ≤ 640 px, safe-area insets (`viewport-fit=cover`), landscape chart fills the screen. Chart:
one-finger horizontal drag pans, pinch zooms, vertical swipes are left to the page (`vertTouchDrag:false`). Refresh pauses
while the tab/app is hidden; tabs render lazily; the backtest + AI training run in a Web Worker.

### Scripture banner

A slim banner under the header shows Bible verses on wealth, prosperity, provision, diligence, generosity and wise
stewardship: 30 passages, **King James Version (public domain)**. Each verse was fetched verbatim from bible-api.com
(`tests/verses_verified.json` keeps the text, reference and source URL) and is bundled into the page, so it works offline.
The banner starts at a random verse on each load, then goes through them in order every 10 s with a crossfade. Tap or click it
for the next verse. It pauses while hovered or pressed; with reduced motion it switches without the fade. Verses are never cut
off: long ones use a smaller font (at most 3 lines on phones). On narrow phones, a multi-verse passage that doesn't fit shows
one complete verse from it, and a single verse that is still too long is skipped on that screen. Use the × to hide the banner
(remembered in localStorage) and "Show scripture banner" in the footer to bring it back.

## Data sources (tested from a US-located machine, Sep 2026)

| Source | Used for | Browser CORS | Status |
|---|---|---|---|
| **OKX v5 public** (`/market/candles`, `/market/history-candles`, `/market/ticker`, `/public/funding-rate`, `/public/funding-rate-history`, `/public/open-interest`) | primary candles, ticker, funding, OI | yes (reflects Origin) | ✅ works |
| **Gate.io v4 futures** (`/futures/usdt/candlesticks`, `/tickers`, `/funding_rate`, `/contract_stats`) | automatic fallback for candles/ticker/funding; **OI history (24h change), long/short ratio, top-trader ratio, liquidations** | `*` | ✅ works |
| Binance USDⓈ-M (`fapi.binance.com`) | — | — | ❌ HTTP 451 (restricted location) |
| Bybit v5 (`api.bybit.com`) | — | — | ❌ HTTP 403 (CloudFront geo-block) |
| OKX Rubik stats (OI history / L-S ratio) | — | ❌ no `Access-Control-Allow-Origin` | not usable from the browser |
| Kraken Futures charts/analytics | — | ❌ empty ACAO header | not usable from the browser |

Fallback logic: every candle request tries OKX first and falls back to Gate.io on error/timeout (HTTP 429 is retried with
backoff first). The header shows which source is live ("Live · OKX" or "Live · Gate.io (fallback)"). Because both work
directly from the browser, no proxy server is needed.

### Refresh and rate limits

The first load of a coin/timeframe fetches full history (1,200 bars + higher timeframes; the backtest's 3,000-bar history
loads in the background and is cached 30 min). After that, each 10 s refresh fetches only:

* the newest 100 candles of the current timeframe (1 request, merged into the cached series by timestamp; a full reload
  happens only on a gap or an error, and every 10 min while on the Gate.io fallback so OKX gets retried), and
* the ticker (1 request) for the price and 24 h change.

Slower data refreshes on its own clock, also incrementally: higher-timeframe candles and positioning (funding, funding
history, open interest, Gate.io OI history / long-short ratio: 7 requests) every 60 s, and the multi-timeframe strip every
90 s. Each coin with an open trade adds 1 ticker per refresh plus the same 60/90 s updates. A tick is skipped if the previous
refresh (or its background multi-timeframe/history fetch, or the trades update) is still running, so requests never pile
up, and the timer pauses while the tab/app is hidden. Measured over a 2-minute run (`tests/refresh_test.py`, desktop and
iPhone 14 open at the same time from one IP): usually 2 requests per refresh (3 with one open trade on another coin),
4–11 on the refreshes where the 60/90 s data comes due, about 3–6 requests per 10 s on average, no HTTP 429s. OKX public
limits are 40 req/2 s for candles, 20/2 s for ticker, history-candles and open interest, and 10/2 s for funding endpoints;
Gate.io public endpoints allow about 200 req/10 s.

## Features

* Symbols BTC/ETH/SOL/XRP/DOGE/BNB perps, timeframes 15m/1h/4h/1d (higher-timeframe filter = 1h/4h/1d/1w respectively).
* Chart: candlesticks, EMA 20/50/200, Bollinger(20,2), volume, RSI(14) pane, MACD(12,26,9) pane, markers for every historical
  signal the engine took (with its R result), live-signal marker and entry/SL/TP price lines when a signal is active.
* Indicators (JS, verified): EMA, RSI (Wilder), MACD, Bollinger (population σ), ATR (Wilder), ADX/+DI/−DI (Wilder), Stoch RSI
  (14,14,3,3), VWAP (session = UTC day on intraday TFs, 20-bar rolling on 1d), volume ÷ 20-bar average, OBV + 20-bar
  regression slope, 20-bar high/low, confirmed swing pivots.
* Futures data: current funding (+ 8h-equivalent and annualized), next funding time, 30-settlement funding history,
  open interest (OKX), 24h OI change, account long/short ratio, top-trader L/S, 24h long/short liquidations (Gate.io).
* Auto-refresh every 10 s with last-updated time + countdown; settings persist in localStorage. Refreshes are incremental and
  never overlap (see *Refresh and rate limits* below).

## How the signal engine works

Evaluated on the **last closed candle** (never on the forming one). Each factor contributes signed points; the sum is
clamped to ±100.

| Group | Factor | Max | Logic |
|---|---|---|---|
| Trend | Higher-timeframe trend | ±20 | HTF close vs EMA200 and EMA50 vs EMA200 (both agree = ±20, mixed = ±6) |
| Trend | EMA structure | ±15 | stack of price/EMA20/EMA50/EMA200 |
| Setup | Regime & setup | ±20 | **ADX ≥ 25 (trend):** pullback to EMA20 (or EMA50) with RSI reset to 35–55 and turning = ±20/±17; extended > 2.5 ATR from EMA20 = "don't chase". **ADX < 20 (range):** tag of the outer Bollinger band with RSI ≤ 35 / ≥ 65 = mean-reversion ±14–18; mid-range = 0. **20–25:** no regime, small bias only |
| Momentum | MACD | ±10 | fresh cross (≤ 3 bars) ±10; histogram expanding ±7 / fading ±3 |
| Momentum | RSI regime | ±10 | bull regime (14-bar RSI low ≥ 40, RSI > 50) / bear regime (high ≤ 60, RSI < 50); capped when > 80 / < 20 |
| Momentum | RSI divergence | ±12 | regular divergence between the last two confirmed pivots (5 left / 3 right bars) |
| Volume | Breakout volume | ±10 | close beyond the prior 20-bar high/low on ≥ 1.5× volume = confirmed; on < 1× volume = fake-out penalty |
| Volume | OBV slope | ±5 | normalized 20-bar regression slope of OBV |
| Timing | Stoch RSI | ±5 | K/D cross out of < 25 or > 75 |
| Timing | VWAP | ±3 | price above/below VWAP |
| Positioning | Funding & crowding | ±10 | funding ≥ 0.03%/8h (+ OI up > 2% = crowded longs, −10); funding ≤ −0.02% with rising OI and price holding = short-squeeze fuel (+10) |
| Positioning | OI vs price (24h) | ±8 | OI↑ price↑ = confirmation (+6); OI↑ price↓ = shorts pressing (−6); OI↓ = covering/liquidation (±2) |
| Positioning | Long/short ratio | ±5 | contrarian: > 1.8 crowd long (−4), < 0.8 crowd short (+4) |

**Verdict (before the filter):** LONG if score ≥ +35, SHORT if ≤ −35, otherwise DON'T TRADE. A signal against the higher-timeframe trend is only
allowed with a reversal setup (divergence or range-extreme fade) **and** |score| ≥ 45 — otherwise it is filtered and the
card says why. **Confidence:** High = |score| ≥ 60 and ≥ 75 % of the weighted factors agree; Medium = |score| ≥ 45 and ≥ 60 %
agree; else Low.

**No-trade / chop filter** (any reason blocks the signal; the card lists every reason; defaults are textbook values fixed
in advance, not optimized): sideways = Choppiness Index(14) > 61.8, or ADX(14) < 20, or whipsaw (price crossed EMA20 ≥ 4× in
20 bars or EMA20/50 crossed ≥ 2× in 30 bars) with ADX < 25 (range-extreme fades are still allowed); Bollinger squeeze =
bandwidth in the lowest 10 % of 120 bars (unless a 1.5×-volume breakout); volatility too low = ATR% in the lowest 10 % of
200 bars; volatility shock = last range > 3× ATR, spike = ATR > 2× its 50-bar average; conflicting factors = < 60 % weighted
agreement; conflicting timeframes (HTF filter above); crowded funding |f| ≥ 0.1 %/8h against the trade; mid-range in a
range; stale data / feed errors / too little history. **Market condition** label: Volatile / Squeeze / Sideways-choppy /
Trending up / Trending down / Transitional; chop periods are shaded on the chart.

**A+ setups only** (toggle, default off): on top of a Normal signal it also needs the HTF trend **and** the daily trend
(15m/1h use 1d; 4h/1d use their HTF) to agree with the direction, market condition = Trending in that direction, factor
agreement ≥ 80 %, |score| ≥ 60, MACD and RSI regime both confirming, and no positioning red flag / extreme funding. Same
ATR stop and 1.5R / 3R targets — no target/stop tricks.

**Trade plan:** entry zone = last close to 0.35 ATR better; stop = 10-bar swing low/high ∓ 0.5 ATR, at least 1.5 ATR and at
most 4 ATR from entry; TP1 = 1.5R, TP2 = 3R; liquidation estimate for isolated linear perps
`entry × (1 ∓ 1/leverage ± 0.5% maintenance margin)` with a warning if the stop is beyond liquidation. When there is no
signal, a *hypothetical* plan for the leaning side is shown and clearly labelled.

**Position size:** risk $ = account × risk %; size = risk $ ÷ |entry − stop|; notional, margin = notional ÷ leverage,
effective leverage, round-trip fees. Warns above 10× leverage, when margin > account, and when risk > 2 %.

**Expert notes** are templated from the factor readings (context → trade/no-trade → invalidation / what changes my mind →
positioning → what to watch) — template text, not an LLM. **Playbook** tab: concise rules of thumb (risk, leverage, regime, funding/OI, news,
psychology).

## Backtest and honest statistics

Up to **3,000 candles** per symbol/timeframe (OKX `market/candles` gives the latest 1,440, older bars come from
`history-candles`, 100 per page, spaced 250 ms apart so two tabs on one IP stay under OKX's 20 req/2 s; cached 30 min). The engine is replayed bar by bar after a 210-bar warm-up using
only data available at each bar (HTF/daily filters use closed bars only). Entry next bar open; stop/targets as above; 50 %
off at TP1 (1.5R) and stop to breakeven, rest at TP2 (3R); 60-bar time stop; stop assumed first if both hit in one bar.
Costs 0.05 % fee + 0.02 % slippage per side; funding payments not modelled; positioning factors excluded (no free history).

The Backtest tab shows win rate **together with** TP1-hit and TP2-hit rates, average R / expectancy, profit factor, max
drawdown and trade count for the previous engine vs Normal vs A+ (plus the AI-filtered variants), on **Full history**,
**In-sample (first 70 %)** and **Out-of-sample (last 30 %)** — thresholds fixed before the split. Any result with **< 30
trades is flagged ⚠ n<30** (not meaningful). *Win rate alone is misleading; expectancy = win% × avg win − loss% × avg loss.*

Results of the 24-combo scan (Sep 27 2026, 1:02–1:06 PM CT; full tables in `tests/filter_comparison.md`, raw data in
`tests/scan_results.json`): Normal-mode win rates range 30.0 %–55.6 % over full history (18–51 trades per combo); A+ ranges
25.0 %–83.3 % but every A+ result has fewer than 30 trades; every out-of-sample (last 30 %) result in every mode has fewer
than 30 trades. Expectancy is positive in 13/24 combos for Normal (full history) and negative on e.g. BTC 1h (−0.23R over
49 trades). Nothing here reaches — or should be expected to reach — a 95 % win rate.

## My trades (log your own positions, get recommendations)

Open the **My trades** tab (or the "My trades" button in the header) and tap **+ Add trade**: coin (the 6 perps), Long/Short,
margin in USD, leverage 1–125 (quick buttons x5/x10/x20/x50/x100), entry price (pre-filled with the live price, editable),
the timeframe the trade is based on (defaults to the one on screen) and optional stop-loss / take-profit. While you type, the
form previews the position size and the estimated liquidation. Trades are saved in this browser's localStorage only
(`fst_trades`); you can have several open, edit them, close one (enter the exit price → it moves to a history list with its
P&L), or delete (tap twice). The app never places, changes or closes orders on any exchange.

Each open trade updates on every refresh (10 s):
* position size (margin × leverage) and coin quantity; unrealized P&L in $ and ROE %; price change since entry;
  estimated round-trip fees (not included in P&L; funding is not included either);
* **estimated liquidation price** — isolated margin with the same formula as the trade plan,
  `entry × (1 − 1/leverage + 0.5 %)` for longs and `entry × (1 + 1/leverage − 0.5 %)` for shorts — and the % distance from
  the current price to it; R-multiple progress against your stop (or against the suggested stop, labelled as such);
* a **recommendation badge** with 1–4 plain-English reasons, computed from the same signal engine (normal mode) on the trade's
  coin and timeframe, the next-higher timeframe verdict, and the trade's own numbers. Checked in this order:
  **DANGER** (price at or past the estimated liquidation, or within 1 % / one ATR of it) → **CLOSE / CUT LOSS** (your stop, or
  the suggested ATR stop if you set none, is broken) → signal **flipped** against the trade (**TAKE PROFIT** if it is in
  profit, otherwise **CLOSE / CUT LOSS**) → **TAKE PROFIT** (T2 = 3R or your take-profit reached) → **TAKE PARTIAL PROFIT /
  MOVE STOP TO ENTRY** (T1 = 1.5R reached, or ROE ≥ +100 %) → **DANGER** (the estimated liquidation comes before the stop) →
  **TIGHTEN / CONSIDER CLOSING** (signal is now DON'T TRADE, or the higher timeframe points the other way) → **HOLD** (signal
  still agrees);
* a suggested stop / T1 / T2 from the entry (the trade plan's ATR/swing stop, 1.5R and 3R) when you didn't set them, and a
  **leverage check**: the highest leverage at which that ATR stop still sits inside the liquidation price with a half-ATR
  buffer, `floor(1 / (stop distance + 0.5 % + 0.5 ATR))`, shown as a lower-leverage option when yours is above it;
* **leverage warnings**: the real move that liquidates the margin at your leverage (1/L − 0.5 %: x10 → 9.5 %, x20 → 4.5 %,
  x50 → 1.5 %, x100 → 0.5 %, x125 → 0.3 %), a warning when the ATR stop is wider than the distance to liquidation (normal
  noise could liquidate the trade), how big one average candle is compared to the remaining distance, and a general note at
  50x+ (round-trip fees alone ≈ 5 % of margin at x50).

Example — $100 margin at x50 on BTC at 84,808.3 (OKX, Sep 27 2026 2:18 PM CT): position $5,000 = 0.05896 BTC;
**long** est. liquidation **83,536.2**, **short** est. liquidation **86,080.4** — a **1.5 %** move against either side wipes out
the margin; each 1 % move is ±$50 (±50 % ROE); round-trip fees ≈ $5.

**Ask AI about this trade** opens the AI analyst tab with a pre-filled prompt (coin, direction, margin, leverage, entry, current
price, P&L, liquidation, stop/targets, the signal and its reasons, the 4 timeframe dots, the app's own recommendation and
warnings) and attaches the trade as JSON to the system message, with extra rules: recommendation not order, the user decides,
never promise outcomes, say the backtests are roughly break-even, risk first. You review the prompt and tap Send; it uses your
own key. Without a key, everything above still works.

> Recommendations come from the app's rules and are not guaranteed; the backtests show roughly break-even results.
> Liquidation prices are estimates (your exchange's margin tiers, fees and funding move them).

## AI features

### AI probability model (in the browser, no key)

A small **L2-regularized logistic regression** (pure JS, ~150 lines, no libraries) trained in the Web Worker on the loaded
history of the current symbol/timeframe.
* **Question:** "if I take the engine's trade in the direction of the score on this closed bar (same ATR/swing stop), does
  TP1 (1.5R) get hit before the stop?" One sample per closed bar.
* **Features (25):** engine readings signed by trade direction — HTF and daily trend alignment, EMA stack, ADX, CHOP, RSI,
  MACD histogram/ATR, Bollinger %B and bandwidth percentile, ATR% percentile, log volume ratio, OBV slope, distance to
  EMA20/50/200 in ATR, |score|, factor agreement, Stoch RSI, sideways/squeeze/volatile flags, stop distance, divergence /
  breakout / setup alignment. Funding/OI/long-short are excluded (live-only).
* **Train / test:** first 70 % (only samples whose outcome resolved inside it — purged), test on the last 30 %. The L2
  strength (λ ∈ {0.1, 1, 10, 100, 1000}, by out-of-fold log-loss) and the **AI filter threshold** (grid 30–70 %, by
  out-of-fold average R, ≥ 10 % of bars must pass) are chosen by walk-forward inside the first 70 % only. The displayed live
  probability uses the same recipe refit on all resolved bars. The fit matches an independent numpy Newton solver to 5e-15.
* **UI:** "AI probability of hitting TP1" on the verdict card and in the trade plan with a calibration note; an **AI filter**
  toggle (can only remove signals); an "honest out-of-sample check" box in Backtest (AUC, Brier vs always-guess-the-base-rate,
  accuracy vs majority class, calibration buckets, and a plain verdict on whether the filter beat the plain rules).
* **Result (24-combo scan):** out-of-sample AUC 0.327–0.616 (median 0.500); the model beat the base-rate Brier score with
  AUC ≥ 0.55 in 8/24 combos; the inner CV chose the strongest regularization (λ = 1000) in all 24, i.e. little signal. The AI
  filter improved Normal-mode out-of-sample expectancy in 6/24 combos, all on fewer than 30 trades, and never on ≥ 30 trades.
  **It does not reliably beat the plain rules, and the app says so.**

### AI analyst (optional, bring your own key)

"AI analyst" tab: pick a provider (xAI Grok, OpenAI, Anthropic), a model (editable; defaults grok-4.3 / gpt-5.6-terra /
claude-sonnet-5) and paste your own API key. The key is stored **only in this browser's localStorage** and sent straight from
the browser to the provider (no server in between); **Forget key** removes it. "Explain this setup" and free-form chat send a
compact JSON snapshot (symbol, timeframe, price, verdict, score, market condition, don't-trade reasons, factor breakdown,
indicators, funding/OI, trade plan, AI probability, multi-timeframe verdicts, backtest summary — viewable under "Data sent")
with a system prompt that makes the model act as a disciplined, risk-first futures trader (explain, invalidation, wait or not,
never promise outcomes, always cover risk). Browser CORS (checked Sep 27 2026, `tests/ai_cors_check.txt`): xAI ✓
(`*`), Anthropic ✓ (`*`, with the `anthropic-dangerous-direct-browser-access` header), OpenAI preflight ✓ but a wrong
`sk-…` key is rejected with no CORS header (the app explains the resulting "Failed to fetch"); a successful call was not
tested for any provider (no key available) — the UI flow was tested with a mocked reply.

## Verification

* `tests/verify.py` checks the JS indicators (incl. CHOP) against Python `ta` / `pandas_ta` — ALL OK (`tests/verify_output.txt`).
* `tests/ml_test.js` runs the engine + AI model in Node on saved OKX data and dumps the training matrix; the logistic fit
  matches an independent numpy Newton solver (max weight difference 5e-15).
* `tests/mobile_test.py` (Playwright, Chromium with iPhone 14 / Pixel 7 / iPhone 14 Pro Max descriptors; 390×664, 390×844,
  360×800, 412×839, 430×932): live data, console errors, horizontal overflow on every tab, tap targets ≥ 44 px, input
  font/inputmode, calculator, collapsers, pane toggles, symbol/TF switching by tap, touch pan + pinch (CDP), orientation,
  service worker scope/control/cache contents, manifest + installability (CDP), visibility pause, long tasks at 4× CPU
  throttle. Results: `tests/mobile_results.json`.
* `tests/verse_test.py`: scripture banner (verbatim match with the verified fetch, fit on 280–1440 px, rotation after 10 s,
  tap/click, hover/press pause, reduced motion, × persisted, no overflow/console errors). `tests/verse_results.json`.
* `tests/ai_panel_test.py`: AI analyst flow with a mocked reply, missing-key message, save/forget key, real calls with fake
  keys (xAI 400, Anthropic 401 readable; OpenAI blocked by CORS → explained). `tests/ai_panel_results.json`.
* `tests/trades_test.js` (Node): My-trades math — liquidation for long/short at x1–x125 (matches `Engine.plan`), P&L, ROE,
  R-multiple, fees, close P&L, safe leverage — and 21 synthetic recommendation scenarios (signal agrees / flipped in profit
  and at a loss / T1 / T2 / take-profit / DON'T TRADE / higher timeframe against / stop hit / near liquidation / stop beyond
  liquidation / past liquidation…). `--live` adds the $100 x50 BTC example at the live price. `tests/trades_results.json`.
* `tests/trades_ui_test.py` (Playwright; iPhone 14, iPhone SE, desktop 1440; `--base URL` for the live site): add trades
  through the form (live-price prefill, x50 quick button, validation), recommendation badge + reasons + warnings, no console
  errors, no horizontal overflow, tap targets ≥ 44 px, persistence after reload, Ask-AI prefill (no key → clear message),
  edit, close → history, delete. `tests/trades_ui_results.json`.
* `tests/header_test.py` (Playwright; iPhone 14, iPhone SE, 280 px fold, installed-style iPhone 14 portrait + landscape
  with safe-area insets via CDP, desktop 1440; a sample trade is injected so the count shows): the My trades button is in
  normal flow, same height as its neighbouring controls, its label fits, and its box + text don't intersect any other visible
  header or scripture-banner element; header blocks (brand, price, symbol/timeframe rows, stats) don't overlap each other.
  `tests/header_results.json`, screenshots `screenshots/mobile/13_header_my_trades_*.png`, `screenshots/13_header_my_trades_desktop.png`.
* `tests/refresh_test.py` (Playwright, ≥ 2 min on desktop 1440 + iPhone 14 at once): refresh interval, requests per refresh by
  endpoint, peak requests per endpoint in any 2 s window vs the OKX limits, HTTP 429s, skipped ticks, console errors, and no
  requests while the page is hidden. `tests/refresh_results.json`.
* `tests/browser_test.py` (desktop 1440×900 + screenshots), `tests/scan_all.py` + `tests/summarize.py` (all 24 combos →
  `tests/filter_comparison.md`), `tests/fallback_test.py` (OKX blocked → Gate.io), `tests/file_test.py` (`file://`).

```bash
python3 -m venv .venv && .venv/bin/pip install ta pandas pandas-ta playwright && .venv/bin/python -m playwright install chromium
python3 build.py && python3 -m http.server 8766 --bind 127.0.0.1 --directory dist &
.venv/bin/python tests/mobile_test.py --shots && .venv/bin/python tests/browser_test.py --shots --active SOL 4h
```

## Source layout

`index.html` is generated by `python3 build.py`, which inlines `src/part_head.html` (markup + CSS),
`src/part_indicators.js`, `src/part_engine.js`, `src/part_ml.js`, `src/part_trades.js` (My-trades math + recommendation
rules, no DOM), `src/part_app.js` and `src/part_verses.js` (with the verses from
`tests/verses_verified.json` injected), copies `pwa/manifest.webmanifest`,
`pwa/sw.js` and `pwa/icons/` (made by `pwa/make_icons.py`) next to it, and writes the clean `dist/` folder.

## Known limitations

* OI change and long/short ratio come from Gate.io (the only free CORS-enabled source found). They stand in for
  market-wide positioning; they are not Binance's aggregate figures.
* Positioning factors apply only to the live signal, not the backtest (and not the AI model).
* Samples are small: ~40–50 Normal trades per combo over 3,000 bars, < 30 in every out-of-sample slice and every A+ result.
  Treat all win rates as noisy. On several combos (e.g. BTC 1h) the strategy's expectancy is negative.
* Mobile testing used Chromium with device emulation (touch, DPR, UA, viewport). Real Safari/WebKit was not tested (WebKit's
  system libraries could not be installed on the test machine). Synthetic touch *scroll* gestures did nothing in headless
  Chromium even on plain page areas, so "vertical swipe over the chart scrolls the page" is configured (`vertTouchDrag:false`,
  `touch-action: auto`) but not verified.
* The AI analyst was only tested with a mocked reply and with fake keys; it needs your own paid API key.
* OKX rate-limits (HTTP 429) if you switch views very rapidly. The app retries with backoff and then falls back to Gate.io.
* Liquidation price is an isolated-margin approximation (fixed 0.5 % MMR, fees and tiered margin ignored). The same
  estimate is used in My trades; cross margin, added margin, partial closes and funding are not modelled.
* My trades are stored per browser/device (localStorage); they don't sync between your phone and computer, and clearing
  site data deletes them.
* The first bars of each series have fewer than 200 HTF bars, so the HTF filter falls back to EMA50 there. Young listings
  have less history.
* Chart times are shown in the browser's local timezone. VWAP sessions reset at 00:00 UTC.
