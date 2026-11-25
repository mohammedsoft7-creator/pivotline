export function startTrade(signal) {
  return { signal, enteredAt: null, hits: [], closed: null }
}

export function trackTrade(trade, tick) {
  const { signal } = trade
  if (
    trade.closed ||
    signal.symbol !== tick.symbol ||
    tick.time < signal.createdAt * 1000
  )
    return { trade, events: [] }
  const events = []
  let next = trade
  const event = (type) => ({ type, at: tick.time, price: tick.price, signal })
  if (trade.enteredAt == null) {
    if (tick.time >= signal.expiresAt * 1000)
      return { trade: { ...trade, closed: 'expired' }, events }
    if (tick.price < signal.low || tick.price > signal.high)
      return { trade, events }
    next = { ...trade, enteredAt: tick.time, entryFill: tick.price }
    events.push(event('entry'))
  }
  if (signal.dir * (tick.price - signal.stop) <= 0) {
    return {
      trade: { ...next, closed: 'SL' },
      events: [...events, event('SL')],
    }
  }
  const hits = [...next.hits]
  for (const [i, target] of signal.targets.entries()) {
    const name = 'TP' + (i + 1)
    if (!hits.includes(name) && signal.dir * (tick.price - target.price) >= 0) {
      hits.push(name)
      events.push(event(name))
    }
  }
  if (hits.length !== next.hits.length)
    next = { ...next, hits, closed: hits.includes('TP3') ? 'TP3' : null }
  return { trade: next, events }
}
