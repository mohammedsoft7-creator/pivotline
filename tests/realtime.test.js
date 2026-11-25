import assert from 'node:assert/strict'
import test from 'node:test'
import {
  connectBinance,
  createMarketStream,
  parseStreamEvent,
} from '../src/services/realtimeStream.js'
import { startTrade, trackTrade } from '../src/engines/tradeTracker.js'

class FakeSocket extends EventTarget {
  static current
  constructor() {
    super()
    FakeSocket.current = this
  }
  send(message) {
    this.subscription = JSON.parse(message)
  }
  close() {
    this.dispatchEvent(new Event('close'))
  }
  emit(value) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    )
  }
}
const candleStart = Math.floor(Date.now() / 60000) * 60
const candle = (time, close) => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
})
const tick = (id, price, time) => ({
  e: 'aggTrade',
  E: time,
  s: 'PAXGUSDT',
  p: String(price),
  T: time,
  l: id,
})
const bar = (id, close, isClosed) => ({
  e: 'kline',
  E: (candleStart + 58) * 1000,
  s: 'PAXGUSDT',
  k: {
    i: '1m',
    t: candleStart * 1000,
    o: '100',
    h: String(Math.max(100, close)),
    l: String(Math.min(100, close)),
    c: String(close),
    v: '20',
    L: id,
    x: isClosed,
  },
})

test('subscribes to trades, klines and mini ticker, reconciles stale snapshots and confirms closed bars', async () => {
  const events = [],
    updates = []
  let loads = 0
  const feed = createMarketStream({
    markets: [{ symbol: 'PAXGUSDT', interval: '1m' }],
    Socket: FakeSocket,
    onTrade: (e) => events.push(e),
    onMarket: (key, data) => updates.push(data),
    onStatus() {},
    loadHistory: async (_s, _i, _signal, options) => {
      loads++
      assert.equal(options.historyOnly, true)
      return {
        candles: Array.from({ length: 200 }, (_, i) =>
          candle(candleStart - (199 - i) * 60, 100),
        ),
        updated: candleStart * 1000 + 1,
        source: 'live',
        change: null,
      }
    },
  })
  try {
    feed.watch('PAXGUSDT', '1m')
    const socket = FakeSocket.current
    socket.dispatchEvent(new Event('open'))
    assert.deepEqual(socket.subscription.params, [
      'paxgusdt@kline_1m',
      'paxgusdt@aggTrade',
      'paxgusdt@miniTicker',
    ])
    await Promise.resolve()
    socket.emit(bar(10, 100, false))
    socket.emit(tick(12, 105, (candleStart + 57) * 1000))
    socket.emit(tick(12, 99, (candleStart + 57) * 1000))
    socket.emit(bar(11, 103, false))
    assert.equal(events.length, 1)
    assert.equal(updates.at(-1).candles.at(-1).close, 105)
    assert.equal(updates.at(-1).candles.at(-1).volume, 20)
    assert.equal(updates.at(-1).closedBars.at(-1).time, candleStart - 60)
    socket.emit(bar(13, 106, true))
    assert.equal(updates.at(-1).closedBars.at(-1).close, 106)
    socket.emit(tick(15, 108, (candleStart + 60) * 1000))
    assert.equal(updates.at(-1).candles.length, 200)
    assert.equal(
      updates.at(-1).closedBars[0].time,
      updates.at(-1).candles[0].time,
    )
    assert.equal(updates.at(-1).candles.at(-1).close, 108)
    assert.equal(loads, 1)
    assert.equal(parseStreamEvent('invalid'), null)
  } finally {
    feed.close()
  }
})

test('trade milestones require an observed entry, stay unique and follow direction', () => {
  for (const dir of [1, -1]) {
    const signal = {
      symbol: 'PAXGUSDT',
      dir,
      createdAt: 1,
      expiresAt: 10,
      low: 100,
      high: 101,
      stop: dir > 0 ? 95 : 106,
      targets: [2, 4, 6].map((n) => ({ price: 100 + dir * n })),
    }
    const sample = (p, time = 2000) => ({ price: p, time, symbol: 'PAXGUSDT' })
    let t = startTrade(signal)
    let step = trackTrade(t, sample(100 + dir * 7))
    assert.equal(step.trade, t)
    step = trackTrade(t, sample(100))
    assert.deepEqual(
      step.events.map((e) => e.type),
      ['entry'],
    )
    t = step.trade
    step = trackTrade(t, sample(100 + dir * 4, 11000))
    assert.deepEqual(
      step.events.map((e) => e.type),
      ['TP1', 'TP2'],
    )
    assert.equal(trackTrade(step.trade, sample(100 + dir * 4)).events.length, 0)
    assert.deepEqual(
      trackTrade(step.trade, sample(signal.stop)).events.map((e) => e.type),
      ['SL'],
    )
    const target3 = trackTrade(step.trade, sample(100 + dir * 6))
    assert.equal(target3.trade.closed, 'TP3')
    assert.equal(
      trackTrade(target3.trade, sample(signal.stop)).events.length,
      0,
    )
    assert.equal(
      trackTrade(startTrade(signal), sample(100, 10000)).trade.closed,
      'expired',
    )
  }
})

test('a closed socket reconnects and subscribes again', async () => {
  const states = []
  let reconnect
  const retried = new Promise((resolve) => {
    reconnect = resolve
  })
  const stop = connectBinance({
    markets: [{ symbol: 'PAXGUSDT', interval: '1m' }],
    Socket: FakeSocket,
    onEvent() {},
    onStatus(status) {
      states.push(status.state)
      if (states.filter((s) => s === 'reconnecting').length === 2) reconnect()
    },
  })
  try {
    const first = FakeSocket.current
    first.dispatchEvent(new Event('open'))
    first.close()
    await retried
    const second = FakeSocket.current
    assert.notEqual(first, second)
    second.dispatchEvent(new Event('open'))
    assert.deepEqual(second.subscription, first.subscription)
  } finally {
    stop()
  }
})
