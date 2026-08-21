const { chooseSingleImage } = require('../../utils/image-picker')
const { getCanvas, loadCanvasImage, prepareCanvas, exportCanvas, formatBytes } = require('../../utils/canvas')
const { fitWithinSide, getWatermarkPoint, opacityPercentToAlpha } = require('../../utils/image-math')
const { normalizeImageFormat, shouldFillWhite } = require('../../utils/image-format')
const { saveImageToAlbum } = require('../../utils/image-save')
const { resultBannerUnitId } = require('../../config/ads')

const MAX_SIDE = 4096
const COLORS = ['#000000', '#ffffff']
const POSITIONS = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right']
let cachedSegmenter
let segmenterChecked = false
let markPattern
let markPatternChecked = false

function getFileSize(path) {
  return new Promise((resolve) => {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!manager || typeof manager.stat !== 'function') return resolve(0)
    manager.stat({ path, success(result) { resolve(Number(result && result.stats && result.stats.size) || 0) }, fail() { resolve(0) } })
  })
}

function isCanvasTooLarge(error) {
  const message = String(error && (error.message || error.errMsg) ? error.message || error.errMsg : error)
  return error instanceof RangeError || /canvas.*(?:large|dimension|pixel)/i.test(message)
}

function clearResult(page) {
  page.nextSave()
  page.setData({ resultPath: '', resultSize: 0, resultSizeText: '', warningMessage: '', errorMessage: '' })
}

function getSegmenter() {
  if (segmenterChecked) return cachedSegmenter
  segmenterChecked = true
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null
  try {
    cachedSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
  } catch (error) {
    cachedSegmenter = null
  }
  return cachedSegmenter
}

function getMarkPattern() {
  if (markPatternChecked) return markPattern
  markPatternChecked = true
  try {
    markPattern = new RegExp('\\p{Mark}', 'u')
  } catch (error) {
    markPattern = null
  }
  return markPattern
}

function isRegionalIndicator(character) {
  const point = character.codePointAt(0)
  return point >= 0x1f1e6 && point <= 0x1f1ff
}

function isExtend(character) {
  const point = character.codePointAt(0)
  const marks = getMarkPattern()
  return (marks && marks.test(character))
    || (point >= 0x0300 && point <= 0x036f)
    || (point >= 0x1ab0 && point <= 0x1aff)
    || (point >= 0x1dc0 && point <= 0x1dff)
    || (point >= 0x20d0 && point <= 0x20ff)
    || (point >= 0x0483 && point <= 0x0489)
    || (point >= 0x0591 && point <= 0x05c7)
    || (point >= 0x0610 && point <= 0x061a)
    || (point >= 0x064b && point <= 0x065f)
    || point === 0x0670
    || (point >= 0x06d6 && point <= 0x06ed)
    || (point >= 0x0900 && point <= 0x0903)
    || (point >= 0x093a && point <= 0x094d)
    || (point >= 0x0951 && point <= 0x0957)
    || (point >= 0x0962 && point <= 0x0963)
    || (point >= 0xfe00 && point <= 0xfe0f)
    || (point >= 0xfe20 && point <= 0xfe2f)
    || (point >= 0xe0100 && point <= 0xe01ef)
    || (point >= 0x1f3fb && point <= 0x1f3ff)
}

function splitGraphemes(value) {
  const text = value === undefined || value === null ? '' : String(value)
  const segmenter = getSegmenter()
  if (segmenter) return Array.from(segmenter.segment(text), (segment) => segment.segment)
  const points = Array.from(text)
  const graphemes = []
  let index = 0
  while (index < points.length) {
    let grapheme = points[index]
    index += 1
    if (isRegionalIndicator(grapheme) && index < points.length && isRegionalIndicator(points[index])) {
      grapheme += points[index]
      index += 1
    }
    while (index < points.length && isExtend(points[index])) {
      grapheme += points[index]
      index += 1
    }
    while (points[index] === '\u200d' && index + 1 < points.length) {
      grapheme += points[index]
      grapheme += points[index + 1]
      index += 2
      while (index < points.length && isExtend(points[index])) {
        grapheme += points[index]
        index += 1
      }
    }
    graphemes.push(grapheme)
  }
  return graphemes
}

function trimGraphemes(value) {
  return splitGraphemes(value).slice(0, 30).join('')
}

function fitWatermarkText(context, text, width, height) {
  let fontSize = Math.min(96, Math.max(24, Math.round(Math.min(width, height) * 0.055)))
  let padding
  let availableWidth
  let measuredWidth
  do {
    padding = Math.max(16, Math.round(fontSize * 0.8))
    availableWidth = width - padding * 2
    context.font = `${fontSize}px sans-serif`
    measuredWidth = context.measureText(text).width
    if (fontSize + padding * 2 <= height && measuredWidth <= availableWidth) break
    if (fontSize === 24) break
    fontSize -= 1
  } while (fontSize >= 24)
  if (availableWidth <= 0 || fontSize + padding * 2 > height) return null
  if (measuredWidth <= availableWidth) return { text, fontSize, padding, availableWidth, truncated: false, textWidth: measuredWidth }
  const points = splitGraphemes(text)
  let rendered = '…'
  while (points.length && context.measureText(`${points.join('')}…`).width > availableWidth) points.pop()
  if (context.measureText(`${points.join('')}…`).width <= availableWidth) rendered = `${points.join('')}…`
  return { text: rendered, fontSize, padding, availableWidth, truncated: true, textWidth: Math.min(context.measureText(rendered).width, availableWidth) }
}

Page({
  data: {
    source: null, watermarkText: '', color: '#ffffff', position: 'bottom-right', opacity: 70,
    processing: false, saving: false, resultPath: '', resultSize: 0, resultSizeText: '', sourceSizeText: '',
    warningMessage: '', errorMessage: '', resultBannerUnitId,
  },

  isCurrent(token) { return !this._unloaded && this._operationId === token },
  isSelectionCurrent(token) { return !this._unloaded && this._selectionId === token },
  isSaveCurrent(token) { return !this._unloaded && this._saveId === token },
  nextOperation() { this._operationId = (this._operationId || 0) + 1; return this._operationId },
  nextSelection() { this._selectionId = (this._selectionId || 0) + 1; return this._selectionId },
  nextSave() { this._saveId = (this._saveId || 0) + 1; return this._saveId },

  releaseCanvas(ownerId, canvas) {
    if (!canvas || this._canvasOwnerId !== ownerId || this._canvas !== canvas) return
    canvas.width = 1
    canvas.height = 1
    this._canvas = null
    this._canvasOwnerId = null
  },

  async chooseImage() {
    if (this._processing || this._saving || this.data.processing || this.data.saving) return
    const token = this.nextSelection()
    try {
      const picked = await chooseSingleImage()
      if (!picked || !this.isSelectionCurrent(token)) return
      const source = { ...picked, format: normalizeImageFormat(picked.type, picked.path) }
      const canvas = this._canvas
      const ownerId = this._canvasOwnerId
      this.nextOperation()
      this.nextSave()
      this.releaseCanvas(ownerId, canvas)
      this._processing = false
      this.setData({ source, processing: false, sourceSizeText: formatBytes(source.size), resultPath: '', resultSize: 0, resultSizeText: '', warningMessage: '', errorMessage: '' })
    } catch (error) {
      if (this.isSelectionCurrent(token)) this.setData({ errorMessage: '选择图片失败，请重试' })
    }
  },

  onTextInput(event) {
    if (this.data.processing) return this.data.watermarkText
    const watermarkText = trimGraphemes(event && event.detail && event.detail.value)
    if (watermarkText !== this.data.watermarkText) {
      clearResult(this)
      this.setData({ watermarkText })
    }
    return watermarkText
  },

  selectColor(event) {
    if (this.data.processing) return
    const color = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.color
    if (!COLORS.includes(color) || color === this.data.color) return
    clearResult(this)
    this.setData({ color })
  },

  selectPosition(event) {
    if (this.data.processing) return
    const position = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.position
    if (!POSITIONS.includes(position) || position === this.data.position) return
    clearResult(this)
    this.setData({ position })
  },

  onOpacityChange(event) {
    if (this.data.processing) return
    const raw = Math.round(Number(event && event.detail && event.detail.value))
    const opacity = Number.isFinite(raw) ? Math.min(100, Math.max(20, raw)) : 70
    if (opacity === this.data.opacity) return
    clearResult(this)
    this.setData({ opacity })
  },

  async applyWatermark() {
    if (this._processing || this._saving || this.data.processing || this.data.saving) return
    const source = this.data.source
    if (!source) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }
    const watermarkText = trimGraphemes(this.data.watermarkText).trim()
    if (!watermarkText) {
      this.setData({ errorMessage: '请输入水印文字' })
      return
    }
    const snapshot = { source: { ...source }, watermarkText, color: this.data.color, position: this.data.position, opacity: this.data.opacity }
    const token = this.nextOperation()
    this._processing = true
    clearResult(this)
    this.setData({ processing: true })
    let canvas
    try {
      const target = fitWithinSide(snapshot.source.width, snapshot.source.height, MAX_SIDE)
      canvas = await getCanvas(this, '#processor-canvas')
      if (!this.isCurrent(token)) {
        const newerOwner = this._canvas === canvas && this._canvasOwnerId && this._canvasOwnerId !== token
        if (!newerOwner && canvas) { canvas.width = 1; canvas.height = 1 }
        return
      }
      this._canvas = canvas
      this._canvasOwnerId = token
      const image = await loadCanvasImage(canvas, snapshot.source.path)
      if (!this.isCurrent(token)) return
      const prepared = prepareCanvas(canvas, target.width, target.height, 1)
      const context = prepared.context
      const watermark = fitWatermarkText(context, snapshot.watermarkText, target.width, target.height)
      if (!watermark) {
        this.setData({ warningMessage: '', errorMessage: '图片尺寸过小，无法添加水印' })
        return
      }
      if (shouldFillWhite(snapshot.source.format)) {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, target.width, target.height)
      }
      context.drawImage(image, 0, 0, target.width, target.height)
      const point = getWatermarkPoint({ width: target.width, height: target.height, textWidth: watermark.textWidth, lineHeight: watermark.fontSize, padding: watermark.padding, position: snapshot.position })
      context.fillStyle = snapshot.color
      context.textAlign = point.textAlign
      context.textBaseline = point.textBaseline
      context.globalAlpha = opacityPercentToAlpha(snapshot.opacity)
      try {
        context.fillText(watermark.text, point.x, point.y, watermark.availableWidth)
      } finally {
        context.globalAlpha = 1
      }
      if (!this.isCurrent(token)) return
      const resultPath = await exportCanvas(canvas, target.width, target.height, snapshot.source.format, snapshot.source.format === 'jpg' ? 0.92 : undefined)
      if (!this.isCurrent(token)) return
      if (!resultPath) throw new Error('Canvas export did not return a temporary file')
      const resultSize = await getFileSize(resultPath)
      if (!this.isCurrent(token)) return
      this.setData({
        resultPath,
        resultSize,
        resultSizeText: resultSize > 0 ? formatBytes(resultSize) : '大小暂不可用',
        warningMessage: watermark.truncated ? '文字过长，已自动截断' : '',
        errorMessage: '',
      })
      if (watermark.truncated) wx.showToast({ title: '文字过长，已自动截断', icon: 'none' })
    } catch (error) {
      if (!this.isCurrent(token)) return
      this.setData({ resultPath: '', resultSize: 0, resultSizeText: '', warningMessage: '', errorMessage: isCanvasTooLarge(error) ? '图片尺寸过大，请选择较小的图片' : '处理失败，请重试或更换图片' })
    } finally {
      this.releaseCanvas(token, canvas)
      if (this.isCurrent(token)) {
        this._processing = false
        this.setData({ processing: false })
      }
    }
  },

  async saveResult() {
    if (this._saving) return
    if (!this.data.resultPath) {
      wx.showToast({ title: '请先处理图片', icon: 'none' })
      return
    }
    const token = this.nextSave()
    const requestId = (this._saveRequestId || 0) + 1
    const resultPath = this.data.resultPath
    this._saveRequestId = requestId
    this._activeSaveId = requestId
    this._saving = true
    this.setData({ saving: true })
    try {
      const result = await saveImageToAlbum(resultPath)
      if (!this.isSaveCurrent(token) || !result || !result.saved) return
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      if (!this.isSaveCurrent(token)) return
      const message = String(error && error.message ? error.message : '')
      this.setData({ errorMessage: message === '图片文件无效，请重新处理图片' ? message : '保存失败，请重试' })
    } finally {
      if (this._activeSaveId === requestId) {
        this._saving = false
        this._activeSaveId = null
        if (!this._unloaded) this.setData({ saving: false })
      }
    }
  },

  onUnload() {
    const canvas = this._canvas
    const ownerId = this._canvasOwnerId
    this._unloaded = true
    this.nextOperation()
    this.nextSelection()
    this.nextSave()
    this._processing = false
    this._saving = false
    this._activeSaveId = null
    this.releaseCanvas(ownerId, canvas)
    this._canvas = null
    this._canvasOwnerId = null
  },
})
