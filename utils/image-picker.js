function callWx(method, options) {
  return new Promise((resolve, reject) => {
    wx[method]({
      ...options,
      success: resolve,
      fail: reject,
    })
  })
}

function isCancelled(error) {
  return /cancel/i.test(String(error && error.errMsg ? error.errMsg : error))
}

async function chooseSingleImage() {
  let selected
  try {
    selected = await callWx('chooseMedia', {
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
    })
  } catch (error) {
    if (isCancelled(error)) return null
    throw error
  }

  const file = selected && selected.tempFiles && selected.tempFiles[0]
  const path = file && file.tempFilePath
  if (!path) return null

  let info
  try {
    info = await callWx('getImageInfo', { src: path })
  } catch (error) {
    if (isCancelled(error)) return null
    throw error
  }

  return {
    path,
    size: Number(file.size) || 0,
    width: info.width,
    height: info.height,
    type: info.type || '',
  }
}

module.exports = { chooseSingleImage }
