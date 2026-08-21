const { chooseSingleImage } = require('../../utils/image-picker')
const { getCanvas, loadCanvasImage, prepareCanvas, exportCanvas, formatBytes } = require('../../utils/canvas')
const { fitWithinSide } = require('../../utils/image-math')
const { normalizeImageFormat, shouldFillWhite } = require('../../utils/image-format')
const { saveImageToAlbum } = require('../../utils/image-save')
const { resultBannerUnitId } = require('../../config/ads')

function getFileSize(path) {
  return new Promise((resolve) => {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!manager || typeof manager.stat !== 'function') {
      resolve(0)
      return
    }
    manager.stat({
      path,
      success(result) {
        resolve(Number(result && result.stats && result.stats.size) || 0)
      },
      fail() {
        resolve(0)
      },
    })
  })
}

function isCanvasTooLarge(error) {
  const message = String(error && error.message ? error.message : error)
  return error instanceof RangeError || /canvas.*(?:large|dimension|pixel)/i.test(message)
}

Page({
  data: {
    source: null,
    quality: 80,
    processing: false,
    resultPath: '',
    resultSize: 0,
    sourceSizeText: '',
    resultSizeText: '',
    errorMessage: '',
    resultBannerUnitId,
  },

  isCurrent(token) {
    return !this._unloaded && this._operationId === token
  },

  isSelectionCurrent(token) {
    return !this._unloaded && this._selectionId === token
  },

  nextOperation() {
    this._operationId = (this._operationId || 0) + 1
    return this._operationId
  },

  nextSelection() {
    this._selectionId = (this._selectionId || 0) + 1
    return this._selectionId
  },

  async chooseImage() {
    const token = this.nextSelection()
    try {
      const picked = await chooseSingleImage()
      if (!picked || !this.isSelectionCurrent(token)) return
      const source = { ...picked, format: normalizeImageFormat(picked.type, picked.path) }
      this.nextOperation()
      this.setData({
        source,
        processing: false,
        sourceSizeText: formatBytes(source.size),
        resultPath: '',
        resultSize: 0,
        resultSizeText: '',
        errorMessage: '',
      })
    } catch (error) {
      if (this.isSelectionCurrent(token)) this.setData({ errorMessage: '选择图片失败，请重试' })
    }
  },

  onQualityChange(event) {
    const value = Math.round(Number(event && event.detail && event.detail.value))
    const quality = Number.isFinite(value) ? Math.min(95, Math.max(20, value)) : 80
    this.setData({ quality })
  },

  async compressImage() {
    const source = this.data.source
    if (!source) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }

    const token = this.nextOperation()
    this.setData({ processing: true, resultPath: '', resultSize: 0, resultSizeText: '', errorMessage: '' })
    try {
      const target = fitWithinSide(source.width, source.height, 4096)
      const canvas = await getCanvas(this, '#processor-canvas')
      if (!this.isCurrent(token)) return
      this._canvas = canvas
      const image = await loadCanvasImage(canvas, source.path)
      if (!this.isCurrent(token)) return
      this._image = image
      const prepared = prepareCanvas(canvas, target.width, target.height, 1)
      if (shouldFillWhite(source.format)) {
        prepared.context.fillStyle = '#ffffff'
        prepared.context.fillRect(0, 0, target.width, target.height)
      }
      prepared.context.drawImage(image, 0, 0, target.width, target.height)
      const resultPath = await exportCanvas(canvas, target.width, target.height, source.format, this.data.quality / 100)
      if (!this.isCurrent(token)) return
      if (!resultPath) throw new Error('Canvas export did not return a temporary file')
      const resultSize = await getFileSize(resultPath)
      if (!this.isCurrent(token)) return
      this.setData({
        resultPath,
        resultSize,
        resultSizeText: resultSize > 0 ? formatBytes(resultSize) : '大小暂不可用',
        errorMessage: '',
      })
    } catch (error) {
      if (!this.isCurrent(token)) return
      this.setData({
        resultPath: '',
        resultSize: 0,
        resultSizeText: '',
        errorMessage: isCanvasTooLarge(error) ? '图片尺寸过大，请选择较小的图片' : '处理失败，请重试或更换图片',
      })
    } finally {
      if (this.isCurrent(token)) this.setData({ processing: false })
    }
  },

  async saveResult() {
    if (!this.data.resultPath) {
      wx.showToast({ title: '请先处理图片', icon: 'none' })
      return
    }

    const token = this.nextOperation()
    const resultPath = this.data.resultPath
    try {
      const result = await saveImageToAlbum(resultPath)
      if (!this.isCurrent(token) || !result || !result.saved) return
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      if (!this.isCurrent(token)) return
      const message = String(error && error.message ? error.message : '')
      this.setData({ errorMessage: message === '图片文件无效，请重新处理图片' ? message : '保存失败，请重试' })
    }
  },

  onUnload() {
    this._unloaded = true
    this.nextOperation()
    this.nextSelection()
    this._canvas = null
    this._image = null
  },
})
