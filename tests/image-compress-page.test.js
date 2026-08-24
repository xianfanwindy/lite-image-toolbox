const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
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
    saving: false,
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

test('a changed quality clears a stale compression result', () => {
  const { definition } = loadPage()
  const page = createInstance(definition)
  Object.assign(page.data, {
    quality: 80,
    resultPath: 'old.jpg',
    resultSize: 12,
    resultSizeText: '12 B',
    errorMessage: 'old error',
  })
  page.onQualityChange({ detail: { value: '75' } })
  assert.equal(page.data.quality, 75)
  assert.equal(page.data.resultPath, '')
  assert.equal(page.data.resultSize, 0)
  assert.equal(page.data.resultSizeText, '')
  assert.equal(page.data.errorMessage, '')
})

test('quality stays fixed during compression and export uses the initial snapshot', async () => {
  const canvasReady = createDeferred()
  const exports = []
  const context = { fillRect() {}, drawImage() {} }
  const { definition } = loadPage({
    canvas: {
      getCanvas: () => canvasReady.promise,
      loadCanvasImage: async () => ({}),
      prepareCanvas: () => ({ context }),
      exportCanvas: async (...args) => { exports.push(args); return 'output.jpg' },
      formatBytes: () => '2 KB',
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  const compression = page.compressImage()
  page.onQualityChange({ detail: { value: '40' } })
  assert.equal(page.data.quality, 80)
  page.data.quality = 40
  canvasReady.resolve({})
  await compression
  assert.equal(exports[0][4], 0.8)
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
  const canvas = { id: 'canvas' }
  const context = {
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  }
  const source = { path: 'source.jpg', width: 9000, height: 4500, size: 1000, format: 'jpg' }
  const { definition } = loadPage({
    canvas: {
      getCanvas: async () => canvas,
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
    ['prepare', canvas, 4096, 2048, 1],
    ['fillRect', 0, 0, 4096, 2048],
    ['drawImage', { id: 'image' }, 0, 0, 4096, 2048],
    ['export', canvas, 4096, 2048, 'jpg', 0.8],
  ])
  assert.equal(context.fillStyle, '#ffffff')
  assert.equal(page.data.resultPath, 'output.jpg')
  assert.equal(page.data.resultSizeText, '2048 bytes')
  assert.equal(page.data.processing, false)
})

test('compressImage keeps a PNG transparent and does not pass quality to PNG encoding policy', async () => {
  const calls = []
  const canvas = {}
  const context = { fillRect: () => calls.push('fill'), drawImage: () => calls.push('draw') }
  const { definition } = loadPage({
    canvas: {
      getCanvas: async () => canvas, loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context }),
      exportCanvas: async (...args) => { calls.push(args); return 'output.png' }, formatBytes: () => '1 KB',
    },
    math: { fitWithinSide: () => ({ width: 12, height: 8 }) },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.png', width: 12, height: 8, size: 1, format: 'png' }
  page.data.quality = 35
  await page.compressImage()
  assert.deepEqual(calls, ['draw', [canvas, 12, 8, 'png', 0.35]])
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

test('saveResult accepts one in-flight save and restores saving afterwards', async () => {
  const saveReady = createDeferred()
  let calls = 0
  const { definition, wx } = loadPage({
    save: {
      saveImageToAlbum: () => {
        calls += 1
        return saveReady.promise
      },
    },
  })
  const page = createInstance(definition)
  page.data.resultPath = 'wxfile://output.jpg'
  const first = page.saveResult()
  const second = page.saveResult()
  assert.equal(calls, 1)
  assert.equal(page.data.saving, true)
  saveReady.resolve({ saved: true, cancelled: false })
  await Promise.all([first, second])
  assert.equal(page.data.saving, false)
  assert.deepEqual(wx.toasts, [{ title: '已保存到相册', icon: 'success' }])
})

test('a successful replacement silences a pending save failure', async () => {
  const saveReady = createDeferred()
  const replacement = { path: 'new.png', size: 20, width: 30, height: 40, type: 'png' }
  const { definition, wx } = loadPage({
    picker: { chooseSingleImage: async () => replacement },
    canvas: { formatBytes: (size) => `${size} B` },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
    save: { saveImageToAlbum: () => saveReady.promise },
  })
  const page = createInstance(definition)
  page.data.resultPath = 'old.jpg'
  const saving = page.saveResult()

  await page.chooseImage()
  assert.deepEqual(page.data.source, { ...replacement, format: 'png' })
  assert.equal(page.data.saving, true)
  saveReady.reject(new Error('album unavailable'))
  await saving

  assert.equal(page.data.errorMessage, '')
  assert.equal(page.data.saving, false)
  assert.deepEqual(wx.toasts, [])
})

test('a quality change silences stale save success while preserving the physical mutex', async () => {
  const saves = []
  const paths = []
  const { definition, wx } = loadPage({
    save: {
      saveImageToAlbum: (resultPath) => {
        const deferred = createDeferred()
        paths.push(resultPath)
        saves.push(deferred)
        return deferred.promise
      },
    },
  })
  const page = createInstance(definition)
  page.data.resultPath = 'old.jpg'
  const first = page.saveResult()

  page.onQualityChange({ detail: { value: '75' } })
  page.data.resultPath = 'new.jpg'
  const blocked = page.saveResult()
  assert.deepEqual(paths, ['old.jpg'])
  assert.equal(page.data.saving, true)
  saves[0].resolve({ saved: true, cancelled: false })
  await Promise.all([first, blocked])

  assert.equal(page.data.saving, false)
  assert.deepEqual(wx.toasts, [])
  const second = page.saveResult()
  assert.deepEqual(paths, ['old.jpg', 'new.jpg'])
  saves[1].resolve({ saved: false, cancelled: true })
  await second
  assert.deepEqual(wx.toasts, [])
})

test('starting a new compression silences an older save success', async () => {
  const saveReady = createDeferred()
  const canvasReady = createDeferred()
  const canvas = {}
  const context = { fillRect() {}, drawImage() {} }
  const { definition, wx } = loadPage({
    canvas: {
      getCanvas: () => canvasReady.promise,
      loadCanvasImage: async () => ({}),
      prepareCanvas: () => ({ context }),
      exportCanvas: async () => 'new-output.jpg',
      formatBytes: () => '2 KB',
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
    save: { saveImageToAlbum: () => saveReady.promise },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  page.data.resultPath = 'old-output.jpg'
  const saving = page.saveResult()
  const compression = page.compressImage()

  saveReady.resolve({ saved: true, cancelled: false })
  await saving
  assert.deepEqual(wx.toasts, [])
  canvasReady.resolve(canvas)
  await compression
  assert.equal(page.data.resultPath, 'new-output.jpg')
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

test('unload silences pending save success and failure callbacks', async () => {
  const cases = [
    (saving) => saving.resolve({ saved: true, cancelled: false }),
    (saving) => saving.reject(new Error('late save failure')),
  ]

  for (const settle of cases) {
    const saving = createDeferred()
    const { definition, wx } = loadPage({ save: { saveImageToAlbum: () => saving.promise } })
    const page = createInstance(definition)
    let lateUpdates = 0
    const originalSetData = page.setData
    page.setData = (patch) => {
      if (page._unloaded) lateUpdates += 1
      originalSetData(patch)
    }
    page.data.resultPath = 'output.jpg'
    page.data.errorMessage = 'keep current state'

    const pending = page.saveResult()
    assert.equal(page._saving, true)
    page.onUnload()
    settle(saving)
    await pending

    assert.equal(page._saving, false)
    assert.equal(page.data.errorMessage, 'keep current state')
    assert.equal(lateUpdates, 0)
    assert.deepEqual(wx.toasts, [])
  }
})

test('a cancelled selection does not invalidate an in-flight compression', async () => {
  const canvasReady = createDeferred()
  const context = { fillRect() {}, drawImage() {} }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => null },
    canvas: {
      getCanvas: () => canvasReady.promise,
      loadCanvasImage: async () => ({}),
      prepareCanvas: () => ({ context }),
      exportCanvas: async () => 'output.jpg',
      formatBytes: () => '2 KB',
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  const compression = page.compressImage()
  await page.chooseImage()
  canvasReady.resolve({})
  await compression
  assert.equal(page.data.processing, false)
  assert.equal(page.data.resultPath, 'output.jpg')
})

test('unload prevents late canvas and image references after canvas resolution', async () => {
  const canvasReady = createDeferred()
  const context = { fillRect() {}, drawImage() {} }
  const { definition } = loadPage({
    canvas: {
      getCanvas: () => canvasReady.promise,
      loadCanvasImage: async () => ({ id: 'image' }),
      prepareCanvas: () => ({ context }),
      exportCanvas: async () => 'output.jpg',
      formatBytes: () => '2 KB',
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  let lateSetDataCount = 0
  const setData = page.setData
  page.setData = (patch) => {
    if (page._unloaded) lateSetDataCount += 1
    setData(patch)
  }
  page.data.source = { path: 'source.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  const compression = page.compressImage()
  page.onUnload()
  canvasReady.resolve({ id: 'canvas' })
  await compression
  assert.equal(page._canvas, null)
  assert.equal(page._image, null)
  assert.equal(lateSetDataCount, 0)
})

test('a successful replacement invalidates an older compression result', async () => {
  const canvasReady = createDeferred()
  const replacement = { path: 'new.png', width: 5, height: 6, size: 12, type: 'png' }
  const context = { fillRect() {}, drawImage() {} }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => replacement },
    canvas: {
      getCanvas: () => canvasReady.promise,
      loadCanvasImage: async () => ({}),
      prepareCanvas: () => ({ context }),
      exportCanvas: async () => 'old-output.jpg',
      formatBytes: (size) => `${size} B`,
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'old.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  const compression = page.compressImage()
  await page.chooseImage()
  canvasReady.resolve({})
  await compression
  assert.deepEqual(page.data.source, { ...replacement, format: 'png' })
  assert.equal(page.data.resultPath, '')
  assert.equal(page.data.processing, false)
})

test('a direct duplicate compression is ignored and a successful replacement resets its guard', async () => {
  const canvasReady = createDeferred()
  let canvasCalls = 0
  const replacement = { path: 'new.jpg', width: 5, height: 6, size: 12, type: 'jpg' }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => replacement },
    canvas: { getCanvas: () => { canvasCalls += 1; return canvasReady.promise }, formatBytes: () => '12 B' },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'old.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  const first = page.compressImage()
  const second = page.compressImage()
  assert.equal(canvasCalls, 1)
  await page.chooseImage()
  assert.equal(page.data.processing, false)
  assert.equal(page._compressing, false)
  canvasReady.resolve({})
  await Promise.all([first, second])
})

test('compression releases decoded image and canvas backing storage after success', async () => {
  const canvas = { width: 99, height: 88 }
  const image = { id: 'decoded' }
  const context = { fillRect() {}, drawImage() {} }
  const { definition } = loadPage({
    canvas: {
      getCanvas: async () => canvas,
      loadCanvasImage: async () => image,
      prepareCanvas: () => ({ context }),
      exportCanvas: async () => 'output.jpg',
      formatBytes: () => '2 KB',
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  await page.compressImage()
  assert.equal(page._image, undefined)
  assert.equal(page._canvas, null)
  assert.equal(canvas.width, 1)
  assert.equal(canvas.height, 1)
})

test('a successful replacement releases the currently owned canvas', async () => {
  const canvas = { width: 100, height: 80 }
  const replacement = { path: 'new.jpg', width: 5, height: 6, size: 12, type: 'jpg' }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => replacement },
    canvas: { formatBytes: () => '12 B' },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page._operationId = 4
  page._canvas = canvas
  page._canvasOwnerId = 4
  await page.chooseImage()
  assert.equal(page._canvas, null)
  assert.equal(canvas.width, 1)
  assert.equal(canvas.height, 1)
})

test('an invalidated owner cannot release a canvas reassigned to a newer compression', async () => {
  const oldImageReady = createDeferred()
  const newExportReady = createDeferred()
  const canvas = { width: 1, height: 1 }
  const replacement = { path: 'new.jpg', width: 5, height: 6, size: 12, type: 'jpg' }
  const context = { fillRect() {}, drawImage() {} }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => replacement },
    canvas: {
      getCanvas: async () => canvas,
      loadCanvasImage: (ignoredCanvas, sourcePath) => sourcePath === 'old.jpg' ? oldImageReady.promise : Promise.resolve({}),
      prepareCanvas: () => {
        canvas.width = 64
        canvas.height = 32
        return { context }
      },
      exportCanvas: () => newExportReady.promise,
      formatBytes: () => '2 KB',
    },
    math: { fitWithinSide: () => ({ width: 10, height: 10 }) },
    format: { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'old.jpg', width: 10, height: 10, size: 1, format: 'jpg' }
  const oldCompression = page.compressImage()
  await Promise.resolve()
  await page.chooseImage()
  const newCompression = page.compressImage()
  await Promise.resolve()
  await Promise.resolve()
  oldImageReady.resolve({ id: 'old' })
  await oldCompression
  assert.equal(canvas.width, 64)
  assert.equal(canvas.height, 32)
  newExportReady.resolve('new-output.jpg')
  await newCompression
})

test('canvas errMsg reports the oversized-image recovery message', async () => {
  const { definition } = loadPage({
    canvas: { getCanvas: async () => { throw { errMsg: 'canvasToTempFilePath:fail canvas too large' } } },
  })
  const page = createInstance(definition)
  page.data.source = { path: 'source.jpg', width: 10, height: 10, format: 'jpg' }
  await page.compressImage()
  assert.equal(page.data.errorMessage, '图片尺寸过大，请选择较小的图片')
})

test('compression controls disable quality changes and duplicate saves in WXML', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/image-compress/image-compress.wxml'), 'utf8')
  assert.match(wxml, /<slider[^>]*disabled="\{\{processing\}\}"/)
  assert.match(wxml, /<button class="primary-button save-button"[^>]*loading="\{\{saving\}\}" disabled="\{\{saving\}\}"/)
})
