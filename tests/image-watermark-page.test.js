const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { afterEach } = test

const pagePath = require.resolve('../pages/image-watermark/image-watermark')
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
  let reject
  const promise = new Promise((next, fail) => { resolve = next; reject = fail })
  return { promise, resolve, reject }
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
    fitWithinSide: () => ({ width: 1, height: 1 }),
    getWatermarkPoint: () => ({ x: 1, y: 1, textAlign: 'left', textBaseline: 'top' }),
    opacityPercentToAlpha: () => 0.7,
  })
  installModule(dependencyPaths.format, dependencies.format || { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true })
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
function setSource(page, source = { path: 'source.jpg', width: 1000, height: 800, size: 100, format: 'jpg' }) {
  page.data.source = source
  return source
}
afterEach(() => {
  delete require.cache[pagePath]
  originals.forEach((cached, modulePath) => { if (cached) require.cache[modulePath] = cached; else delete require.cache[modulePath] })
  originals.clear()
  global.Page = originalGlobals.Page
  global.wx = originalGlobals.wx
})

test('defaults expose only fixed local text-watermark state and handlers', () => {
  const { definition } = loadPage()
  assert.deepEqual(definition.data, {
    source: null, watermarkText: '', color: '#ffffff', position: 'bottom-right', opacity: 70,
    processing: false, saving: false, resultPath: '', resultSize: 0, resultSizeText: '', sourceSizeText: '',
    warningMessage: '', errorMessage: '', resultBannerUnitId: '',
  })
  ;['chooseImage', 'onTextInput', 'selectColor', 'selectPosition', 'onOpacityChange', 'applyWatermark', 'saveResult', 'onUnload'].forEach((name) => assert.equal(typeof definition[name], 'function'))
})

test('choose, cancellation, and selection error handle source and stale output correctly', async () => {
  const picked = { path: 'picked.png', width: 33, height: 20, size: 1024, type: 'PNG' }
  const { definition } = loadPage({ picker: { chooseSingleImage: async () => picked }, canvas: { formatBytes: () => '1 KB' }, format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false } })
  const page = createInstance(definition)
  Object.assign(page.data, { resultPath: 'old.jpg', resultSize: 12, resultSizeText: '12 B', errorMessage: 'old' })
  await page.chooseImage()
  assert.deepEqual(page.data.source, { ...picked, format: 'png' })
  assert.equal(page.data.sourceSizeText, '1 KB')
  assert.equal(page.data.resultPath, '')
  const before = clone(page.data)
  const { definition: cancelled } = loadPage({ picker: { chooseSingleImage: async () => null } })
  const cancelledPage = createInstance(cancelled)
  Object.assign(cancelledPage.data, before)
  await cancelledPage.chooseImage()
  assert.deepEqual(cancelledPage.data, before)
  const { definition: failed } = loadPage({ picker: { chooseSingleImage: async () => { throw new Error('camera') } } })
  const failedPage = createInstance(failed)
  await failedPage.chooseImage()
  assert.equal(failedPage.data.errorMessage, '选择图片失败，请重试')
})

test('parameter handlers normalize values, retain at most 30 Unicode code points, invalidate output, and stop while busy', () => {
  const { definition } = loadPage()
  const page = createInstance(definition)
  page.data.resultPath = 'old.jpg'
  page.onTextInput({ detail: { value: '😀'.repeat(31) } })
  assert.equal(Array.from(page.data.watermarkText).length, 30)
  assert.equal(page.data.resultPath, '')
  page.data.resultPath = 'old.jpg'
  page.selectColor({ currentTarget: { dataset: { color: '#000000' } } })
  assert.equal(page.data.color, '#000000')
  page.selectColor({ currentTarget: { dataset: { color: '#123456' } } })
  assert.equal(page.data.color, '#000000')
  page.selectPosition({ currentTarget: { dataset: { position: 'top-right' } } })
  assert.equal(page.data.position, 'top-right')
  page.selectPosition({ currentTarget: { dataset: { position: 'repeat' } } })
  assert.equal(page.data.position, 'top-right')
  page.onOpacityChange({ detail: { value: '17.6' } })
  assert.equal(page.data.opacity, 20)
  page.onOpacityChange({ detail: { value: '100.6' } })
  assert.equal(page.data.opacity, 100)
  page.data.processing = true
  const before = clone(page.data)
  page.onTextInput({ detail: { value: 'later' } })
  page.selectColor({ currentTarget: { dataset: { color: '#ffffff' } } })
  page.selectPosition({ currentTarget: { dataset: { position: 'center' } } })
  page.onOpacityChange({ detail: { value: '50' } })
  assert.deepEqual(page.data, before)
})

test('applyWatermark requires source and nonblank trimmed text before canvas access', async () => {
  let canvasCalled = false
  const { definition, wx } = loadPage({ canvas: { getCanvas: async () => { canvasCalled = true } } })
  const page = createInstance(definition)
  await page.applyWatermark()
  assert.equal(canvasCalled, false)
  assert.deepEqual(wx.toasts, [{ title: '请先选择图片', icon: 'none' }])
  setSource(page)
  page.data.watermarkText = '   '
  await page.applyWatermark()
  assert.equal(canvasCalled, false)
  assert.equal(page.data.errorMessage, '请输入水印文字')
})

test('choose and apply are ignored while processing, and oversized canvas errMsg gets recovery guidance', async () => {
  let picks = 0
  const { definition } = loadPage({
    picker: { chooseSingleImage: async () => { picks += 1; return null } },
    canvas: { getCanvas: async () => { throw { errMsg: 'canvasToTempFilePath:fail canvas too large' } } },
  })
  const page = createInstance(definition)
  page.data.processing = true
  await page.chooseImage()
  await page.applyWatermark()
  assert.equal(picks, 0)
  page.data.processing = false
  setSource(page)
  page.data.watermarkText = 'x'
  await page.applyWatermark()
  assert.equal(page.data.errorMessage, '图片尺寸过大，请选择较小的图片')
})

test('JPG renders a fitted white image and fixed text-watermark snapshot at DPR one', async () => {
  const calls = []
  const canvas = { width: 9, height: 9 }
  const context = {
    measureText(text) { calls.push(['measure', text]); return { width: 150 } },
    fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args]),
    fillText: (...args) => calls.push(['text', ...args]),
  }
  const { definition } = loadPage({
    canvas: { getCanvas: async () => canvas, loadCanvasImage: async () => ({ id: 'image' }), prepareCanvas: (c, w, h, ratio) => { calls.push(['prepare', c, w, h, ratio]); return { context } }, exportCanvas: async (...args) => { calls.push(['export', ...args]); return 'out.jpg' }, formatBytes: () => '2 KB' },
    math: { fitWithinSide: (w, h, max) => { calls.push(['fit', w, h, max]); return { width: 1000, height: 800 } }, opacityPercentToAlpha: (value) => { calls.push(['alpha', value]); return value / 100 }, getWatermarkPoint: (options) => { calls.push(['point', options]); return { x: 968, y: 768, textAlign: 'right', textBaseline: 'bottom' } } },
  })
  const page = createInstance(definition)
  setSource(page)
  page.data.watermarkText = ' Hello '
  await page.applyWatermark()
  assert.deepEqual(calls, [
    ['fit', 1000, 800, 4096], ['prepare', canvas, 1000, 800, 1], ['fill', 0, 0, 1000, 800], ['draw', { id: 'image' }, 0, 0, 1000, 800],
    ['measure', 'Hello'], ['point', { width: 1000, height: 800, textWidth: 150, lineHeight: 44, padding: 35, position: 'bottom-right' }], ['alpha', 70], ['text', 'Hello', 968, 768], ['export', canvas, 1000, 800, 'jpg', 0.92],
  ])
  assert.equal(context.font, '44px sans-serif')
  assert.equal(context.fillStyle, '#ffffff')
  assert.equal(context.textAlign, 'right')
  assert.equal(context.textBaseline, 'bottom')
  assert.equal(context.globalAlpha, 1)
  assert.equal(page.data.resultPath, 'out.jpg')
  assert.equal(canvas.width, 1)
})

test('PNG remains transparent and exports without JPG quality', async () => {
  const calls = []
  const context = { measureText: () => ({ width: 40 }), fillRect: () => calls.push('fill'), drawImage: () => calls.push('draw'), fillText: () => calls.push('text') }
  const canvas = {}
  const { definition } = loadPage({
    canvas: { getCanvas: async () => canvas, loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context }), exportCanvas: async (...args) => { calls.push(args); return 'out.png' }, formatBytes: () => '2 KB' },
    math: { fitWithinSide: () => ({ width: 20, height: 10 }), opacityPercentToAlpha: () => 0.7, getWatermarkPoint: () => ({ x: 1, y: 1, textAlign: 'left', textBaseline: 'top' }) },
    format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false },
  })
  const page = createInstance(definition)
  setSource(page, { path: 'source.png', width: 20, height: 10, format: 'png' })
  page.data.watermarkText = 'P'
  await page.applyWatermark()
  assert.deepEqual(calls, ['draw', 'text', [canvas, 20, 10, 'png', undefined]])
})

test('long text shrinks then truncates by Unicode point before export while retaining its input', async () => {
  const calls = []
  const context = { measureText(text) { return { width: Array.from(text).length * 30 } }, fillRect() {}, drawImage() {}, fillText: (...args) => calls.push(args) }
  const { definition, wx } = loadPage({
    canvas: { getCanvas: async () => ({}), loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context }), exportCanvas: async () => 'out.jpg', formatBytes: () => '2 KB' },
    math: { fitWithinSide: () => ({ width: 100, height: 100 }), opacityPercentToAlpha: () => 0.7, getWatermarkPoint: () => ({ x: 16, y: 16, textAlign: 'left', textBaseline: 'top' }) },
  })
  const page = createInstance(definition)
  setSource(page, { path: 'source.jpg', width: 100, height: 100, format: 'jpg' })
  page.data.watermarkText = '😀😀😀😀😀😀😀😀😀😀'
  await page.applyWatermark()
  assert.equal(page.data.watermarkText, '😀😀😀😀😀😀😀😀😀😀')
  assert.equal(page.data.warningMessage, '文字过长，已自动截断')
  assert.deepEqual(wx.toasts, [{ title: '文字过长，已自动截断', icon: 'none' }])
  assert.equal(calls.length, 1)
  assert.match(calls[0][0], /…$/)
  assert.doesNotMatch(calls[0][0], /\ud83d(?!\ude00)/)
})

test('stale or unloaded work cannot update state and releases only its canvas ownership', async () => {
  const canvasReady = createDeferred()
  const { definition } = loadPage({ canvas: { getCanvas: () => canvasReady.promise } })
  const page = createInstance(definition)
  let lateUpdates = 0
  const originalSetData = page.setData
  page.setData = (patch) => { if (page._unloaded) lateUpdates += 1; originalSetData(patch) }
  setSource(page)
  page.data.watermarkText = 'x'
  const applying = page.applyWatermark()
  page.onUnload()
  const returnedCanvas = { width: 9, height: 9 }
  canvasReady.resolve(returnedCanvas)
  await applying
  assert.equal(lateUpdates, 0)
  assert.equal(returnedCanvas.width, 1)
  const shared = { width: 9, height: 9 }
  const waiting = createDeferred()
  const { definition: second } = loadPage({ canvas: { getCanvas: () => waiting.promise } })
  const secondPage = createInstance(second)
  setSource(secondPage); secondPage.data.watermarkText = 'x'
  const old = secondPage.applyWatermark()
  const owner = secondPage.nextOperation()
  secondPage._canvas = shared; secondPage._canvasOwnerId = owner
  waiting.resolve(shared)
  await old
  assert.equal(shared.width, 9)
  assert.equal(secondPage._canvasOwnerId, owner)
})

test('save uses exact output, preserves physical mutex across invalidation, and cancellation is silent', async () => {
  const saving = createDeferred()
  const paths = []
  const { definition, wx } = loadPage({ save: { saveImageToAlbum: (resultPath) => { paths.push(resultPath); return saving.promise } } })
  const page = createInstance(definition)
  page.data.resultPath = 'old.jpg'
  const first = page.saveResult()
  page.onTextInput({ detail: { value: 'next' } })
  page.data.resultPath = 'new.jpg'
  await page.saveResult()
  assert.deepEqual(paths, ['old.jpg'])
  saving.resolve({ saved: false, cancelled: true })
  await first
  assert.equal(page.data.saving, false)
  await page.saveResult()
  assert.deepEqual(paths, ['old.jpg', 'new.jpg'])
  assert.deepEqual(wx.toasts, [])
})

test('watermark WXML is local fixed-position UI with one ad slot and accessible controls', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/image-watermark/image-watermark.wxml'), 'utf8')
  assert.match(wxml, /id="processor-canvas" type="2d"/)
  assert.match(wxml, /maxlength="30"/)
  assert.match(wxml, /aria-label="水印文字"/)
  assert.match(wxml, /aria-label="水印透明度"/)
  assert.match(wxml, /<ad-slot[^>]*ad-unit-id="\{\{resultBannerUnitId\}\}"/)
  assert.doesNotMatch(wxml, /logo|在线|素材|repeat|tile|rotate|font|https?:/i)
})
