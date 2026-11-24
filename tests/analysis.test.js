import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRSI, findSwings, zigzag } from '../src/utils/indicators.js'
import {
  generateFallback,
  INTERVALS,
  ASSETS,
  fetchMarketData,
  initialData,
} from '../src/services/marketData.js'
import { schools } from '../src/engines/index.js'

// Linear legs isolate exact pivot prices; the first and last anchors provide confirmation bars.
function fixture(prices) {
  const values = []
  for (let i = 1; i < prices.length; i++) {
    for (let j = 0; j < 10; j++)
      values.push(prices[i - 1] + ((prices[i] - prices[i - 1]) * j) / 10)
  }
  values.push(prices.at(-1))
  return values.map((close, i) => ({
    time: 1600000000 + i * 3600,
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
  }))
}
test('Wilder RSI seeds at the 14th change and recursively smooths following changes', () => {
  const prices = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28, 46.0,
  ]
  const rsi = calculateRSI(prices.map((close) => ({ close })))
  assert.ok(rsi.slice(0, 14).every((v) => v === null))
  assert.equal(rsi[14].toFixed(2), '70.46')
  assert.equal(rsi[15].toFixed(2), '66.25')
  for (const [slope, value] of [
    [1, 100],
    [-1, 0],
    [0, 50],
  ])
    assert.equal(
      calculateRSI(prices.map((_, i) => ({ close: 50 + i * slope }))).at(-1),
      value,
    )
})
test('pivots require right confirmation and select the last bar of a plateau', () => {
  const bars = [1, 2, 4, 4, 3, 2, 1, 3, 4].map((p, i) => ({
    time: i,
    high: p,
    low: p,
  }))
  assert.deepEqual(findSwings(bars.slice(0, 5), 2, 2), [])
  assert.deepEqual(
    findSwings(bars, 2, 2).map((p) => [p.index, p.type, p.confirmedAt]),
    [
      [3, 'high', 5],
      [6, 'low', 8],
    ],
  )
  assert.throws(() => zigzag(bars, 0), RangeError)
})
test('Elliott projects 4 and 5 from measured wave 3 in both directions', () => {
  for (const dir of [1, -1]) {
    const bars = fixture(
      [115, 100, 125, 110, 155, 150].map((n) => 200 + dir * n),
    )
    const a = schools.ELLIOTT.engine(bars)
    assert.deepEqual(
      a.projections[0].points.slice(1).map((p) => p.label),
      ['(4)?', '(5)?'],
    )
    const expected = [0.236, 0.382]
      .map((r) => 200 + dir * (155 - 45 * r))
      .sort((x, y) => x - y)
    assert.ok(Math.abs(a.zones[0].low - expected[0]) < 1e-10)
    assert.ok(Math.abs(a.zones[0].high - expected[1]) < 1e-10)
    assert.equal(a.horizontalLines[0].price, 200 + dir * 125)
  }
})
test('Elliott distinguishes a completed impulse and its subsequent ABC correction', () => {
  const impulse = [115, 100, 125, 110, 155, 135, 170]
  const a = schools.ELLIOTT.engine(fixture([...impulse, 160]))
  assert.equal(a.overlays[0].points.at(-1).label, '(5)')
  assert.equal(a.projections.length, 0)
  const b = schools.ELLIOTT.engine(fixture([...impulse, 145, 160, 135, 140]))
  assert.deepEqual(
    b.overlays.at(-1).points.map((p) => p.label),
    ['', 'A', 'B', 'C'],
  )
})
for (const [name, prices] of [
  ['Gartley', [100, 200, 138.2, 169.1, 121.4]],
  ['Bat', [100, 200, 155, 185, 111.4]],
  ['Butterfly', [100, 200, 121.4, 164, 73]],
]) {
  test(
    name + ' requires AD and CD convergence and places D inside its PRZ',
    () => {
      const a = schools.HARMONIC.engine(
        fixture([115, ...prices, prices.at(-1) + 8]),
      )
      assert.ok(a.commentary.structure.includes(name))
      assert.ok(a.zones[0].low <= prices[4] && a.zones[0].high >= prices[4])
      assert.equal(a.overlays[0].triangles.length, 2)
      assert.equal(a.overlays[0].ratios.length, 3)
    },
  )
}
test('classical retracements and Gann levels use the same latest confirmed leg', () => {
  const bars = fixture([115, 100, 125, 110, 155, 150])
  const c = schools.CLASSICAL.engine(bars),
    g = schools.GANN.engine(bars)
  assert.deepEqual(
    c.horizontalLines.filter((l) => l.math).map((l) => l.price),
    [0.382, 0.5, 0.618].map((r) => 155 - 45 * r),
  )
  assert.equal(g.horizontalLines[1].price, (Math.sqrt(110) + 0.5) ** 2)
  assert.ok(
    g.projections
      .filter((p) => p.vertical != null)
      .every((p) => p.vertical >= bars.length),
  )
})
test('ICT confirms breaks on close and records a wick-only sweep independently', () => {
  const bars = fixture([120, 100, 130, 110, 140, 115, 145, 102, 120])
  for (const [i, k] of bars.entries()) k.open = i ? bars[i - 1].close : k.close
  bars[35].high = 132
  for (const k of bars) {
    k.high = Math.max(k.open, k.close, k.high)
    k.low = Math.min(k.open, k.close, k.low)
  }
  const a = schools.ICT.engine(bars)
  assert.ok(a.overlays.some((p) => p.points[0].label === 'Sweep'))
  assert.ok(a.horizontalLines.some((l) => l.label === 'CHoCH'))
  assert.ok(a.horizontalLines.some((l) => l.label === 'BOS'))
  assert.ok(a.zones.some((z) => z.label.includes('OB')))
  assert.ok(a.zones.some((z) => z.label === 'FVG'))
})
test('all markets generate 200 valid, evenly spaced candles and finite chart geometry', () => {
  for (const symbol of Object.keys(ASSETS))
    for (const [interval, step] of Object.entries(INTERVALS)) {
      const data = generateFallback(symbol, interval, 1700000000000)
      assert.equal(data.candles.length, 200)
      assert.ok(Number.isFinite(data.change))
      for (const [i, c] of data.candles.entries()) {
        assert.ok(
          c.low > 0 &&
            c.low <= Math.min(c.open, c.close) &&
            c.high >= Math.max(c.open, c.close) &&
            c.volume >= 0,
        )
        if (i) assert.equal(c.time - data.candles[i - 1].time, step)
      }
      for (const model of Object.values(schools)) {
        const analysis = model.engine(data.candles)
        assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(analysis)))
        for (const shape of [...analysis.overlays, ...analysis.projections])
          for (const p of shape.points || [])
            assert.ok(Number.isFinite(p.price) && Number.isFinite(p.index))
        for (const z of analysis.zones)
          assert.ok(z.high >= z.low && z.from <= z.to)
      }
    }
})
test('live klines survive a missing ticker and cache the latest usable series', async (t) => {
  const data = generateFallback('BTCUSDT', '4h')
  const rows = data.candles.map((k) => [
    k.time * 1000,
    k.open,
    k.high,
    k.low,
    k.close,
    k.volume,
  ])
  t.mock.method(
    globalThis,
    'fetch',
    async (url) =>
      new Response(JSON.stringify(url.includes('klines') ? rows : {}), {
        status: url.includes('klines') ? 200 : 503,
      }),
  )
  const live = await fetchMarketData(
    'BTCUSDT',
    '4h',
    new AbortController().signal,
  )
  assert.equal(live.source, 'live')
  assert.equal(live.change, null)
  const cached = initialData('BTCUSDT', '4h')
  assert.equal(cached.source, 'cached')
  assert.deepEqual(live.candles, cached.candles)
})
test('5m uses 300-second boundaries and requests 200 Binance candles for each market', async (t) => {
  assert.equal(INTERVALS['5m'], 300)
  for (const symbol of Object.keys(ASSETS)) {
    const sample = generateFallback(symbol, '5m', 1700000000000)
    assert.ok(sample.candles.every((c) => c.time % 300 === 0))
    assert.ok(Number.isFinite(sample.change))
    const rows = sample.candles.map((c) => [
      c.time * 1000,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
    ])
    const fetch = t.mock.method(globalThis, 'fetch', async (input) => {
      const url = new URL(input)
      assert.equal(url.searchParams.get('symbol'), symbol)
      if (url.pathname.endsWith('/klines')) {
        assert.equal(url.searchParams.get('interval'), '5m')
        assert.equal(url.searchParams.get('limit'), '200')
        return Response.json(rows)
      }
      return Response.json({ priceChangePercent: '0.75' })
    })
    const live = await fetchMarketData(
      symbol,
      '5m',
      new AbortController().signal,
    )
    assert.deepEqual(live.candles, sample.candles)
    assert.equal(live.change, 0.75)
    assert.equal(initialData(symbol, '5m').source, 'cached')
    fetch.mock.restore()
  }
})
test('zigzag omits a double pivot whose intrabar sequence is ambiguous', () => {
  const bars = [
    { high: 10, low: 8 },
    { high: 12, low: 6 },
    { high: 9, low: 7 },
  ]
  assert.equal(findSwings(bars, 1, 1).length, 2)
  assert.deepEqual(zigzag(bars, 1), [])
})
test('Elliott caps fifth-wave length when the third is shorter than the first', () => {
  for (const dir of [1, -1]) {
    const bars = fixture(
      [115, 100, 140, 120, 150, 144, 146].map((p) => 250 + dir * p),
    )
    const a = schools.ELLIOTT.engine(bars)
    const [four, five] = a.projections[0].points
    assert.ok(dir * (five.price - (250 + dir * 150)) > 0)
    assert.ok(Math.abs(five.price - four.price) <= 30)
    assert.equal(a.horizontalLines[0].price, 250 + dir * 144)
  }
})
test('Elliott withdraws the fifth when the wick breaks the fourth despite a recovering close', () => {
  const bars = fixture([115, 100, 125, 110, 155, 135, 143])
  bars.at(-1).low = 134
  const a = schools.ELLIOTT.engine(bars)
  assert.equal(a.projections.length, 0)
  assert.equal(a.commentary.target, '')
  assert.equal(a.horizontalLines[0].price, 135)
})
test('Elliott invalidates a developing fifth that makes wave three the shortest', () => {
  const a = schools.ELLIOTT.engine(fixture([115, 100, 140, 120, 150, 144, 180]))
  assert.equal(a.projections.length, 0)
  assert.equal(
    a.horizontalLines.find((l) => l.label === 'Wave 5 limit').price,
    174,
  )
  assert.equal(a.commentary.target, '')
})
test('Elliott carries an impulse into a developing ABC, then retires its reached C target', () => {
  const formation = [115, 100, 125, 110, 155, 135, 170, 145, 160]
  const forming = schools.ELLIOTT.engine(fixture([...formation, 150]))
  assert.equal(forming.overlays.at(-1).points.at(-1).label, 'B')
  assert.equal(forming.projections[0].points.at(-1).price, 135)
  const reached = schools.ELLIOTT.engine(fixture([...formation, 134]))
  assert.equal(reached.projections.length, 0)
  assert.equal(reached.commentary.target, '135.00')
})
test('Gann fan units, next square levels and cycle times agree on both directions and a gapped 5m feed', () => {
  for (const dir of [1, -1]) {
    const bars = fixture(
      [115, 100, 125, 110, 155, 150].map((p) => 300 + dir * p),
    )
    for (const [i, k] of bars.entries()) k.time = 1700000100 + i * 300
    bars.at(-1).time += 600
    const end = bars.length - 1,
      chartEnd = end + 1
    const g = schools.GANN.engine(bars, { chartEnd, intervalSeconds: 300 })
    for (const [i, multiple] of [1, 2, 0.5].entries()) {
      const [a, b] = g.overlays[i].points
      assert.equal(
        (b.price - a.price) / (b.index - a.index),
        dir * 4.5 * multiple,
      )
    }
    const next = g.projections.find((p) => p.vertical != null)
    assert.equal(next.label, 'T+' + (next.vertical - chartEnd))
    assert.equal(next.vertical, 60)
    const time = new Date((bars[end].time + (next.vertical - end) * 300) * 1000)
    assert.ok(g.commentary.scenario.includes(time.toISOString().slice(11, 16)))
    const levels = g.commentary.target
      .split(' / ')
      .map((s) => Number(s.replaceAll(',', '')))
    assert.equal(levels.length, 2)
    assert.ok(levels.every((p) => dir * (p - bars[end].close) > 0))
  }
})
test('Gann retires both price and time projections after the anchor breaks', () => {
  const bars = fixture([115, 100, 125, 110, 155, 95])
  const g = schools.GANN.engine(bars)
  assert.equal(g.projections.length, 0)
  assert.equal(g.commentary.target, '')
  assert.ok(g.overlays.every((p) => p.points.at(-1).index < bars.length - 1))
})
test('harmonic closes beyond the PRZ retire a historical reversal scenario', () => {
  const bars = fixture([115, 100, 200, 138.2, 169.1, 121.4, 130])
  bars.push({
    ...bars.at(-1),
    time: bars.at(-1).time + 3600,
    close: 118,
    low: 117,
  })
  const h = schools.HARMONIC.engine(bars)
  assert.ok(h.commentary.structure.includes('Gartley'))
  assert.equal(h.commentary.target, '')
  assert.equal(h.zones[0].to, bars.length - 1)
})
test('classical Fibonacci targets expire on a closing break of the measured leg origin', () => {
  const bars = fixture([115, 100, 125, 110, 155, 95])
  const a = schools.CLASSICAL.engine(bars)
  assert.equal(a.commentary.target, '')
  assert.ok(
    a.horizontalLines
      .filter((l) => l.math)
      .every((l) => l.to < bars.length - 1),
  )
})
test('rate limits start a cooldown before another network call', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('', { status: 429, headers: { 'Retry-After': '90' } }),
  )
  const signal = new AbortController().signal
  await assert.rejects(fetchMarketData('PAXGUSDT', '1d', signal), /429/)
  const requests = fetch.mock.callCount()
  await assert.rejects(fetchMarketData('PAXGUSDT', '1d', signal), /cooldown/)
  assert.equal(fetch.mock.callCount(), requests)
})
