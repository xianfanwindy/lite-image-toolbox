const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const indexModulePath = path.resolve(__dirname, '../pages/index/index.js')
const expectedTools = [
  { title: '图片压缩', description: '减小图片体积', icon: '压', path: '/pages/image-compress/image-compress' },
  { title: '尺寸调整', description: '按比例修改宽高', icon: '尺', path: '/pages/image-resize/image-resize' },
  { title: '九宫格切图', description: '一键生成九张图', icon: '九', path: '/pages/nine-grid/nine-grid' },
  { title: '文字水印', description: '为图片添加文字', icon: '印', path: '/pages/image-watermark/image-watermark' },
]

let originalPage
let originalWx
let pageDefinition
let navigateCalls

test.beforeEach(() => {
  originalPage = global.Page
  originalWx = global.wx
  pageDefinition = undefined
  navigateCalls = []
  global.Page = (definition) => {
    pageDefinition = definition
  }
  global.wx = {
    navigateTo(options) {
      navigateCalls.push(options)
    },
  }
  delete require.cache[indexModulePath]
})

test.afterEach(() => {
  if (originalPage === undefined) delete global.Page
  else global.Page = originalPage
  if (originalWx === undefined) delete global.wx
  else global.wx = originalWx
  delete require.cache[indexModulePath]
})

function loadPage() {
  require(indexModulePath)
  return pageDefinition
}

test('首页提供精确的工具数据与最小页面接口', () => {
  const page = loadPage()

  assert.deepEqual(Object.keys(page).sort(), ['data', 'openTool'])
  assert.equal(page.data.homeBannerUnitId, '')
  assert.deepEqual(page.data.tools, expectedTools)
})

test('首页在有效工具路径上导航', () => {
  const page = loadPage()
  const toolPath = expectedTools[0].path

  page.openTool({ currentTarget: { dataset: { path: toolPath } } })

  assert.deepEqual(navigateCalls, [{ url: toolPath }])
})

test('首页忽略缺失或空工具路径', () => {
  const page = loadPage()

  page.openTool({ currentTarget: { dataset: {} } })
  page.openTool({ currentTarget: { dataset: { path: '' } } })

  assert.deepEqual(navigateCalls, [])
})
