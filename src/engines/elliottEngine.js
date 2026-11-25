import { zigzag } from '../utils/indicators.js'
import {
  result,
  path,
  zone,
  level,
  ordered,
  point,
  number,
  describe,
  blue,
  amber,
  red,
} from './common.js'

const waveLabels = ['', '(1)', '(2)', '(3)', '(4)', '(5)']
const percent = (value) => (100 * value).toFixed(1) + '%'
const direction = (p) => (p.type === 'low' ? 1 : -1)
const adverse = (bar, dir) => (dir > 0 ? bar.low : bar.high)
const favorable = (bar, dir) => (dir > 0 ? bar.high : bar.low)

// A larger pivot window can suppress an intervening extreme. Validate the candles
// as well as the selected endpoints before treating any leg as complete.
function fitsImpulse(pts, candles) {
  const dir = direction(pts[0])
  const [origin, one, two, three, four, five] = pts.map((p) => p.price * dir)
  if (!(origin < two && two < one && one < three)) return false
  if (four != null && !(one < four && four < three)) return false
  if (
    five != null &&
    !(five > three && three - two >= Math.min(one - origin, five - four))
  )
    return false
  for (let i = 1; i < pts.length; i++) {
    const from = pts[i - 1],
      to = pts[i]
    const low = Math.min(from.price, to.price),
      high = Math.max(from.price, to.price)
    for (let j = from.index + 1; j < to.index; j++) {
      if (candles[j].low < low || candles[j].high > high) return false
    }
  }
  // The opposite wick on the terminal pivot can still break a hard rule.
  if (dir * (adverse(candles[pts[2].index], dir) - pts[0].price) <= 0)
    return false
  return (
    !pts[4] || dir * (adverse(candles[pts[4].index], dir) - pts[1].price) > 0
  )
}

function correction(out, impulse, legs, candles) {
  const origin = impulse.at(-1),
    [a, b, c] = legs
  const dir = -direction(impulse[0])
  if (
    dir * (a.price - origin.price) <= 0 ||
    (b &&
      !(dir * (b.price - origin.price) > 0 && dir * (a.price - b.price) > 0)) ||
    (c && !(dir * (c.price - a.price) > 0))
  )
    return false
  const end = candles.length - 1
  out.overlays.push(
    path(ordered(impulse, waveLabels)),
    path(
      ordered([origin, ...legs], ['', 'A', 'B', 'C'].slice(0, legs.length + 1)),
      amber,
    ),
  )
  out.commentary.structure =
    'بعد خمس موجات انتهت عند ' +
    describe(origin) +
    '، تأكدت محاور ' +
    ['A', 'B', 'C'].slice(0, legs.length).join('، ') +
    ' ضمن تصحيح متعرّج مرشّح.'
  out.commentary.details = legs
    .map((p, i) => 'ABC'[i] + ' ' + describe(p))
    .join(' · ')
  if (c) {
    out.commentary.scenario =
      'اكتملت ثلاثة أضلاع مرشّحة. بلغ طول C نسبة ' +
      percent(Math.abs((c.price - b.price) / (a.price - origin.price))) +
      ' من A. ننتظر محوراً جديداً.'
    out.commentary.invalidation =
      'يُعاد تقييم نهاية C إذا امتدت الحركة عبر ' +
      number(c.price) +
      ' في اتجاه التصحيح.'
    return true
  }
  const boundary = b || origin
  const broken = candles
    .slice(legs.at(-1).index + 1)
    .some((k) => dir * (adverse(k, dir) - boundary.price) <= 0)
  out.horizontalLines.push(
    level(boundary.index, end + 20, boundary.price, 'Invalidation', red),
  )
  out.commentary.invalidation =
    'تجاوز ' +
    number(boundary.price) +
    ' عكس اتجاه التصحيح يستدعي إعادة ترقيم ' +
    (b ? 'B' : 'A') +
    '.'
  if (broken) {
    out.commentary.scenario =
      'اخترق السعر الحدّ البنيوي بعد المحور الأخير. ننتظر تأكيد محور بديل.'
  } else if (!b) {
    out.commentary.scenario = 'ننتظر تأكيد نهاية B لحساب هدف C من طول A.'
  } else {
    const target = b.price + a.price - origin.price
    if (target <= 0) {
      out.commentary.scenario =
        'إسقاط تساوي C مع A خارج نطاق الأسعار الموجبة. ننتظر محور C.'
      return true
    }
    const reached = candles
      .slice(b.index + 1)
      .some((k) => dir * (favorable(k, dir) - target) >= 0)
    out.commentary.scenario = reached
      ? 'بلغ السعر مستوى تساوي C مع A. ننتظر تأكيد محور C عند نهاية الضلع.'
      : 'إسقاط طول A من نهاية B يعطي هدف تساوي C مع A عند'
    out.commentary.target = number(target)
    if (!reached)
      out.projections.push(
        path(
          [
            b,
            point(
              Math.max(end + 1, b.index + a.index - origin.index),
              target,
              'C?',
            ),
          ],
          amber,
        ),
      )
  }
  return true
}

function impulse(out, pts, candles) {
  const [origin, one, two, three, four, five] = pts,
    dir = direction(origin)
  const end = candles.length - 1
  const length1 = Math.abs(one.price - origin.price),
    length3 = Math.abs(three.price - two.price)
  const tail = candles.slice(pts.at(-1).index + 1)
  out.overlays.push(path(ordered(pts, waveLabels.slice(0, pts.length))))
  out.commentary.structure =
    'اندفاع ' +
    (dir > 0 ? 'صاعد' : 'هابط') +
    ' مرشّح من ' +
    describe(origin) +
    '، وآخر محور مؤكد هو الموجة (' +
    (pts.length - 1) +
    ').'
  out.commentary.details =
    pts
      .slice(1)
      .map((p, i) => waveLabels[i + 1] + ' ' + describe(p))
      .join(' · ') +
    '. ارتداد الثانية ' +
    percent(Math.abs(two.price - one.price) / length1) +
    ' من الأولى، وطول الثالثة ' +
    percent(length3 / length1) +
    ' من الأولى.'
  const zoneAt = (r) => three.price - dir * length3 * r
  const near = zoneAt(0.236),
    far = zoneAt(0.382)
  const fitsZone = dir * (near - one.price) > 0
  const limit = four && !five ? four : one
  out.horizontalLines.push(
    level(
      limit.index,
      five?.index ?? end + 24,
      limit.price,
      'Invalidation',
      red,
    ),
  )
  out.commentary.invalidation =
    four && !five
      ? 'تجاوز ' +
        number(four.price) +
        ' عكس اتجاه الخامسة يُبطل انطلاقها من الرابعة الحالية. دخول نطاق الأولى عند ' +
        number(one.price) +
        ' يلغي الاندفاع القياسي.'
      : 'دخول الرابعة نطاق الأولى عند ' +
        number(one.price) +
        ' يلغي هذا العدّ الاندفاعي.'
  if (five) {
    out.commentary.scenario =
      'اكتملت خمس موجات مرشّحة. محور الرابعة السابق مرجع لمتابعة التصحيح عند'
    out.commentary.target = number(four.price)
  }
  const validFar = dir * (far - one.price) > 0 ? far : one.price
  const expected4 =
    four ||
    point(
      Math.max(end + 1, three.index + two.index - one.index),
      (near + validFar) / 2,
      '(4)?',
    )
  if (fitsZone) {
    const box = zone(
      three.index,
      four?.index ?? expected4.index + 2,
      near,
      validFar,
      'Wave (4) zone',
      amber,
    )
    box.mathLabel =
      '23.6–' +
      ((100 * Math.abs(validFar - three.price)) / length3).toFixed(1) +
      '%'
    box.future = !four
    out.zones.push(box)
  }
  if (five) return out
  if (
    four &&
    length3 < length1 &&
    tail.some((k) => dir * (favorable(k, dir) - four.price) > length3)
  ) {
    const cap = four.price + dir * length3
    out.horizontalLines.push(level(four.index, end, cap, 'Wave 5 limit', red))
    out.commentary.scenario =
      'تجاوز امتداد الخامسة ' +
      number(cap) +
      '، فأصبحت الثالثة أقصر من الأولى والخامسة وأُلغي هذا العدّ.'
    out.commentary.invalidation =
      'الحد الأقصى لطول الخامسة في هذا العدّ هو طول الثالثة، أي ' +
      number(length3) +
      '.'
    return out
  }
  if (tail.some((k) => dir * (adverse(k, dir) - limit.price) <= 0)) {
    out.commentary.scenario =
      'تجاوز السعر مستوى الإلغاء ' +
      number(limit.price) +
      ' بعد المحور الأخير. أُوقف إسقاط المسار بانتظار محور جديد.'
    return out
  }
  if (
    !four &&
    (!fitsZone ||
      tail.some(
        (k) =>
          dir * (adverse(k, dir) - validFar) < 0 ||
          dir * (favorable(k, dir) - three.price) > 0,
      ))
  ) {
    out.commentary.scenario =
      'ننتظر تأكيد محور الرابعة. حركة السعر أو حدّ التداخل يمنعان اعتماد نطاق الارتداد المعتاد هدفاً جديداً.'
    return out
  }
  // Select a measured fifth that clears wave 3 and never makes wave 3 the shortest.
  const ratio = [1, 0.618, 1.618, 2.618].find(
    (r) =>
      expected4.price + dir * r * length1 > 0 &&
      dir * (expected4.price - three.price) + r * length1 > 0 &&
      length3 >= Math.min(length1, r * length1),
  )
  const forecast = [pts.at(-1)]
  if (!four) forecast.push(expected4)
  let scenario = four
    ? 'تأكد محور الرابعة عند ' + number(four.price) + '.'
    : 'النطاق المتوقع للرابعة من ارتداد الثالثة (' +
      out.zones[0].mathLabel +
      ').'
  if (!four)
    out.commentary.target =
      number(Math.min(near, validFar)) +
      ' – ' +
      number(Math.max(near, validFar))
  if (ratio != null) {
    const target = expected4.price + dir * ratio * length1
    const reached =
      four && tail.some((k) => dir * (favorable(k, dir) - target) >= 0)
    scenario +=
      ' إسقاط ' +
      percent(ratio) +
      ' من طول الأولى يعطي ' +
      number(target) +
      ' للخامسة.'
    if (four) {
      out.commentary.target = number(target)
      if (!reached && fitsZone) {
        const wave2Bars = two.index - one.index
        const wave4Bars = four.index - three.index
        const timeRatio = wave4Bars / wave2Bars
        out.tradeEvidence = {
          dir,
          trigger: four.price,
          invalidation: four.price,
          zone: {
            low: Math.min(near, validFar),
            high: Math.max(near, validFar),
          },
          from: four.index,
          timeRatio,
        }
      }
    }
    if (reached)
      scenario += ' بلغ السعر هذا المستوى، وننتظر تأكيد نهاية الخامسة.'
    else
      forecast.push(
        point(
          Math.max(end + 1, expected4.index + one.index - origin.index),
          target,
          '(5)?',
        ),
      )
  } else scenario += ' لا يتوفر هدف خامس بهذه النسب يحقق قاعدة طول الثالثة.'
  if (forecast.length > 1) out.projections.push(path(forecast, blue))
  out.commentary.scenario = scenario
  return out
}

export function elliottEngine(candles) {
  const out = result('موجات إليوت'),
    pivots = zigzag(candles, 5)
  if (pivots.length < 4) return out
  for (const count of [3, 2, 1]) {
    if (pivots.length < 6 + count) continue
    const previous = pivots.slice(-6 - count, -count)
    if (
      fitsImpulse(previous, candles) &&
      correction(out, previous, pivots.slice(-count), candles)
    )
      return out
  }
  for (const size of [6, 5, 4]) {
    const pts = pivots.slice(-size)
    if (pts.length === size && fitsImpulse(pts, candles))
      return impulse(out, pts, candles)
  }
  const latest = pivots.slice(-4)
  out.overlays.push(path(latest))
  out.commentary.structure =
    'آخر المحاور المؤكدة تمتد من ' +
    describe(latest[0]) +
    ' إلى ' +
    describe(latest.at(-1)) +
    '، ولم يتأكد عدّ اندفاعي أو تصحيح تابع لاندفاع مكتمل.'
  out.commentary.details = latest
    .map((p) => (p.type === 'high' ? 'قمة ' : 'قاع ') + describe(p))
    .join(' · ')
  return out
}
