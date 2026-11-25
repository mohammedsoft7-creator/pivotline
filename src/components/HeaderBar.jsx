import {
  Activity,
  Bitcoin,
  Blocks,
  Camera,
  CandlestickChart,
  ChartNoAxesCombined,
  ChartSpline,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  Fan,
  Gem,
  Layers3,
  Maximize2,
  Minimize2,
  RefreshCw,
  Radar,
  RotateCcw,
  SlidersHorizontal,
  Waypoints,
} from 'lucide-react'
import { ASSETS, INTERVALS, formatInterval } from '../services/marketData.js'
import { schools } from '../engines/index.js'
import { number } from '../engines/common.js'
const icons = {
  ELLIOTT: Activity,
  ICT: Blocks,
  HARMONIC: Waypoints,
  CLASSICAL: ChartNoAxesCombined,
  GANN: Fan,
}
export function HeaderBar({
  symbol,
  onSymbol,
  source,
  refresh,
  busy,
  exporting,
  save,
  activeCount,
  view,
  onView,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <ChartNoAxesCombined size={24} strokeWidth={2.7} />
        </span>
        Pivotline
      </div>
      <span className="nav-divider" />
      <AssetSwitch symbol={symbol} onChange={onSymbol} />
      <nav className="view-nav" lang="ar" aria-label="أقسام Pivotline">
        <button
          type="button"
          aria-pressed={view === 'chart'}
          onClick={() => onView('chart')}
          title="Chart Workspace"
        >
          <CandlestickChart size={15} /> منصة التحليل
        </button>
        <button
          type="button"
          aria-pressed={view === 'signals'}
          onClick={() => onView('signals')}
          title="Trade Signals"
        >
          <Radar size={15} /> قسم الصفقات{' '}
          <bdi aria-label={activeCount + ' إشارات مباشرة'}>{activeCount}</bdi>
        </button>
      </nav>
      <div className="top-actions">
        <span className={'feed ' + source}>
          <i />
          {
            {
              live: 'Live feed',
              simulated: 'Simulated feed',
              cached: 'Cached feed',
              scanning: 'Signal scanner',
            }[source]
          }
        </span>
        <button
          className="icon-btn"
          title="Refresh market data"
          aria-label="Refresh market data"
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw size={16} className={busy ? 'spin' : ''} />
        </button>
        {view === 'chart' && (
          <button
            className="export-btn"
            onClick={save}
            disabled={exporting}
            title="تصدير صورة"
          >
            <Camera size={17} />
            {exporting ? 'Exporting…' : 'Export PNG'}
            <span lang="ar">تصدير صورة</span>
          </button>
        )}
      </div>
    </header>
  )
}
function AssetSwitch({ symbol, onChange }) {
  return (
    <div className="asset-switch" aria-label="Asset">
      {Object.entries(ASSETS).map(([id, a]) => {
        const Icon = id === 'BTCUSDT' ? Bitcoin : Gem
        return (
          <button
            aria-pressed={symbol === id}
            className={symbol === id ? 'active' : ''}
            key={id}
            onClick={() => onChange(id)}
          >
            <Icon size={16} />
            {a.pair}
          </button>
        )
      })}
    </div>
  )
}
export function MarketHeader({
  symbol,
  data,
  interval,
  onInterval,
  reset,
  expand,
  expanded,
  candle,
  rsi,
}) {
  const a = ASSETS[symbol],
    last = data.candles.at(-1),
    Icon = symbol === 'BTCUSDT' ? Bitcoin : Gem
  const positive = data.change >= 0
  const volume = Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(candle.volume)
  return (
    <>
      <div className="instrument">
        <div className={'coin ' + (symbol === 'PAXGUSDT' ? 'gold' : '')}>
          <Icon size={25} strokeWidth={2.5} />
        </div>
        <div className="instrument-name">
          <h2>
            {a.name}
            <span> / </span>
            {a.quote}
          </h2>
          <div>
            {symbol === 'BTCUSDT' ? 'BTC/USDT' : 'XAU/USD · PAXG/USDT proxy'}
            <i />
            Binance
          </div>
        </div>
        <div className="quote">
          <strong>{number(last.close)}</strong>
          <div>
            <span className={positive ? 'rise' : 'fall'}>
              {data.change == null
                ? '—'
                : (positive ? '+' : '') + data.change.toFixed(2) + '%'}
            </span>
            <small>24h</small>
          </div>
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="chart-type">
          <CandlestickChart size={17} />
          <span>Candles</span>
        </div>
        <div className="timeframes">
          {Object.keys(INTERVALS).map((v) => (
            <button
              key={v}
              aria-pressed={interval === v}
              className={interval === v ? 'selected' : ''}
              onClick={() => onInterval(v)}
            >
              {formatInterval(v)}
            </button>
          ))}
        </div>
        <div className="chart-actions">
          <button
            onClick={reset}
            title="Reset chart view"
            aria-label="Reset chart view"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={expand}
            title={expanded ? 'Exit expanded chart' : 'Expand chart'}
            aria-label={expanded ? 'Exit expanded chart' : 'Expand chart'}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
      <div className="ohlc" aria-label="Candle values">
        {[
          ['O', candle.open],
          ['H', candle.high],
          ['L', candle.low],
          ['C', candle.close],
        ].map(([key, v]) => (
          <span key={key}>
            {key}{' '}
            <b className={candle.close >= candle.open ? 'bull' : 'bear'}>
              {number(v)}
            </b>
          </span>
        ))}
        <span>
          Vol <b>{volume}</b>
        </span>
        <span>
          RSI <b className="purple">{rsi?.toFixed(2) ?? '—'}</b>
        </span>
      </div>
    </>
  )
}
export function ModelPanel({ school, onSchool, settings, toggle }) {
  const legends = {
    ELLIOTT: [
      ['#6795ff', 'Wave structure'],
      ['#f4b855', 'Retracement zone'],
      ['#ec7583', 'Invalidation'],
    ],
    ICT: [
      ['#39c6a4', 'Bullish zone'],
      ['#ec7583', 'Bearish zone'],
      ['#6795ff', 'Structure break'],
    ],
    HARMONIC: [
      ['#b591ed', 'X–A–B–C–D'],
      ['#f4b855', 'Reversal zone'],
      ['#ec7583', 'Invalidation'],
    ],
    CLASSICAL: [
      ['#39c6a4', 'Support'],
      ['#ec7583', 'Resistance'],
      ['#f4b855', 'Fibonacci level'],
    ],
    GANN: [
      ['#6795ff', '1×1 · 2×1 · 1×2 fan'],
      ['#f4b855', 'Square of nine'],
      ['#b591ed', 'Time cycle'],
    ],
  }
  return (
    <aside className="sidepanel panel">
      <div className="panel-heading">
        <Layers3 size={17} />
        <h2>Analysis models</h2>
      </div>
      <div className="model-list" role="group" aria-label="Analysis school">
        {Object.entries(schools).map(([id, s]) => {
          const Icon = icons[id]
          return (
            <button
              aria-pressed={school === id}
              onClick={() => onSchool(id)}
              className={'model ' + (school === id ? 'active' : '')}
              key={id}
            >
              <span className="model-icon">
                <Icon size={18} />
              </span>
              <b>{s.name}</b>
              <small lang="ar">{s.arabic}</small>
              {school === id ? <Check size={14} /> : <ChevronRight size={14} />}
            </button>
          )
        })}
      </div>
      <section className="side-section">
        <div className="mini-heading">
          <SlidersHorizontal size={15} /> Overlay settings
        </div>
        {Object.entries({
          math: 'Fibonacci labels',
          future: 'Future projections',
        }).map(([k, title]) => (
          <button
            className="setting"
            role="switch"
            aria-checked={settings[k]}
            key={k}
            onClick={() => toggle(k)}
          >
            {title}
            <span className={'switch ' + (settings[k] ? 'on' : '')}>
              <i />
            </span>
          </button>
        ))}
      </section>
      <section className="side-section legend">
        <div className="mini-heading">
          <ChartSpline size={16} /> Chart legend
        </div>
        {legends[school].map(([color, label], i) => (
          <div className="legend-row" key={label}>
            <i style={{ '--swatch': color }} className={'swatch s' + i} />
            {label}
          </div>
        ))}
      </section>
    </aside>
  )
}
export function ChartFooter({ updated, count }) {
  return (
    <div className="chart-footer">
      <span>
        <Crosshair size={13} />
        {count} candles
      </span>
      <span>
        <Clock3 size={13} />{' '}
        {new Date(updated).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC
      </span>
    </div>
  )
}
