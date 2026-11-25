import { ASSETS, formatInterval } from '../src/services/marketData.js'
import { number } from '../src/engines/common.js'
import { schools } from '../src/engines/index.js'
import {
  closedCandles,
  marketKey,
} from '../src/engines/confluenceSignalEngine.js'
import { calculateRSI } from '../src/utils/indicators.js'

const html = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const tag = (symbol) => (symbol === 'BTCUSDT' ? '#BTCUSDT' : '#XAUUSD')
const schoolName = (id) => schools[id]?.arabic ?? id
export function signalMessage(s) {
  const direction = s.dir > 0 ? '🟢 صفقة شراء LONG' : '🔴 صفقة بيع SHORT'
  const targets = s.targets.map(
    (t, i) =>
      'TP' +
      (i + 1) +
      ' <code>' +
      number(t.price) +
      '</code> · R:R 1:' +
      t.rr.toFixed(2),
  )
  const reasons = s.votes.map(
    (v) =>
      '• ' +
      html(schoolName(v.school)) +
      ' · ' +
      html(v.reason) +
      ' · ' +
      (v.school === 'RSI' ? v.value.toFixed(1) : number(v.trigger)),
  )
  return [
    '<b>' + direction + '</b>',
    tag(s.symbol) +
      ' · ' +
      formatInterval(s.interval) +
      ' · التوافق ' +
      s.score +
      '%',
    'منطقة الدخول <code>' + number(s.low) + ' – ' + number(s.high) + '</code>',
    'وقف الخسارة SL <code>' + number(s.stop) + '</code>',
    ...targets,
    'صلاحية الدخول حتى ' +
      new Date(s.expiresAt * 1000)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ') +
      ' UTC',
    '',
    '<b>الأسباب الفنية والزمنية</b>',
    ...reasons,
  ].join('\n')
}
export function outcomeMessage(event, trade) {
  const s = trade.signal
  const profit = ((event.price / trade.entryFill - 1) * 100 * s.dir).toFixed(2)
  const action =
    event.type === 'SL'
      ? '🛑 بلغ السعر وقف الخسارة SL'
      : '✅ بلغ السعر الهدف ' + event.type
  return (
    '<b>' +
    action +
    '</b>\n' +
    tag(s.symbol) +
    ' · ' +
    formatInterval(s.interval) +
    ' · <code>' +
    number(event.price) +
    '</code>\nالتغير من سعر الدخول المرصود ' +
    profit +
    '%'
  )
}
export function analysisReports(book, prices) {
  const reports = []
  for (const [symbol, asset] of Object.entries(ASSETS)) {
    const frames = []
    for (const interval of ['15m', '1h', '4h']) {
      const data = book.get(marketKey(symbol, interval))
      if (data?.source !== 'live')
        throw new Error('البيانات المباشرة غير جاهزة لكل الأطر المطلوبة.')
      const candles = closedCandles(data, interval)
      if (candles.length < 20)
        throw new Error('الشموع المغلقة غير كافية للتحليل.')
      const rsi = calculateRSI(candles).at(-1)
      const analyses = Object.fromEntries(
        Object.entries(schools).map(([key, school]) => [
          key,
          school.engine(candles),
        ]),
      )
      const levels = analyses.CLASSICAL.horizontalLines
        .filter((l) => /^(Support|Resistance)/.test(l.label))
        .map(
          (l) =>
            (l.label.startsWith('Support') ? 'دعم ' : 'مقاومة ') +
            number(l.price),
        )
      frames.push(
        [
          '<b>' +
            formatInterval(interval) +
            '</b> · RSI ' +
            rsi.toFixed(2) +
            ' (' +
            (rsi >= 70 ? 'تشبّع شرائي' : rsi <= 30 ? 'تشبّع بيعي' : 'محايد') +
            ')',
          ...(levels.length ? [levels.join(' · ')] : []),
          ...Object.entries(analyses).map(([id, a]) =>
            html(schoolName(id) + ' · ' + a.commentary.structure),
          ),
          ...['ELLIOTT', 'ICT', 'GANN'].map((id) =>
            html(
              schoolName(id) +
                ' · ' +
                analyses[id].commentary.scenario +
                (analyses[id].commentary.target
                  ? ' ' + analyses[id].commentary.target
                  : ''),
            ),
          ),
        ].join('\n'),
      )
    }
    const price =
      prices.get(symbol)?.price ??
      book.get(marketKey(symbol, '15m')).candles.at(-1).close
    const header =
      '<b>تحليل Pivotline</b> · ' +
      tag(symbol) +
      ' · ' +
      html(asset.pair) +
      '\nالسعر <code>' +
      number(price) +
      '</code>'
    let current = header
    for (const frame of frames) {
      if (current.length + frame.length > 3950) {
        reports.push({ symbol, text: current })
        current = header
      }
      current += '\n\n' + frame
    }
    reports.push({ symbol, text: current })
  }
  return reports
}
