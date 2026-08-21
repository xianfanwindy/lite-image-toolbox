const test = require('node:test')
const assert = require('node:assert/strict')

const originalWx = global.wx

test.afterEach(() => {
  if (originalWx === undefined) delete global.wx
  else global.wx = originalWx
})

test('getCanvas resolves the selected Canvas node through the selector chain', async () => {
  const node = { id: 'canvas' }
  let fieldOptions
  const page = {
    createSelectorQuery() {
      return {
        select(selector) {
          assert.equal(selector, '#processor-canvas')
          return this
        },
        fields(options) {
          fieldOptions = options
          return this
        },
        exec(callback) {
          callback([{ node }])
        },
      }
    },
  }

  const { getCanvas } = require('../utils/canvas')
  assert.equal(await getCanvas(page), node)
  assert.deepEqual(fieldOptions, { node: true, size: true })
})

test('getCanvas rejects with a clear Canvas error when no node is found', async () => {
  const page = {
    createSelectorQuery() {
      return {
        select() { return this },
        fields() { return this },
        exec(callback) { callback([{}]) },
      }
    },
  }

  const { getCanvas } = require('../utils/canvas')
  await assert.rejects(getCanvas(page), /Canvas/)
})

test('loadCanvasImage resolves the loaded image', async () => {
  const image = {}
  const canvas = {
    createImage() {
      Object.defineProperty(image, 'src', {
        set(value) {
          assert.equal(value, 'wxfile://tmp/photo.jpg')
          image.onload()
        },
      })
      return image
    },
  }

  const { loadCanvasImage } = require('../utils/canvas')
  assert.equal(await loadCanvasImage(canvas, 'wxfile://tmp/photo.jpg'), image)
})

test('loadCanvasImage rejects with image load context on error', async () => {
  const image = {}
  const canvas = {
    createImage() {
      Object.defineProperty(image, 'src', {
        set() { image.onerror(new Error('broken')) },
      })
      return image
    },
  }

  const { loadCanvasImage } = require('../utils/canvas')
  await assert.rejects(loadCanvasImage(canvas, 'wxfile://tmp/photo.jpg'), /image load/i)
})

test('prepareCanvas caps ratio and scales the backing canvas context', () => {
  const calls = []
  const context = { scale(...args) { calls.push(args) } }
  const canvas = {
    getContext(type) {
      assert.equal(type, '2d')
      return context
    },
  }

  const { prepareCanvas } = require('../utils/canvas')
  assert.deepEqual(prepareCanvas(canvas, 100.4, 50.2, 3), {
    context,
    width: 100,
    height: 50,
    pixelRatio: 2,
  })
  assert.equal(canvas.width, 200)
  assert.equal(canvas.height, 100)
  assert.deepEqual(calls, [[2, 2]])
})

test('prepareCanvas rejects a backing store that exceeds the Canvas pixel budget', () => {
  const canvas = { getContext() { return { scale() {} } } }
  const { prepareCanvas } = require('../utils/canvas')

  assert.throws(() => prepareCanvas(canvas, 4096, 4096, 2), /Canvas.*too large|too large.*Canvas/i)
  assert.doesNotThrow(() => prepareCanvas(canvas, 2048, 2048, 2))
  assert.doesNotThrow(() => prepareCanvas(canvas, 4096, 1024, 2))
})

test('prepareCanvas and exportCanvas reject invalid or oversized dimensions', () => {
  const { prepareCanvas, exportCanvas } = require('../utils/canvas')
  assert.throws(() => prepareCanvas({}, 0, 10, 1), RangeError)
  assert.throws(() => prepareCanvas({}, 4097, 10, 1), RangeError)
  assert.throws(() => exportCanvas({}, 10, 4097, 'jpg', 0.8), RangeError)
})

test('exportCanvas exports PNG without quality and resolves a nonempty temporary path', async () => {
  let exportOptions
  global.wx = {
    canvasToTempFilePath(options) {
      exportOptions = options
      options.success({ tempFilePath: 'wxfile://tmp/output.png' })
    },
  }
  const canvas = { id: 'canvas', width: 300, height: 200 }

  const { exportCanvas } = require('../utils/canvas')
  assert.equal(await exportCanvas(canvas, 300, 200, 'png', 0.2), 'wxfile://tmp/output.png')
  const { success, fail, ...actualOptions } = exportOptions
  assert.equal(typeof success, 'function')
  assert.equal(typeof fail, 'function')
  assert.deepEqual(actualOptions, {
    canvas,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    destWidth: 300,
    destHeight: 200,
    fileType: 'png',
  })
})

test('exportCanvas crops the full DPR backing store while keeping logical output dimensions', async () => {
  let exportOptions
  global.wx = {
    canvasToTempFilePath(options) {
      exportOptions = options
      options.success({ tempFilePath: 'wxfile://tmp/output.jpg' })
    },
  }
  const canvas = { getContext() { return { scale() {} } } }
  const { prepareCanvas, exportCanvas } = require('../utils/canvas')

  prepareCanvas(canvas, 300, 200, 2)
  await exportCanvas(canvas, 300, 200, 'jpg', 0.8)

  assert.equal(canvas.width, 600)
  assert.equal(canvas.height, 400)
  assert.equal(exportOptions.width, 600)
  assert.equal(exportOptions.height, 400)
  assert.equal(exportOptions.destWidth, 300)
  assert.equal(exportOptions.destHeight, 200)
})

test('exportCanvas rejects when WeChat reports an empty temporary path', async () => {
  global.wx = {
    canvasToTempFilePath(options) {
      options.success({ tempFilePath: '' })
    },
  }

  const { exportCanvas } = require('../utils/canvas')
  await assert.rejects(exportCanvas({ width: 10, height: 10 }, 10, 10, 'jpg', 0.8), /Canvas/)
})

test('formatBytes formats invalid, byte, KB, and MB values', () => {
  const { formatBytes } = require('../utils/canvas')
  assert.equal(formatBytes(-1), '0 B')
  assert.equal(formatBytes(1023.6), '1024 B')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(1024 * 1024), '1.0 MB')
})
