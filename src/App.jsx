import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChartCandlestick } from 'lucide-react'
import { ASSETS, INTERVALS, chartIntervals } from './services/marketData.js'
import { closedCandles, marketKey } from './engines/confluenceSignalEngine.js'
import { useSignalScanner } from './services/useSignalScanner.js'
import { useSignalAlerts } from './services/useSignalAlerts.js'
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
import { TelegramControl } from './components/TelegramControl.jsx'
import { useTelegramControl } from './services/telegramControl.js'
import {
  PositionStrip,
  QuickSignals,
  TradeSignals,
} from './components/TradeSignals.jsx'

function Terminal({
  symbol,
  interval,
  onSymbol,
  onInterval,
  school,
  setSchool,
  settings,
  toggle,
  mode,
  onMode,
  scan,
  requestRefresh,
  alerts,
  onPlot,
  position,
  onClearPosition,
  plotRequest,
  telegram,
}) {
  const selectedMarket = marketKey(symbol, interval)
  const data = scan.book[selectedMarket]
  const [hover, setHover] = useState(null),
    [view, setView] = useState(0)
  const [expanded, setExpanded] = useState(false),
    [exporting, setExporting] = useState(false),
    [message, setMessage] = useState('')
  const exportRef = useRef(null)
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  const rsi = useMemo(() => calculateRSI(data.candles), [data.candles])
  const closed = data.closedBars ?? closedCandles(data, interval)
  const chartEnd = data.candles.length - 1
  const analysis = useMemo(() => {
    return schools[school].engine(closed, {
      intervalSeconds: INTERVALS[interval],
      chartEnd,
    })
  }, [closed, chartEnd, school, interval])
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
        source={mode === 'chart' ? data.source : 'scanning'}
        busy={mode === 'signals' ? scan.busy : scan.pending.has(selectedMarket)}
        refresh={requestRefresh}
        exporting={exporting}
        save={save}
        activeCount={scan.active.length}
        view={mode}
        onView={onMode}
        stream={scan.status}
        onTelegram={() => telegram.setOpen(true)}
        telegramConnected={
          telegram.status?.configured &&
          telegram.status?.stream.state === 'live'
        }
      />
      {mode === 'signals' ? (
        <TradeSignals scan={scan} alerts={alerts} onPlot={onPlot} />
      ) : (
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
          <QuickSignals
            active={scan.active}
            onPlot={onPlot}
            onOpen={() => onMode('signals')}
          />
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
              {position && (
                <PositionStrip signal={position} onClear={onClearPosition} />
              )}
              <ChartWorkspace
                candles={data.candles}
                interval={interval}
                rsi={rsi}
                analysis={analysis}
                settings={settings}
                onHover={setHover}
                resetKey={view + plotRequest}
                readout={rsi[index]}
                position={position}
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
      )}
      {alerts.notice && (
        <div
          role="status"
          className="toast signal-toast"
          dir="rtl"
          lang="ar"
          data-html2canvas-ignore
        >
          {alerts.notice}
        </div>
      )}
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
  const [mode, setMode] = useState('chart')
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState(null)
  const [plotRequest, setPlotRequest] = useState(0)
  const scan = useSignalScanner(refresh, symbol, interval)
  const telegram = useTelegramControl()
  const alerts = useSignalAlerts(scan.active)
  const position = [
    ...scan.active,
    ...scan.previews,
    ...scan.events.map((e) => ({ ...e.signal, tracking: e.type })),
  ].find(
    (s) => s.id === selected && s.symbol === symbol && s.interval === interval,
  )
  function changeSymbol(nextSymbol) {
    setSymbol(nextSymbol)
    if (!chartIntervals(nextSymbol).includes(interval)) setIntervalValue('5m')
  }
  function plot(signal) {
    setSymbol(signal.symbol)
    setIntervalValue(signal.interval)
    setSelected(signal.id)
    setPlotRequest((n) => n + 1)
    setMode('chart')
  }
  const toggle = useCallback(
    (k) => setSettings((s) => ({ ...s, [k]: !s[k] })),
    [],
  )
  return (
    <>
      <Terminal
        key={symbol + interval}
        symbol={symbol}
        interval={interval}
        onSymbol={changeSymbol}
        onInterval={setIntervalValue}
        school={school}
        setSchool={setSchool}
        settings={settings}
        toggle={toggle}
        mode={mode}
        onMode={setMode}
        scan={scan}
        requestRefresh={() => setRefresh((n) => n + 1)}
        alerts={alerts}
        onPlot={plot}
        position={position}
        plotRequest={plotRequest}
        onClearPosition={() => setSelected(null)}
        telegram={telegram}
      />
      <TelegramControl control={telegram} />
    </>
  )
}
