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
  return /cancel|deny/i.test(String(error && error.errMsg ? error.errMsg : error))
}

function isInvalidTemporaryFile(error) {
  const message = String(error && error.errMsg ? error.errMsg : error)
  return /(temp(?:orary)?\s*(?:file|path)|wxfile:).*?(missing|invalid|not\s*exist|not\s*found)|no\s+such\s+file/i.test(message)
}

async function requestAlbumPermission() {
  const setting = await callWx('getSetting', {})
  const permission = setting && setting.authSetting && setting.authSetting['scope.writePhotosAlbum']
  if (permission === true) return true

  if (permission === undefined) {
    try {
      await callWx('authorize', { scope: 'scope.writePhotosAlbum' })
      return true
    } catch (error) {
      if (isCancelled(error)) return false
      throw error
    }
  }

  const modal = await callWx('showModal', {
    title: '需要相册权限',
    content: '保存图片需要使用相册权限，请在设置中允许访问相册。',
    confirmText: '去设置',
  })
  if (!modal || !modal.confirm) return false

  try {
    const updated = await callWx('openSetting', {})
    if (!updated || !updated.authSetting) return false
    return updated.authSetting['scope.writePhotosAlbum'] === true
  } catch (error) {
    if (isCancelled(error)) return false
    throw error
  }
}

async function saveImageToAlbum(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('图片文件无效，请重新处理图片')
  }

  if (typeof wx.requirePrivacyAuthorize === 'function') {
    try {
      await callWx('requirePrivacyAuthorize', {})
    } catch (error) {
      if (isCancelled(error)) return { saved: false, cancelled: true }
      throw error
    }
  }

  if (!(await requestAlbumPermission())) return { saved: false, cancelled: true }

  try {
    await callWx('saveImageToPhotosAlbum', { filePath })
    return { saved: true, cancelled: false }
  } catch (error) {
    if (isCancelled(error)) return { saved: false, cancelled: true }
    if (isInvalidTemporaryFile(error)) throw new Error('图片文件无效，请重新处理图片')
    throw error
  }
}

module.exports = { saveImageToAlbum }
