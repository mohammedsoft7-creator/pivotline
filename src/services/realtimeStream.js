import { ASSETS, INTERVALS, fetchMarketData } from './marketData.js'

export const marketKey = (symbol, interval) => symbol + ':' + interval
const primary = 'wss://stream.binance.com:9443/ws'
const alternate = 'wss://stream.binance.com:443/ws'
const silenceLimit = 20000

export function parseStreamEvent(message) {
  let decoded
  try {
    decoded = JSON.parse(
      typeof message === 'string' ? message : message.toString(),
    )
  } catch {
    return null
  }
  const d = decoded?.data ?? decoded
  if (!ASSETS[d?.s] || !Number.isFinite(d.E)) return null
  const common = { symbol: d.s, at: d.E }
  if (d.e === 'aggTrade') {
    const price = Number(d.p)
    if (
      price > 0 &&
      Number.isFinite(price) &&
      Number.isSafeInteger(d.l) &&
      Number.isFinite(d.T)
    )
      return { ...common, type: 'trade', price, time: d.T, id: d.l }
  }
  if (d.e === '24hrMiniTicker') {
    const open = Number(d.o),
      price = Number(d.c)
    if (
      open > 0 &&
      price > 0 &&
      Number.isFinite(open) &&
      Number.isFinite(price)
    )
      return {
        ...common,
        type: 'ticker',
        price,
        change: 100 * (price / open - 1),
      }
  }
  if (d.e === 'kline' && INTERVALS[d.k?.i]) {
    const k = d.k
    const bar = {
      time: k.t / 1000,
      open: +k.o,
      high: +k.h,
      low: +k.l,
      close: +k.c,
      volume: +k.v,
    }
    if (
      Object.values(bar).every(Number.isFinite) &&
      Number.isSafeInteger(bar.time) &&
      bar.low > 0 &&
      bar.low <= Math.min(bar.open, bar.close) &&
      bar.high >= Math.max(bar.open, bar.close) &&
      bar.volume >= 0 &&
      Number.isSafeInteger(k.L) &&
      typeof k.x === 'boolean'
    )
      return {
        ...common,
        type: 'kline',
        interval: k.i,
        bar,
        id: k.L,
        closed: k.x,
      }
  }
  return null
}

export function connectBinance({
  markets,
  onEvent,
  onStatus,
  Socket = globalThis.WebSocket,
  url,
}) {
  const symbols = [...new Set(markets.map((m) => m.symbol))]
  const streams = [
    ...markets.map((m) => m.symbol.toLowerCase() + '@kline_' + m.interval),
    ...symbols.flatMap((s) => [
      s.toLowerCase() + '@aggTrade',
      s.toLowerCase() + '@miniTicker',
    ]),
  ]
  let socket,
    reconnect,
    heartbeat,
    lastMessage = 0,
    attempt = 0,
    stopped = false,
    state = 'connecting',
    delay = 0
  function connect() {
    state = attempt ? 'reconnecting' : 'connecting'
    onStatus({ state })
    lastMessage = Date.now()
    try {
      socket = new Socket(url || (attempt % 2 ? alternate : primary))
    } catch {
      retry()
      return
    }
    const current = socket
    current.addEventListener('open', () => {
      if (stopped || current !== socket) return
      current.send(
        JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: 1 }),
      )
    })
    current.addEventListener('message', (e) => {
      if (stopped || current !== socket) return
      const event = parseStreamEvent(e.data)
      if (!event) return
      const now = Date.now()
      lastMessage = now
      const latency = Math.max(0, now - event.at)
      delay = state === 'live' ? 0.85 * delay + 0.15 * latency : latency
      if (state !== 'live') {
        state = 'live'
        attempt = 0
      }
      onStatus({ state, latency: Math.round(delay) })
      onEvent(event)
    })
    current.addEventListener('close', () => {
      if (!stopped && current === socket) retry()
    })
    current.addEventListener('error', () => {
      if (!stopped && current === socket) disconnect()
    })
    heartbeat = setInterval(() => {
      if (Date.now() - lastMessage > silenceLimit) disconnect()
    }, 5000)
  }
  function disconnect() {
    const current = socket
    socket = null
    try {
      if (typeof current?.terminate === 'function') current.terminate()
      else current?.close()
    } finally {
      retry()
    }
  }
  function retry() {
    if (stopped) return
    clearInterval(heartbeat)
    socket = null
    state = 'reconnecting'
    onStatus({ state })
    const wait =
      Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) *
      (0.8 + Math.random() * 0.4)
    clearTimeout(reconnect)
    reconnect = setTimeout(connect, wait)
  }
  connect()
  return () => {
    stopped = true
    clearInterval(heartbeat)
    clearTimeout(reconnect)
    socket?.close()
  }
}

const barStart = (time, interval) => {
  const offset = interval === '1w' ? 4 * 86400 : 0
  return (
    Math.floor((time / 1000 - offset) / INTERVALS[interval]) *
      INTERVALS[interval] +
    offset
  )
}
function withBar(candles, bar) {
  const last = candles.at(-1)
  if (!last || bar.time > last.time) return [...candles.slice(-199), bar]
  const index = candles.findIndex((c) => c.time === bar.time)
  if (index < 0) return candles
  const next = candles.slice()
  next[index] = bar
  return next
}

export function createMarketStream({
  markets,
  onMarket,
  onTrade,
  onStatus,
  Socket,
  url,
  loadHistory = fetchMarketData,
}) {
  const records = new Map()
  const specs = new Map(
    markets.map((m) => [marketKey(m.symbol, m.interval), m]),
  )
  const stats = new Map(),
    tradeIds = new Map()
  const recordsBySymbol = new Map(
    Object.keys(ASSETS).map((s) => [s, new Set()]),
  )
  let destroyed = false,
    state = 'connecting',
    connectedBefore = false,
    lastStatus = 0
  function publish(r, event, changes) {
    const old = r.data
    const confirmed = event.type === 'kline' && event.closed
    r.data = {
      ...old,
      ...changes,
      source: 'live',
      updated: Math.max(old.updated, event.at),
    }
    if (
      confirmed ||
      r.data.closedThrough !== old.closedThrough ||
      r.data.candles[0]?.time !== old.candles[0]?.time
    )
      r.data.closedBars = r.data.candles.filter(
        (bar) => bar.time <= r.data.closedThrough,
      )
    onMarket(
      r.key,
      r.data,
      confirmed || old.closedThrough !== r.data.closedThrough,
    )
  }
  function kline(r, event) {
    if (!r.data) {
      r.buffer.set(event.bar.time, event)
      return
    }
    const last = r.data.candles.at(-1),
      step = INTERVALS[r.interval],
      bar = event.bar
    if (
      bar.time > last.time + step ||
      (event.closed && bar.time > r.data.closedThrough + step)
    ) {
      r.buffer.set(bar.time, event)
      seed(r)
      return
    }
    if (!event.closed && bar.time <= r.data.closedThrough) return
    if (event.closed && bar.time < r.data.closedThrough) return
    const newerTick =
      !event.closed && last.time === bar.time && r.barTrade > event.id
    const current = newerTick
      ? {
          ...bar,
          close: last.close,
          high: Math.max(bar.high, last.high),
          low: Math.min(bar.low, last.low),
        }
      : bar
    if (bar.time >= last.time) r.barTrade = newerTick ? r.barTrade : event.id
    publish(r, event, {
      candles: withBar(r.data.candles, current),
      closedThrough: event.closed
        ? Math.max(r.data.closedThrough, bar.time)
        : r.data.closedThrough,
      change: stats.get(r.symbol)?.change ?? r.data.change,
    })
  }
  function trade(r, event) {
    if (!r.data) return
    const last = r.data.candles.at(-1),
      at = barStart(event.time, r.interval)
    if (at > last.time + INTERVALS[r.interval]) {
      seed(r)
      return
    }
    if (
      at < last.time ||
      at <= r.data.closedThrough ||
      (at === last.time && event.id <= r.barTrade)
    )
      return
    const bar =
      at > last.time
        ? {
            time: at,
            open: event.price,
            close: event.price,
            low: event.price,
            high: event.price,
            volume: 0,
          }
        : {
            ...last,
            close: event.price,
            low: Math.min(event.price, last.low),
            high: Math.max(event.price, last.high),
          }
    r.barTrade = event.id
    publish(r, event, {
      candles: withBar(r.data.candles, bar),
      change: stats.get(r.symbol)?.change ?? r.data.change,
    })
  }
  async function seed(r) {
    if (destroyed || r.controller || Date.now() < r.retryAt) return
    const controller = new AbortController()
    r.controller = controller
    onStatus({ state, loading: r.key })
    const timeout = setTimeout(() => controller.abort(), 6500)
    try {
      const history = await loadHistory(
        r.symbol,
        r.interval,
        controller.signal,
        { historyOnly: true },
      )
      if (destroyed || controller.signal.aborted) return
      const last = history.candles.at(-1),
        step = INTERVALS[r.interval]
      const snapshot = stats.get(r.symbol)
      r.data = {
        ...history,
        source: 'cached',
        change: snapshot?.change ?? r.data?.change ?? null,
        closedThrough:
          last.time + (history.updated / 1000 >= last.time + step ? 0 : -step),
      }
      r.data.closedBars = r.data.candles.filter(
        (bar) => bar.time <= r.data.closedThrough,
      )
      r.barTrade = -1
      onMarket(r.key, r.data, true)
      const buffered = [...r.buffer.values()].sort(
        (a, b) => a.bar.time - b.bar.time,
      )
      r.buffer.clear()
      for (const event of buffered)
        if (event.bar.time >= last.time) kline(r, event)
    } catch {
      // A fresh stream event retries a failed history load after a short cooldown.
      r.retryAt = Date.now() + 15000
    } finally {
      clearTimeout(timeout)
      if (!destroyed) {
        r.controller = null
        onStatus({ state, loaded: r.key })
      }
    }
  }
  const close = connectBinance({
    markets,
    Socket,
    url,
    onStatus(status) {
      const previous = state
      state = status.state
      if (state !== 'live') {
        if (state !== previous || !lastStatus) onStatus(status)
        if (previous === 'live') {
          for (const r of records.values()) {
            r.buffer.clear()
            if (r.data) {
              r.data = { ...r.data, source: 'cached' }
              onMarket(r.key, r.data, false)
            }
          }
        }
      } else if (previous !== 'live' || Date.now() - lastStatus >= 500) {
        lastStatus = Date.now()
        onStatus(status)
        if (previous !== 'live') {
          if (connectedBefore)
            for (const r of records.values()) {
              r.retryAt = 0
              seed(r)
            }
          connectedBefore = true
        }
      }
    },
    onEvent(event) {
      if (event.type === 'trade') {
        if (event.id <= (tradeIds.get(event.symbol) ?? -1)) return
        tradeIds.set(event.symbol, event.id)
        onTrade?.(event)
        for (const r of recordsBySymbol.get(event.symbol)) trade(r, event)
      } else if (event.type === 'kline') {
        const r = records.get(marketKey(event.symbol, event.interval))
        if (!r) return
        kline(r, event)
        if (!r.data) seed(r)
      } else {
        stats.set(event.symbol, event)
        for (const r of recordsBySymbol.get(event.symbol))
          if (r.data?.source === 'live')
            publish(r, event, { change: event.change })
      }
    },
  })
  return {
    watch(symbol, interval) {
      const key = marketKey(symbol, interval)
      if (records.has(key) || !specs.has(key)) return
      const r = {
        ...specs.get(key),
        key,
        buffer: new Map(),
        retryAt: 0,
        barTrade: -1,
      }
      records.set(key, r)
      recordsBySymbol.get(symbol).add(r)
      seed(r)
    },
    refresh() {
      for (const r of records.values()) {
        r.retryAt = 0
        seed(r)
      }
    },
    close() {
      destroyed = true
      close()
      for (const r of records.values()) r.controller?.abort()
    },
  }
}
