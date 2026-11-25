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
Each market starts with a cached or deterministic simulated 200-candle series. Binance klines and the rolling 24-hour ticker are requested on load, on refresh and every minute. Simulated, cached and live feeds are explicitly labeled. PAXG is tokenized gold priced in USDT. Timestamps on the charts and exports use UTC.

School engines use closed candles and bilateral confirmed swing points. RSI and the header include the latest partial candle. Elliott counts use impulse non-overlap and wave-length constraints. ICT zones use three-candle gaps, closed structural breaks and the last opposing candle before a break. Harmonic reversal zones require intersecting XA and BC projections. Classical levels cluster pivots by average candle range. Gann fans are calibrated to pivot-to-pivot price movement per bar. All projections are conditional analytical scenarios.

Drag or zoom either chart to explore history. The reset control restores the initial range. The camera exports the entire dashboard with its current analysis, visibility settings and data source.

Both markets support 5m, 15m, 1h, 4h, 1d and 1w. The Gold chart also supports 1m and 3m, refreshed every 15 and 45 seconds respectively. The simulated intraday feed includes a 24-hour price reference even when the 200 displayed bars cover a shorter period.

The Elliott engine tests standard, non-truncated impulse candidates and following zigzag corrections at one confirmed pivot degree. Targets use measured leg lengths. The fifth-wave projection must clear wave three while respecting its relative length. Diagonals and complex corrections are outside this count. See [Elliott Wave International’s impulse rules](https://www.elliottwave.com/waveopedia/impulse/) and [wave-length guidelines](https://www.elliottwave.com/waveopedia/equality/).

Gann fans use the latest confirmed swing pair to calibrate price per bar. The 2×1 and 1×2 rays use twice and half the 1×1 slope. Square-of-nine levels rotate the square root of the anchor price in quote units, with a full rotation equal to two units on the root scale. Cycle dates repeat the observed leg duration on the selected interval and are monitoring windows. A closed candle crossing the anchor with its high or low retires the projections. See [TradingView’s Gann fan reference](https://www.tradingview.com/support/solutions/43000518151-gann-fan-drawing-tool/).

Charts powered by [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/).

TradingView Lightweight Charts™. Copyright © 2024 TradingView, Inc.
