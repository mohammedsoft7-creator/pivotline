import { useEffect, useMemo, useState } from 'react'
import {
  ASSETS,
  INTERVALS,
  fetchMarketData,
  initialData,
} from './marketData.js'
import {
  signalIntervals,
  marketKey,
  confluenceSignalEngine,
} from '../engines/confluenceSignalEngine.js'

const markets = Object.keys(ASSETS).flatMap((symbol) =>
  signalIntervals(symbol).map((interval) => ({
    symbol,
    interval,
    key: marketKey(symbol, interval),
  })),
)
const refreshDelay = (interval) => Math.min(60000, INTERVALS[interval] * 250)
const pollGroups = new Map()
for (const market of markets) {
  const delay = refreshDelay(market.interval)
  if (!pollGroups.has(delay)) pollGroups.set(delay, [])
  pollGroups.get(delay).push(market)
}

async function readMarket(symbol, interval, signal) {
  try {
    return await fetchMarketData(symbol, interval, signal)
  } catch {
    return initialData(symbol, interval)
  }
}

export function useSignalScanner(refresh) {
  const [book, setBook] = useState(() =>
    Object.fromEntries(
      markets.map((m) => [m.key, initialData(m.symbol, m.interval)]),
    ),
  )
  const [pending, setPending] = useState(
    () => new Set(markets.map((m) => m.key)),
  )
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const stops = Array.from(pollGroups, ([delay, group]) => {
      let active = true,
        timer,
        controller
      function markPending(busy) {
        setPending((current) => {
          const next = new Set(current)
          for (const { key } of group) {
            if (busy) next.add(key)
            else next.delete(key)
          }
          return next
        })
      }
      async function poll() {
        controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 6500)
        markPending(true)
        try {
          const rows = await Promise.all(
            group.map(async (m) => [
              m.key,
              await readMarket(m.symbol, m.interval, controller.signal),
            ]),
          )
          if (active) {
            setBook((current) => ({ ...current, ...Object.fromEntries(rows) }))
            setNow(Date.now())
          }
        } finally {
          clearTimeout(timeout)
          if (active) {
            markPending(false)
            timer = setTimeout(poll, delay)
          }
        }
      }
      poll()
      return () => {
        active = false
        clearTimeout(timer)
        controller.abort()
      }
    })
    return () => stops.forEach((stop) => stop())
  }, [refresh])
  const rows = useMemo(
    () =>
      markets.map((m) =>
        confluenceSignalEngine(m.symbol, m.interval, book[m.key]),
      ),
    [book],
  )
  const active = [],
    previews = []
  for (const row of rows) {
    if (!row.signal || row.signal.expiresAt * 1000 <= now) continue
    if (
      row.source === 'live' &&
      now - row.updated < 2 * refreshDelay(row.interval) + 30000
    )
      active.push(row.signal)
    else if (row.source !== 'live') previews.push(row.signal)
  }
  return { book, pending, busy: pending.size > 0, rows, active, previews }
}

export function useChartMarket(symbol, interval, shared, refresh) {
  const [data, setData] = useState(
    () => shared ?? initialData(symbol, interval),
  )
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (shared) return
    let active = true,
      timer,
      controller
    async function poll() {
      setBusy(true)
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6500)
      try {
        const next = await readMarket(symbol, interval, controller.signal)
        if (active) setData(next)
      } finally {
        clearTimeout(timeout)
        if (active) {
          setBusy(false)
          timer = setTimeout(poll, refreshDelay(interval))
        }
      }
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [symbol, interval, shared, refresh])
  return { data: shared ?? data, busy }
}
