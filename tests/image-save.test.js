const test = require('node:test')
const assert = require('node:assert/strict')

const originalWx = global.wx

test.afterEach(() => {
  if (originalWx === undefined) delete global.wx
  else global.wx = originalWx
})

test('saveImageToAlbum saves the exact path when album access is already granted', async () => {
  const order = []
  global.wx = {
    getSetting(options) {
      order.push('getSetting')
      options.success({ authSetting: { 'scope.writePhotosAlbum': true } })
    },
    saveImageToPhotosAlbum(options) {
      order.push(`save:${options.filePath}`)
      options.success({})
    },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: true, cancelled: false })
  assert.deepEqual(order, ['getSetting', 'save:wxfile://tmp/processed.jpg'])
})

test('saveImageToAlbum authorizes an undecided album permission before saving', async () => {
  const order = []
  global.wx = {
    getSetting(options) {
      order.push('getSetting')
      options.success({ authSetting: {} })
    },
    authorize(options) {
      order.push(options.scope)
      options.success({})
    },
    saveImageToPhotosAlbum(options) {
      order.push('save')
      options.success({})
    },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: true, cancelled: false })
  assert.deepEqual(order, ['getSetting', 'scope.writePhotosAlbum', 'save'])
})

test('saveImageToAlbum returns cancelled when a denied permission modal is dismissed', async () => {
  let openSettingCalled = false
  let saveCalled = false
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': false } }) },
    showModal(options) {
      assert.match(options.content, /相册/)
      options.success({ confirm: false })
    },
    openSetting() { openSettingCalled = true },
    saveImageToPhotosAlbum() { saveCalled = true },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
  assert.equal(openSettingCalled, false)
  assert.equal(saveCalled, false)
})

test('saveImageToAlbum saves after settings grant a previously denied permission', async () => {
  const order = []
  global.wx = {
    getSetting(options) {
      order.push('getSetting')
      options.success({ authSetting: { 'scope.writePhotosAlbum': false } })
    },
    showModal(options) {
      order.push('showModal')
      options.success({ confirm: true })
    },
    openSetting(options) {
      order.push('openSetting')
      options.success({ authSetting: { 'scope.writePhotosAlbum': true } })
    },
    saveImageToPhotosAlbum(options) {
      order.push(`save:${options.filePath}`)
      options.success({})
    },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: true, cancelled: false })
  assert.deepEqual(order, ['getSetting', 'showModal', 'openSetting', 'save:wxfile://tmp/processed.jpg'])
})

test('saveImageToAlbum returns cancelled when settings remain denied', async () => {
  let saved = false
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': false } }) },
    showModal(options) { options.success({ confirm: true }) },
    openSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': false } }) },
    saveImageToPhotosAlbum() { saved = true },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
  assert.equal(saved, false)
})

test('saveImageToAlbum treats a non-boolean initial permission as denied', async () => {
  let modalShown = false
  let saved = false
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': 'false' } }) },
    showModal(options) {
      modalShown = true
      options.success({ confirm: false })
    },
    saveImageToPhotosAlbum() { saved = true },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
  assert.equal(modalShown, true)
  assert.equal(saved, false)
})

test('saveImageToAlbum requires literal true after opening settings', async () => {
  let saved = false
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': false } }) },
    showModal(options) { options.success({ confirm: true }) },
    openSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': 'true' } }) },
    saveImageToPhotosAlbum(options) {
      saved = true
      options.success({})
    },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
  assert.equal(saved, false)
})

test('saveImageToAlbum returns cancelled when privacy authorization is denied', async () => {
  let getSettingCalled = false
  global.wx = {
    requirePrivacyAuthorize(options) { options.fail({ errMsg: 'requirePrivacyAuthorize:fail deny' }) },
    getSetting() { getSettingCalled = true },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
  assert.equal(getSettingCalled, false)
})

test('saveImageToAlbum treats privacy-not-authorized and disagree responses as cancellation', async () => {
  for (const errMsg of [
    'requirePrivacyAuthorize:fail privacy permission is not authorized',
    'requirePrivacyAuthorize:fail disagree',
  ]) {
    let getSettingCalled = false
    let saveCalled = false
    global.wx = {
      requirePrivacyAuthorize(options) { options.fail({ errMsg }) },
      getSetting() { getSettingCalled = true },
      saveImageToPhotosAlbum() { saveCalled = true },
    }

    const { saveImageToAlbum } = require('../utils/image-save')
    assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
    assert.equal(getSettingCalled, false)
    assert.equal(saveCalled, false)
  }
})

test('saveImageToAlbum returns cancelled when album saving is cancelled', async () => {
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': true } }) },
    saveImageToPhotosAlbum(options) { options.fail({ errMsg: 'saveImageToPhotosAlbum:fail cancel' }) },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  assert.deepEqual(await saveImageToAlbum('wxfile://tmp/processed.jpg'), { saved: false, cancelled: true })
})

test('saveImageToAlbum converts an invalid temporary-file error into recovery guidance', async () => {
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': true } }) },
    saveImageToPhotosAlbum(options) { options.fail({ errMsg: 'saveImageToPhotosAlbum:fail no such file' }) },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  await assert.rejects(saveImageToAlbum('wxfile://tmp/processed.jpg'), /请重新处理图片/)
})

test('saveImageToAlbum converts a file-not-found save error into recovery guidance', async () => {
  global.wx = {
    getSetting(options) { options.success({ authSetting: { 'scope.writePhotosAlbum': true } }) },
    saveImageToPhotosAlbum(options) { options.fail({ errMsg: 'saveImageToPhotosAlbum:fail file not found' }) },
  }

  const { saveImageToAlbum } = require('../utils/image-save')
  await assert.rejects(saveImageToAlbum('wxfile://tmp/processed.jpg'), /请重新处理图片/)
})

test('saveImageToAlbum rejects an empty output path with recovery guidance', async () => {
  const { saveImageToAlbum } = require('../utils/image-save')
  await assert.rejects(saveImageToAlbum(''), /请重新处理图片/)
})
