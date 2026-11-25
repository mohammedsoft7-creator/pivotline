import { useLayoutEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import { Activity } from 'lucide-react'
import { INTERVALS } from '../services/marketData.js'
import { drawOverlay } from '../utils/drawOverlay.js'
const colors = { up: '#26ae92', down: '#eb6979' }
const opts = {
  layout: {
    background: { type: ColorType.Solid, color: '#131722' },
    textColor: '#8c99ad',
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 11,
    attributionLogo: false,
  },
  grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
  rightPriceScale: { borderColor: '#2a3040', minimumWidth: 84 },
  timeScale: {
    borderColor: '#2a3040',
    rightOffset: 25,
    lockVisibleTimeRangeOnResize: true,
    timeVisible: true,
    secondsVisible: false,
    minBarSpacing: 2,
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: '#607188', labelBackgroundColor: '#354563' },
    horzLine: { color: '#607188', labelBackgroundColor: '#354563' },
  },
  localization: { locale: 'en-US' },
}
export default function ChartWorkspace({
  candles,
  rsi,
  analysis,
  settings,
  interval,
  onHover,
  resetKey,
  readout,
  position,
}) {
  const mainRef = useRef(null),
    rsiRef = useRef(null),
    overlayRef = useRef(null),
    chartRef = useRef(null),
    live = useRef(null)
  useLayoutEffect(() => {
    live.current = { candles, rsi, analysis, settings, onHover, position }
  })
  useLayoutEffect(() => {
    const mainEl = mainRef.current,
      rsiEl = rsiRef.current
    const main = createChart(mainEl, {
      ...opts,
      width: mainEl.clientWidth,
      height: mainEl.clientHeight,
      timeScale: { ...opts.timeScale, visible: false },
    })
    const sub = createChart(rsiEl, {
      ...opts,
      width: rsiEl.clientWidth,
      height: rsiEl.clientHeight,
      rightPriceScale: {
        ...opts.rightPriceScale,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
    })
    const bars = main.addCandlestickSeries({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      borderVisible: false,
      priceLineStyle: LineStyle.Dotted,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      autoscaleInfoProvider(original) {
        const info = original(),
          data = live.current,
          range = main.timeScale().getVisibleLogicalRange()
        if (!info || !data || !range) return info
        if (data.position && range.to >= data.candles.length - 5) {
          const prices = [
            data.position.stop,
            ...data.position.targets.map((t) => t.price),
          ]
          info.priceRange.minValue = Math.min(
            info.priceRange.minValue,
            ...prices,
          )
          info.priceRange.maxValue = Math.max(
            info.priceRange.maxValue,
            ...prices,
          )
        }
        const paths = [
          ...data.analysis.overlays,
          ...(data.settings.future ? data.analysis.projections : []),
        ]
        for (const s of paths)
          for (const p of s.points || [])
            if (p.index >= range.from && p.index <= range.to) {
              info.priceRange.minValue = Math.min(
                info.priceRange.minValue,
                p.price,
              )
              info.priceRange.maxValue = Math.max(
                info.priceRange.maxValue,
                p.price,
              )
            }
        return info
      },
    })
    bars.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.23 } })
    const vol = main.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false,
    })
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    const line = sub.addLineSeries({
      color: '#9c27b0',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      autoscaleInfoProvider: (base) => {
        const v = base()
        if (v) {
          v.priceRange.minValue = Math.min(v.priceRange.minValue, 23)
          v.priceRange.maxValue = Math.max(v.priceRange.maxValue, 77)
        }
        return v
      },
    })
    for (const price of [30, 70])
      line.createPriceLine({
        price,
        color: '#79558c',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      })
    let frame = 0
    function schedule() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const d = live.current
        drawOverlay(
          overlayRef.current,
          main,
          bars,
          d.candles,
          d.analysis,
          d.settings,
          d.position,
        )
      })
    }
    bars.attachPrimitive({ updateAllViews: schedule })
    function sync(other, range) {
      if (!range) return
      const old = other.timeScale().getVisibleLogicalRange()
      if (
        !old ||
        Math.abs(old.from - range.from) > 0.01 ||
        Math.abs(old.to - range.to) > 0.01
      )
        other.timeScale().setVisibleLogicalRange(range)
      schedule()
    }
    main.timeScale().subscribeVisibleLogicalRangeChange((r) => sync(sub, r))
    sub.timeScale().subscribeVisibleLogicalRangeChange((r) => sync(main, r))
    let syncing = false
    function hover(param, other, otherSeries, isMain) {
      if (syncing) return
      syncing = true
      try {
        const d = live.current,
          i = d.candles.findIndex((c) => c.time === param.time)
        d.onHover(i >= 0 ? i : null)
        const value = i < 0 ? null : isMain ? d.rsi[i] : d.candles[i].close
        if (value != null)
          other.setCrosshairPosition(value, param.time, otherSeries)
        else other.clearCrosshairPosition()
      } finally {
        syncing = false
      }
    }
    main.subscribeCrosshairMove((p) => hover(p, sub, line, true))
    sub.subscribeCrosshairMove((p) => hover(p, main, bars, false))
    const observer = new ResizeObserver(() => {
      main.resize(mainEl.clientWidth, mainEl.clientHeight)
      sub.resize(rsiEl.clientWidth, rsiEl.clientHeight)
      schedule()
    })
    observer.observe(mainEl)
    observer.observe(rsiEl)
    chartRef.current = { main, sub, bars, vol, line, schedule }
    return () => {
      observer.disconnect()
      main.remove()
      sub.remove()
      cancelAnimationFrame(frame)
      chartRef.current = null
    }
  }, [])
  useLayoutEffect(() => {
    const { bars, vol, line, main, sub, previous } = chartRef.current
    const histogram = (c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? '#23574f' : '#613744',
    })
    const rsiPoint = (c, i) =>
      rsi[i] == null ? { time: c.time } : { time: c.time, value: rsi[i] }
    chartRef.current.previous = candles
    if (
      previous &&
      candles.length === previous.length &&
      candles.at(-1).time === previous.at(-1).time &&
      candles.every((c, i) => i === candles.length - 1 || c === previous[i])
    ) {
      const last = candles.at(-1)
      if (last !== previous.at(-1)) {
        bars.update(last)
        vol.update(histogram(last))
        line.update(rsiPoint(last, candles.length - 1))
      }
      return
    }
    const range = main.timeScale().getVisibleLogicalRange()
    bars.setData(candles)
    vol.setData(candles.map(histogram))
    line.setData(candles.map(rsiPoint))
    for (const c of [main, sub])
      c.timeScale().applyOptions({
        timeVisible: INTERVALS[interval] < 86400,
      })
    if (range) main.timeScale().setVisibleLogicalRange(range)
  }, [candles, rsi, interval])
  useLayoutEffect(() => {
    const { main, sub } = chartRef.current
    const n = live.current.candles.length
    const range = {
      from: n - Math.min(116, Math.max(72, mainRef.current.clientWidth / 8)),
      to: n + 24,
    }
    main.priceScale('right').applyOptions({ autoScale: true })
    main.timeScale().setVisibleLogicalRange(range)
    sub.timeScale().setVisibleLogicalRange(range)
  }, [resetKey, interval])
  useLayoutEffect(() => {
    const { main, sub, bars, schedule } = chartRef.current
    for (const c of [main, sub])
      c.priceScale('right').applyOptions({ minimumWidth: position ? 124 : 84 })
    bars.applyOptions({})
    schedule()
  }, [analysis, settings, position])
  return (
    <>
      <div className="main-pane">
        <div ref={mainRef} className="chart-native" />
        <canvas
          ref={overlayRef}
          className="overlay pointer-events-none"
          aria-hidden="true"
        />
      </div>
      <div className="rsi-title">
        <Activity size={14} />
        <b>Relative Strength Index</b>
        <span>RSI (14)</span>
        <strong>{readout?.toFixed(2) ?? '—'}</strong>
      </div>
      <div
        className="rsi-pane"
        ref={rsiRef}
        aria-label="Synchronized RSI chart"
      />
    </>
  )
}
