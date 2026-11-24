import { zigzag } from '../utils/indicators.js'
import {
  result,
  path,
  point,
  level,
  describe,
  number,
  when,
  green,
  blue,
  amber,
  violet,
  red,
} from './common.js'

const fanRatios = [
  { multiple: 1, label: '1×1', color: blue },
  { multiple: 2, label: '2×1', color: green },
  { multiple: 0.5, label: '1×2', color: '#87b9e1' },
]

export function gannEngine(candles, context = {}) {
  const out = result('جان والدورات الزمنية')
  const pivots = zigzag(candles, 6)
  if (pivots.length < 2) return out
  const [anchor, turn] = pivots.slice(-2)
  const end = candles.length - 1,
    last = candles[end]
  const chartEnd = context.chartEnd ?? end
  const intervalSeconds =
    context.intervalSeconds ?? candles[1].time - candles[0].time
  const duration = turn.index - anchor.index
  const dir = anchor.type === 'low' ? 1 : -1
  const unit = (dir * (turn.price - anchor.price)) / duration
  if (unit <= 0) return out
  const breach = candles.findIndex(
    (k, i) =>
      i > anchor.index && dir * ((dir > 0 ? k.low : k.high) - anchor.price) < 0,
  )
  const stop = breach < 0 ? end : breach
  const horizon = chartEnd + 20
  for (const { multiple, label, color } of fanRatios) {
    const slope = dir * unit * multiple
    const at = (i) => anchor.price + (i - anchor.index) * slope
    const positiveEnd =
      slope < 0 ? anchor.index + Math.ceil(anchor.price / -slope) - 1 : Infinity
    const rayEnd = Math.min(stop, positiveEnd)
    if (rayEnd <= anchor.index) continue
    out.overlays.push(path([anchor, point(rayEnd, at(rayEnd), label)], color))
    const futureEnd = Math.min(horizon, positiveEnd)
    if (breach < 0 && rayEnd === end && futureEnd > end)
      out.projections.push(
        path([point(end, at(end)), point(futureEnd, at(futureEnd))], color),
      )
  }
  const root = Math.sqrt(anchor.price)
  // One full rotation adds/subtracts 2 on the square-root scale, in raw quote units.
  const nextStep = Math.max(
    1,
    Math.floor(dir * (Math.sqrt(last.close) - root) * 4 + 1e-10) + 1,
  )
  const angles = new Set([45, 90, 180, 360])
  if (breach < 0)
    for (const step of [nextStep, nextStep + 1]) angles.add(step * 45)
  const targets = []
  for (const deg of angles) {
    const rotated = root + (dir * deg) / 180
    if (rotated <= 0) continue
    const price = rotated ** 2
    out.horizontalLines.push(
      level(
        anchor.index,
        breach < 0 ? horizon : breach,
        price,
        'Sq9 ' + deg + '°',
        amber,
      ),
    )
    if (
      deg >= nextStep * 45 &&
      deg <= (nextStep + 1) * 45 &&
      dir * (price - last.close) > 0
    )
      targets.push({ deg, price })
  }
  out.commentary.structure =
    'مروحة ' +
    (dir > 0 ? 'صاعدة' : 'هابطة') +
    ' من ' +
    describe(anchor) +
    '، ومعايرتها حتى ' +
    describe(turn) +
    '.'
  out.commentary.details =
    'تغيّر السعر ' +
    number(Math.abs(turn.price - anchor.price)) +
    ' خلال ' +
    duration +
    ' شمعة. وحدة 1×1 هي ' +
    number(unit) +
    ' لكل شمعة؛ ميل 2×1 ضعفها و1×2 نصفها.'
  out.commentary.invalidation =
    'اختراق ' +
    (dir > 0 ? 'القاع ' : 'القمة ') +
    number(anchor.price) +
    ' بمدى شمعة مغلقة يلغي المروحة.'
  if (breach >= 0) {
    out.horizontalLines.push(
      level(anchor.index, breach, anchor.price, 'Invalidation', red),
    )
    out.commentary.scenario =
      'أُلغيت المروحة في ' +
      when(candles[breach]) +
      ' UTC. ننتظر مرساة مؤكدة جديدة.'
    return out
  }
  const fanNow = anchor.price + dir * unit * (end - anchor.index)
  if (fanNow > 0)
    out.commentary.details +=
      ' آخر إغلاق ' +
      number(last.close) +
      (last.close >= fanNow ? ' عند خط 1×1 أو فوقه' : ' تحت خط 1×1') +
      ' (' +
      number(fanNow) +
      ').'
  const first =
    anchor.index +
    (Math.floor((chartEnd - anchor.index) / duration) + 1) * duration
  for (let i = first; i <= first + 2 * duration; i += duration)
    out.projections.push({
      vertical: i,
      color: violet,
      label: 'T+' + (i - chartEnd),
    })
  const nextTime = last.time + (first - end) * intervalSeconds
  out.commentary.scenario =
    'بتكرار مدة الضلع المرجعي، نافذة المراقبة التالية بعد ' +
    (first - chartEnd) +
    ' شمعة من آخر شمعة معروضة، في ' +
    when({ time: nextTime }) +
    ' UTC.'
  targets.sort((a, b) => a.deg - b.deg)
  if (targets.length) {
    out.commentary.scenario +=
      ' أقرب زوايا مربع التسعة أمام آخر إغلاق في اتجاه المروحة ' +
      targets.map((t) => t.deg + '°').join(' و') +
      '.'
    out.commentary.target = targets.map((t) => number(t.price)).join(' / ')
  }
  return out
}
