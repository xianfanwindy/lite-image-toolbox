const test = require('node:test')
const assert = require('node:assert/strict')

const originalWx = global.wx

test.afterEach(() => {
  if (originalWx === undefined) delete global.wx
  else global.wx = originalWx
})

test('chooseSingleImage returns JPG metadata and passes the exact picker options', async () => {
  let chooseOptions
  global.wx = {
    chooseMedia(options) {
      chooseOptions = options
      options.success({ tempFiles: [{ tempFilePath: 'wxfile://tmp/photo.jpg', size: 321 }] })
    },
    getImageInfo(options) {
      assert.equal(options.src, 'wxfile://tmp/photo.jpg')
      options.success({ width: 640, height: 480, type: 'jpg' })
    },
  }

  const { chooseSingleImage } = require('../utils/image-picker')
  const result = await chooseSingleImage()

  const { success, fail, ...pickerOptions } = chooseOptions
  assert.equal(typeof success, 'function')
  assert.equal(typeof fail, 'function')
  assert.deepEqual(pickerOptions, {
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    sizeType: ['original'],
  })
  assert.deepEqual(result, {
    path: 'wxfile://tmp/photo.jpg',
    size: 321,
    width: 640,
    height: 480,
    type: 'jpg',
  })
})

test('chooseSingleImage returns null when image selection is cancelled', async () => {
  global.wx = {
    chooseMedia(options) {
      options.fail({ errMsg: 'chooseMedia:fail cancel' })
    },
  }

  const { chooseSingleImage } = require('../utils/image-picker')
  assert.equal(await chooseSingleImage(), null)
})

test('chooseSingleImage rejects the original non-cancel picker failure', async () => {
  const failure = new Error('chooseMedia:fail system error')
  global.wx = {
    chooseMedia(options) {
      options.fail(failure)
    },
  }

  const { chooseSingleImage } = require('../utils/image-picker')
  await assert.rejects(chooseSingleImage(), (error) => error === failure)
})

test('chooseSingleImage returns null when chooseMedia provides no temporary file', async () => {
  global.wx = {
    chooseMedia(options) {
      options.success({ tempFiles: [] })
    },
  }

  const { chooseSingleImage } = require('../utils/image-picker')
  assert.equal(await chooseSingleImage(), null)
})
