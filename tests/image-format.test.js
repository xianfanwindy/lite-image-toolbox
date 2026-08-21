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

test('invalid JPG quality values use the default quality', () => {
  for (const quality of [null, '', undefined, 'not-a-number']) {
    assert.deepEqual(getCanvasExportOptions('jpg', quality), { fileType: 'jpg', quality: 0.8 })
  }
})

test('JPG quality is clamped and PNG ignores quality', () => {
  assert.deepEqual(getCanvasExportOptions('jpg', 2), { fileType: 'jpg', quality: 1 })
  assert.deepEqual(getCanvasExportOptions('jpg', -1), { fileType: 'jpg', quality: 0 })
  assert.deepEqual(getCanvasExportOptions('png', 0.1), { fileType: 'png' })
})

test('path extension is used only when metadata is missing', () => {
  assert.equal(normalizeImageFormat('', 'wxfile://tmp/source.PNG'), 'png')
  assert.equal(normalizeImageFormat('', 'wxfile://tmp/source.heic'), 'jpg')
})
