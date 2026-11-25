# Pivotline
A React, Vite and Tailwind technical analysis terminal for BTC/USDT and a PAXG/USDT proxy for XAU/USD. Node 22.12+ or a newer supported Vite runtime is required.

[Open the live dashboard](https://mohammedsoft7-creator.github.io/pivotline/)

## Run
```sh
npm ci
npm run dev
```

Run `npm run lint`, `npm test` and `npm run build` to verify the project. Use `npm run preview` to serve the production output locally. The static deployment directory is `dist/`.

## Data and interpretation
Each market starts with a cached or deterministic simulated 200-candle series. Binance REST loads candle history initially and backfills after a disconnect or gap. Spot WebSocket streams supply aggregate trades, ticker statistics and confirmed candles. The connection badge reports estimated event-to-browser delay, which depends on the network and clock accuracy. PAXG is tokenized gold priced in USDT. Timestamps on the charts and exports use UTC.

School engines use closed candles and bilateral confirmed swing points. RSI and the header include the latest partial candle. Elliott counts use impulse non-overlap and wave-length constraints. ICT zones use three-candle gaps, closed structural breaks and the last opposing candle before a break. Harmonic reversal zones require intersecting XA and BC projections. Classical levels cluster pivots by average candle range. Gann fans are calibrated to pivot-to-pivot price movement per bar. All projections are conditional analytical scenarios.

Drag or zoom either chart to explore history. The reset control restores the initial range. The camera exports the entire dashboard with its current analysis, visibility settings and data source.

Both markets support 5m, 15m, 1h, 4h, 1d and 1w. The Gold chart and signal scanner also support 1m and 3m. The simulated intraday feed includes a 24-hour price reference even when the 200 displayed bars cover a shorter period.

## Telegram

Copy `.env.example` to `.env`. Generate an admin key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and set `TELEGRAM_ADMIN_KEY`. Then run `npm run dev:all`. Open **ربط تلغرام**, enter the admin key, and save the bot token and chat ID or channel username. You can also provide `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` through the worker environment. Grant the bot permission to post to the channel. The test and manual analysis buttons record delivery in the activity feed. Automation switches start disabled.

For continuous delivery, run `npm run build` and `npm run telegram` on an always-on Node host. The worker serves the dashboard and the API on port 8787 by default. Keep the worker behind HTTPS and use a persistent volume for `server/data` with one worker instance. When using a separately hosted dashboard, set `VITE_TELEGRAM_API_URL` at build time and allow its exact origin with `TELEGRAM_UI_ORIGIN` on the worker. For GitHub Pages, set the public worker URL in the repository Actions variable `TELEGRAM_API_URL` and rerun the Pages workflow. Store the bot token and admin key on the Node host.

The worker scans both assets on 15m, 1H, 4H and 1D. Automatic reports run at the hour and half hour in UTC. Entry and outcome alerts use trades observed on the stream. Telegram posts and reply state survive restarts. A timed-out Telegram submission appears as unconfirmed in the activity feed to avoid duplicate posts. The configuration file is encrypted using the admin key. Keep that key with the persistent configuration.

The Elliott engine tests standard, non-truncated impulse candidates and following zigzag corrections at one confirmed pivot degree. Targets use measured leg lengths. The fifth-wave projection must clear wave three while respecting its relative length. Diagonals and complex corrections are outside this count. See [Elliott Wave International’s impulse rules](https://www.elliottwave.com/waveopedia/impulse/) and [wave-length guidelines](https://www.elliottwave.com/waveopedia/equality/).

Gann fans use the latest confirmed swing pair to calibrate price per bar. The 2×1 and 1×2 rays use twice and half the 1×1 slope. Square-of-nine levels rotate the square root of the anchor price in quote units, with a full rotation equal to two units on the root scale. Cycle dates repeat the observed leg duration on the selected interval and are monitoring windows. A closed candle crossing the anchor with its high or low retires the projections. See [TradingView’s Gann fan reference](https://www.tradingview.com/support/solutions/43000518151-gann-fan-drawing-tool/).

Charts powered by [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/).

TradingView Lightweight Charts™. Copyright © 2024 TradingView, Inc.
