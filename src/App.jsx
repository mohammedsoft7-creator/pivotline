import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChartCandlestick } from 'lucide-react'
import {
  ASSETS,
  INTERVALS,
  initialData,
  fetchMarketData,
} from './services/marketData.js'
import { calculateRSI } from './utils/indicators.js'
import { schools } from './engines/index.js'
import { exportSnapshot } from './utils/exportSnapshot.js'
import {
  HeaderBar,
  MarketHeader,
  ModelPanel,
  ChartFooter,
} from './components/HeaderBar.jsx'
import ChartWorkspace from './components/ChartWorkspace.jsx'
import ArabicCommentary from './components/ArabicCommentary.jsx'

function Terminal({
  symbol,
  interval,
  onSymbol,
  onInterval,
  school,
  setSchool,
  settings,
  toggle,
}) {
  const [data, setData] = useState(() => initialData(symbol, interval)),
    [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0),
    [hover, setHover] = useState(null),
    [view, setView] = useState(0)
  const [expanded, setExpanded] = useState(false),
    [exporting, setExporting] = useState(false),
    [message, setMessage] = useState('')
  const exportRef = useRef(null)
  useEffect(() => {
    let active = true,
      timer,
      controller
    async function load() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6500)
      setBusy(true)
      try {
        const next = await fetchMarketData(symbol, interval, controller.signal)
        if (active) setData(next)
      } catch {
        if (active) setData(initialData(symbol, interval))
      } finally {
        clearTimeout(timeout)
        if (active) {
          setBusy(false)
          timer = setTimeout(load, 60000)
        }
      }
    }
    load()
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [symbol, interval, refresh])
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  const rsi = useMemo(() => calculateRSI(data.candles), [data.candles])
  const analysis = useMemo(() => {
    const last = data.candles.at(-1)
    const closed =
      (last.time + INTERVALS[interval]) * 1000 > data.updated
        ? data.candles.slice(0, -1)
        : data.candles
    return schools[school].engine(closed, {
      intervalSeconds: INTERVALS[interval],
      chartEnd: data.candles.length - 1,
    })
  }, [data, school, interval])
  const index = hover ?? data.candles.length - 1,
    candle = data.candles[index] ?? data.candles.at(-1)
  const save = async () => {
    setExporting(true)
    setMessage('')
    try {
      await exportSnapshot(exportRef.current, symbol, interval, school)
      setMessage('Snapshot downloaded.')
    } catch {
      setMessage('Snapshot could not be saved. Please retry.')
    } finally {
      setExporting(false)
    }
  }
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4500)
      return () => clearTimeout(timer)
    }
  }, [message])
  return (
    <div ref={exportRef} data-export-root className="terminal">
      <HeaderBar
        symbol={symbol}
        onSymbol={onSymbol}
        source={data.source}
        busy={busy}
        refresh={() => setRefresh((n) => n + 1)}
        exporting={exporting}
        save={save}
      />
      <main className="workspace">
        <div className="work-heading">
          <h1>Chart workspace</h1>
          <div className="date">
            <CalendarDays size={14} />
            {new Date(data.updated).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <div className="workspace-grid">
          <section
            className={'chart-panel panel ' + (expanded ? 'expanded' : '')}
            aria-label={ASSETS[symbol].pair + ' chart'}
          >
            <MarketHeader
              symbol={symbol}
              data={data}
              interval={interval}
              onInterval={onInterval}
              reset={() => setView((n) => n + 1)}
              expand={() => setExpanded((v) => !v)}
              expanded={expanded}
              candle={candle}
              rsi={rsi[index]}
            />
            <ChartWorkspace
              candles={data.candles}
              interval={interval}
              rsi={rsi}
              analysis={analysis}
              settings={settings}
              onHover={setHover}
              resetKey={view}
              readout={rsi[index]}
            />
            <ChartFooter updated={data.updated} count={data.candles.length} />
          </section>
          <ModelPanel
            school={school}
            onSchool={setSchool}
            settings={settings}
            toggle={toggle}
          />
        </div>
        <ArabicCommentary
          commentary={analysis.commentary}
          model={schools[school].name}
        />
        <footer className="page-footer">
          <span>
            <ChartCandlestick size={13} /> Pivotline terminal
          </span>
          <a
            href="https://www.tradingview.com/"
            title="TradingView Lightweight Charts™ · Copyright © 2024 TradingView, Inc."
            target="_blank"
            rel="noreferrer"
          >
            Charts by TradingView
          </a>
        </footer>
      </main>
      {message && (
        <div role="status" className="toast" data-html2canvas-ignore>
          {message}
        </div>
      )}
    </div>
  )
}
export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT'),
    [interval, setIntervalValue] = useState('1d'),
    [school, setSchool] = useState('ELLIOTT')
  const [settings, setSettings] = useState({ math: true, future: true })
  const toggle = useCallback(
    (k) => setSettings((s) => ({ ...s, [k]: !s[k] })),
    [],
  )
  return (
    <Terminal
      key={symbol + interval}
      symbol={symbol}
      interval={interval}
      onSymbol={setSymbol}
      onInterval={setIntervalValue}
      school={school}
      setSchool={setSchool}
      settings={settings}
      toggle={toggle}
    />
  )
}
