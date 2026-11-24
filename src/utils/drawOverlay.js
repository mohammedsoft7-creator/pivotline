const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export function drawOverlay(
  canvas,
  chart,
  series,
  candles,
  analysis,
  settings,
) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    ratio = window.devicePixelRatio || 1
  if (!width || !height || !candles.length) return
  if (
    canvas.width !== Math.round(width * ratio) ||
    canvas.height !== Math.round(height * ratio)
  ) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const scale = chart.timeScale(),
    plot = width - chart.priceScale('right').width()
  const x = (i) =>
    candles[i]
      ? scale.timeToCoordinate(candles[i].time)
      : scale.logicalToCoordinate(i)
  const y = (p) => series.priceToCoordinate(p)
  if (x(0) == null || y(candles[0].close) == null || !plot) return
  const labels = [],
    tags = []
  const label = (text, x, y, color, axis = false) => {
    if (text && Number.isFinite(x) && Number.isFinite(y))
      labels.push({ text, x, y, color, axis })
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, plot, height)
  ctx.clip()
  function stroke(points, color, dash = [], thickness = 1.4) {
    ctx.beginPath()
    points.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)))
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.setLineDash(dash)
    ctx.stroke()
    ctx.setLineDash([])
  }
  for (const z of analysis.zones) {
    if (z.future && !settings.future) continue
    const left = x(z.from),
      right = x(settings.future ? z.to : Math.min(candles.length - 1, z.to)),
      top = y(z.high),
      bottom = y(z.low)
    ctx.fillStyle = z.color + '18'
    ctx.fillRect(left, top, right - left, bottom - top)
    ctx.strokeStyle = z.color + '90'
    ctx.setLineDash([4, 4])
    ctx.strokeRect(left, top, right - left, bottom - top)
    ctx.setLineDash([])
    const caption =
      z.label + (settings.math && z.mathLabel ? ' · ' + z.mathLabel : '')
    if (right >= 0 && left <= plot)
      label(
        caption,
        (clamp(left, 0, plot) + clamp(right, 0, plot)) / 2,
        top - 12,
        z.color,
      )
  }
  for (const line of analysis.horizontalLines) {
    const yy = y(line.price),
      start = x(line.from),
      end = x(settings.future ? line.to : Math.min(candles.length - 1, line.to))
    stroke(
      [
        [start, yy],
        [end, yy],
      ],
      line.color + 'b0',
      [4, 5],
    )
    if (end >= 0 && start <= plot && (!line.math || settings.math)) {
      label(line.label, Math.max(start + 30, 45), yy - 12, line.color)
      tags.push({
        text: line.price.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        y: yy,
        color: line.color,
      })
    }
  }
  function drawPath(shape, projected) {
    if (shape.vertical != null) {
      const xx = x(shape.vertical)
      stroke(
        [
          [xx, 0],
          [xx, height],
        ],
        shape.color,
        [3, 5],
      )
      label(shape.label, xx, 15, shape.color)
      return
    }
    const points = shape.points.map((p) => [x(p.index), y(p.price)])
    for (const tri of shape.triangles || []) {
      ctx.beginPath()
      tri.forEach((j, k) =>
        k ? ctx.lineTo(...points[j]) : ctx.moveTo(...points[j]),
      )
      ctx.closePath()
      ctx.fillStyle = shape.color + '22'
      ctx.fill()
    }
    stroke(points, shape.color, projected ? [5, 5] : [], 1.65)
    shape.points.forEach((p, i) => {
      if (!p.label && !p.type) return
      const [xx, yy] = points[i]
      ctx.beginPath()
      ctx.arc(xx, yy, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#131722'
      ctx.fill()
      ctx.strokeStyle = shape.color
      ctx.lineWidth = 1.5
      ctx.stroke()
      label(p.label, xx, yy + (p.type === 'low' ? 15 : -15), shape.color)
    })
    if (settings.math)
      for (const { leg, text } of shape.ratios || [])
        label(
          text,
          (points[leg][0] + points[leg - 1][0]) / 2,
          (points[leg][1] + points[leg - 1][1]) / 2,
          shape.color,
        )
  }
  analysis.overlays.forEach((s) => drawPath(s, false))
  if (settings.future) analysis.projections.forEach((s) => drawPath(s, true))
  ctx.restore()
  const occupied = [],
    lastY = y(candles.at(-1).close)
  occupied.push({ l: plot, r: width, t: lastY - 11, b: lastY + 11 })
  ctx.font = '600 11px Inter, Arial, sans-serif'
  ctx.textBaseline = 'middle'
  for (const t of tags) label(t.text, (plot + width) / 2, t.y, t.color, true)
  for (const item of labels) {
    const { text, x: ax, y: ay, color, axis } = item
    if ((!axis && (ax < 0 || ax > plot)) || ay < 0 || ay > height) continue
    const w = Math.ceil(ctx.measureText(text).width) + 10,
      h = 17
    if (w > (axis ? width - plot : plot)) continue
    const left = axis ? plot + 2 : clamp(ax - w / 2, 2, plot - w - 2)
    for (const dy of [0, -19, 19, -38, 38, -57, 57]) {
      // A price tag must remain at its actual price. Omit it if crowded.
      if (axis && dy) break
      const top = clamp(ay - h / 2 + dy, 1, height - h - 1),
        r = { l: left - 2, r: left + w + 2, t: top - 2, b: top + h + 2 }
      if (
        occupied.some((q) => q.l < r.r && q.r > r.l && q.t < r.b && q.b > r.t)
      )
        continue
      occupied.push(r)
      ctx.fillStyle = '#141b29'
      ctx.fillRect(left, top, w, h)
      ctx.fillStyle = color + '20'
      ctx.fillRect(left, top, w, h)
      ctx.fillStyle = color
      ctx.fillText(text, left + 5, top + h / 2 + 0.5)
      break
    }
  }
}
