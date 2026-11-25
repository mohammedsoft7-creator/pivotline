import { useEffect, useRef, useState } from 'react'
import { ASSETS, formatInterval } from './marketData.js'
export function useSignalAlerts(active) {
  const [mode, setMode] = useState(false)
  const [notice, setNotice] = useState(null)
  const previous = useRef(new Set())
  const audio = useRef(null)
  async function toggle() {
    if (mode) {
      setMode(false)
      setNotice(null)
      return
    }
    const Context = window.AudioContext || window.webkitAudioContext
    if (Context) {
      try {
        audio.current ??= new Context()
        await audio.current.resume()
      } catch {
        // Visual notifications stay available if audio permission is denied.
      }
    }
    setMode(true)
  }
  useEffect(() => {
    const eligible = active.filter((s) => s.score >= 80)
    const ids = new Set(eligible.map((s) => s.id))
    const fresh = eligible.filter((s) => !previous.current.has(s.id))
    previous.current = ids
    if (!mode || !fresh.length) return
    const first = fresh[0]
    setNotice(
      'إشارة ' +
        (first.dir > 0 ? 'شراء' : 'بيع') +
        ' · ' +
        ASSETS[first.symbol].pair +
        ' · ' +
        formatInterval(first.interval) +
        ' · ' +
        first.score +
        '%',
    )
    const context = audio.current
    if (context?.state === 'running') {
      const start = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.setValueAtTime(660, start)
      oscillator.frequency.setValueAtTime(880, start + 0.12)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.035)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.36)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
      }
    }
  }, [active, mode])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(
    () => () => {
      audio.current?.close().catch(() => {})
      audio.current = null
    },
    [],
  )
  return { mode, toggle, notice }
}
