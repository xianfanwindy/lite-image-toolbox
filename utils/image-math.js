function assertPositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`)
  }
}

function roundDimension(value) {
  return Math.max(1, Math.round(value))
}

function fitWithinSide(width, height, maxSide) {
  assertPositive(width, 'width')
  assertPositive(height, 'height')
  assertPositive(maxSide, 'maxSide')
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: roundDimension(width * scale),
    height: roundDimension(height * scale),
    scale,
  }
}

function resizeByPercent(width, height, percent) {
  assertPositive(width, 'width')
  assertPositive(height, 'height')
  assertPositive(percent, 'percent')
  const scale = percent / 100
  return {
    width: roundDimension(width * scale),
    height: roundDimension(height * scale),
  }
}

function resolveLockedSize(sourceWidth, sourceHeight, changed, value) {
  assertPositive(sourceWidth, 'sourceWidth')
  assertPositive(sourceHeight, 'sourceHeight')
  assertPositive(value, 'value')
  if (changed === 'width') {
    return { width: value, height: roundDimension(value * sourceHeight / sourceWidth) }
  }
  if (changed === 'height') {
    return { width: roundDimension(value * sourceWidth / sourceHeight), height: value }
  }
  throw new RangeError('changed must be width or height')
}

function getSquareCrop(width, height) {
  assertPositive(width, 'width')
  assertPositive(height, 'height')
  const size = Math.min(width, height)
  return { x: (width - size) / 2, y: (height - size) / 2, size }
}

function getNineGridTile(crop, index) {
  if (!crop || typeof crop !== 'object') throw new RangeError('crop is required')
  const { x, y, size } = crop
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new RangeError('x must be a finite non-negative number')
  if (typeof y !== 'number' || !Number.isFinite(y) || y < 0) throw new RangeError('y must be a finite non-negative number')
  assertPositive(size, 'size')
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new RangeError('index must be an integer from 0 to 8')
  const tileSize = size / 3
  return {
    x: x + (index % 3) * tileSize,
    y: y + Math.floor(index / 3) * tileSize,
    size: tileSize,
  }
}

function getWatermarkPoint(options) {
  if (!options || typeof options !== 'object') throw new RangeError('options is required')
  const { width, height, padding, textWidth, lineHeight, position } = options
  assertPositive(width, 'width')
  assertPositive(height, 'height')
  assertPositive(padding, 'padding')
  if (textWidth !== undefined) assertPositive(textWidth, 'textWidth')
  if (lineHeight !== undefined) assertPositive(lineHeight, 'lineHeight')
  const points = {
    'top-left': { x: padding, y: padding, textAlign: 'left', textBaseline: 'top' },
    'top-right': { x: width - padding, y: padding, textAlign: 'right', textBaseline: 'top' },
    center: { x: width / 2, y: height / 2, textAlign: 'center', textBaseline: 'middle' },
    'bottom-left': { x: padding, y: height - padding, textAlign: 'left', textBaseline: 'bottom' },
    'bottom-right': { x: width - padding, y: height - padding, textAlign: 'right', textBaseline: 'bottom' },
  }
  if (!Object.prototype.hasOwnProperty.call(points, position)) throw new RangeError('unknown watermark position')
  return points[position]
}

function opacityPercentToAlpha(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new RangeError('percent must be finite')
  }
  return Math.min(1, Math.max(0, percent / 100))
}

module.exports = {
  fitWithinSide,
  getNineGridTile,
  getSquareCrop,
  getWatermarkPoint,
  opacityPercentToAlpha,
  resizeByPercent,
  resolveLockedSize,
}
