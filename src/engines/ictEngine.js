import { findSwings } from '../utils/indicators.js'
import {
  result,
  zone,
  level,
  point,
  path,
  number,
  describe,
  blue,
  green,
  red,
  amber,
} from './common.js'
export function ictEngine(candles) {
  const out = result('السيولة والهيكل'),
    swings = findSwings(candles, 3, 3)
  const end = candles.length - 1,
    breaks = [],
    gaps = [],
    blocks = [],
    sweeps = []
  let cursor = 0,
    trend = 0
  const active = { high: null, low: null }
  for (let i = 2; i <= end; i++) {
    const bar = candles[i],
      past = candles[i - 2]
    while (swings[cursor]?.confirmedAt <= i) {
      const p = swings[cursor++]
      active[p.type] = p
    }
    const gapDir = bar.low > past.high ? 1 : bar.high < past.low ? -1 : 0
    if (gapDir) {
      const top = gapDir > 0 ? bar.low : past.low,
        bottom = gapDir > 0 ? past.high : bar.high
      const filled = candles.findIndex(
        (k, j) => j > i && (gapDir > 0 ? k.low <= bottom : k.high >= top),
      )
      gaps.push(
        zone(
          i - 2,
          filled < 0 ? end + 8 : filled,
          top,
          bottom,
          'FVG',
          gapDir > 0 ? green : red,
        ),
      )
      Object.assign(gaps.at(-1), { dir: gapDir, confirmedAt: i })
    }
    for (const type of ['high', 'low']) {
      const pivot = active[type],
        dir = type === 'high' ? 1 : -1
      if (!pivot) continue
      if (dir * (bar.close - pivot.price) > 0) {
        const label = trend && trend !== dir ? 'CHoCH' : 'BOS'
        breaks.push({
          line: level(pivot.index, i, pivot.price, label, blue),
          pivot,
          dir,
          bar,
        })
        let j = i - 1
        while (
          j >= pivot.index &&
          dir * (candles[j].close - candles[j].open) >= 0
        )
          j--
        if (j >= pivot.index) {
          const k = candles[j]
          const broken = candles.findIndex(
            (v, n) => n > i && (dir > 0 ? v.close < k.low : v.close > k.high),
          )
          blocks.push({
            ...zone(
              j,
              broken < 0 ? end + 12 : broken,
              k.low,
              k.high,
              dir > 0 ? 'Bullish OB' : 'Bearish OB',
              dir > 0 ? green : red,
            ),
            dir,
            active: broken < 0,
            confirmedAt: i,
          })
        }
        trend = dir
        active[type] = null
      } else if (dir * (bar[type] - pivot.price) > 0 && !pivot.swept) {
        sweeps.push(path([point(i, bar[type], 'Sweep')], amber))
        pivot.swept = true
      }
    }
  }
  out.horizontalLines = breaks.slice(-5).map((b) => b.line)
  out.overlays = sweeps.slice(-3)
  const last = breaks.at(-1),
    block = blocks.filter((b) => b.active && b.dir === trend).at(-1)
  const shownBlocks = blocks.slice(-2)
  if (block && !shownBlocks.includes(block)) shownBlocks[0] = block
  out.zones = [...gaps.slice(-3), ...shownBlocks]
  if (last) {
    out.tradeEvidence = {
      dir: trend,
      trigger: last.pivot.price,
      zones: [
        ...blocks.filter((b) => b.active && b.dir === trend),
        ...gaps.filter((g) => g.dir === trend && g.to > end),
      ],
    }
    out.commentary.structure =
      'آخر كسر مؤكد بالإغلاق (' +
      last.line.label +
      ') ' +
      (trend > 0 ? 'صاعد' : 'هابط') +
      ' عبر المحور ' +
      describe(last.pivot) +
      '.'
    out.commentary.details =
      'إغلاق الكسر ' +
      describe({ price: last.bar.close, time: last.bar.time }) +
      '، مع رصد ' +
      sweeps.length +
      ' عمليات سحب سيولة و' +
      gaps.length +
      ' فجوات ثلاثية.'
    out.commentary.scenario = block
      ? 'منطقة الأوامر النشطة الموافقة لآخر كسر تقع بين'
      : 'نراقب إعادة اختبار آخر مستوى مكسور عند'
    out.commentary.target = block
      ? number(block.low) + ' – ' + number(block.high)
      : number(last.pivot.price)
    out.commentary.invalidation =
      'إغلاق ' +
      (trend > 0 ? 'دون ' : 'فوق ') +
      number(block ? (trend > 0 ? block.low : block.high) : last.pivot.price) +
      ' يلغي سيناريو إعادة الاختبار.'
    if (
      !block &&
      candles.some(
        (k) =>
          k.time > last.bar.time && trend * (k.close - last.pivot.price) < 0,
      )
    ) {
      out.commentary.scenario =
        'عاد إغلاق السعر عبر مستوى الكسر. ننتظر تأكيداً هيكلياً جديداً.'
      out.commentary.target = ''
    }
  }
  return out
}
