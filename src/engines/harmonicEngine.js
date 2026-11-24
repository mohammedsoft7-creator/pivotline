import { zigzag } from '../utils/indicators.js'
import {
  result,
  path,
  ordered,
  zone,
  point,
  level,
  number,
  describe,
  violet,
  amber,
  red,
} from './common.js'
const patterns = [
  {
    name: 'Gartley',
    ab: [0.588, 0.648],
    ad: [0.766, 0.806],
    cd: [1.13, 1.618],
  },
  { name: 'Bat', ab: [0.382, 0.5], ad: [0.866, 0.906], cd: [1.618, 2.618] },
  {
    name: 'Butterfly',
    ab: [0.756, 0.816],
    ad: [1.25, 1.638],
    cd: [1.618, 2.618],
  },
]
const inside = (n, [a, b]) => n >= a && n <= b
function match(pts) {
  const [x, a, b, c, d] = pts
  const xa = a.price - x.price,
    ab = b.price - a.price,
    bc = c.price - b.price
  if (
    xa * ab >= 0 ||
    ab * bc >= 0 ||
    !inside(Math.abs(bc / ab), [0.382, 0.886])
  )
    return null
  for (const pattern of patterns) {
    if (!inside(Math.abs(ab / xa), pattern.ab)) continue
    const ad = pattern.ad.map((r) => a.price - xa * r).sort((l, r) => l - r)
    const cd = pattern.cd.map((r) => c.price - bc * r).sort((l, r) => l - r)
    const lo = Math.max(ad[0], cd[0]),
      hi = Math.min(ad[1], cd[1])
    if (hi <= lo || (d && !inside(d.price, [lo, hi]))) continue
    return { pattern, lo, hi }
  }
  return null
}
export function harmonicEngine(candles) {
  const out = result('النماذج التوافقية'),
    pivots = zigzag(candles, 4),
    end = candles.length - 1
  if (pivots.length < 4) return out
  let pts = pivots.slice(-4),
    found = match(pts)
  if (!found) {
    for (let i = pivots.length; i >= 5; i--) {
      const candidate = pivots.slice(i - 5, i),
        fit = match(candidate)
      if (fit) {
        pts = candidate
        found = fit
        break
      }
    }
  }
  if (!found) pts = pivots.slice(-5)
  const [x, a, b, c, d] = pts
  if (a.price === x.price || a.price === b.price) return out
  const ab = Math.abs((b.price - a.price) / (a.price - x.price)),
    bc = Math.abs((c.price - b.price) / (b.price - a.price))
  const ad = d ? Math.abs((d.price - a.price) / (a.price - x.price)) : null
  const labels = ordered(pts, ['X', 'A', 'B', 'C', 'D'].slice(0, pts.length))
  out.overlays.push({
    ...path(labels, violet),
    triangles: [[0, 1, 2], ...(d ? [[2, 3, 4]] : [])],
    ratios: [
      { leg: 2, text: 'AB/XA ' + ab.toFixed(3) },
      { leg: 3, text: 'BC/AB ' + bc.toFixed(3) },
      ...(d ? [{ leg: 4, text: 'AD/XA ' + ad.toFixed(3) }] : []),
    ],
  })
  out.commentary.structure = found
    ? 'نموذج ' +
      found.pattern.name +
      (d ? ' اكتملت محاوره عند ' : ' قيد التكوين منذ ') +
      describe(d || x) +
      '.'
    : 'محاور مرشحة من ' +
      describe(x) +
      ' إلى ' +
      describe(d || c) +
      '، دون توافق مع نسب النماذج الثلاثة.'
  out.commentary.details =
    'AB/XA = ' +
    ab.toFixed(3) +
    ' · BC/AB = ' +
    bc.toFixed(3) +
    (d ? ' · AD/XA = ' + ad.toFixed(3) : '') +
    ' | ' +
    pts.map((p, i) => 'XABCD'[i] + ' ' + number(p.price)).join(' · ')
  if (found) {
    const { lo, hi } = found
    const bull = a.price > x.price
    const lastPivot = d ?? c
    const breach = candles.findIndex(
      (k, i) => i > lastPivot.index && (bull ? k.close < lo : k.close > hi),
    )
    const touch = candles.findIndex(
      (k, i) => i > c.index && k.low <= hi && k.high >= lo,
    )
    const extendedC =
      !d &&
      candles.some(
        (k, i) => i > c.index && (bull ? k.high > c.price : k.low < c.price),
      )
    if (extendedC) {
      out.commentary.scenario =
        'امتد المحور C قبل تأكيد D. ننتظر محوراً جديداً لحساب منطقة الانعكاس.'
      return out
    }
    const z = zone(
      d
        ? d.index - 2
        : Math.min(touch < 0 ? end + 2 : touch, breach < 0 ? Infinity : breach),
      breach >= 0 ? breach : d ? d.index + 8 : end + 20,
      lo,
      hi,
      'PRZ',
      amber,
    )
    z.future = !d && touch < 0 && breach < 0
    out.zones.push(z)
    if (!d && touch < 0 && breach < 0)
      out.projections.push(
        path([c, point(end + 14, (lo + hi) / 2, 'D?')], violet),
      )
    out.horizontalLines.push(
      level(
        d?.index ?? c.index,
        breach >= 0 ? breach : d ? d.index + 10 : end + 22,
        bull ? lo : hi,
        'Invalidation',
        red,
      ),
    )
    out.commentary.scenario =
      'تقاطع ارتداد XA وامتداد BC يحدد منطقة الانعكاس المحتملة بين'
    out.commentary.target = number(lo) + ' – ' + number(hi)
    out.commentary.invalidation =
      'إغلاق ' +
      (bull ? 'دون ' + number(lo) : 'فوق ' + number(hi)) +
      ' يبطل فرضية الانعكاس عند المنطقة.'
    if (breach >= 0) {
      out.commentary.scenario =
        'أبطل الإغلاق عند ' +
        describe({ price: candles[breach].close, time: candles[breach].time }) +
        ' سيناريو الانعكاس من المنطقة المرسومة.'
      out.commentary.target = ''
    } else if (!d && touch >= 0) {
      out.commentary.scenario =
        'لامس السعر منطقة الانعكاس وننتظر تأكيد محور D داخلها.'
    }
  } else
    out.commentary.scenario =
      'ننتظر تقاطع نطاقي AD/XA وCD/BC قبل تحديد منطقة انعكاس محتملة.'
  return out
}
