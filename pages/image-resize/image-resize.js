const { chooseSingleImage } = require('../../utils/image-picker')
const { getCanvas, loadCanvasImage, prepareCanvas, exportCanvas, formatBytes } = require('../../utils/canvas')
const { resizeByPercent, resolveLockedSize } = require('../../utils/image-math')
const { normalizeImageFormat, shouldFillWhite } = require('../../utils/image-format')
const { saveImageToAlbum } = require('../../utils/image-save')
const { resultBannerUnitId } = require('../../config/ads')

const MAX_SIDE = 4096
const INVALID_SIZE_MESSAGE = '宽高必须是 1–4096 的整数'

function getFileSize(path) {
  return new Promise((resolve) => {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!manager || typeof manager.stat !== 'function') {
      resolve(0)
      return
    }
    manager.stat({
      path,
      success(result) { resolve(Number(result && result.stats && result.stats.size) || 0) },
      fail() { resolve(0) },
    })
  })
}

function isCanvasTooLarge(error) {
  const message = String(error && (error.message || error.errMsg) ? error.message || error.errMsg : error)
  return error instanceof RangeError || /canvas.*(?:large|dimension|pixel)/i.test(message)
}

function asInteger(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SIDE ? value : 0
}

function targetText(width, height) {
  return asInteger(width) && asInteger(height) ? `${width} × ${height}` : ''
}

function clearResult(page) {
  page.nextSave()
  page.setData({ resultPath: '', resultSize: 0, resultSizeText: '', errorMessage: '' })
}

function getTarget(source, mode, customWidth, customHeight) {
  if (!source) return null
  if (mode === 'original') return { width: source.width, height: source.height }
  if (mode === 'half') return resizeByPercent(source.width, source.height, 50)
  if (mode === 'custom') return { width: Number(customWidth), height: Number(customHeight) }
  return null
}

function validTarget(target) {
  return target && asInteger(target.width) && asInteger(target.height)
}

Page({
  data: {
    source: null,
    mode: 'original',
    customWidth: '',
    customHeight: '',
    lockAspectRatio: true,
    targetSizeText: '',
    processing: false,
    saving: false,
    resultPath: '',
    resultSize: 0,
    resultSizeText: '',
    sourceSizeText: '',
    errorMessage: '',
    resultBannerUnitId,
  },

  isCurrent(token) {
    return !this._unloaded && this._operationId === token
  },

  isSelectionCurrent(token) {
    return !this._unloaded && this._selectionId === token
  },

  isSaveCurrent(token) {
    return !this._unloaded && this._saveId === token
  },

  nextOperation() {
    this._operationId = (this._operationId || 0) + 1
    return this._operationId
  },

  nextSelection() {
    this._selectionId = (this._selectionId || 0) + 1
    return this._selectionId
  },

  nextSave() {
    this._saveId = (this._saveId || 0) + 1
    return this._saveId
  },

  releaseCanvas(ownerId, canvas) {
    if (!canvas || this._canvasOwnerId !== ownerId || this._canvas !== canvas) return
    canvas.width = 1
    canvas.height = 1
    this._canvas = null
    this._canvasOwnerId = null
  },

  async chooseImage() {
    const token = this.nextSelection()
    try {
      const picked = await chooseSingleImage()
      if (!picked || !this.isSelectionCurrent(token)) return
      const source = {
        ...picked,
        width: Math.round(Number(picked.width)),
        height: Math.round(Number(picked.height)),
        format: normalizeImageFormat(picked.type, picked.path),
      }
      const previousCanvas = this._canvas
      const previousOwnerId = this._canvasOwnerId
      this.nextOperation()
      this.nextSave()
      this.releaseCanvas(previousOwnerId, previousCanvas)
      this._resizing = false
      this.setData({
        source,
        mode: 'original',
        customWidth: String(source.width),
        customHeight: String(source.height),
        lockAspectRatio: true,
        targetSizeText: targetText(source.width, source.height),
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

  selectMode(event) {
    if (this.data.processing) return
    const mode = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.mode
    if (!['original', 'half', 'custom'].includes(mode) || mode === this.data.mode) return
    const target = getTarget(this.data.source, mode, this.data.customWidth, this.data.customHeight)
    clearResult(this)
    this.setData({ mode, targetSizeText: validTarget(target) ? targetText(target.width, target.height) : '' })
  },

  onWidthInput(event) {
    this.updateCustomSize('width', event && event.detail && event.detail.value)
  },

  onHeightInput(event) {
    this.updateCustomSize('height', event && event.detail && event.detail.value)
  },

  updateCustomSize(changed, rawValue) {
    if (this.data.processing) return
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue)
    let customWidth = this.data.customWidth
    let customHeight = this.data.customHeight
    const numeric = Number(value)
    if (this.data.lockAspectRatio && this.data.source && Number.isFinite(numeric) && numeric > 0) {
      try {
        const size = resolveLockedSize(this.data.source.width, this.data.source.height, changed, numeric)
        customWidth = String(size.width)
        customHeight = String(size.height)
      } catch (error) {
        if (changed === 'width') customWidth = value
        else customHeight = value
      }
    } else if (changed === 'width') {
      customWidth = value
    } else {
      customHeight = value
    }
    const target = getTarget(this.data.source, 'custom', customWidth, customHeight)
    clearResult(this)
    this.setData({ customWidth, customHeight, targetSizeText: validTarget(target) ? targetText(target.width, target.height) : '' })
  },

  onLockChange(event) {
    if (this.data.processing) return
    const lockAspectRatio = Boolean(event && event.detail && event.detail.value)
    let customWidth = this.data.customWidth
    let customHeight = this.data.customHeight
    if (lockAspectRatio && this.data.mode === 'custom' && this.data.source) {
      const width = asInteger(Number(customWidth))
      const height = asInteger(Number(customHeight))
      try {
        const size = width
          ? resolveLockedSize(this.data.source.width, this.data.source.height, 'width', width)
          : height
            ? resolveLockedSize(this.data.source.width, this.data.source.height, 'height', height)
            : null
        if (size) {
          customWidth = String(size.width)
          customHeight = String(size.height)
        }
      } catch (error) {
        // 保留用户输入，让尺寸校验提示具体问题。
      }
    }
    const target = getTarget(this.data.source, 'custom', customWidth, customHeight)
    clearResult(this)
    this.setData({
      lockAspectRatio,
      customWidth,
      customHeight,
      targetSizeText: validTarget(target) ? targetText(target.width, target.height) : '',
    })
  },

  async resizeImage() {
    const source = this.data.source
    if (!source) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }
    if (this._resizing) return

    let target
    try {
      target = getTarget(source, this.data.mode, this.data.customWidth, this.data.customHeight)
    } catch (error) {
      target = null
    }
    if (!validTarget(target)) {
      const message = this.data.mode === 'custom'
        ? INVALID_SIZE_MESSAGE
        : `${INVALID_SIZE_MESSAGE}，请选择 50% 或自定义更小尺寸`
      this.setData({ errorMessage: message, targetSizeText: '' })
      return
    }

    const operationSource = { ...source }
    const operationTarget = { width: target.width, height: target.height }
    const format = operationSource.format
    const token = this.nextOperation()
    this._resizing = true
    clearResult(this)
    this.setData({ processing: true, targetSizeText: targetText(operationTarget.width, operationTarget.height) })
    let canvas
    try {
      canvas = await getCanvas(this, '#processor-canvas')
      if (!this.isCurrent(token)) {
        const ownedByAnotherOperation = this._canvas === canvas
          && this._canvasOwnerId
          && this._canvasOwnerId !== token
        if (!ownedByAnotherOperation && canvas) {
          canvas.width = 1
          canvas.height = 1
        }
        return
      }
      this._canvas = canvas
      this._canvasOwnerId = token
      const image = await loadCanvasImage(canvas, operationSource.path)
      if (!this.isCurrent(token)) return
      const prepared = prepareCanvas(canvas, operationTarget.width, operationTarget.height, 1)
      if (shouldFillWhite(format)) {
        prepared.context.fillStyle = '#ffffff'
        prepared.context.fillRect(0, 0, operationTarget.width, operationTarget.height)
      }
      prepared.context.drawImage(image, 0, 0, operationTarget.width, operationTarget.height)
      const resultPath = await exportCanvas(
        canvas,
        operationTarget.width,
        operationTarget.height,
        format,
        format === 'jpg' ? 0.92 : undefined,
      )
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
        errorMessage: isCanvasTooLarge(error) ? '图片尺寸过大，请选择 50% 或自定义更小尺寸' : '处理失败，请重试或更换图片',
      })
    } finally {
      this.releaseCanvas(token, canvas)
      if (this.isCurrent(token)) {
        this._resizing = false
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
    this._resizing = false
    this._saving = false
    this._activeSaveId = null
    this.releaseCanvas(ownerId, canvas)
    this._canvas = null
    this._canvasOwnerId = null
  },
})
