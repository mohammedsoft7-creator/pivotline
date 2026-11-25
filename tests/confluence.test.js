import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleTrade,
  calculatePosition,
  confluenceSignalEngine,
} from '../src/engines/confluenceSignalEngine.js'
import { INTERVALS, generateFallback } from '../src/services/marketData.js'

const candleTime = 1700000100
function inputs(dir = 1) {
  const price = (n) => 200 + dir * n
  const zone = (a, b) => ({
    low: Math.min(price(a), price(b)),
    high: Math.max(price(a), price(b)),
  })
  const evidence = (school, a, b, stop) => ({
    school,
    dir,
    zone: zone(a, b),
    invalidation: price(stop),
    trigger: price(a),
  })
  return {
    votes: [
      evidence('ICT', 0, 3, -3),
      { ...evidence('ELLIOTT', 1, 4, -5), timeRatio: 1 },
      evidence('CLASSICAL', 2, 5, -2),
      { school: 'GANN', dir, trigger: price(2), invalidation: price(-8) },
      { school: 'RSI', dir, value: dir > 0 ? 28 : 73, trigger: price(3) },
    ],
    candles: [{ close: price(3), time: candleTime }],
    pivots: [
      { price: price(-5), index: 0, type: dir > 0 ? 'low' : 'high' },
      { price: price(5), index: 0, type: dir > 0 ? 'high' : 'low' },
    ],
    gann: {
      dir,
      cycleIndex: 3,
      cycleTime: candleTime + 2700,
      targetLevels: [price(16)],
    },
    atr: 1,
    interval: '15m',
  }
}

test('confluence needs three technical votes, two overlapping zones and a Gann cycle', () => {
  const base = inputs()
  const onlyTwo = base.votes.filter((v) =>
    ['ICT', 'ELLIOTT', 'RSI'].includes(v.school),
  )
  assert.equal(assembleTrade({ ...base, votes: onlyTwo }).reason, 'alignment')
  const separated = base.votes.map((v, i) =>
    v.zone ? { ...v, zone: { low: 210 + 2 * i, high: 211 + 2 * i } } : v,
  )
  assert.equal(assembleTrade({ ...base, votes: separated }).reason, 'overlap')
  assert.equal(assembleTrade({ ...base, gann: null }).reason, 'window')
})

test('long and short setups place exact bounded levels and size from worst fill', () => {
  for (const dir of [1, -1]) {
    const { signal } = assembleTrade(inputs(dir))
    assert.equal(signal.score, 82)
    assert.equal(signal.schoolCount, 4)
    assert.deepEqual(signal.entrySchools, ['ICT', 'ELLIOTT', 'CLASSICAL'])
    assert.equal(signal.entryPrice, 200 + dir * 3)
    assert.ok(dir * (signal.stop - signal.boundary) < 0)
    assert.deepEqual(
      signal.targets.map((t) => t.ratio),
      [1.272, 1.618, 2.618],
    )
    assert.equal(signal.targets[0].price, 200 + dir * 16)
    assert.equal(signal.targets[0].liquidity, true)
    assert.equal(signal.expiresAt, candleTime + 3600)
    assert.ok(
      signal.targets.every((t, i, a) => t.rr > 0 && (!i || t.rr > a[i - 1].rr)),
    )
    const size = calculatePosition(signal, 10000, 2)
    assert.equal(size.budget, 200)
    assert.ok(
      Math.abs(size.units * Math.abs(signal.stop - signal.entryPrice) - 200) <
        1e-10,
    )
    assert.ok(
      Math.abs(size.profits[0] - size.budget * signal.targets[0].rr) < 1e-10,
    )
    for (const bad of [0, -2, 101, Infinity, NaN])
      assert.equal(calculatePosition(signal, 10000, bad), null)
  }
})

test('historical OHLC reaches real engine confluence, and a forming stop breach withdraws it', () => {
  const interval = '15m',
    step = INTERVALS[interval]
  const candles = generateFallback(
    'BTCUSDT',
    interval,
    1700000000000,
  ).candles.slice(0, 156)
  const frame = candles.at(-1)
  const data = { candles, source: 'live', updated: (frame.time + step) * 1000 }
  const row = confluenceSignalEngine('BTCUSDT', interval, data)
  assert.equal(row.votes.length, 6)
  assert.equal(row.signal.direction, 'SELL')
  assert.deepEqual(row.signal.entrySchools, ['ICT', 'CLASSICAL'])
  assert.match(
    row.signal.votes.find((v) => v.school === 'CLASSICAL').reason,
    /مقاومة|دعم|فيبوناتشي|اتجاه/,
  )
  const forming = { ...frame, time: frame.time + step, high: row.signal.stop }
  const breached = confluenceSignalEngine('BTCUSDT', interval, {
    ...data,
    candles: [...candles, forming],
  })
  assert.equal(breached.reason, 'crossed')
})
