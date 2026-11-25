import { formatInterval } from '../services/marketData.js'

export async function exportSnapshot(element, symbol, interval, school) {
  const { default: html2canvas } = await import('html2canvas')
  await document.fonts.ready
  // Let the chart's queued canvas paint finish before freezing the layer images.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  )
  const stamp = new Date()
  const images = Array.from(element.querySelectorAll('canvas'), (c) =>
    c.toDataURL(),
  )
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#131722',
    logging: false,
    onclone(doc) {
      const root = doc.querySelector('[data-export-root]')
      const button = root.querySelector('.export-btn')
      button.disabled = false
      for (const node of button.childNodes)
        if (node.nodeType === 3) node.textContent = 'Export PNG'
      root.querySelectorAll('canvas').forEach((layer, i) => {
        const img = doc.createElement('img')
        img.src = images[i]
        img.className = layer.className
        img.style.cssText = layer.style.cssText
        img.style.width = layer.style.width || layer.clientWidth + 'px'
        img.style.height = layer.style.height || layer.clientHeight + 'px'
        layer.replaceWith(img)
      })
      return Promise.all(
        Array.from(root.querySelectorAll('img'), (im) => im.decode()),
      )
    },
  })
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = '20px monospace'
  ctx.textAlign = 'right'
  ctx.fillStyle = '#8492a8'
  ctx.fillText(
    'Pivotline  •  ' +
      stamp.toISOString().slice(0, 19).replace('T', ' ') +
      ' UTC',
    canvas.width - 30,
    canvas.height - 12,
  )
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
      'image/png',
    ),
  )
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download =
    [
      symbol,
      formatInterval(interval),
      school,
      stamp.toISOString().slice(0, 10),
    ].join('_') + '.png'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
