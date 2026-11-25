import { useEffect, useRef, useState } from 'react'
import { ASSETS, chartIntervals, initialData } from './marketData.js'
import {
  signalIntervals,
  confluenceSignalEngine,
} from '../engines/confluenceSignalEngine.js'
import { startTrade, trackTrade } from '../engines/tradeTracker.js'
import { createMarketStream, marketKey } from './realtimeStream.js'

const allMarkets = Object.keys(ASSETS).flatMap((symbol) =>
  chartIntervals(symbol).map((interval) => ({
    symbol,
    interval,
    key: marketKey(symbol, interval),
  })),
)
const scanMarkets = allMarkets.filter((m) =>
  signalIntervals(m.symbol).includes(m.interval),
)

function candidates(book) {
  return new Map(
    scanMarkets.map((m) => [
      m.key,
      confluenceSignalEngine(m.symbol, m.interval, book[m.key], {
        ignoreForming: true,
      }),
    ]),
  )
}

export function useSignalScanner(refresh, symbol, interval) {
  const [initial] = useState(() => {
    const book = Object.fromEntries(
      allMarkets.map((m) => [m.key, initialData(m.symbol, m.interval)]),
    )
    return {
      book,
      rows: [...candidates(book).values()],
      pending: new Set(),
      status: { state: 'connecting' },
      trades: [],
      events: [],
    }
  })
  const [snapshot, setSnapshot] = useState(initial)
  const stream = useRef(null),
    requested = useRef({ symbol, interval })
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    requested.current = { symbol, interval }
    stream.current?.watch(symbol, interval)
  }, [symbol, interval])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const book = { ...initial.book },
      rows = candidates(book)
    const pending = new Set(),
      tracked = new Map(),
      retired = new Set()
    let status = { state: 'connecting' },
      events = [],
      frame = 0,
      disposed = false
    function flush() {
      if (disposed || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setSnapshot({
          book: { ...book },
          rows: [...rows.values()],
          pending: new Set(pending),
          status,
          trades: [...tracked.values()],
          events,
        })
      })
    }
    const connection = createMarketStream({
      markets: allMarkets,
      onStatus(value) {
        if (value.loading) pending.add(value.loading)
        else if (value.loaded) pending.delete(value.loaded)
        else status = value
        flush()
      },
      onMarket(key, data, closedChanged) {
        const before = book[key]
        book[key] = data
        if (rows.has(key) && (closedChanged || before.source !== data.source)) {
          const m = rows.get(key)
          const row = confluenceSignalEngine(m.symbol, m.interval, data, {
            ignoreForming: true,
          })
          rows.set(key, row)
          const signal = row.signal
          // A still-tracked entry can outlive its entry window as long as no exit traded.
          for (const [id, trade] of tracked) {
            if (trade.signal.key !== key || trade.enteredAt != null) continue
            if (!signal || signal.id !== id) {
              tracked.delete(id)
              retired.delete(id)
            }
          }
          if (!signal)
            for (const id of retired)
              if (id.startsWith(key + ':')) retired.delete(id)
          if (
            data.source === 'live' &&
            signal &&
            signal.expiresAt * 1000 > Date.now() &&
            !tracked.has(signal.id) &&
            !retired.has(signal.id)
          )
            tracked.set(signal.id, startTrade(signal))
        }
        flush()
      },
      onTrade(tick) {
        for (const [id, trade] of tracked) {
          if (
            trade.enteredAt == null &&
            book[trade.signal.key].source !== 'live'
          )
            continue
          const result = trackTrade(trade, tick)
          if (result.trade === trade) continue
          if (result.trade.closed) {
            tracked.delete(id)
            retired.add(id)
          } else tracked.set(id, result.trade)
          if (result.events.length)
            events = [...result.events.reverse(), ...events].slice(0, 20)
        }
        flush()
      },
    })
    stream.current = connection
    for (const market of scanMarkets)
      connection.watch(market.symbol, market.interval)
    connection.watch(requested.current.symbol, requested.current.interval)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      connection.close()
      stream.current = null
    }
    // The stream owns its book. Changes to the view do not reconnect the socket.
  }, [initial])
  useEffect(() => {
    if (refresh) stream.current?.refresh()
  }, [refresh])
  const active =
    snapshot.status.state === 'live'
      ? snapshot.trades
          .filter(
            ({ signal, enteredAt }) =>
              enteredAt != null || signal.expiresAt * 1000 > now,
          )
          .map((t) => ({
            ...t.signal,
            tracking: t.enteredAt != null ? 'entry' : 'waiting',
            hits: t.hits,
          }))
      : []
  const previews = snapshot.rows
    .filter((r) => r.source !== 'live' && r.signal?.expiresAt * 1000 > now)
    .map((r) => r.signal)
  return { ...snapshot, active, previews, busy: snapshot.pending.size > 0 }
}
