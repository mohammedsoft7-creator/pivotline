import { useEffect, useMemo, useState } from 'react'
import {
  ASSETS,
  INTERVALS,
  fetchMarketData,
  initialData,
} from './marketData.js'
import {
  SIGNAL_INTERVALS,
  marketKey,
  confluenceSignalEngine,
} from '../engines/confluenceSignalEngine.js'

const markets = Object.keys(ASSETS).flatMap((symbol) =>
  SIGNAL_INTERVALS.map((interval) => ({
    symbol,
    interval,
    key: marketKey(symbol, interval),
  })),
)

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
  const [busy, setBusy] = useState(true)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let active = true,
      timer,
      controller
    async function poll() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6500)
      setBusy(true)
      try {
        const rows = await Promise.all(
          markets.map(async (m) => [
            m.key,
            await readMarket(m.symbol, m.interval, controller.signal),
          ]),
        )
        if (active) {
          setBook(Object.fromEntries(rows))
          setNow(Date.now())
        }
      } finally {
        clearTimeout(timeout)
        if (active) {
          setBusy(false)
          timer = setTimeout(poll, 60000)
        }
      }
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
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
    if (row.source === 'live' && now - row.updated < 150000)
      active.push(row.signal)
    else if (row.source !== 'live') previews.push(row.signal)
  }
  return { book, busy, rows, active, previews }
}

export function useChartMarket(symbol, interval, shared, refresh) {
  const [data, setData] = useState(
    () => shared ?? initialData(symbol, interval),
  )
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (shared) return
    const refreshDelay = Math.min(60000, INTERVALS[interval] * 250)
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
          timer = setTimeout(poll, refreshDelay)
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
