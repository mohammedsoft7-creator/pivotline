export const ASSETS = {
  BTCUSDT: {
    pair: 'BTC/USDT',
    name: 'Bitcoin',
    quote: 'TetherUS',
    unit: 'BTC',
  },
  PAXGUSDT: { pair: 'XAU/USD', name: 'Gold', quote: 'US Dollar', unit: 'PAXG' },
}
export const INTERVALS = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
}
const goldIntervals = Object.keys(INTERVALS)
const bitcoinIntervals = goldIntervals.filter(
  (interval) => INTERVALS[interval] >= 300,
)
export function chartIntervals(symbol) {
  if (symbol === 'PAXGUSDT') return goldIntervals
  return symbol === 'BTCUSDT' ? bitcoinIntervals : []
}
const endpoint = 'https://api.binance.com/api/v3/'
export const formatInterval = (interval) =>
  interval.endsWith('m') ? interval : interval.toUpperCase()
const memory = new Map()
let retryAfter = 0

// A continuous seeded price curve keeps simulated bars reproducible across refreshes.
export function generateFallback(symbol, interval, now = Date.now()) {
  const seconds = INTERVALS[interval]
  const offset = interval === '1w' ? 4 * 86400 : 0
  const last = Math.floor((now / 1000 - offset) / seconds) * seconds + offset
  const gold = symbol === 'PAXGUSDT'
  const base = gold ? 3180 : 92340
  const amplitude =
    base * (gold ? 0.037 : 0.075) * Math.pow(seconds / 86400, 0.3)
  const anchors = [
    // Include the 24-hour reference for chart intervals with fewer than 24 hours visible.
    [-1241, -0.52],
    [-281, -0.2],
    [-90, -0.38],
    [0, -0.7],
    [14, -0.1],
    [27, -0.64],
    [44, 0.4],
    [56, -0.12],
    [70, 0.67],
    [82, 0.05],
    [95, 0.53],
    [107, -0.15],
    [120, 0.29],
    [135, -0.76],
    [152, 0.08],
    [164, -0.35],
    [186, 1.08],
    [199, 0.78],
  ]
  const noise = (i) => {
    const n = Math.sin(i * 127.1 + (gold ? 17 : 1)) * 43758.5453
    return n - Math.floor(n)
  }
  function price(i) {
    const right = anchors.findIndex(([x]) => x >= i)
    const [x1, y1] = anchors[Math.max(0, right - 1)]
    const [x2, y2] = anchors[Math.max(0, right)]
    const trend = y1 + ((y2 - y1) * (i - x1)) / (x2 - x1 || 1)
    return (
      base +
      amplitude *
        (trend +
          0.068 * Math.sin(i * 1.22) +
          0.055 * (noise(Math.floor(i)) - 0.5))
    )
  }
  const candles = Array.from({ length: 200 }, (_, i) => {
    const open =
      price(Math.max(0, i - 1)) + (noise(i + 270) - 0.5) * amplitude * 0.025
    const close = price(i)
    return {
      time: last - (199 - i) * seconds,
      open,
      close,
      high:
        Math.max(open, close) + amplitude * (0.014 + noise(i + 500) * 0.085),
      low: Math.min(open, close) - amplitude * (0.014 + noise(i + 900) * 0.085),
      volume:
        (((gold ? 290 : 4300) * seconds) / 86400) *
        (0.3 + noise(i + 60) + (9 * Math.abs(close - open)) / amplitude),
    }
  })
  return {
    candles,
    change: (price(199) / price(199 - 86400 / seconds) - 1) * 100,
    source: 'simulated',
    updated: now,
  }
}
function valid(c) {
  return (
    [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
    Number.isInteger(c.time) &&
    c.low > 0 &&
    c.volume >= 0 &&
    c.low <= Math.min(c.open, c.close) &&
    c.high >= Math.max(c.open, c.close)
  )
}
function key(symbol, interval) {
  return 'pivotline-v1:' + symbol + ':' + interval
}
export function initialData(symbol, interval) {
  const id = key(symbol, interval)
  try {
    const stored =
      memory.get(id) ??
      JSON.parse(globalThis.window?.localStorage.getItem(id) ?? 'null')
    if (
      stored &&
      Number.isFinite(stored.updated) &&
      Array.isArray(stored.candles) &&
      stored.candles.length >= 20 &&
      stored.candles.length <= 200 &&
      stored.candles.every(
        (c, i, a) => valid(c) && (!i || c.time > a[i - 1].time),
      )
    ) {
      return { ...stored, source: 'cached' }
    }
  } catch {
    /* Storage is optional in private browsing. */
  }
  return generateFallback(symbol, interval)
}
async function request(path, signal) {
  const response = await fetch(endpoint + path, { signal, cache: 'no-store' })
  if (!response.ok) {
    if ([418, 429].includes(response.status))
      retryAfter =
        Date.now() +
        Math.max(60, Number(response.headers.get('Retry-After')) || 60) * 1000
    throw new Error('Binance HTTP ' + response.status)
  }
  return response.json()
}
export async function fetchMarketData(
  symbol,
  interval,
  signal,
  { historyOnly = false } = {},
) {
  if (!chartIntervals(symbol).includes(interval))
    throw new Error('Unknown market')
  if (Date.now() < retryAfter) throw new Error('Rate limit cooldown')
  const [rows, ticker] = await Promise.all([
    request(
      'klines?symbol=' + symbol + '&interval=' + interval + '&limit=200',
      signal,
    ),
    historyOnly
      ? null
      : request('ticker/24hr?symbol=' + symbol, signal).catch(() => null),
  ])
  const candles = rows.map(([t, o, h, l, c, v]) => ({
    time: Number(t) / 1000,
    open: +o,
    high: +h,
    low: +l,
    close: +c,
    volume: +v,
  }))
  if (
    candles.length < 20 ||
    !candles.every((c, i) => valid(c) && (!i || c.time > candles[i - 1].time))
  )
    throw new Error('Invalid candles')
  const change =
    ticker?.priceChangePercent != null ? Number(ticker.priceChangePercent) : NaN
  const result = {
    candles,
    change: Number.isFinite(change) ? change : null,
    source: 'live',
    updated: Date.now(),
  }
  if (signal.aborted) throw new Error('Request cancelled')
  const id = key(symbol, interval)
  memory.set(id, result)
  try {
    globalThis.window?.localStorage.setItem(id, JSON.stringify(result))
  } catch {
    /* In-memory cache remains available. */
  }
  return result
}
