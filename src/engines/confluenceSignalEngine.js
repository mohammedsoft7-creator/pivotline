import { schools } from './index.js'
import { calculateRSI, zigzag } from '../utils/indicators.js'
import { INTERVALS } from '../services/marketData.js'

const standardSignalIntervals = ['15m', '1h', '4h', '1d']
const goldSignalIntervals = ['1m', '3m', ...standardSignalIntervals]
export function signalIntervals(symbol = '') {
  if (symbol === 'PAXGUSDT' || symbol === '') return goldSignalIntervals
  return symbol === 'BTCUSDT' ? standardSignalIntervals : []
}
export const marketKey = (symbol, interval) => symbol + ':' + interval
const extensions = [1.272, 1.618, 2.618]
const tick = 0.01
const round = (n) => Math.round(n * 100) / 100
const distance = (zone, price) =>
  Math.max(zone.low - price, price - zone.high, 0)
const vote = (school, evidence, reason) => ({
  school,
  ...evidence,
  direction: evidence.dir > 0 ? 'BUY' : 'SELL',
  reason,
})

export function closedCandles(data, interval) {
  const last = data.candles.at(-1)
  return last && (last.time + INTERVALS[interval]) * 1000 > data.updated
    ? data.candles.slice(0, -1)
    : data.candles
}

function makeVotes(results, candles, atr, rsi) {
  const end = candles.length - 1,
    close = candles[end].close
  const {
    ELLIOTT: elliott,
    ICT: ict,
    HARMONIC: harmonic,
    CLASSICAL: classical,
    GANN: gann,
  } = results
  const local = (zone, dir, invalidation) =>
    dir * (close - invalidation) > 0 && distance(zone, close) <= 1.75 * atr
  const band = (price) => ({
    low: price - 0.25 * atr,
    high: price + 0.25 * atr,
  })
  const votes = []
  if (
    elliott &&
    end - elliott.from <= 24 &&
    local(elliott.zone, elliott.dir, elliott.invalidation)
  ) {
    votes.push(
      vote('ELLIOTT', elliott, 'نهاية الموجة الرابعة ضمن نطاق الارتداد'),
    )
  }

  if (ict) {
    const zones = ict.zones
      .filter(
        (z) =>
          end - z.confirmedAt <= 36 &&
          local(z, ict.dir, ict.dir > 0 ? z.low : z.high),
      )
      .sort(
        (a, b) =>
          distance(a, close) - distance(b, close) ||
          b.confirmedAt - a.confirmedAt,
      )
    if (zones.length) {
      const z = zones[0]
      votes.push(
        vote(
          'ICT',
          {
            dir: ict.dir,
            zone: z,
            trigger: (z.low + z.high) / 2,
            invalidation: ict.dir > 0 ? z.low : z.high,
            alternatives: zones,
          },
          z.label === 'FVG'
            ? 'فجوة قيمة عادلة نشطة'
            : 'منطقة أوامر نشطة مع كسر هيكلي',
        ),
      )
    }
  }

  if (
    harmonic &&
    end - harmonic.from <= 10 &&
    local(harmonic.zone, harmonic.dir, harmonic.invalidation)
  )
    votes.push(
      vote(
        'HARMONIC',
        harmonic,
        'تماس منطقة الانعكاس لنموذج ' + harmonic.pattern,
      ),
    )

  if (classical) {
    const choices = [
      ...classical.levels.map((l) => ({
        ...l,
        reason: l.dir > 0 ? 'دعم سعري قريب' : 'مقاومة سعرية قريبة',
      })),
      ...classical.trendlines.map((l) => ({
        ...l,
        reason: 'اختبار خط اتجاه فعّال',
      })),
      ...(classical.retracement
        ? [{ ...classical.retracement, reason: 'تراجع فيبوناتشي 38.2–61.8%' }]
        : []),
    ]
      .map((l) => ({
        ...l,
        trigger: l.price,
        zone: l.low == null ? band(l.price) : { low: l.low, high: l.high },
      }))
      .filter((l) => local(l.zone, l.dir, l.invalidation))
      .sort(
        (a, b) =>
          distance(a.zone, close) - distance(b.zone, close) ||
          Math.abs(a.price - close) - Math.abs(b.price - close),
      )
    if (choices.length) {
      const best = choices[0]
      votes.push(
        vote(
          'CLASSICAL',
          { ...best, alternatives: choices.filter((c) => c.dir === best.dir) },
          best.reason,
        ),
      )
    }
  }

  if (gann && gann.cycleIndex - end <= 4) {
    const squareNear =
      gann.square != null && Math.abs(close - gann.square) <= 1.75 * atr
    const fanAligned =
      gann.fan > 0 && gann.dir * (close - gann.fan) >= -0.5 * atr
    if (squareNear || fanAligned)
      votes.push(
        vote(
          'GANN',
          {
            dir: gann.dir,
            trigger: squareNear ? gann.square : gann.fan,
            invalidation: gann.anchor,
          },
          (squareNear ? 'مستوى مربع التسعة مع دورة' : 'مروحة 1×1 مع دورة') +
            ' T+' +
            (gann.cycleIndex - end),
        ),
      )
  }

  const current = rsi.at(-1),
    recent = rsi.slice(-4)
  const direction =
    current <= 30 ||
    (recent.some((v) => v <= 30) && current < 50 && current > rsi.at(-2))
      ? 1
      : current >= 70 ||
          (recent.some((v) => v >= 70) && current > 50 && current < rsi.at(-2))
        ? -1
        : 0
  if (direction)
    votes.push(
      vote(
        'RSI',
        { dir: direction, trigger: close, value: current },
        direction > 0 ? 'تشبّع بيعي أو تعافٍ منه' : 'تشبّع شرائي أو تراجع منه',
      ),
    )

  return [...Object.keys(schools), 'RSI'].map(
    (school) =>
      votes.find((v) => v.school === school) ?? {
        school,
        dir: 0,
        direction: 'NEUTRAL',
        trigger: null,
      },
  )
}

function entryOverlap(aligned, close, atr) {
  const zones = aligned.flatMap((v) => {
    if (!v.zone) return []
    return (v.alternatives ?? [v]).map((candidate) => {
      const z = candidate.zone ?? candidate
      const invalidation =
        candidate.invalidation ?? (v.dir > 0 ? z.low : z.high)
      return {
        ...z,
        school: v.school,
        invalidation,
        trigger: candidate.trigger ?? (z.low + z.high) / 2,
        reason:
          candidate.reason ??
          (v.school === 'ICT'
            ? z.label === 'FVG'
              ? 'فجوة قيمة عادلة نشطة'
              : 'منطقة أوامر نشطة مع كسر هيكلي'
            : v.reason),
      }
    })
  })
  const candidates = []
  for (const [i, a] of zones.entries()) {
    for (const b of zones.slice(i + 1)) {
      if (a.school === b.school) continue
      const low = Math.ceil(Math.max(a.low, b.low) * 100 - 1e-8) / 100
      const high = Math.floor(Math.min(a.high, b.high) * 100 + 1e-8) / 100
      if (high < low || distance({ low, high }, close) > atr) continue
      const members = zones.filter(
        (z) => z.low <= low + 1e-8 && z.high >= high - 1e-8,
      )
      const contributors = [
        ...new Map(members.map((z) => [z.school, z])).values(),
      ]
      candidates.push({ low, high, contributors })
    }
  }
  return candidates.sort(
    (a, b) =>
      b.contributors.length - a.contributors.length ||
      distance(a, close) - distance(b, close) ||
      a.high - a.low - (b.high - b.low),
  )[0]
}

export function assembleTrade({ votes, candles, pivots, gann, atr, interval }) {
  const last = candles.at(-1),
    end = candles.length - 1
  const aligned = [1, -1]
    .map((dir) => votes.filter((v) => v.school !== 'RSI' && v.dir === dir))
    .sort((a, b) => b.length - a.length)[0]
  if (aligned.length < 3)
    return { reason: 'alignment', aligned: aligned.length }
  const dir = aligned[0].dir
  const overlap = entryOverlap(aligned, last.close, atr)
  if (!overlap) return { reason: 'overlap', aligned: aligned.length }
  if (!gann || gann.cycleIndex <= end)
    return { reason: 'window', aligned: aligned.length }
  const { low, high, contributors } = overlap
  // Size exposure from the least favorable fill inside the entry band.
  const entryPrice = dir > 0 ? high : low
  const structural = aligned
    .flatMap((v) => {
      const zone = contributors.find((z) => z.school === v.school)
      return [zone?.invalidation ?? v.invalidation]
    })
    .filter(Number.isFinite)
  const boundary = (dir > 0 ? Math.min : Math.max)(
    dir > 0 ? low : high,
    ...structural,
  )
  const buffer = Math.max(2 * tick, 0.15 * atr)
  const stop =
    dir > 0
      ? Math.floor((boundary - buffer) * 100) / 100
      : Math.ceil((boundary + buffer) * 100) / 100
  const risk = dir * (entryPrice - stop)
  if (stop <= 0 || risk <= 0 || dir * (last.close - stop) <= 0)
    return { reason: 'risk', aligned: aligned.length }

  const swing = pivots
    .slice(1)
    .map((p, i) => ({
      end: p,
      length: dir * (p.price - pivots[i].price),
    }))
    .filter((s) => s.length > atr && s.end.index >= end - 50)
    .at(-1)
  if (!swing) return { reason: 'targets', aligned: aligned.length }
  const liquidity = [
    ...pivots
      .filter((p) => p.type === (dir > 0 ? 'high' : 'low'))
      .map((p) => p.price),
    ...(gann.dir === dir ? gann.targetLevels : []),
  ]
  const targets = []
  let previous = entryPrice
  for (const ratio of extensions) {
    const projected = entryPrice + dir * swing.length * ratio
    const pool = liquidity
      .filter(
        (p) =>
          Math.abs(p - projected) <= 0.12 * swing.length &&
          dir * (round(p) - previous) > 0,
      )
      .sort((a, b) => Math.abs(a - projected) - Math.abs(b - projected))[0]
    const price = round(pool ?? projected)
    if (price <= 0 || dir * (price - previous) <= 0)
      return { reason: 'targets', aligned: aligned.length }
    targets.push({
      price,
      ratio,
      liquidity: pool != null,
      rr: (dir * (price - entryPrice)) / risk,
    })
    previous = price
  }
  if (dir * (targets[0].price - last.close) <= 0)
    return { reason: 'targets', aligned: aligned.length }
  const rsi = votes.find((v) => v.school === 'RSI' && v.dir === dir)
  const ratio = aligned.find((v) => v.school === 'ELLIOTT')?.timeRatio
  const timing =
    ratio != null &&
    [0.618, 1, 1.618, 2.618].some((ref) => Math.abs(ratio - ref) <= 0.15 * ref)
  const score = aligned.length * 18 + (rsi ? 5 : 0) + (timing ? 5 : 0)
  return {
    aligned: aligned.length,
    signal: {
      direction: dir > 0 ? 'BUY' : 'SELL',
      dir,
      score,
      schoolCount: aligned.length,
      low,
      high,
      entryPrice,
      stop,
      boundary,
      risk,
      targets,
      votes: aligned
        .map((v) => {
          const z = contributors.find((c) => c.school === v.school)
          if (!z || !v.alternatives) return v
          return {
            ...v,
            trigger: z.trigger,
            reason: z.reason,
            zone: z,
            invalidation: z.invalidation,
          }
        })
        .concat(rsi ? [rsi] : []),
      timeRatio: timing ? ratio : null,
      entrySchools: contributors.map((z) => z.school),
      createdAt: last.time + INTERVALS[interval],
      cycleTime: gann.cycleTime,
      validBars: gann.cycleIndex - end,
      expiresAt: gann.cycleTime + INTERVALS[interval],
    },
  }
}

export function confluenceSignalEngine(symbol, interval, data) {
  const candles = closedCandles(data, interval)
  const end = candles.length - 1
  const meta = {
    symbol,
    interval,
    source: data.source,
    updated: data.updated,
    key: marketKey(symbol, interval),
  }
  if (candles.length < 20)
    return { ...meta, votes: [], reason: 'data', aligned: 0 }
  const atr =
    candles.slice(-14).reduce((sum, c, i) => {
      const prev = candles[candles.length - 15 + i].close
      return (
        sum +
        Math.max(
          c.high - c.low,
          Math.abs(c.high - prev),
          Math.abs(c.low - prev),
        )
      )
    }, 0) / 14
  const evidence = Object.fromEntries(
    Object.entries(schools).map(([id, school]) => [
      id,
      school.engine(candles, {
        intervalSeconds: INTERVALS[interval],
        chartEnd: end,
      }).tradeEvidence,
    ]),
  )
  const votes = makeVotes(
    evidence,
    candles,
    Math.max(atr, tick),
    calculateRSI(candles),
  )
  const evaluation = assembleTrade({
    votes,
    candles,
    pivots: zigzag(candles, 4),
    gann: evidence.GANN,
    atr: Math.max(atr, tick),
    interval,
  })
  const forming =
    data.candles.length > candles.length ? data.candles.at(-1) : null
  if (forming && evaluation.signal) {
    const { dir, stop, targets } = evaluation.signal
    const crossed =
      dir > 0
        ? forming.low <= stop || forming.high >= targets[0].price
        : forming.high >= stop || forming.low <= targets[0].price
    if (crossed)
      return { ...meta, votes, aligned: evaluation.aligned, reason: 'crossed' }
  }
  const signal = evaluation.signal && {
    ...evaluation.signal,
    ...meta,
    id: meta.key + ':' + evaluation.signal.direction,
  }
  return { ...meta, ...evaluation, votes, signal }
}

export function calculatePosition(signal, balance, riskPercent) {
  if (
    !Number.isFinite(balance) ||
    !Number.isFinite(riskPercent) ||
    balance <= 0 ||
    riskPercent <= 0 ||
    riskPercent > 100
  )
    return null
  const budget = balance * (riskPercent / 100),
    units = budget / signal.risk
  const notional = units * signal.entryPrice
  const profits = signal.targets.map(
    (t) => units * signal.dir * (t.price - signal.entryPrice),
  )
  return budget > 0 &&
    [budget, units, notional, ...profits].every(Number.isFinite)
    ? { budget, units, notional, profits }
    : null
}
