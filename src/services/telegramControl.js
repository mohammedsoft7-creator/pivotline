import { useEffect, useState } from 'react'

const workerUrl = (import.meta.env.VITE_TELEGRAM_API_URL || '').trim()
export const localTelegramSetupRequired =
  !workerUrl && window.location.hostname.endsWith('.github.io')
const endpoint = workerUrl.replace(/\/$/, '') + '/api/telegram'
const workerUnavailable = 'خادم Telegram غير متاح على هذا العنوان.'

export async function api(
  path,
  key,
  body,
  signal = AbortSignal.timeout(12000),
) {
  if (localTelegramSetupRequired) throw new Error(workerUnavailable)
  let response
  try {
    response = await fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      signal,
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + key,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(workerUnavailable)
  }
  if (
    !(response.headers.get('content-type') || '').includes('application/json')
  )
    throw new Error(workerUnavailable)
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.error || 'تعذّر الاتصال بخادم Telegram.')
  return data
}
export function useTelegramControl() {
  const [status, setStatus] = useState(null)
  const [key, setKey] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    async function read() {
      try {
        const next = await api(
          '/status',
          key,
          undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        )
        if (!controller.signal.aborted) setStatus(next)
      } catch {
        if (!controller.signal.aborted) setStatus(null)
      }
    }
    const timer = setInterval(read, open ? 4000 : 15000)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [key, open])
  return { status, setStatus, key, setKey, open, setOpen }
}
