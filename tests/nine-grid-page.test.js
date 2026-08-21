const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { afterEach } = test

const pagePath = require.resolve('../pages/nine-grid/nine-grid')
const dependencyPaths = {
  picker: require.resolve('../utils/image-picker'), canvas: require.resolve('../utils/canvas'),
  math: require.resolve('../utils/image-math'), format: require.resolve('../utils/image-format'),
  save: require.resolve('../utils/image-save'), ads: require.resolve('../config/ads'),
}
const originalGlobals = { Page: global.Page, wx: global.wx }
const originals = new Map()

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function install(modulePath, exports) { if (!originals.has(modulePath)) originals.set(modulePath, require.cache[modulePath]); require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports } }
function createWx(overrides = {}) { const toasts = []; return { toasts, showToast(options) { toasts.push(options) }, ...overrides } }
function loadPage(dependencies = {}, wx = createWx()) {
  let definition
  global.Page = (options) => { definition = options }
  global.wx = wx
  install(dependencyPaths.picker, dependencies.picker || { chooseSingleImage: async () => null })
  install(dependencyPaths.canvas, dependencies.canvas || {})
  install(dependencyPaths.math, dependencies.math || { getSquareCrop: () => ({ x: 0, y: 0, size: 3 }), getNineGridTile: () => ({ x: 0, y: 0, size: 1 }) })
  install(dependencyPaths.format, dependencies.format || { normalizeImageFormat: () => 'jpg', shouldFillWhite: () => true })
  install(dependencyPaths.save, dependencies.save || { saveImageToAlbum: async () => ({ saved: false, cancelled: true }) })
  install(dependencyPaths.ads, dependencies.ads || { resultBannerUnitId: '' })
  delete require.cache[pagePath]
  require(pagePath)
  return { definition, wx }
}
function instance(definition) { const page = { data: clone(definition.data) }; Object.keys(definition).forEach((key) => { if (typeof definition[key] === 'function') page[key] = definition[key] }); page.setData = (patch) => Object.assign(page.data, patch); return page }
function source(overrides = {}) { return { path: 'source.jpg', width: 1200, height: 900, size: 4096, format: 'jpg', ...overrides } }
afterEach(() => { delete require.cache[pagePath]; originals.forEach((cached, modulePath) => { if (cached) require.cache[modulePath] = cached; else delete require.cache[modulePath] }); originals.clear(); global.Page = originalGlobals.Page; global.wx = originalGlobals.wx })

test('defaults expose only local nine-grid state and handlers', () => {
  const { definition } = loadPage()
  assert.deepEqual(definition.data, { source: null, processing: false, saving: false, results: [], savedCount: 0, saveProgressText: '', sourceSizeText: '', errorMessage: '', resultBannerUnitId: '' })
  ;['chooseImage', 'generateGrid', 'saveAll', 'onUnload'].forEach((name) => assert.equal(typeof definition[name], 'function'))
})

test('chooseImage normalizes a selection, clears output, and handles cancellation or error', async () => {
  const picked = { path: 'picked.png', width: 800, height: 1200, size: 1234, type: 'PNG' }
  const { definition } = loadPage({ picker: { chooseSingleImage: async () => picked }, canvas: { formatBytes: () => '1.2 KB' }, format: { normalizeImageFormat: () => 'png', shouldFillWhite: () => false } })
  const page = instance(definition)
  Object.assign(page.data, { results: [{ index: 0, path: 'old.jpg' }], savedCount: 1, saveProgressText: 'old', errorMessage: 'old' })
  await page.chooseImage()
  assert.deepEqual(page.data.source, { ...picked, format: 'png' })
  assert.deepEqual(page.data.results, [])
  assert.equal(page.data.savedCount, 0)
  assert.equal(page.data.sourceSizeText, '1.2 KB')
  const before = clone(page.data)
  const cancelled = instance(loadPage({ picker: { chooseSingleImage: async () => null } }).definition)
  Object.assign(cancelled.data, before)
  await cancelled.chooseImage()
  assert.deepEqual(cancelled.data, before)
  const failed = instance(loadPage({ picker: { chooseSingleImage: async () => { throw new Error('no camera') } } }).definition)
  await failed.chooseImage()
  assert.equal(failed.data.errorMessage, '选择图片失败，请重试')
})

test('generateGrid requires a source and crops centered landscape tiles sequentially', async () => {
  const calls = []
  const canvas = { width: 8, height: 8 }
  const context = { clearRect: (...args) => calls.push(['clear', ...args]), fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) }
  const { definition, wx } = loadPage({
    canvas: { getCanvas: async () => canvas, loadCanvasImage: async () => ({ id: 'decoded' }), prepareCanvas: (c, w, h, dpr) => { calls.push(['prepare', c, w, h, dpr]); return { context } }, exportCanvas: async (...args) => { calls.push(['export', ...args]); return `tile-${calls.filter((call) => call[0] === 'export').length}.jpg` } },
    math: { getSquareCrop: (w, h) => { calls.push(['crop', w, h]); return { x: 150, y: 0, size: 900 } }, getNineGridTile: (crop, index) => ({ x: crop.x + (index % 3) * 300, y: crop.y + Math.floor(index / 3) * 300, size: 300 }) },
  })
  const empty = instance(definition)
  await empty.generateGrid()
  assert.deepEqual(wx.toasts, [{ title: '请先选择图片', icon: 'none' }])
  const page = instance(definition); page.data.source = source()
  await page.generateGrid()
  assert.deepEqual(calls.slice(0, 4), [['crop', 1200, 900], ['prepare', canvas, 300, 300, 1], ['clear', 0, 0, 300, 300], ['fill', 0, 0, 300, 300]])
  assert.deepEqual(calls.filter((call) => call[0] === 'draw')[0], ['draw', { id: 'decoded' }, 150, 0, 300, 300, 0, 0, 300, 300])
  assert.equal(calls.filter((call) => call[0] === 'export').length, 9)
  assert.deepEqual(page.data.results, Array.from({ length: 9 }, (_, index) => ({ index, path: `tile-${index + 1}.jpg` })))
  assert.equal(page.data.savedCount, 0)
  assert.equal(canvas.width, 1); assert.equal(canvas.height, 1)
})

test('generateGrid validates small sources and discards all tiles after one failure', async () => {
  const { definition } = loadPage({ canvas: { getCanvas: async () => ({}), loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context: { clearRect() {}, fillRect() {}, drawImage() {} } }), exportCanvas: async () => { throw new Error('export failed') } }, math: { getSquareCrop: () => ({ x: 0, y: 0, size: 2 }), getNineGridTile: () => ({ x: 0, y: 0, size: 1 }) } })
  const page = instance(definition); page.data.source = source({ width: 2, height: 2 }); page.data.results = [{ index: 0, path: 'old.jpg' }]
  await page.generateGrid()
  assert.deepEqual(page.data.results, [])
  assert.match(page.data.errorMessage, /图片尺寸过小/)
  const failed = instance(loadPage({ canvas: { getCanvas: async () => ({}), loadCanvasImage: async () => ({}), prepareCanvas: () => ({ context: { clearRect() {}, fillRect() {}, drawImage() {} } }), exportCanvas: async () => { throw new Error('export failed') } }, math: { getSquareCrop: () => ({ x: 0, y: 0, size: 900 }), getNineGridTile: () => ({ x: 0, y: 0, size: 300 }) } }).definition)
  failed.data.source = source()
  await failed.generateGrid()
  assert.deepEqual(failed.data.results, [])
  assert.equal(failed.data.errorMessage, '处理失败，请重试或更换图片')
})

test('saveAll saves in order, resumes after cancellation, and has a physical mutex', async () => {
  const first = deferred(); const calls = []
  const { definition, wx } = loadPage({ save: { saveImageToAlbum: (filePath) => { calls.push(filePath); return calls.length === 1 ? first.promise : Promise.resolve({ saved: true, cancelled: false }) } } })
  const page = instance(definition); page.data.results = Array.from({ length: 9 }, (_, index) => ({ index, path: `tile-${index}.jpg` }))
  const running = page.saveAll(); const duplicate = page.saveAll()
  assert.deepEqual(calls, ['tile-0.jpg']); assert.equal(page.data.saving, true)
  first.resolve({ saved: false, cancelled: true }); await Promise.all([running, duplicate])
  assert.equal(page.data.savedCount, 0); assert.equal(page.data.saveProgressText, '已保存 0/9 张，可重新点击继续')
  await page.saveAll()
  assert.deepEqual(calls, ['tile-0.jpg', ...Array.from({ length: 9 }, (_, index) => `tile-${index}.jpg`)])
  assert.equal(page.data.savedCount, 9)
  assert.deepEqual(wx.toasts, [{ title: '9 张图片已按顺序保存', icon: 'success' }])
})

test('nine-grid WXML keeps controls disabled while busy and uses a local 3 by 3 preview', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/nine-grid/nine-grid.wxml'), 'utf8')
  assert.match(wxml, /disabled="\{\{processing \|\| saving\}\}"/)
  assert.match(wxml, /wx:for="\{\{results\}\}"/)
  assert.match(wxml, /id="processor-canvas" type="2d"/)
  assert.doesNotMatch(wxml, /top-left|center|bottom-right|https?:\/\/|upload/i)
})
