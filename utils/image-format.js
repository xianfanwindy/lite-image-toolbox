function normalizeImageFormat(type, path) {
  const metadata = String(type || '').toLowerCase()
  if (metadata === 'png') return 'png'
  if (metadata === 'jpg' || metadata === 'jpeg') return 'jpg'
  return /\.png(?:$|\?)/i.test(String(path || '')) ? 'png' : 'jpg'
}

function shouldFillWhite(format) {
  return normalizeImageFormat(format, '') !== 'png'
}

function getCanvasExportOptions(format, quality) {
  if (normalizeImageFormat(format, '') === 'png') return { fileType: 'png' }
  const value = Number(quality)
  return {
    fileType: 'jpg',
    quality: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.8,
  }
}

module.exports = { getCanvasExportOptions, normalizeImageFormat, shouldFillWhite }
