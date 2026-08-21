const { chooseSingleImage } = require('../../utils/image-picker')
const { getCanvas, loadCanvasImage, prepareCanvas, exportCanvas, formatBytes } = require('../../utils/canvas')
const { getSquareCrop, getNineGridTile } = require('../../utils/image-math')
const { normalizeImageFormat, shouldFillWhite } = require('../../utils/image-format')
const { saveImageToAlbum } = require('../../utils/image-save')
const { resultBannerUnitId } = require('../../config/ads')

const TOTAL_TILES = 9
const MAX_TILE_SIDE = 1024

function progressText(savedCount, resumable) {
  return `已保存 ${savedCount}/${TOTAL_TILES} 张${resumable ? '，可重新点击继续' : ''}`
}

Page({
  data: {
    source: null,
    processing: false,
    saving: false,
    results: [],
    savedCount: 0,
    saveProgressText: '',
    sourceSizeText: '',
    errorMessage: '',
    resultBannerUnitId,
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

  releaseReturnedCanvas(ownerId, canvas) {
    this.releaseCanvas(ownerId, canvas)
    if (canvas && this._canvas !== canvas) {
      canvas.width = 1
      canvas.height = 1
    }
  },

  async chooseImage() {
    if (this.data.processing || this.data.saving || this._saving) return
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
      const oldCanvas = this._canvas
      const oldOwner = this._canvasOwnerId
      this.nextOperation()
      this.nextSave()
      this.releaseCanvas(oldOwner, oldCanvas)
      this._generating = false
      this.setData({
        source,
        processing: false,
        results: [],
        savedCount: 0,
        saveProgressText: '',
        sourceSizeText: formatBytes(source.size),
        errorMessage: '',
      })
    } catch (error) {
      if (this.isSelectionCurrent(token)) this.setData({ errorMessage: '选择图片失败，请重试' })
    }
  },

  async generateGrid() {
    if (this.data.processing || this.data.saving || this._generating || this._saving) return
    const source = this.data.source
    if (!source) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }

    let crop
    let tileSize
    try {
      crop = getSquareCrop(source.width, source.height)
      tileSize = Math.min(Math.floor(crop.size / 3), MAX_TILE_SIDE)
      if (!Number.isFinite(tileSize) || tileSize < 1 || crop.size < 3) throw new RangeError('source is too small')
    } catch (error) {
      this.setData({ results: [], savedCount: 0, saveProgressText: '', errorMessage: '图片尺寸过小，无法切成九宫格' })
      return
    }

    const operationSource = { ...source }
    const format = operationSource.format
    const token = this.nextOperation()
    this._generating = true
    this.setData({ processing: true, results: [], savedCount: 0, saveProgressText: '', errorMessage: '' })
    let canvas
    try {
      canvas = await getCanvas(this, '#processor-canvas')
      if (!this.isCurrent(token)) return
      this._canvas = canvas
      this._canvasOwnerId = token
      const image = await loadCanvasImage(canvas, operationSource.path)
      if (!this.isCurrent(token)) return
      const prepared = prepareCanvas(canvas, tileSize, tileSize, 1)
      const results = []
      for (let index = 0; index < TOTAL_TILES; index += 1) {
        if (!this.isCurrent(token)) return
        const tile = getNineGridTile(crop, index)
        prepared.context.clearRect(0, 0, tileSize, tileSize)
        if (shouldFillWhite(format)) {
          prepared.context.fillStyle = '#ffffff'
          prepared.context.fillRect(0, 0, tileSize, tileSize)
        }
        prepared.context.drawImage(image, tile.x, tile.y, tile.size, tile.size, 0, 0, tileSize, tileSize)
        const resultPath = await exportCanvas(canvas, tileSize, tileSize, format, format === 'jpg' ? 0.92 : undefined)
        if (!this.isCurrent(token)) return
        if (!resultPath) throw new Error('Canvas export did not return a temporary file')
        results.push({ index, path: resultPath })
      }
      if (!this.isCurrent(token)) return
      this.setData({ results, savedCount: 0, saveProgressText: '', errorMessage: '' })
    } catch (error) {
      if (this.isCurrent(token)) this.setData({ results: [], savedCount: 0, saveProgressText: '', errorMessage: '处理失败，请重试或更换图片' })
    } finally {
      this.releaseReturnedCanvas(token, canvas)
      if (this.isCurrent(token)) {
        this._generating = false
        this.setData({ processing: false })
      }
    }
  },

  async saveAll() {
    if (this._saving || this.data.saving) return
    if (!Array.isArray(this.data.results) || this.data.results.length !== TOTAL_TILES) {
      wx.showToast({ title: '请先生成九宫格图片', icon: 'none' })
      return
    }

    const results = this.data.results.slice()
    const start = Math.min(TOTAL_TILES, Math.max(0, Number.isInteger(this.data.savedCount) ? this.data.savedCount : 0))
    if (start === TOTAL_TILES) return
    const token = this.nextSave()
    const requestId = (this._saveRequestId || 0) + 1
    this._saveRequestId = requestId
    this._activeSaveId = requestId
    this._saving = true
    this.setData({ saving: true, errorMessage: '' })
    try {
      for (let index = start; index < TOTAL_TILES; index += 1) {
        const result = await saveImageToAlbum(results[index].path)
        if (!this.isSaveCurrent(token)) return
        if (!result || !result.saved) {
          this.setData({ saveProgressText: progressText(index, true) })
          return
        }
        const savedCount = index + 1
        this.setData({ savedCount, saveProgressText: progressText(savedCount, false), errorMessage: '' })
      }
      if (this.isSaveCurrent(token)) wx.showToast({ title: '9 张图片已按顺序保存', icon: 'success' })
    } catch (error) {
      if (this.isSaveCurrent(token)) {
        if (String(error).includes('图片文件无效，请重新处理图片')) {
          this.setData({ results: [], savedCount: 0, saveProgressText: '', errorMessage: '图片已失效，请重新生成九宫格' })
        } else {
          const savedCount = Math.min(TOTAL_TILES, Math.max(0, this.data.savedCount))
          this.setData({ saveProgressText: progressText(savedCount, true), errorMessage: '保存失败，请重试' })
        }
      }
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
    this._generating = false
    this._saving = false
    this._activeSaveId = null
    this.releaseCanvas(ownerId, canvas)
    this._canvas = null
    this._canvasOwnerId = null
  },
})
