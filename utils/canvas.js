const { getCanvasExportOptions } = require('./image-format')

const MAX_CANVAS_PIXELS = 16777216

function validateDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new RangeError('Canvas dimensions must be between 1 and 4096')
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

function getCanvas(page, selector = '#processor-canvas') {
  if (!page || typeof page.createSelectorQuery !== 'function') {
    throw new Error('Canvas page does not provide createSelectorQuery')
  }

  return new Promise((resolve, reject) => {
    page.createSelectorQuery()
      .select(selector)
      .fields({ node: true, size: true })
      .exec((result) => {
        const canvas = result && result[0] && result[0].node
        if (!canvas) {
          reject(new Error('Canvas node was not found'))
          return
        }
        resolve(canvas)
      })
  })
}

function loadCanvasImage(canvas, path) {
  if (!canvas || typeof canvas.createImage !== 'function') {
    throw new Error('Canvas cannot create an image')
  }
  if (!path) throw new Error('Canvas image path is required')

  return new Promise((resolve, reject) => {
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Canvas image load failed'))
    image.src = path
  })
}

function prepareCanvas(canvas, width, height, pixelRatio) {
  const logical = validateDimensions(width, height)
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? Math.min(pixelRatio, 2) : 1
  if (logical.width * logical.height * ratio * ratio > MAX_CANVAS_PIXELS) {
    throw new RangeError('Canvas backing store is too large')
  }
  canvas.width = Math.round(logical.width * ratio)
  canvas.height = Math.round(logical.height * ratio)
  const context = canvas.getContext('2d')
  context.scale(ratio, ratio)
  return { context, ...logical, pixelRatio: ratio }
}

function exportCanvas(canvas, width, height, format, quality) {
  const logical = validateDimensions(width, height)
  if (!canvas) return Promise.reject(new Error('Canvas is required'))
  if (!Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    return Promise.reject(new Error('Canvas backing dimensions are invalid'))
  }

  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: logical.width,
      destHeight: logical.height,
      ...getCanvasExportOptions(format, quality),
      success(result) {
        if (!result || !result.tempFilePath) {
          reject(new Error('Canvas export did not return a temporary file'))
          return
        }
        resolve(result.tempFilePath)
      },
      fail: reject,
    })
  })
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

module.exports = { getCanvas, loadCanvasImage, prepareCanvas, exportCanvas, formatBytes }
