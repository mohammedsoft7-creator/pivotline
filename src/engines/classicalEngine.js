import { zigzag } from '../utils/indicators.js'
import {
  result,
  path,
  point,
  level,
  describe,
  number,
  green,
  red,
  amber,
  blue,
} from './common.js'
export function classicalEngine(candles) {
  const out = result('التحليل الكلاسيكي'),
    ps = zigzag(candles, 4)
  if (ps.length < 2) return out
  const end = candles.length - 1,
    last = candles[end].close
  const tolerance =
      candles.reduce((s, k) => s + k.high - k.low, 0) / candles.length,
    groups = []
  for (const p of ps) {
    const g = groups.find((v) => Math.abs(v.price - p.price) <= tolerance)
    if (g) {
      g.price = (g.price * g.count + p.price) / (g.count + 1)
      g.count++
    } else groups.push({ price: p.price, count: 1, from: p.index })
  }
  groups.sort(
    (a, b) =>
      b.count - a.count || Math.abs(a.price - last) - Math.abs(b.price - last),
  )
  for (const side of [-1, 1]) {
    const g = groups.find((p) => side * (p.price - last) > 0)
    if (g)
      out.horizontalLines.push(
        level(
          g.from,
          end + 20,
          g.price,
          (side < 0 ? 'Support' : 'Resistance') + ' · ' + g.count,
          side < 0 ? green : red,
        ),
      )
  }
  const [start, finish] = ps.slice(-2),
    up = finish.price > start.price
  const trendlines = []
  for (const type of ['high', 'low']) {
    const pair = ps.filter((p) => p.type === type).slice(-2)
    if (pair.length < 2) continue
    const [a, b] = pair,
      slope = (b.price - a.price) / (b.index - a.index)
    const at = (i) => a.price + slope * (i - a.index)
    const side = type === 'low' ? 1 : -1
    const broken = candles.findIndex(
      (k, i) => i > b.index && side * (k.close - at(i)) < 0,
    )
    const stop = broken < 0 ? end : broken
    if (broken < 0 && slope * side > 0)
      trendlines.push({ dir: side, price: at(end), invalidation: b.price })
    out.overlays.push(
      path([a, b, point(stop, at(stop))], type === 'low' ? green : red),
    )
    if (broken < 0)
      out.projections.push(
        path(
          [point(end, at(end)), point(end + 15, at(end + 15))],
          type === 'low' ? green : red,
        ),
      )
    if (type === (up ? 'low' : 'high')) {
      const offsets = candles
        .slice(a.index, stop + 1)
        .map((k, i) => (up ? k.high : k.low) - at(i + a.index))
      const width = up ? Math.max(...offsets) : Math.min(...offsets)
      out.overlays.push(
        path(
          [
            point(a.index, a.price + width, 'Channel'),
            point(stop, at(stop) + width),
          ],
          blue,
        ),
      )
    }
  }
  const fib = (r) => finish.price - (finish.price - start.price) * r
  const invalidated = candles.findIndex(
    (k, i) =>
      i > finish.index && (up ? k.close < start.price : k.close > start.price),
  )
  out.tradeEvidence = {
    levels: out.horizontalLines.map((l) => ({
      dir: l.price < last ? 1 : -1,
      price: l.price,
      invalidation: l.price,
    })),
    trendlines,
    retracement:
      invalidated < 0
        ? {
            dir: up ? 1 : -1,
            low: Math.min(fib(0.382), fib(0.618)),
            high: Math.max(fib(0.382), fib(0.618)),
            price: fib(0.5),
            invalidation: start.price,
          }
        : null,
  }
  for (const r of [0.382, 0.5, 0.618])
    out.horizontalLines.push(
      level(
        finish.index,
        invalidated < 0 ? end + 21 : invalidated,
        fib(r),
        r.toFixed(3),
        amber,
        true,
      ),
    )
  out.commentary.structure =
    'آخر ضلع ' +
    (up ? 'صاعد' : 'هابط') +
    ' من ' +
    describe(start) +
    ' إلى ' +
    describe(finish) +
    '.'
  out.commentary.details =
    'تُجمع المحاور ضمن متوسط مدى الشمعة (' +
    number(tolerance) +
    '). ' +
    out.horizontalLines
      .filter((l) => !l.math)
      .map((l) => (l.price < last ? 'دعم ' : 'مقاومة ') + number(l.price))
      .join(' · ')
  out.commentary.scenario =
    'تراجع 38.2%–61.8% من آخر ضلع يحدد نطاق التصحيح. منتصفه عند ' +
    number(fib(0.5)) +
    '.'
  out.commentary.target =
    number(Math.min(fib(0.382), fib(0.618))) +
    ' – ' +
    number(Math.max(fib(0.382), fib(0.618)))
  out.commentary.invalidation =
    'إغلاق ' +
    (up ? 'دون ' : 'فوق ') +
    number(start.price) +
    ' يكسر منشأ الضلع.'
  if (invalidated >= 0) {
    out.commentary.scenario =
      'توقف سيناريو الارتداد بعد كسر منشأ الضلع بإغلاق ' +
      describe({
        price: candles[invalidated].close,
        time: candles[invalidated].time,
      }) +
      '.'
    out.commentary.target = ''
  }
  return out
}
