import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const automationDefaults = {
  autoSignals: false,
  autoReplies: false,
  autoReports: false,
  minScore: 75,
}

function read(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}
function write(path, value) {
  const temp = path + '.tmp'
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(temp, path)
}
function cipherKey(adminKey) {
  return createHash('sha256')
    .update('Pivotline Telegram config\0' + adminKey)
    .digest()
}
export function createTelegramStore(directory, env) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const statePath = join(directory, 'activeTrades.json'),
    configPath = join(directory, 'telegramConfig.json')
  const state = read(statePath, { trades: {}, outbox: [], activity: [] })
  const saved = read(configPath, null)
  let config = {
    ...automationDefaults,
    token: env.TELEGRAM_BOT_TOKEN || '',
    chatId: env.TELEGRAM_CHAT_ID || '',
  }
  const adminKey = env.TELEGRAM_ADMIN_KEY
  if (saved && adminKey) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      cipherKey(adminKey),
      Buffer.from(saved.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(saved.tag, 'base64'))
    const json = Buffer.concat([
      decipher.update(Buffer.from(saved.data, 'base64')),
      decipher.final(),
    ])
    config = { ...config, ...JSON.parse(json.toString('utf8')) }
  }
  for (const item of state.outbox.filter((x) => x.state === 'sending')) {
    item.state = 'unknown'
    state.activity.unshift({
      type: item.type,
      detail: item.label,
      status: 'unknown',
      at: Date.now(),
    })
  }
  function persist() {
    state.activity = state.activity.slice(0, 20)
    state.outbox = state.outbox.filter(
      (x) =>
        x.state === 'queued' ||
        x.state === 'sending' ||
        (x.type === 'signal' && state.trades[x.tradeId]?.postId === x.id),
    )
    write(statePath, state)
  }
  persist()
  return {
    state,
    persist,
    getConfig: () => config,
    saveConfig(next) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', cipherKey(adminKey), iv)
      const data = Buffer.concat([
        cipher.update(JSON.stringify(next)),
        cipher.final(),
      ])
      write(configPath, {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      })
      config = next
    },
  }
}
