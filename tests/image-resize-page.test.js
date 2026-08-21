const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { afterEach } = test

const pagePath = require.resolve('../pages/image-resize/image-resize')
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

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function createDeferred() {
  let resolve
  const promise = new Promise((next) => { resolve = next })
  return { promise, resolve }
}
function installModule(modulePath, exports) {
  if (!originals.has(modulePath)) originals.set(modulePath, require.cache[modulePath])
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports }
}
function createWx(overrides = {}) {
  const toasts = []
  return {
    toasts,
    showToast(options) { toasts.push(options) },
    getFileSystemManager() { return { stat({ success }) { success({ stats: { size: 2048 } }) } } },
    ...overrides,
  }
}
function loadPage(dependencies = {}, wx = createWx()) {
  let definition
  global.Page = (options) => { definition = options }
  global.wx = wx
  installModule(dependencyPaths.picker, dependencies.picker || { chooseSingleImage: async () => null })
  installModule(dependencyPaths.canvas, dependencies.canvas || {})
  installModule(dependencyPaths.math, dependencies.math || {
    resizeByPercent: () => ({ width: 1, height: 1 }),
    resolveLockedSize: () => ({ width: 1, height: 1 }),
  })
  installModule(dependencyPaths.format, dependencies.format || {
    normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true,
  })
  installModule(dependencyPaths.save, dependencies.save || { saveImageToAlbum: async () => ({ saved: false, cancelled: true }) })
  installModule(dependencyPaths.ads, dependencies.ads || { resultBannerUnitId: '' })
  delete require.cache[pagePath]
  require(pagePath)
  return { definition, wx }
}
function createInstance(definition) {
  const instance = { data: clone(definition.data) }
  Object.keys(definition).forEach((key) => { if (typeof definition[key] === 'function') instance[key] = definition[key] })
  instance.setData = (patch) => Object.assign(instance.data, patch)
  return instance
}
function setSource(page, source = { path: 'source.jpg', width: 400, height: 300, size: 100, format: 'jpg' }) {
  page.data.source = source
  page.data.customWidth = String(source.width)
  page.data.customHeight = String(source.height)
  return source
}
afterEach(() => {
  delete require.cache[pagePath]
  originals.forEach((cached, modulePath) => { if (cached) require.cache[modulePath] = cached; else delete require.cache[modulePath] })
  originals.clear()
  global.Page = originalGlobals.Page
  global.wx = originalGlobals.wx
})

test('defaults expose only the local resize UI state and public handlers', () => {
  const { definition } = loadPage()
  assert.deepEqual(definition.data, {
    source: null, mode: 'original', customWidth: '', customHeight: '', lockAspectRatio: true,
    targetSizeText: '', processing: false, saving: false, resultPath: '', resultSize: 0, resultSizeText: '',
    sourceSizeText: '', errorMessage: '', resultBannerUnitId: '',
  })
  ;['chooseImage', 'selectMode', 'onWidthInput', 'onHeightInput', 'onLockChange', 'resizeImage', 'saveResult', 'onUnload'].forEach((name) => assert.equal(typeof definition[name], 'function'))
})

test('chooseImage normalizes input, resets resize state, and cancellation is unchanged', async () => {
  const picked = { path: 'picked.png', width: 33.7, height: 20.2, size: 1024, type: 'PNG' }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => picked }, canvas: { formatBytes: () => '1 KB' },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  Object.assign(page.data, { mode: 'custom', customWidth: '9', customHeight: '8', resultPath: 'old.jpg', errorMessage: 'old' })
  await page.chooseImage()
  assert.deepEqual(page.data.source, { ...picked, width: 34, height: 20, format: 'png' })
  assert.equal(page.data.mode, 'original')
  assert.equal(page.data.customWidth, '34')
  assert.equal(page.data.customHeight, '20')
  assert.equal(page.data.lockAspectRatio, true)
  assert.equal(page.data.resultPath, '')
  const before = clone(page.data)
  const { definition: cancelled } = loadPage({ picker: { chooseSingleImage: async () => null } })
  const cancelledPage = createInstance(cancelled)
  Object.assign(cancelledPage.data, before)
  await cancelledPage.chooseImage()
  assert.deepEqual(cancelledPage.data, before)
})

test('selection failures remain recoverable and modes/inputs invalidate stale output', async () => {
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => { throw new Error('no camera') } },
    math: {
      resizeByPercent: () => ({ width: 1, height: 1 }),
      resolveLockedSize: (width, height, changed, value) => changed === 'width'
        ? { width: Number(value), height: Math.round(Number(value) * height / width) }
        : { width: Math.round(Number(value) * width / height), height: Number(value) },
    },
  })
  const page = createInstance(definition)
  await page.chooseImage()
  assert.equal(page.data.errorMessage, '选择图片失败，请重试')
  setSource(page)
  page.data.resultPath = 'old.jpg'
  page.selectMode({ currentTarget: { dataset: { mode: 'half' } } })
  assert.equal(page.data.mode, 'half')
  assert.equal(page.data.resultPath, '')
  page.data.resultPath = 'old.jpg'
  page.selectMode({ currentTarget: { dataset: { mode: 'custom' } } })
  page.onWidthInput({ detail: { value: '200' } })
  assert.equal(page.data.customWidth, '200')
  assert.equal(page.data.customHeight, '150')
  assert.equal(page.data.resultPath, '')
  page.onLockChange({ detail: { value: false } })
  page.onHeightInput({ detail: { value: '111' } })
  assert.equal(page.data.customWidth, '200')
  assert.equal(page.data.customHeight, '111')
  page.data.processing = true
  page.selectMode({ currentTarget: { dataset: { mode: 'original' } } })
  page.onWidthInput({ detail: { value: '100' } })
  assert.equal(page.data.mode, 'custom')
  assert.equal(page.data.customWidth, '200')
})

test('resizeImage uses 50 percent target and JPG full-frame white export', async () => {
  const calls = []
  const canvas = { width: 5, height: 5 }
  const context = { fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) }
  const { definition } = loadPage({
    canvas: { getCanvas: async () => canvas, loadCanvasImage: async () => ({ id: 'image' }), prepareCanvas: (c, w, h, dpr) => { calls.push(['prepare', c, w, h, dpr]); return { context } }, exportCanvas: async (...args) => { calls.push(['export', ...args]); return 'half.jpg' }, formatBytes: () => '2 KB' },
    math: { resizeByPercent: (w, h, percent) => { calls.push(['half', w, h, percent]); return { width: 200, height: 150 } }, resolveLockedSize: () => ({ width: 1, height: 1 }) },
  })
  const page = createInstance(definition)
  setSource(page)
  page.selectMode({ currentTarget: { dataset: { mode: 'half' } } })
  calls.length = 0
  await page.resizeImage()
  assert.deepEqual(calls, [
    ['half', 400, 300, 50], ['prepare', canvas, 200, 150, 1], ['fill', 0, 0, 200, 150],
    ['draw', { id: 'image' }, 0, 0, 200, 150], ['export', canvas, 200, 150, 'jpg', 0.92],
  ])
  assert.equal(context.fillStyle, '#ffffff')
  assert.equal(page.data.resultPath, 'half.jpg')
  assert.equal(canvas.width, 1)
  assert.equal(canvas.height, 1)
})

test('PNG stays transparent, draws the full target, and export omits quality', async () => {
  const calls = []
  const canvas = { width: 9, height: 9 }
  const context = {
    fillRect: (...args) => calls.push(['fill', ...args]),
    drawImage: (...args) => calls.push(['draw', ...args]),
  }
  const { definition } = loadPage({
    canvas: {
      getCanvas: async () => canvas,
      loadCanvasImage: async () => ({ id: 'png-image' }),
      prepareCanvas: (ignoredCanvas, width, height, ratio) => { calls.push(['prepare', width, height, ratio]); return { context } },
      exportCanvas: async (...args) => { calls.push(['export', ...args]); return 'output.png' },
      formatBytes: () => '2 KB',
    },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  setSource(page, { path: 'source.png', width: 20, height: 10, format: 'png' })
  await page.resizeImage()
  assert.deepEqual(calls, [
    ['prepare', 20, 10, 1],
    ['draw', { id: 'png-image' }, 0, 0, 20, 10],
    ['export', canvas, 20, 10, 'png', undefined],
  ])
  assert.equal(page.data.resultPath, 'output.png')
})

test('stale operations, result changes, and unloaded pages cannot update state', async () => {
  const canvasReady = createDeferred()
  const { definition } = loadPage({
    canvas: { getCanvas: () => canvasReady.promise, loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context: { fillRect() {}, drawImage() {} } }), exportCanvas: async () => 'late.jpg', formatBytes: () => '2 KB' },
    math: { resizeByPercent: () => ({ width: 200, height: 150 }), resolveLockedSize: () => ({ width: 1, height: 1 }) },
  })
  const page = createInstance(definition)
  let lateSetDataCount = 0
  const setData = page.setData
  page.setData = (patch) => {
    if (page._unloaded) lateSetDataCount += 1
    setData(patch)
  }
  const returnedCanvas = { width: 9, height: 9 }
  setSource(page)
  const pending = page.resizeImage()
  page.selectMode({ currentTarget: { dataset: { mode: 'half' } } })
  page.onUnload()
  canvasReady.resolve(returnedCanvas)
  await pending
  assert.equal(page.data.resultPath, '')
  assert.equal(page.data.processing, true)
  assert.equal(page._canvas || null, null)
  assert.equal(page._canvasOwnerId || null, null)
  assert.equal(returnedCanvas.width, 1)
  assert.equal(returnedCanvas.height, 1)
  assert.equal(lateSetDataCount, 0)
})

test('a successful replacement releases an ownerless stale returned canvas', async () => {
  const canvasReady = createDeferred()
  const replacement = { path: 'new.png', width: 30, height: 20, size: 12, type: 'png' }
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => replacement },
    canvas: { getCanvas: () => canvasReady.promise, formatBytes: (size) => `${size} B` },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  setSource(page, { path: 'old.jpg', width: 40, height: 30, size: 1, format: 'jpg' })
  const resizing = page.resizeImage()
  await page.chooseImage()
  const oldCanvas = { width: 9, height: 9 }
  canvasReady.resolve(oldCanvas)
  await resizing
  assert.deepEqual(page.data.source, { ...replacement, format: 'png' })
  assert.equal(page.data.resultPath, '')
  assert.equal(page._canvas || null, null)
  assert.equal(page._canvasOwnerId || null, null)
  assert.equal(oldCanvas.width, 1)
  assert.equal(oldCanvas.height, 1)
})

test('a stale returned canvas does not release a newer owner of the same canvas', async () => {
  const canvasReady = createDeferred()
  const sharedCanvas = { width: 9, height: 9 }
  const { definition } = loadPage({ canvas: { getCanvas: () => canvasReady.promise } })
  const page = createInstance(definition)
  setSource(page)
  const oldResize = page.resizeImage()
  const newerOwnerId = page.nextOperation()
  page._canvas = sharedCanvas
  page._canvasOwnerId = newerOwnerId
  canvasReady.resolve(sharedCanvas)
  await oldResize
  assert.equal(sharedCanvas.width, 9)
  assert.equal(sharedCanvas.height, 9)
  assert.equal(page._canvas, sharedCanvas)
  assert.equal(page._canvasOwnerId, newerOwnerId)
})

test('saveResult uses exact result once, cancellation is silent, and invalid results are cleared by changes', async () => {
  const saving = createDeferred()
  const paths = []
  const { definition, wx } = loadPage({ save: { saveImageToAlbum: (filePath) => { paths.push(filePath); return saving.promise } } })
  const page = createInstance(definition)
  setSource(page)
  page.data.resultPath = 'output.jpg'
  const first = page.saveResult()
  const second = page.saveResult()
  assert.deepEqual(paths, ['output.jpg'])
  saving.resolve({ saved: true, cancelled: false })
  await Promise.all([first, second])
  assert.deepEqual(wx.toasts, [{ title: '已保存到相册', icon: 'success' }])
  page.data.resultPath = 'old.jpg'
  page.onWidthInput({ detail: { value: '200' } })
  assert.equal(page.data.resultPath, '')
})

test('resize WXML exposes local controls and no unsupported modes', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/image-resize/image-resize.wxml'), 'utf8')
  assert.match(wxml, /关闭比例锁后图片可能变形/)
  assert.match(wxml, /id="processor-canvas" type="2d"/)
  assert.match(wxml, /disabled="\{\{processing\}\}"/)
  assert.match(wxml, /loading="\{\{saving\}\}" disabled="\{\{saving\}\}"/)
  assert.doesNotMatch(wxml, /passport|template|cover|contain|stretch|upload/i)
  assert.ok(wxml.indexOf('wx:if="{{errorMessage}}"') < wxml.indexOf('class="primary-button process-button"'))
})
