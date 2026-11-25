import { useState } from 'react'
import {
  ArrowUpRight,
  Bell,
  BellOff,
  Calculator,
  ChevronDown,
  CircleDot,
  Clock3,
  Copy,
  Crosshair,
  Radar,
  X,
} from 'lucide-react'
import { ASSETS, formatInterval } from '../services/marketData.js'
import {
  signalIntervals,
  calculatePosition,
} from '../engines/confluenceSignalEngine.js'
import { number } from '../engines/common.js'
import { schools } from '../engines/index.js'
import './TradeSignals.css'

const sourceText = { live: 'مباشر', cached: 'محفوظ', simulated: 'محاكاة' }
const trackingText = {
  waiting: 'بانتظار الدخول',
  entry: 'تم لمس الدخول',
  TP1: 'تم لمس TP1',
  TP2: 'تم لمس TP2',
  TP3: 'تم لمس TP3',
  SL: 'تم لمس وقف الخسارة',
}
const reasons = {
  alignment: 'أقل من 3 مدارس متوافقة',
  overlap: 'لا يوجد تقاطع سعري قريب بين مدرستين',
  window: 'لا تتوفر دورة جان نافذة',
  risk: 'مستوى الإلغاء لا يعطي وقفاً صالحاً',
  targets: 'لا تتوفر ثلاثة أهداف صالحة',
  data: 'الشموع المغلقة غير كافية',
  crossed: 'الشمعة الجارية بلغت الوقف أو الهدف الأول',
}
const schoolName = (id) => schools[id]?.arabic ?? 'RSI'
const sideText = (signal) => (signal.dir > 0 ? 'صفقة شراء' : 'صفقة بيع')
const formatRange = ({ low, high }) =>
  low === high ? number(low) : number(low) + ' – ' + number(high)
const formatRR = (ratio) => '1 : ' + ratio.toFixed(2)
const dateLabel = (time) =>
  new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

function Direction({ signal }) {
  return (
    <span className={'direction-pill ' + (signal.dir > 0 ? 'long' : 'short')}>
      {sideText(signal)}
    </span>
  )
}

function Price({ label, value, raw, className = '' }) {
  const [copy, setCopy] = useState('')
  async function copyPrice() {
    try {
      await navigator.clipboard.writeText(raw)
      setCopy('تم النسخ')
    } catch {
      setCopy('تعذر النسخ')
    }
  }
  return (
    <div className={'signal-price ' + className}>
      <span>{label}</span>
      <div>
        <bdi>{value}</bdi>
        <button
          type="button"
          className="signal-icon"
          onClick={copyPrice}
          aria-label={'نسخ ' + label}
          title={copy || 'نسخ'}
        >
          <Copy size={14} />
        </button>
      </div>
      {copy && <small role="status">{copy}</small>}
    </div>
  )
}

function RiskCalculator({ signal }) {
  const [balance, setBalance] = useState('1000')
  const [risk, setRisk] = useState('1')
  const size = calculatePosition(signal, Number(balance), Number(risk))
  const units = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 })
  return (
    <details className="risk-calculator">
      <summary>
        <Calculator size={17} /> حاسبة إدارة رأس المال <ChevronDown size={15} />
      </summary>
      <div className="risk-inputs">
        <label>
          رصيد الحساب ($)
          <input
            type="number"
            min="0.01"
            step="any"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            dir="ltr"
          />
        </label>
        <label>
          المخاطرة (%)
          <input
            type="number"
            min="0.01"
            max="100"
            step="any"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            dir="ltr"
          />
        </label>
      </div>
      {size ? (
        <>
          <div className="risk-results">
            <div>
              <span>حجم المركز</span>
              <bdi>
                {units.format(size.units)} {ASSETS[signal.symbol].unit}
              </bdi>
            </div>
            <div>
              <span>القيمة الاسمية</span>
              <bdi>{number(size.notional)} USDT</bdi>
            </div>
            <div>
              <span>الخسارة عند الوقف</span>
              <bdi>{number(size.budget)} USDT</bdi>
            </div>
          </div>
          <div className="profit-row">
            {size.profits.map((profit, i) => (
              <bdi key={i}>
                TP{i + 1} +{number(profit)} USDT
              </bdi>
            ))}
          </div>
          <p className="signal-muted">
            الحساب من حدّ الدخول الأعلى مخاطرة، قبل رسوم التداول والانزلاق
            السعري.
          </p>
        </>
      ) : (
        <p role="status" className="signal-muted">
          أدخل رصيداً موجباً ونسبة مخاطرة أكبر من صفر وحتى 100%.
        </p>
      )}
    </details>
  )
}

function SignalCard({ signal, onPlot }) {
  const time = formatInterval(signal.interval)
  return (
    <article className="trade-card panel">
      <div className="trade-card-head">
        <div>
          <bdi>{ASSETS[signal.symbol].pair}</bdi>
          <span className="signal-tf" dir="ltr">
            {time}
          </span>
        </div>
        <div>
          <Direction signal={signal} />
          {signal.source !== 'live' && (
            <span className="signal-source">{sourceText[signal.source]}</span>
          )}
        </div>
      </div>
      <div className="signal-score">
        <div>
          <span>نسبة التوافق · {signal.schoolCount} مدارس</span>
          <strong>
            <bdi>{signal.score}%</bdi>
          </strong>
        </div>
        <meter
          min="0"
          max="100"
          value={signal.score}
          aria-label="نسبة التوافق"
        />
      </div>
      <div className="trade-prices">
        <Price
          label="منطقة الدخول"
          value={formatRange(signal)}
          raw={
            signal.low === signal.high
              ? signal.low.toFixed(2)
              : signal.low.toFixed(2) + ' – ' + signal.high.toFixed(2)
          }
          className="entry-price"
        />
        <Price
          label="وقف الخسارة · SL"
          value={number(signal.stop)}
          raw={signal.stop.toFixed(2)}
          className="stop-price"
        />
        {signal.targets.map((t, i) => (
          <Price
            key={t.ratio}
            label={'TP' + (i + 1)}
            value={number(t.price)}
            raw={t.price.toFixed(2)}
            className="target-price"
          />
        ))}
      </div>
      <div className="trade-window">
        <div>
          <Clock3 size={16} />
          <span>
            نافذة جان خلال {signal.validBars} شمعة عند التأكيد · تنتهي{' '}
            <bdi dir="ltr">{dateLabel(signal.expiresAt)}</bdi>
          </span>
        </div>
        <div>
          <span>العائد إلى المخاطرة</span>
          <bdi>
            TP1 {formatRR(signal.targets[0].rr)} · TP2{' '}
            {formatRR(signal.targets[1].rr)} · TP3{' '}
            {formatRR(signal.targets[2].rr)}
          </bdi>
        </div>
      </div>
      {signal.tracking && (
        <div className="signal-pills">
          <span>{trackingText[signal.tracking]}</span>
          {(signal.hits ?? []).map((hit) => (
            <span key={hit}>{trackingText[hit]}</span>
          ))}
        </div>
      )}
      <div className="signal-pills">
        {signal.votes.map((v) => (
          <span key={v.school}>
            <CircleDot size={12} />
            {schoolName(v.school)} · {v.reason}{' '}
            <bdi>
              {v.school === 'RSI' ? v.value.toFixed(1) : number(v.trigger)}
            </bdi>
          </span>
        ))}
        {signal.timeRatio != null && (
          <span>
            <Clock3 size={12} /> نسبة زمن الرابعة إلى الثانية{' '}
            <bdi>{signal.timeRatio.toFixed(2)}</bdi>
          </span>
        )}
      </div>
      <RiskCalculator signal={signal} />
      <button
        type="button"
        className="plot-button"
        onClick={() => onPlot(signal)}
      >
        <Crosshair size={17} />
        عرض على التشارت
        <ArrowUpRight size={15} />
      </button>
    </article>
  )
}

function Filters({ label, value, options, onChange }) {
  return (
    <div className="signal-filters" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(([id, name]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

export function TradeSignals({ scan, alerts, onPlot }) {
  const [symbol, setSymbol] = useState('')
  const [direction, setDirection] = useState('')
  const [interval, setInterval] = useState('')
  function changeSymbol(nextSymbol) {
    setSymbol(nextSymbol)
    if (interval && !signalIntervals(nextSymbol).includes(interval))
      setInterval('')
  }
  const inMarket = (row) =>
    (!symbol || row.symbol === symbol) &&
    (!interval || row.interval === interval)
  const shown = [...scan.active, ...scan.previews]
    .filter((s) => inMarket(s) && (!direction || s.direction === direction))
    .sort(
      (a, b) =>
        (b.source === 'live') - (a.source === 'live') ||
        b.score - a.score ||
        b.updated - a.updated,
    )
  const rows = scan.rows.filter(inMarket)
  const liveCount = scan.rows.filter((r) => r.source === 'live').length
  return (
    <main className="workspace signals-workspace" lang="ar" dir="rtl">
      <header className="scanner-heading">
        <div>
          <div className="scanner-icon">
            <Radar size={24} />
          </div>
          <div>
            <h1>قسم الصفقات والتوصيات</h1>
            <p>
              توافق المدارس الفنية عبر {scan.rows.length} تركيبات للأصل والإطار
              الزمني
            </p>
          </div>
        </div>
        <button
          type="button"
          className="alert-toggle"
          aria-pressed={alerts.mode}
          onClick={alerts.toggle}
        >
          {alerts.mode ? <Bell size={17} /> : <BellOff size={17} />}
          <span>
            تنبيهات التوافق <bdi>80%</bdi> فأكثر
          </span>
        </button>
      </header>
      <div className="scanner-toolbar panel">
        <Filters
          label="الأصل"
          value={symbol}
          onChange={changeSymbol}
          options={[
            ['', 'الكل'],
            ...Object.entries(ASSETS).map(([id, a]) => [id, a.pair]),
          ]}
        />
        <Filters
          label="الاتجاه"
          value={direction}
          onChange={setDirection}
          options={[
            ['', 'الكل'],
            ['BUY', 'شراء'],
            ['SELL', 'بيع'],
          ]}
        />
        <Filters
          label="الإطار"
          value={interval}
          onChange={setInterval}
          options={[
            ['', 'الكل'],
            ...signalIntervals(symbol).map((i) => [i, formatInterval(i)]),
          ]}
        />
      </div>
      <div className="scanner-result" aria-live="polite">
        <strong>{shown.length} نتيجة</strong>
        <span>
          {scan.busy
            ? 'جارٍ تحديث البيانات…'
            : liveCount + ' من ' + scan.rows.length + ' مصادر مباشرة'}
        </span>
      </div>
      {shown.length ? (
        <div className="trade-grid">
          {shown.map((s) => (
            <SignalCard key={s.id} signal={s} onPlot={onPlot} />
          ))}
        </div>
      ) : (
        <div className="scanner-empty panel">
          <Radar size={27} />
          <h2>لا توجد صفقات تطابق الفلاتر</h2>
          <p>
            تظهر الصفقة عند توافق ثلاث مدارس وتداخل منطقتين سعريتين مع نافذة
            زمنية قابلة للقياس.
          </p>
        </div>
      )}
      <section className="scan-status panel" aria-label="حالة المسح">
        <h2>حالة المسح</h2>
        {rows.map((row) => (
          <details key={row.key} className="scan-row">
            <summary>
              <bdi>{ASSETS[row.symbol].pair}</bdi>
              <bdi className="signal-tf">{formatInterval(row.interval)}</bdi>
              <span className="scan-reason">
                {shown.some((s) => s.key === row.key)
                  ? 'توافق ' + shown.find((s) => s.key === row.key).score + '%'
                  : row.signal
                    ? 'النافذة مغلقة أو مستبعدة بالفلاتر'
                    : reasons[row.reason]}
              </span>
              <span className={'signal-source ' + row.source}>
                {sourceText[row.source]}
              </span>
              <ChevronDown size={15} />
            </summary>
            <div>
              {row.votes.map((v) => (
                <span key={v.school}>
                  {schoolName(v.school)} ·{' '}
                  <b>{v.dir > 0 ? 'شراء' : v.dir < 0 ? 'بيع' : 'محايد'}</b>
                  {v.trigger != null && (
                    <>
                      {' '}
                      · <bdi>{number(v.trigger)}</bdi>
                    </>
                  )}
                </span>
              ))}
            </div>
          </details>
        ))}
      </section>
      {scan.events.length > 0 && (
        <section
          className="scan-status panel"
          aria-label="تحديثات الصفقات المباشرة"
        >
          <h2>تحديثات الصفقات المباشرة</h2>
          <ol className="trade-events">
            {scan.events
              .filter((e) => inMarket(e.signal))
              .map((e) => (
                <li key={e.signal.id + ':' + e.type + ':' + e.at}>
                  <strong>{trackingText[e.type]}</strong>{' '}
                  <bdi>
                    {ASSETS[e.signal.symbol].pair} ·{' '}
                    {formatInterval(e.signal.interval)} · {number(e.price)}
                  </bdi>
                  <time dir="ltr">
                    {new Date(e.at).toISOString().slice(11, 19)} UTC
                  </time>
                </li>
              ))}
          </ol>
        </section>
      )}
    </main>
  )
}

export function QuickSignals({ active, onPlot, onOpen }) {
  return (
    <details className="quick-signals panel" dir="rtl" lang="ar">
      <summary>
        <Radar size={16} /> الإشارات السريعة <bdi>{active.length}</bdi>
        <ChevronDown size={15} />
      </summary>
      <div>
        {active.map((s) => (
          <button type="button" key={s.id} onClick={() => onPlot(s)}>
            <bdi>
              {ASSETS[s.symbol].pair} · {formatInterval(s.interval)}
            </bdi>
            <Direction signal={s} />
            <bdi>{s.score}%</bdi>
          </button>
        ))}
        {!active.length && <span>لا توجد إشارات مباشرة حالياً</span>}
        <button type="button" onClick={onOpen}>
          فتح ماسح الصفقات <ArrowUpRight size={14} />
        </button>
      </div>
    </details>
  )
}

export function PositionStrip({ signal, onClear }) {
  return (
    <div className="position-strip" lang="ar" dir="rtl">
      <Direction signal={signal} />
      {signal.tracking && <span>{trackingText[signal.tracking]}</span>}
      {signal.source !== 'live' && (
        <span className="signal-source">{sourceText[signal.source]}</span>
      )}
      <span>
        دخول <bdi>{formatRange(signal)}</bdi>
      </span>
      <span>
        وقف <bdi>{number(signal.stop)}</bdi>
      </span>
      {signal.targets.map((t, i) => (
        <bdi key={t.ratio}>
          TP{i + 1} {number(t.price)}
        </bdi>
      ))}
      <button
        type="button"
        className="signal-icon"
        title="إخفاء الصفقة"
        aria-label="إخفاء الصفقة"
        onClick={onClear}
      >
        <X size={17} />
      </button>
    </div>
  )
}
