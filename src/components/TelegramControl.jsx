import { useEffect, useRef, useState } from 'react'
import { Radio, Send, X } from 'lucide-react'
import { api, localTelegramSetupRequired } from '../services/telegramControl.js'
import './TelegramControl.css'

const activityNames = {
  signal: 'صفقة جديدة',
  test: 'اختبار الاتصال',
  analysis: 'تحليل السوق',
  TP1: 'الهدف الأول',
  TP2: 'الهدف الثاني',
  TP3: 'الهدف الثالث',
  SL: 'وقف الخسارة',
}
const deliveryNames = {
  sent: 'تم الإرسال',
  failed: 'فشل الإرسال',
  unknown: 'التسليم غير مؤكد',
  skipped: 'تم التجاوز',
}
const switches = [
  ['autoSignals', 'إرسال الصفقات الجديدة تلقائياً'],
  ['autoReplies', 'تحديثات الأهداف ووقف الخسارة الفورية'],
  ['autoReports', 'التحليل الدوري كل 30 دقيقة للزوجين'],
]
function formFrom(data) {
  return {
    token: '',
    chatId: data.chatId,
    minScore: data.minScore,
    autoSignals: data.autoSignals,
    autoReplies: data.autoReplies,
    autoReports: data.autoReports,
  }
}
export function TelegramControl({ control }) {
  const { status, setStatus, key, setKey, open, setOpen } = control
  const dialog = useRef(null)
  const [admin, setAdmin] = useState('')
  const [form, setForm] = useState(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal()
    if (!open && dialog.current.open) dialog.current.close()
  }, [open])
  async function connect(event) {
    event.preventDefault()
    setPending(true)
    setMessage('')
    try {
      const data = await api('/status', admin.trim())
      setKey(admin.trim())
      setAdmin('')
      setStatus(data)
      setForm(formFrom(data))
      setError(false)
    } catch (e) {
      setMessage(e.message)
      setError(true)
    } finally {
      setPending(false)
    }
  }
  async function send(path, body, success) {
    setPending(true)
    setMessage('')
    try {
      await api(path, key, body)
      const data = await api('/status', key)
      setStatus(data)
      if (path === '/config') setForm(formFrom(data))
      setError(false)
      setMessage(success)
    } catch (e) {
      setError(true)
      setMessage(e.message)
    } finally {
      setPending(false)
    }
  }
  const field = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }))
  return (
    <dialog
      className="telegram-dialog"
      ref={dialog}
      onClose={() => setOpen(false)}
      dir="rtl"
      lang="ar"
      aria-labelledby="telegram-heading"
    >
      <header>
        <Radio size={20} />
        <h2 id="telegram-heading">إعدادات التلغرام والبث المباشر</h2>
        <button
          type="button"
          className="signal-icon"
          aria-label="إغلاق إعدادات Telegram"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
      </header>
      <div className="telegram-body">
        {localTelegramSetupRequired ? (
          <div className="telegram-local">
            <p>
              تُدار إعدادات Telegram من لوحة Pivotline المحلية على الجهاز الذي
              يشغّل العامل.
            </p>
            <a href="http://127.0.0.1:8787/">افتح لوحة Pivotline المحلية</a>
          </div>
        ) : !key ? (
          <form onSubmit={connect} className="telegram-form">
            <label>
              مفتاح إدارة الخادم
              <input
                type="password"
                dir="ltr"
                required
                autoComplete="current-password"
                value={admin}
                onChange={(e) => setAdmin(e.target.value)}
              />
            </label>
            <button type="submit" disabled={pending}>
              فتح لوحة التحكم
            </button>
          </form>
        ) : (
          form && (
            <>
              <div className="telegram-summary">
                <span>
                  {status?.configured
                    ? 'بيانات البوت محفوظة'
                    : 'بانتظار إعداد البوت'}
                </span>
                <span>
                  {status?.stream.state === 'live'
                    ? status.liveMarkets +
                      ' / ' +
                      status.totalMarkets +
                      ' بث مباشر'
                    : 'بانتظار البث'}
                </span>
                <span>{status?.tracking ?? 0} صفقة قيد المتابعة</span>
                <button
                  type="button"
                  onClick={() => {
                    setKey('')
                    setStatus(null)
                    setForm(null)
                    setMessage('')
                  }}
                >
                  قفل اللوحة
                </button>
              </div>
              <form
                className="telegram-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  send('/config', form, 'تم حفظ إعدادات Telegram.')
                }}
              >
                <div className="telegram-fields">
                  <label>
                    رمز البوت
                    <input
                      dir="ltr"
                      type="password"
                      autoComplete="new-password"
                      required={!status?.hasToken}
                      value={form.token}
                      placeholder={
                        status?.hasToken ? 'الرمز محفوظ على الخادم' : undefined
                      }
                      onChange={(e) => field('token', e.target.value)}
                    />
                  </label>
                  <label>
                    معرّف القناة أو @username
                    <input
                      dir="ltr"
                      required
                      value={form.chatId}
                      onChange={(e) => field('chatId', e.target.value)}
                    />
                  </label>
                </div>
                {switches.map(([id, label]) => (
                  <label className="telegram-switch" key={id}>
                    <input
                      role="switch"
                      type="checkbox"
                      checked={form[id]}
                      onChange={(e) => field(id, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <label className="telegram-range">
                  الحد الأدنى للتوافق <bdi>{form.minScore}%</bdi>
                  <input
                    type="range"
                    min="70"
                    max="95"
                    value={form.minScore}
                    onChange={(e) => field('minScore', +e.target.value)}
                  />
                </label>
                <div className="telegram-actions">
                  <button type="submit" disabled={pending}>
                    حفظ الإعدادات
                  </button>
                  <button
                    type="button"
                    disabled={pending || !status?.configured}
                    onClick={() =>
                      send(
                        '/test',
                        {},
                        'أُضيف اختبار الاتصال إلى قائمة الإرسال.',
                      )
                    }
                  >
                    اختبار الاتصال
                  </button>
                  <button
                    type="button"
                    disabled={pending || !status?.configured}
                    onClick={() =>
                      send(
                        '/send-analysis-now',
                        {},
                        'أُضيف التحليل إلى قائمة الإرسال.',
                      )
                    }
                  >
                    <Send size={15} /> إرسال التحليل الآن
                  </button>
                </div>
              </form>
              <section className="telegram-activity" aria-label="سجل Telegram">
                <h3>
                  آخر الرسائل <span>{status?.pending ?? 0} قيد الإرسال</span>
                </h3>
                {status?.activity.length ? (
                  <ol>
                    {status.activity.map((item, i) => (
                      <li key={item.at + ':' + i}>
                        <div>
                          <strong>
                            {activityNames[item.type] ?? item.type}
                          </strong>
                          <span>{item.detail}</span>
                        </div>
                        <div>
                          <span data-delivery={item.status}>
                            {deliveryNames[item.status] ?? item.status}
                          </span>
                          <time
                            dir="ltr"
                            dateTime={new Date(item.at).toISOString()}
                          >
                            {new Date(item.at).toLocaleString('en-GB')}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>يظهر سجل الإرسال هنا عند إرسال أول رسالة.</p>
                )}
              </section>
            </>
          )
        )}
        {message && (
          <p
            role={error ? 'alert' : 'status'}
            className={error ? 'telegram-error' : 'telegram-success'}
          >
            {message}
          </p>
        )}
      </div>
    </dialog>
  )
}
