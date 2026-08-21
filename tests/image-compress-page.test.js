const test = require('node:test')
const assert = require('node:assert/strict')
const { afterEach } = test

const pagePath = require.resolve('../pages/image-compress/image-compress')
const dependencyPaths = {
  picker: require.resolve('../utils/image-picker'),
  canvas: require.resolve('../utils/canvas'),
  math: require.resolve('../utils/image-math'),
  format: require.resolve('../utils/image-format'),
  save: require.resolve('../utils/image-save'),
  ads: require.resolve('../config/ads'),
}

const originalGlobals = { Page: global.Page, wx: global.wx }
const originals = new Map()

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function installModule(path, exports) {
  if (!originals.has(path)) originals.set(path, require.cache[path])
  require.cache[path] = { id: path, filename: path, loaded: true, exports }
}

function createWx(overrides = {}) {
  const toasts = []
  return {
    toasts,
    showToast(options) {
      toasts.push(options)
    },
    getFileSystemManager() {
      return {
        stat({ success }) {
          success({ stats: { size: 2048 } })
        },
      }
    },
    ...overrides,
  }
}

function loadPage(dependencies = {}, wx = createWx()) {
  let definition
  global.Page = (options) => { definition = options }
  global.wx = wx
  installModule(dependencyPaths.picker, dependencies.picker || { chooseSingleImage: async () => null })
  installModule(dependencyPaths.canvas, dependencies.canvas || {})
  installModule(dependencyPaths.math, dependencies.math || { fitWithinSide: () => ({ width: 1, height: 1 }) })
  installModule(dependencyPaths.format, dependencies.format || {
    normalizeImageFormat: () => 'jpg',
    shouldFillWhite: () => true,
  })
  installModule(dependencyPaths.save, dependencies.save || { saveImageToAlbum: async () => ({ saved: false, cancelled: true }) })
  installModule(dependencyPaths.ads, dependencies.ads || { resultBannerUnitId: '' })
  delete require.cache[pagePath]
  require(pagePath)
  return { definition, wx }
}

function createInstance(definition) {
  const instance = { data: clone(definition.data) }
  Object.keys(definition).forEach((key) => {
    if (typeof definition[key] === 'function') instance[key] = definition[key]
  })
  instance.setData = (patch) => Object.assign(instance.data, patch)
  return instance
}

afterEach(() => {
  delete require.cache[pagePath]
  originals.forEach((cached, path) => {
    if (cached) require.cache[path] = cached
    else delete require.cache[path]
  })
  originals.clear()
  global.Page = originalGlobals.Page
  global.wx = originalGlobals.wx
})

test('defaults expose only the local compression UI state', () => {
  const { definition } = loadPage()
  assert.deepEqual(definition.data, {
    source: null,
    quality: 80,
    processing: false,
    resultPath: '',
    resultSize: 0,
    sourceSizeText: '',
    resultSizeText: '',
    errorMessage: '',
    resultBannerUnitId: '',
  })
})

test('chooseImage normalizes a picked image and clears prior output', async () => {
  const picked = { path: 'wxfile://input.png', size: 1024, width: 30, height: 20, type: 'PNG' }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => picked },
    canvas: { formatBytes: (size) => `${size} B` },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  Object.assign(page.data, { resultPath: 'old.jpg', resultSize: 12, resultSizeText: '12 B', errorMessage: 'old error' })
  await page.chooseImage()
  assert.deepEqual(page.data.source, { ...picked, format: 'png' })
  assert.equal(page.data.sourceSizeText, '1024 B')
  assert.equal(page.data.resultPath, '')
  assert.equal(page.data.errorMessage, '')
})

test('chooseImage cancellation leaves the existing state untouched', async () => {
  const { definition } = loadPage({ picker: { chooseSingleImage: async () => null } })
  const page = createInstance(definition)
  page.data.errorMessage = 'keep me'
  const before = clone(page.data)
  await page.chooseImage()
  assert.deepEqual(page.data, before)
})

test('chooseImage reports a recoverable error for a non-cancel failure', async () => {
  const { definition } = loadPage({ picker: { chooseSingleImage: async () => { throw new Error('camera unavailable') } } })
  const page = createInstance(definition)
  await page.chooseImage()
  assert.equal(page.data.errorMessage, '选择图片失败，请重试')
})

test('quality input rounds and clamps within the supported range', () => {
  const { definition } = loadPage()
  const page = createInstance(definition)
  page.onQualityChange({ detail: { value: '96.6' } })
  assert.equal(page.data.quality, 95)
  page.onQualityChange({ detail: { value: '19.2' } })
  assert.equal(page.data.quality, 20)
})

test('compressImage requires a source before touching canvas', async () => {
  let canvasCalled = false
  const { definition, wx } = loadPage({ canvas: { getCanvas: async () => { canvasCalled = true } } })
  const page = createInstance(definition)
  await page.compressImage()
  assert.equal(canvasCalled, false)
  assert.deepEqual(wx.toasts, [{ title: '请先选择图片', icon: 'none' }])
})

test('compressImage renders JPG at pixel ratio one on white and reads output size', async () => {
  const calls = []
  const context = {
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  }
  const source = { path: 'source.jpg', width: 9000, height: 4500, size: 1000, format: 'jpg' }
  const { definition } = loadPage({
    canvas: {
      getCanvas: async () => ({ id: 'canvas' }),
      loadCanvasImage: async () => ({ id: 'image' }),
      prepareCanvas: (canvas, width, height, ratio) => {
        calls.push(['prepare', canvas, width, height, ratio])
        return { context }
      },
      exportCanvas: async (...args) => { calls.push(['export', ...args]); return 'output.jpg' },
      formatBytes: (size) => `${size} bytes`,
    },
    math: { fitWithinSide: (width, height, max) => { calls.push(['fit', width, height, max]); return { width: 4096, height: 2048 } } },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page.data.source = source
  await page.compressImage()
  assert.deepEqual(calls, [
    ['fit', 9000, 4500, 4096],
    ['prepare', { id: 'canvas' }, 4096, 2048, 1],
    ['fillRect', 0, 0, 4096, 2048],
    ['drawImage', { id: 'image' }, 0, 0, 4096, 2048],
    ['export', { id: 'canvas' }, 4096, 2048, 'jpg', 0.8],
  ])
  assert.equal(context.fillStyle, '#ffffff')
  assert.equal(page.data.resultPath, 'output.jpg')
  assert.equal(page.data.resultSizeText, '2048 bytes')
  assert.equal(page.data.processing, false)
})

test('compressImage keeps a PNG transparent and does not pass quality to PNG encoding policy', async () => {
  const calls = []
  const context = { fillRect: () => calls.push('fill'), drawImage: () => calls.push('draw') }
  const { definition } = loadPage({
    canvas: {
      getCanvas: async () => ({}), loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context }),
      exportCanvas: async (...args) => { calls.push(args); return 'output.png' }, formatBytes: () => '1 KB',
    },
    math: { fitWithinSide: () => ({ width: 12, height: 8 }) },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.png', width: 12, height: 8, size: 1, format: 'png' }
  page.data.quality = 35
  await page.compressImage()
  assert.deepEqual(calls, ['draw', [{}, 12, 8, 'png', 0.35]])
})

test('compression failure clears output but preserves source and quality', async () => {
  const { definition } = loadPage({
    canvas: { getCanvas: async () => { throw new RangeError('Canvas backing store is too large') } },
  })
  const page = createInstance(definition)
  const source = { path: 'source.jpg', width: 10, height: 10, format: 'jpg' }
  Object.assign(page.data, { source, quality: 75, resultPath: 'old.jpg', resultSize: 9, resultSizeText: '9 B' })
  await page.compressImage()
  assert.equal(page.data.source, source)
  assert.equal(page.data.quality, 75)
  assert.equal(page.data.resultPath, '')
  assert.equal(page.data.errorMessage, '图片尺寸过大，请选择较小的图片')
  assert.equal(page.data.processing, false)
})

test('saveResult uses the exact result path and only confirms an actual save', async () => {
  const savedPaths = []
  const { definition, wx } = loadPage({
    save: { saveImageToAlbum: async (path) => { savedPaths.push(path); return { saved: true, cancelled: false } } },
  })
  const page = createInstance(definition)
  page.data.resultPath = 'wxfile://output.jpg'
  await page.saveResult()
  assert.deepEqual(savedPaths, ['wxfile://output.jpg'])
  assert.deepEqual(wx.toasts, [{ title: '已保存到相册', icon: 'success' }])
})

test('saveResult cancellation is silent and an unload blocks late updates', async () => {
  let resolvePick
  const { definition, wx } = loadPage({
    picker: { chooseSingleImage: () => new Promise((resolve) => { resolvePick = resolve }) },
    save: { saveImageToAlbum: async () => ({ saved: false, cancelled: true }) },
  })
  const page = createInstance(definition)
  page.data.resultPath = 'output.jpg'
  await page.saveResult()
  assert.deepEqual(wx.toasts, [])
  const pending = page.chooseImage()
  page.onUnload()
  resolvePick({ path: 'late.jpg', width: 1, height: 1, size: 1, type: 'jpg' })
  await pending
  assert.equal(page.data.source, null)
  assert.equal(page.data.resultPath, 'output.jpg')
  assert.equal(page._canvas, null)
  assert.equal(page._image, null)
})
