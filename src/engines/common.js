export const blue = '#6795ff',
  amber = '#f4b855',
  red = '#ec7583',
  green = '#39c6a4',
  violet = '#b591ed'
export const number = (n) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
export const when = (p) =>
  new Intl.DateTimeFormat('ar', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(p.time * 1000)
export const point = (index, price, label) => ({ index, price, label })
export const describe = (p) => number(p.price) + ' (' + when(p) + ' UTC)'
export const path = (points, color = blue) => ({ points, color })
export const zone = (from, to, a, b, label, color) => ({
  from,
  to,
  low: Math.min(a, b),
  high: Math.max(a, b),
  label,
  color,
})
export const level = (from, to, price, label, color, math = false) => ({
  from,
  to,
  price,
  label,
  color,
  math,
})
export function result(name) {
  return {
    overlays: [],
    projections: [],
    horizontalLines: [],
    zones: [],
    commentary: {
      name,
      structure: 'لم يكتمل النموذج في الشموع المغلقة المعروضة.',
      details: 'ننتظر تأكيد قمم وقيعان إضافية.',
      scenario: 'تتطلب القراءة اكتمال البنية السعرية.',
      target: '',
      invalidation: 'لا يوجد شرط إلغاء قبل تأكيد النموذج.',
    },
  }
}
export function ordered(p, values) {
  return values.map((n, i) => ({ ...p[i], label: n }))
}
