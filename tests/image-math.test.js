const test = require('node:test')
const assert = require('node:assert/strict')
const {
  fitWithinSide,
  getNineGridTile,
  getSquareCrop,
  getWatermarkPoint,
  opacityPercentToAlpha,
  resizeByPercent,
  resolveLockedSize,
} = require('../utils/image-math')

test('fitWithinSide keeps a small image unchanged', () => {
  assert.deepEqual(fitWithinSide(1200, 800, 4096), { width: 1200, height: 800, scale: 1 })
})

test('fitWithinSide limits an extreme landscape image', () => {
  assert.deepEqual(fitWithinSide(12000, 3000, 4096), { width: 4096, height: 1024, scale: 4096 / 12000 })
})

test('resizeByPercent rounds dimensions and never returns zero', () => {
  assert.deepEqual(resizeByPercent(3, 1, 50), { width: 2, height: 1 })
})

test('invalid resize values fail explicitly', () => {
  assert.throws(() => resizeByPercent(100, 100, 0), RangeError)
  assert.throws(() => resolveLockedSize(100, 100, 'width', ''), RangeError)
  assert.throws(() => fitWithinSide(0, 100, 4096), RangeError)
})

test('resolveLockedSize updates height from width', () => {
  assert.deepEqual(resolveLockedSize(4000, 3000, 'width', 1000), { width: 1000, height: 750 })
})

test('resolveLockedSize updates width from height', () => {
  assert.deepEqual(resolveLockedSize(4000, 3000, 'height', 600), { width: 800, height: 600 })
})

test('resolveLockedSize rounds a fractional width before locking height', () => {
  assert.deepEqual(resolveLockedSize(4, 3, 'width', 1.5), { width: 2, height: 2 })
})

test('resolveLockedSize rounds a fractional height before locking width', () => {
  assert.deepEqual(resolveLockedSize(4, 3, 'height', 1.5), { width: 3, height: 2 })
})

test('getSquareCrop centers landscape and portrait sources', () => {
  assert.deepEqual(getSquareCrop(1200, 800), { x: 200, y: 0, size: 800 })
  assert.deepEqual(getSquareCrop(800, 1200), { x: 0, y: 200, size: 800 })
})

test('getNineGridTile returns row-major source rectangles', () => {
  assert.deepEqual(getNineGridTile({ x: 90, y: 30, size: 900 }, 0), { x: 90, y: 30, size: 300 })
  assert.deepEqual(getNineGridTile({ x: 90, y: 30, size: 900 }, 5), { x: 690, y: 330, size: 300 })
  assert.deepEqual(getNineGridTile({ x: 90, y: 30, size: 900 }, 8), { x: 690, y: 630, size: 300 })
})

test('watermark positions use the requested padding', () => {
  const input = { width: 1000, height: 800, textWidth: 200, lineHeight: 40, padding: 32 }
  assert.deepEqual(getWatermarkPoint({ ...input, position: 'top-left' }), { x: 32, y: 32, textAlign: 'left', textBaseline: 'top' })
  assert.deepEqual(getWatermarkPoint({ ...input, position: 'center' }), { x: 500, y: 400, textAlign: 'center', textBaseline: 'middle' })
  assert.deepEqual(getWatermarkPoint({ ...input, position: 'bottom-right' }), { x: 968, y: 768, textAlign: 'right', textBaseline: 'bottom' })
})

test('opacity percent is clamped to canvas alpha', () => {
  assert.equal(opacityPercentToAlpha(-1), 0)
  assert.equal(opacityPercentToAlpha(55), 0.55)
  assert.equal(opacityPercentToAlpha(101), 1)
})
