import { timingSafeEqual, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { WebSocket } from 'ws'
import fetch from 'node-fetch'
import cron from 'node-cron'
import { ASSETS } from '../src/services/marketData.js'
import {
  createMarketStream,
  marketKey,
} from '../src/services/realtimeStream.js'
import { confluenceSignalEngine } from '../src/engines/confluenceSignalEngine.js'
import { startTrade, trackTrade } from '../src/engines/tradeTracker.js'
import { createTelegramStore } from './telegramStore.js'
import {
  analysisReports,
  outcomeMessage,
  signalMessage,
} from './telegramMessages.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const markets = Object.keys(ASSETS).flatMap((symbol) =>
  ['15m', '1h', '4h', '1d'].map((interval) => ({ symbol, interval })),
)
const tokenPattern = /^\d{5,20}:[A-Za-z0-9_-]{20,128}$/
const chatPattern = /^(?:-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/
const botId = (token) => token.split(':')[0]

export function createTelegramWorker({
  env = process.env,
  directory = env.TELEGRAM_DATA_DIR || resolve(root, 'server/data'),
  openMarketStream = createMarketStream,
  telegramFetch = fetch,
  evaluateMarket = confluenceSignalEngine,
  schedule = cron.schedule,
} = {}) {
  if (env.TELEGRAM_ADMIN_KEY && env.TELEGRAM_ADMIN_KEY.length < 32)
    throw new Error('TELEGRAM_ADMIN_KEY must contain at least 32 characters.')
  const store = createTelegramStore(directory, env)
  const { state } = store
  const app = express()
  const book = new Map(),
    prices = new Map(),
    rows = new Map()
  let streamStatus = { state: 'connecting' },
    running,
    dispatchTimer,
    stopped = false
  const config = store.getConfig
  const ready = () =>
    tokenPattern.test(config().token) && chatPattern.test(config().chatId)

  function activity(item, status, detail = item.label) {
    state.activity.unshift({ type: item.type, status, detail, at: Date.now() })
  }
  function addJob(type, label, text, tradeId = null) {
    const settings = config()
    const job = {
      id: randomUUID(),
      type,
      label,
      text,
      tradeId,
      state: 'queued',
      chatId: settings.chatId,
      bot: botId(settings.token),
    }
    state.outbox.push(job)
    return job
  }
  function queue(type, label, texts) {
    if (!ready()) throw new Error('احفظ بيانات البوت والقناة أولاً.')
    if (state.outbox.filter((j) => j.state === 'queued').length > 60)
      throw new Error('قائمة إرسال Telegram ممتلئة. حاول بعد قليل.')
    for (const text of texts) addJob(type, label, text)
    store.persist()
    dispatch()
  }
  function inspect(key, row) {
    const signal = row.signal
    if (row.source !== 'live') return
    const settings = config()
    let changed = false
    for (const [id, trade] of Object.entries(state.trades)) {
      if (trade.signal.key !== key || signal?.id === trade.signal.id) continue
      if (trade.enteredAt == null || trade.closed) {
        const needed = state.outbox.some(
          (j) =>
            j.tradeId === id && (j.state === 'queued' || j.state === 'sending'),
        )
        if (!needed) {
          delete state.trades[id]
          changed = true
        } else if (!trade.retired) {
          trade.retired = true
          trade.closed ??= 'cancelled'
          changed = true
        }
      }
    }
    if (
      signal &&
      signal.expiresAt * 1000 > Date.now() &&
      ready() &&
      settings.autoSignals &&
      signal.score >= settings.minScore &&
      !Object.values(state.trades).some(
        (t) => t.signal.id === signal.id && !t.retired,
      ) &&
      state.outbox.filter((j) => j.state === 'queued').length <= 60
    ) {
      const id = randomUUID()
      const post = addJob(
        'signal',
        ASSETS[signal.symbol].pair + ' · ' + signal.interval,
        signalMessage(signal),
        id,
      )
      state.trades[id] = {
        ...startTrade(signal),
        postId: post.id,
        chatId: settings.chatId,
        bot: botId(settings.token),
        messageId: null,
      }
      changed = true
    }
    if (changed) {
      store.persist()
      dispatch()
    }
  }

  function dispatch() {
    if (running || stopped) return
    clearTimeout(dispatchTimer)
    running = sendQueue().finally(() => {
      running = null
    })
    running.catch((error) =>
      console.error('Telegram storage error:', error.code || error.name),
    )
  }
  async function sendQueue() {
    // Yield before assigning the active promise, including when an empty queue completes.
    await Promise.resolve()
    while (!stopped) {
      const job = state.outbox.find((x) => x.state === 'queued')
      if (!job) return
      if (job.retryAt > Date.now()) {
        dispatchTimer = setTimeout(dispatch, job.retryAt - Date.now())
        return
      }
      const settings = config()
      const trade = state.trades[job.tradeId]
      const reply = job.type !== 'signal' && !!job.tradeId
      if (
        !ready() ||
        settings.chatId !== job.chatId ||
        botId(settings.token) !== job.bot ||
        (reply && !trade?.messageId) ||
        (job.type === 'signal' &&
          (trade?.postId !== job.id ||
            (trade.enteredAt == null &&
              (trade.closed || trade.signal.expiresAt * 1000 <= Date.now()))))
      ) {
        job.state = 'skipped'
        activity(job, 'skipped')
        store.persist()
        continue
      }
      job.state = 'sending'
      store.persist()
      try {
        const payload = {
          chat_id: reply ? (trade.postedChatId ?? job.chatId) : job.chatId,
          text: job.text,
          parse_mode: 'HTML',
        }
        if (reply)
          payload.reply_parameters = {
            message_id: trade.messageId,
            allow_sending_without_reply: false,
          }
        const response = await telegramFetch(
          'https://api.telegram.org/bot' + settings.token + '/sendMessage',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
          },
        )
        const result = await response.json()
        if (response.status === 429) {
          job.state = 'queued'
          const seconds = Number(result.parameters?.retry_after)
          job.retryAt =
            Date.now() +
            (Number.isFinite(seconds)
              ? Math.max(1, Math.min(seconds, 3600))
              : 5) *
              1000
          store.persist()
          continue
        }
        if (
          !response.ok ||
          !result.ok ||
          !Number.isInteger(result.result?.message_id)
        ) {
          job.state = response.status >= 500 || result.ok ? 'unknown' : 'failed'
          activity(
            job,
            job.state,
            job.label + ' · Telegram ' + (result.error_code ?? response.status),
          )
        } else {
          if (job.type === 'signal') {
            trade.messageId = result.result.message_id
            trade.postedChatId = result.result.chat?.id
          }
          job.state = 'sent'
          activity(job, 'sent')
        }
      } catch {
        // The remote server may have accepted a timed-out request. Never auto-resend it.
        job.state = 'unknown'
        activity(job, 'unknown')
      }
      store.persist()
    }
  }

  const marketStream = openMarketStream({
    markets,
    Socket: WebSocket,
    onStatus(status) {
      if (!status.loading && !status.loaded) streamStatus = status
    },
    onMarket(key, data, changed) {
      const previous = book.get(key)
      book.set(key, data)
      if (!changed && previous?.source === data.source) return
      const market = markets.find(
        (m) => marketKey(m.symbol, m.interval) === key,
      )
      const row = evaluateMarket(market.symbol, market.interval, data, {
        ignoreForming: true,
      })
      rows.set(key, row)
      inspect(key, row)
    },
    onTrade(tick) {
      prices.set(tick.symbol, tick)
      let changed = false
      const settings = config()
      for (const [id, trade] of Object.entries(state.trades)) {
        if (
          trade.enteredAt == null &&
          book.get(trade.signal.key)?.source !== 'live'
        )
          continue
        const result = trackTrade(trade, tick)
        if (result.trade === trade) continue
        state.trades[id] = result.trade
        changed = true
        if (
          !settings.autoReplies ||
          trade.chatId !== settings.chatId ||
          trade.bot !== botId(settings.token)
        )
          continue
        for (const event of result.events.filter((e) => e.type !== 'entry')) {
          addJob(
            event.type,
            ASSETS[tick.symbol].pair + ' · ' + trade.signal.interval,
            outcomeMessage(event, result.trade),
            id,
          )
        }
      }
      if (changed) {
        store.persist()
        dispatch()
      }
    },
  })
  for (const m of markets) marketStream.watch(m.symbol, m.interval)

  const scheduled = schedule(
    '*/30 * * * *',
    () => {
      if (!ready() || !config().autoReports) return
      try {
        queue(
          'analysis',
          'تحليل نصف الساعة',
          analysisReports(book, prices).map((r) => r.text),
        )
      } catch (error) {
        activity(
          { type: 'analysis', label: 'تحليل نصف الساعة' },
          'failed',
          error.message,
        )
        store.persist()
      }
    },
    { timezone: 'UTC', noOverlap: true },
  )

  app.disable('x-powered-by')
  app.use(
    '/api/telegram',
    (req, res, next) => {
      const origin = req.get('origin')
      const allowed = env.TELEGRAM_UI_ORIGIN
      if (origin && allowed && origin === allowed) {
        res.set('Access-Control-Allow-Origin', origin)
        res.set('Vary', 'Origin')
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      }
      if (req.method === 'OPTIONS')
        return res.sendStatus(origin === allowed ? 204 : 403)
      res.set('Cache-Control', 'no-store')
      const secret = env.TELEGRAM_ADMIN_KEY
      if (!secret)
        return res
          .status(503)
          .json({ error: 'مفتاح إدارة Telegram غير مهيأ على الخادم.' })
      const sent = Buffer.from(req.get('authorization') || '')
      const expected = Buffer.from('Bearer ' + secret)
      if (sent.length !== expected.length || !timingSafeEqual(sent, expected))
        return res.status(401).json({ error: 'مفتاح الإدارة غير صالح.' })
      next()
    },
    express.json({ limit: '8kb' }),
  )
  app.get('/api/telegram/status', (_req, res) => {
    const { token, chatId, autoSignals, autoReplies, autoReports, minScore } =
      config()
    res.json({
      configured: ready(),
      chatId,
      hasToken: !!token,
      autoSignals,
      autoReplies,
      autoReports,
      minScore,
      stream: streamStatus,
      liveMarkets: [...book.values()].filter((d) => d.source === 'live').length,
      totalMarkets: markets.length,
      tracking: Object.values(state.trades).filter(
        (t) => t.messageId && !t.closed,
      ).length,
      pending: state.outbox.filter((j) =>
        ['queued', 'sending'].includes(j.state),
      ).length,
      activity: state.activity,
    })
  })
  app.post('/api/telegram/config', (req, res) => {
    const input = req.body || {},
      current = config()
    const token =
      typeof input.token === 'string' && input.token.trim()
        ? input.token.trim()
        : current.token
    const chatId =
      typeof input.chatId === 'string' ? input.chatId.trim() : current.chatId
    const minScore = input.minScore ?? current.minScore
    const bools = ['autoSignals', 'autoReplies', 'autoReports']
    if (
      !tokenPattern.test(token) ||
      !chatPattern.test(chatId) ||
      !Number.isInteger(minScore) ||
      minScore < 70 ||
      minScore > 95 ||
      bools.some((key) => input[key] != null && typeof input[key] !== 'boolean')
    )
      return res
        .status(400)
        .json({ error: 'راجع صيغة رمز البوت ومعرّف القناة ودرجة التوافق.' })
    store.saveConfig({
      ...current,
      token,
      chatId,
      minScore,
      ...Object.fromEntries(
        bools.map((key) => [key, input[key] ?? current[key]]),
      ),
    })
    for (const [key, row] of rows) inspect(key, row)
    res.json({ saved: true })
  })
  app.post('/api/telegram/test', (_req, res) => {
    try {
      queue('test', 'اختبار الاتصال', [
        '✅ اتصال Pivotline بقناة Telegram يعمل.',
      ])
      res.status(202).json({ queued: true })
    } catch (error) {
      res.status(409).json({ error: error.message })
    }
  })
  app.post('/api/telegram/send-analysis-now', (_req, res) => {
    try {
      queue(
        'analysis',
        'تحليل يدوي',
        analysisReports(book, prices).map((r) => r.text),
      )
      res.status(202).json({ queued: true })
    } catch (error) {
      res.status(409).json({ error: error.message })
    }
  })
  app.use('/api/telegram', (_req, res) =>
    res.status(404).json({ error: 'مسار غير معروف.' }),
  )
  app.use(express.static(resolve(root, 'dist')))
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: 'تعذّر معالجة الطلب.' })
  })
  dispatch()
  return {
    app,
    async close() {
      stopped = true
      scheduled.destroy()
      clearTimeout(dispatchTimer)
      marketStream.close()
      await running
    },
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const worker = createTelegramWorker()
  const port = Number(process.env.TELEGRAM_PORT || 8787)
  const host = process.env.TELEGRAM_HOST || '127.0.0.1'
  const server = worker.app.listen(port, host, () =>
    console.log('Pivotline Telegram worker http://' + host + ':' + port),
  )
  const stop = () => {
    server.close()
    worker.close().catch(() => {
      process.exitCode = 1
    })
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
