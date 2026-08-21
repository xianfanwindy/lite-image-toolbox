const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getCanvasExportOptions,
  normalizeImageFormat,
  shouldFillWhite,
} = require('../utils/image-format')

test('PNG remains PNG and keeps a transparent canvas', () => {
  assert.equal(normalizeImageFormat('png', 'anything.jpg'), 'png')
  assert.equal(shouldFillWhite('png'), false)
  assert.deepEqual(getCanvasExportOptions('png', 0.2), { fileType: 'png' })
})

test('JPG aliases normalize and use quality', () => {
  assert.equal(normalizeImageFormat('jpeg', ''), 'jpg')
  assert.deepEqual(getCanvasExportOptions('jpg', 0.8), { fileType: 'jpg', quality: 0.8 })
  assert.equal(shouldFillWhite('jpg'), true)
})

test('path extension is used only when metadata is missing', () => {
  assert.equal(normalizeImageFormat('', 'wxfile://tmp/source.PNG'), 'png')
  assert.equal(normalizeImageFormat('', 'wxfile://tmp/source.heic'), 'jpg')
})
