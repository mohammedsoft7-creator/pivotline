export function calculateRSI(candles, period = 14) {
  if (!Number.isInteger(period) || period < 1)
    throw new RangeError('Invalid RSI period')
  const result = Array(candles.length).fill(null)
  let gain = 0,
    loss = 0
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].close - candles[i - 1].close
    const up = Math.max(0, delta),
      down = Math.max(0, -delta)
    if (i <= period) {
      gain += up / period
      loss += down / period
    } else {
      gain = (gain * (period - 1) + up) / period
      loss = (loss * (period - 1) + down) / period
    }
    if (i >= period)
      result[i] = gain + loss === 0 ? 50 : (100 * gain) / (gain + loss)
  }
  return result
}
export function findSwings(candles, leftBars = 4, rightBars = 4) {
  if (![leftBars, rightBars].every((x) => Number.isInteger(x) && x > 0))
    throw new RangeError('Invalid pivot window')
  const swings = []
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const c = candles[i]
    const before = candles.slice(i - leftBars, i),
      after = candles.slice(i + 1, i + rightBars + 1)
    for (const type of ['high', 'low']) {
      const dir = type === 'high' ? 1 : -1
      if (
        before.every((b) => dir * (c[type] - b[type]) >= 0) &&
        after.every((b) => dir * (c[type] - b[type]) > 0)
      )
        swings.push({
          index: i,
          time: c.time,
          price: c[type],
          type,
          confirmedAt: i + rightBars,
        })
    }
  }
  return swings
}
export function zigzag(candles, window = 5) {
  const points = []
  const candidates = findSwings(candles, window, window)
  for (const [i, p] of candidates.entries()) {
    // OHLC does not record which extreme came first on a double-pivot bar.
    if (
      candidates[i - 1]?.index === p.index ||
      candidates[i + 1]?.index === p.index
    )
      continue
    const last = points.at(-1)
    if (last?.type !== p.type) points.push(p)
    else if ((p.type === 'high' ? 1 : -1) * (p.price - last.price) >= 0)
      points[points.length - 1] = p
  }
  return points
}
