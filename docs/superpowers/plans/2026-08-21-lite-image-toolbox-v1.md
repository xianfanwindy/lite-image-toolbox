# 轻图工具箱 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个个人主体可用、完全本地处理图片、取得 AppID 后即可导入微信开发者工具并准备上传体验版的“轻图工具箱”首版。

**Architecture:** 使用原生微信小程序页面和 Canvas 2D，四个工具页面只负责参数与交互；选图、图片元数据、尺寸计算、Canvas 导出、相册保存、广告开关由小型公共模块提供。项目不接入后端、云函数、账号、外部 API 或运行时第三方依赖；广告配置默认为空，失败时静默隐藏。

**Tech Stack:** 微信小程序原生 JavaScript/WXML/WXSS、Canvas 2D、微信客户端 API、Node.js 内置 `node:test`、Git/GitHub。

---

## 实施约束与完成定义

- 设计基线：`docs/superpowers/specs/2026-08-21-lite-image-toolbox-design.md`。
- 上游参考：`https://github.com/LittleWhite1995/tools-applet.git`，固定 commit `fce4004c35c73b7ed82ac5191d7ac5e7b23b34b0`，MIT License。
- 不复制上游 `utils/image-picker.js`：它调用 `wx.uploadFile` 做远程图片审核，与本项目“图片不上传”冲突。
- 不引入 TDesign：首版使用原生组件，减少构建步骤、包体和维护面。
- 每个任务只暂存列出的路径，禁止 `git add .` 和 `git add -A`。
- 每个产生代码或文档变更的任务都提交并推送当前功能分支。
- “代码完成”不等于“可发布”：干净检出编译、Android 真机、iPhone 真机、账号备案和微信后台隐私配置均是发布验收的一部分。

## 目标文件树

~~~text
.
├── .eslintrc.js
├── .gitignore
├── LICENSE
├── NOTICE
├── README.md
├── app.js
├── app.json
├── app.wxss
├── package.json
├── project.config.json
├── sitemap.json
├── components/
│   └── ad-slot/
│       ├── ad-slot.js
│       ├── ad-slot.json
│       ├── ad-slot.wxml
│       └── ad-slot.wxss
├── config/
│   └── ads.js
├── docs/
│   ├── privacy-guide.md
│   └── release-checklist.md
├── pages/
│   ├── index/
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── image-compress/
│   │   ├── image-compress.js
│   │   ├── image-compress.json
│   │   ├── image-compress.wxml
│   │   └── image-compress.wxss
│   ├── image-resize/
│   │   ├── image-resize.js
│   │   ├── image-resize.json
│   │   ├── image-resize.wxml
│   │   └── image-resize.wxss
│   ├── nine-grid/
│   │   ├── nine-grid.js
│   │   ├── nine-grid.json
│   │   ├── nine-grid.wxml
│   │   └── nine-grid.wxss
│   └── image-watermark/
│       ├── image-watermark.js
│       ├── image-watermark.json
│       ├── image-watermark.wxml
│       └── image-watermark.wxss
├── utils/
│   ├── ad-config.js
│   ├── canvas.js
│   ├── image-format.js
│   ├── image-math.js
│   ├── image-picker.js
│   └── image-save.js
└── tests/
    ├── ad-config.test.js
    ├── image-format.test.js
    └── image-math.test.js
~~~

## Task 1：建立可编译的最小项目骨架并锁定来源

**Files:**

- Create: `.eslintrc.js`
- Modify: `.gitignore`
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `package.json`
- Create: `app.js`
- Create: `app.json`
- Create: `app.wxss`
- Create: `project.config.json`
- Create: `sitemap.json`

- [ ] **Step 1: 从设计分支创建功能分支并做只读安全检查**

~~~powershell
git status --short --branch
git switch -c feat/lite-image-toolbox-v1
git config --show-origin --get-regexp '^http\..*sslVerify$|^http\.sslVerify$'
~~~

预期：工作区干净；新分支为 `feat/lite-image-toolbox-v1`。如果最后一条显示任何 `false`，只记录来源并告知用户，不在本任务中修改全局 Git 配置。

- [ ] **Step 2: 扩充忽略规则**

保留已有的 `.superpowers/`，追加：

~~~gitignore
node_modules/
miniprogram_npm/
project.private.config.json
.upstream-tools-applet/
coverage/
~~~

- [ ] **Step 3: 获取并核对固定上游版本**

~~~powershell
git clone https://github.com/LittleWhite1995/tools-applet.git .upstream-tools-applet
git -C .upstream-tools-applet checkout --detach fce4004c35c73b7ed82ac5191d7ac5e7b23b34b0
git -C .upstream-tools-applet rev-parse HEAD
Get-FileHash -Algorithm SHA256 .upstream-tools-applet\LICENSE
~~~

预期：HEAD 精确等于固定 commit。将上游 `LICENSE` 原样复制为根目录 `LICENSE`；不要复制上游 AppID、接口配置或图片选择模块。

- [ ] **Step 4: 写入来源声明**

`NOTICE` 完整内容：

~~~text
轻图工具箱

This project contains adapted code and implementation ideas from:
LittleWhite1995/tools-applet
https://github.com/LittleWhite1995/tools-applet
Pinned revision: fce4004c35c73b7ed82ac5191d7ac5e7b23b34b0
License: MIT

Modifications include reducing the project to four local image tools,
removing remote image moderation and all external API calls, replacing
third-party UI components with native mini-program components, and adding
local-only privacy and advertisement configuration controls.
~~~

- [ ] **Step 5: 创建不含运行时依赖的工程配置**

`package.json`：

~~~json
{
  "name": "lite-image-toolbox",
  "version": "1.0.0",
  "private": true,
  "description": "Local-only image tools for WeChat Mini Program",
  "scripts": {
    "test": "node --test",
    "check:network": "node scripts/check-no-network.js"
  }
}
~~~

本计划会在 Task 10 创建 `scripts/check-no-network.js`。在此之前只运行 `node --test`，不运行尚未存在的脚本。

`app.js`：

~~~javascript
App({})
~~~

`app.json`：

~~~json
{
  "pages": [
    "pages/index/index",
    "pages/image-compress/image-compress",
    "pages/image-resize/image-resize",
    "pages/nine-grid/nine-grid",
    "pages/image-watermark/image-watermark"
  ],
  "window": {
    "navigationBarTitleText": "轻图工具箱",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#f5f7f6",
    "backgroundTextStyle": "light"
  },
  "permission": {
    "scope.writePhotosAlbum": {
      "desc": "用于将您处理后的图片保存到系统相册"
    }
  },
  "__usePrivacyCheck__": true,
  "lazyCodeLoading": "requiredComponents",
  "sitemapLocation": "sitemap.json"
}
~~~

`project.config.json`：

~~~json
{
  "setting": {
    "es6": true,
    "postcss": true,
    "minified": true,
    "uglifyFileName": false,
    "enhance": true,
    "useCompilerPlugins": false,
    "minifyWXML": true
  },
  "compileType": "miniprogram",
  "packOptions": {
    "ignore": [],
    "include": []
  },
  "appid": "touristappid",
  "projectname": "lite-image-toolbox",
  "editorSetting": {}
}
~~~

`sitemap.json`：

~~~json
{
  "desc": "轻图工具箱页面索引规则",
  "rules": [
    {
      "action": "allow",
      "page": "*"
    }
  ]
}
~~~

`.eslintrc.js`：

~~~javascript
module.exports = {
  env: {
    browser: true,
    node: true,
  },
  globals: {
    App: 'readonly',
    Component: 'readonly',
    Page: 'readonly',
    getCurrentPages: 'readonly',
    wx: 'readonly',
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },
}
~~~

`app.wxss` 定义全局颜色、卡片、主按钮、次按钮、表单、预览区、错误提示和安全区底部间距；只使用系统字体，不引用 URL。全局色值固定为：

~~~css
page {
  --color-primary: #07c160;
  --color-primary-dark: #059b4d;
  --color-text: #18211d;
  --color-muted: #66736d;
  --color-border: #e5ebe8;
  --color-surface: #ffffff;
  --color-background: #f5f7f6;
  min-height: 100%;
  background: var(--color-background);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 32rpx 28rpx calc(40rpx + env(safe-area-inset-bottom));
}

.card {
  box-sizing: border-box;
  border: 1rpx solid var(--color-border);
  border-radius: 24rpx;
  background: var(--color-surface);
}

.primary-button,
.secondary-button {
  margin: 24rpx 0 0;
  border-radius: 16rpx;
  font-size: 30rpx;
}

.primary-button {
  color: #ffffff;
  background: var(--color-primary);
}

.primary-button::after,
.secondary-button::after {
  border: 0;
}

.secondary-button {
  color: var(--color-primary-dark);
  background: #eaf8f0;
}

.hint {
  color: var(--color-muted);
  font-size: 24rpx;
  line-height: 1.6;
}

.result-image {
  display: block;
  width: 100%;
  max-height: 760rpx;
  margin-top: 24rpx;
  border-radius: 16rpx;
}

.canvas-host {
  position: fixed;
  left: -9999px;
  top: -9999px;
}
~~~

- [ ] **Step 6: 验证敏感配置没有进入工程**

~~~powershell
rg -n "wx[0-9a-f]{16}|adunit-|https?://|wx\.uploadFile|wx\.request|wx\.cloud" --glob "!.git/**" --glob "!.upstream-tools-applet/**" .
git diff --check
~~~

预期：除 `NOTICE` 中上游仓库 URL 外，无命中；diff 检查无输出。

- [ ] **Step 7: 精确提交并推送**

~~~powershell
git add -- .eslintrc.js .gitignore LICENSE NOTICE package.json app.js app.json app.wxss project.config.json sitemap.json
git commit -m "chore: scaffold local-only mini program"
git push -u origin feat/lite-image-toolbox-v1
~~~

## Task 2：先用测试固定图片计算、格式和广告边界

**Files:**

- Create: `utils/image-math.js`
- Create: `utils/image-format.js`
- Create: `utils/ad-config.js`
- Create: `tests/image-math.test.js`
- Create: `tests/image-format.test.js`
- Create: `tests/ad-config.test.js`

- [ ] **Step 1: 写尺寸、九宫格、水印位置的失败测试**

`tests/image-math.test.js` 必须覆盖：

~~~javascript
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

test('resolveLockedSize updates height from width', () => {
  assert.deepEqual(resolveLockedSize(4000, 3000, 'width', 1000), { width: 1000, height: 750 })
})

test('resolveLockedSize updates width from height', () => {
  assert.deepEqual(resolveLockedSize(4000, 3000, 'height', 600), { width: 800, height: 600 })
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
~~~

- [ ] **Step 2: 运行测试并确认因模块缺失而失败**

~~~powershell
node --test tests/image-math.test.js
~~~

预期：退出码非 0，错误包含 `Cannot find module '../utils/image-math'`。

- [ ] **Step 3: 实现最小纯函数**

`utils/image-math.js` 导出上述七个函数。实现规则：

- 所有宽高先验证为有限正数，无效值抛出 `RangeError`。
- `fitWithinSide` 等比缩小且不放大，输出宽高四舍五入，最小为 1。
- `getNineGridTile` 只接受索引 0–8，按从左到右、从上到下计算。
- 水印坐标只接受 `top-left`、`top-right`、`center`、`bottom-left`、`bottom-right`。
- 不引用 `wx`，保证 Node 环境可测。

实现核心公式：

~~~javascript
function positive(value, name) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(name + ' must be a positive number')
  }
  return number
}

function fitWithinSide(width, height, maxSide) {
  const sourceWidth = positive(width, 'width')
  const sourceHeight = positive(height, 'height')
  const limit = positive(maxSide, 'maxSide')
  const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight))
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scale,
  }
}

function resizeByPercent(width, height, percent) {
  const scale = positive(percent, 'percent') / 100
  return {
    width: Math.max(1, Math.round(positive(width, 'width') * scale)),
    height: Math.max(1, Math.round(positive(height, 'height') * scale)),
  }
}

function resolveLockedSize(sourceWidth, sourceHeight, changed, value) {
  const width = positive(sourceWidth, 'sourceWidth')
  const height = positive(sourceHeight, 'sourceHeight')
  const next = Math.max(1, Math.round(positive(value, 'value')))
  if (changed === 'width') {
    return { width: next, height: Math.max(1, Math.round(next * height / width)) }
  }
  if (changed === 'height') {
    return { width: Math.max(1, Math.round(next * width / height)), height: next }
  }
  throw new RangeError('changed must be width or height')
}

function getSquareCrop(width, height) {
  const sourceWidth = positive(width, 'width')
  const sourceHeight = positive(height, 'height')
  const size = Math.min(sourceWidth, sourceHeight)
  return {
    x: (sourceWidth - size) / 2,
    y: (sourceHeight - size) / 2,
    size,
  }
}

function getNineGridTile(crop, index) {
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    throw new RangeError('index must be an integer from 0 to 8')
  }
  const tileSize = positive(crop.size, 'crop.size') / 3
  return {
    x: Number(crop.x) + (index % 3) * tileSize,
    y: Number(crop.y) + Math.floor(index / 3) * tileSize,
    size: tileSize,
  }
}
~~~

`getWatermarkPoint` 用 `position` 分支返回测试中的坐标和 Canvas 对齐方式；`opacityPercentToAlpha` 使用 `Math.min(100, Math.max(0, Number(percent))) / 100`，非有限数抛 `RangeError`。

- [ ] **Step 4: 写格式和广告配置失败测试**

`tests/image-format.test.js`：

~~~javascript
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
~~~

`tests/ad-config.test.js`：

~~~javascript
const test = require('node:test')
const assert = require('node:assert/strict')
const { hasConfiguredAdUnit } = require('../utils/ad-config')

test('empty and placeholder ad IDs stay disabled', () => {
  assert.equal(hasConfiguredAdUnit(''), false)
  assert.equal(hasConfiguredAdUnit('adunit-'), false)
  assert.equal(hasConfiguredAdUnit('replace-me'), false)
})

test('a valid banner unit ID enables the slot', () => {
  assert.equal(hasConfiguredAdUnit('adunit-a1B2c3D4'), true)
})
~~~

- [ ] **Step 5: 运行并观察预期失败**

~~~powershell
node --test
~~~

预期：新增两个模块缺失测试失败。

- [ ] **Step 6: 实现格式与广告纯函数**

`utils/image-format.js`：

~~~javascript
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
  if (normalizeImageFormat(format, '') === 'png') {
    return { fileType: 'png' }
  }
  const value = Number(quality)
  return {
    fileType: 'jpg',
    quality: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.8,
  }
}

module.exports = {
  getCanvasExportOptions,
  normalizeImageFormat,
  shouldFillWhite,
}
~~~

`utils/ad-config.js`：

~~~javascript
function hasConfiguredAdUnit(unitId) {
  return /^adunit-[a-z0-9]+$/i.test(String(unitId || '').trim())
}

module.exports = { hasConfiguredAdUnit }
~~~

- [ ] **Step 7: 运行全部逻辑测试**

~~~powershell
npm test
~~~

预期：全部测试通过，退出码 0。

- [ ] **Step 8: 精确提交并推送**

~~~powershell
git add -- utils/image-math.js utils/image-format.js utils/ad-config.js tests/image-math.test.js tests/image-format.test.js tests/ad-config.test.js
git commit -m "test: define local image processing rules"
git push
~~~

## Task 3：实现无网络的公共选图、Canvas 和保存层

**Files:**

- Create: `utils/image-picker.js`
- Create: `utils/canvas.js`
- Create: `utils/image-save.js`

- [ ] **Step 1: 实现只选择一张图片的本地选择器**

`utils/image-picker.js` 只允许调用 `wx.chooseMedia` 和 `wx.getImageInfo`，不得出现上传、审核或网络请求。公开接口：

~~~javascript
async function chooseSingleImage() {
  try {
    const choice = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
    })
    const file = choice.tempFiles && choice.tempFiles[0]
    if (!file || !file.tempFilePath) return null
    const info = await wx.getImageInfo({ src: file.tempFilePath })
    return {
      path: file.tempFilePath,
      size: Number(file.size) || 0,
      width: info.width,
      height: info.height,
      type: info.type || '',
    }
  } catch (error) {
    if (/cancel/i.test(String(error && error.errMsg))) return null
    throw error
  }
}

module.exports = { chooseSingleImage }
~~~

- [ ] **Step 2: 实现 Canvas Promise 包装**

`utils/canvas.js` 提供：

- `getCanvas(page, selector)`：通过 `page.createSelectorQuery()` 获取 `type="2d"` Canvas node，获取不到时拒绝并给出明确错误。
- `loadCanvasImage(canvas, path)`：使用 `canvas.createImage()`，在 `onload` 后返回 image。
- `prepareCanvas(canvas, width, height, pixelRatio)`：CSS 逻辑尺寸不超过 4096，实际 backing store 乘以 `Math.min(pixelRatio, 2)`，随后 `context.scale`。
- `exportCanvas(canvas, width, height, format, quality)`：调用 `wx.canvasToTempFilePath`；导出参数来自 `getCanvasExportOptions`。
- `formatBytes(bytes)`：0 B、KB、MB 的用户可读展示。

统一的 Canvas 选择器为 `#processor-canvas`。导出拒绝时不得返回空路径。

- [ ] **Step 3: 实现可恢复的相册保存**

`utils/image-save.js` 提供 `saveImageToAlbum(filePath)`。顺序固定为：

1. 若存在 `wx.requirePrivacyAuthorize`，先调用并等待。
2. 使用 `wx.getSetting` 检查 `scope.writePhotosAlbum`。
3. 未决定时调用 `wx.authorize`。
4. 已拒绝时只弹一次说明对话框；用户确认后调用 `wx.openSetting`。
5. 权限可用后调用 `wx.saveImageToPhotosAlbum`。
6. 用户取消授权、对话框或保存时，返回 `{ saved: false, cancelled: true }`，页面不显示错误。
7. 临时文件不存在时抛出带“请重新处理图片”的错误。
8. 成功返回 `{ saved: true, cancelled: false }`。

禁止保存原图来伪装处理结果；调用方只能传本轮生成的临时文件。

- [ ] **Step 4: 静态验证公共层无网络能力**

~~~powershell
rg -n "uploadFile|request\s*\(|wx\.cloud|https?://" utils
node --check utils/image-picker.js
node --check utils/canvas.js
node --check utils/image-save.js
npm test
~~~

预期：网络扫描无输出；语法和测试全部通过。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- utils/image-picker.js utils/canvas.js utils/image-save.js
git commit -m "feat: add local image and album utilities"
git push
~~~

## Task 4：实现默认关闭且失败隐藏的 Banner 广告

**Files:**

- Create: `config/ads.js`
- Create: `components/ad-slot/ad-slot.js`
- Create: `components/ad-slot/ad-slot.json`
- Create: `components/ad-slot/ad-slot.wxml`
- Create: `components/ad-slot/ad-slot.wxss`

- [ ] **Step 1: 创建空广告配置**

`config/ads.js`：

~~~javascript
module.exports = {
  homeBannerUnitId: '',
  resultBannerUnitId: '',
}
~~~

仓库中的广告配置永远保持空值。取得流量主资格后，发布者可以在发布工作区临时填写真实广告 ID，但提交前必须用 `git diff -- config/ads.js` 检查，并在上传代码后恢复为空值。不要使用一个不存在的本地 require 覆盖文件，因为微信开发者工具会在构建期解析 require，缺失文件会导致编译失败。

- [ ] **Step 2: 创建广告组件**

`ad-slot.json`：

~~~json
{
  "component": true
}
~~~

`ad-slot.js`：

~~~javascript
const { hasConfiguredAdUnit } = require('../../utils/ad-config')

Component({
  properties: {
    unitId: {
      type: String,
      value: '',
      observer(value) {
        this.setData({
          enabled: hasConfiguredAdUnit(value),
          failed: false,
        })
      },
    },
  },
  data: {
    enabled: false,
    failed: false,
  },
  methods: {
    onError() {
      this.setData({ failed: true })
    },
  },
})
~~~

`ad-slot.wxml`：

~~~xml
<view wx:if="{{enabled && !failed}}" class="ad-slot">
  <ad unit-id="{{unitId}}" ad-type="banner" binderror="onError" />
</view>
~~~

`ad-slot.wxss`：

~~~css
.ad-slot {
  min-height: 0;
  margin-top: 24rpx;
  overflow: hidden;
}
~~~

空 ID 时整个组件内容不存在；加载错误后组件内容立即消失。组件不发出任何阻塞核心流程的事件。

- [ ] **Step 3: 验证空配置与语法**

~~~powershell
npm test
node --check config/ads.js
node --check components/ad-slot/ad-slot.js
rg -n "adunit-[a-z0-9]" config components
~~~

预期：测试通过；真实广告 ID 扫描无输出。

- [ ] **Step 4: 精确提交并推送**

~~~powershell
git add -- config/ads.js components/ad-slot/ad-slot.js components/ad-slot/ad-slot.json components/ad-slot/ad-slot.wxml components/ad-slot/ad-slot.wxss
git commit -m "feat: add optional banner ad slots"
git push
~~~

## Task 5：实现“清爽可信”的四卡片首页

**Files:**

- Create: `pages/index/index.js`
- Create: `pages/index/index.json`
- Create: `pages/index/index.wxml`
- Create: `pages/index/index.wxss`

- [ ] **Step 1: 创建精确的四工具目录**

`index.js`：

~~~javascript
const { homeBannerUnitId } = require('../../config/ads')

const tools = [
  { title: '图片压缩', description: '减小图片体积', icon: '压', path: '/pages/image-compress/image-compress' },
  { title: '尺寸调整', description: '按比例修改宽高', icon: '尺', path: '/pages/image-resize/image-resize' },
  { title: '九宫格切图', description: '一键生成九张图', icon: '九', path: '/pages/nine-grid/nine-grid' },
  { title: '文字水印', description: '为图片添加文字', icon: '印', path: '/pages/image-watermark/image-watermark' },
]

Page({
  data: {
    homeBannerUnitId,
    tools,
  },
  openTool(event) {
    const path = event.currentTarget.dataset.path
    if (path) wx.navigateTo({ url: path })
  },
})
~~~

`index.json` 注册 `ad-slot`，页面标题为“轻图工具箱”。

- [ ] **Step 2: 实现首页 WXML**

结构仅包含：

1. 顶部标题“轻图工具箱”。
2. 主标语“安全、快速、无需上传”。
3. 文案“图片只在您的设备本地处理”。
4. 两列四卡片，卡片绑定 `data-path` 和 `openTool`。
5. 底部隐私提示。
6. `<ad-slot unit-id="{{homeBannerUnitId}}" />`。

不添加搜索、话题、用户资料、分享裂变、在线图片或未实现入口。

- [ ] **Step 3: 完成首页样式**

固定要求：

- hero 区使用 `#eaf8f0` 背景、24rpx 圆角。
- 工具网格使用两列、16rpx 间距。
- 每张卡最小高度 210rpx、点击区域覆盖整卡。
- 图标用纯文字圆形徽标，不依赖图片文件或网络字体。
- 空广告配置时首页底部没有预留广告高度。

- [ ] **Step 4: 静态检查和手工编译检查**

~~~powershell
node --check pages/index/index.js
rg -n "search|topic|login|avatar|https?://" pages/index
npm test
~~~

用微信开发者工具导入当前目录；预期首页无编译错误，四卡片均可点击进入尚待完善的页面路径。如果目标页面尚不存在，先创建四个空目录和最小页面占位文件，并在后续任务中完整替换；占位页面只显示工具名称，不包含假功能。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- pages/index/index.js pages/index/index.json pages/index/index.wxml pages/index/index.wxss pages/image-compress pages/image-resize pages/nine-grid pages/image-watermark
git commit -m "feat: add four-tool home page"
git push
~~~

## Task 6：完成图片压缩闭环

**Files:**

- Replace: `pages/image-compress/image-compress.js`
- Replace: `pages/image-compress/image-compress.json`
- Replace: `pages/image-compress/image-compress.wxml`
- Replace: `pages/image-compress/image-compress.wxss`

- [ ] **Step 1: 先增加压缩规则测试**

在 `tests/image-format.test.js` 增加：

~~~javascript
test('JPG quality is clamped while PNG ignores quality', () => {
  assert.deepEqual(getCanvasExportOptions('jpg', 2), { fileType: 'jpg', quality: 1 })
  assert.deepEqual(getCanvasExportOptions('jpg', -1), { fileType: 'jpg', quality: 0 })
  assert.deepEqual(getCanvasExportOptions('png', 0.8), { fileType: 'png' })
})
~~~

运行 `npm test`，确认测试通过；如果失败，只修改 `image-format.js` 使这些明确规则通过。

- [ ] **Step 2: 实现页面状态和选图**

页面 data 只包含：

- `source`：path、size、width、height、format。
- `quality: 80`。
- `processing: false`。
- `resultPath: ''`、`resultSize: 0`。
- `errorMessage: ''`。
- `resultBannerUnitId`。

`chooseImage` 调用 `chooseSingleImage`；取消时不改现有状态、不弹错；成功时先清空上一轮 result，再写 source。页面卸载时清空 JS 引用。

- [ ] **Step 3: 实现本地压缩**

`compressImage` 的固定流程：

1. 无 source 时提示“请先选择图片”。
2. 设置 processing，清空错误和旧结果。
3. 使用 `fitWithinSide(source.width, source.height, 4096)` 控制 Canvas 边长。
4. 加载 Canvas image。
5. PNG 不填背景并按 PNG 导出；其他格式先填白色再按 JPG 导出。
6. JPG 使用 `quality / 100`；PNG UI 显示“透明 PNG 将保持透明，质量数值不影响 PNG 编码”。
7. 用 `wx.getFileSystemManager().stat` 读取结果大小；stat 失败时仍允许预览和保存，只显示“大小暂不可用”。
8. 只有获得非空 resultPath 才更新结果区。
9. finally 中恢复 processing。

Canvas 节点固定为：

~~~xml
<canvas id="processor-canvas" type="2d" class="canvas-host"></canvas>
~~~

- [ ] **Step 4: 实现预览、保存和广告**

- 选图区显示原图尺寸和文件大小。
- slider 范围 20–95，步长 5，默认 80。
- 结果区显示结果预览、处理前后大小和“保存到相册”。
- 保存只调用 `saveImageToAlbum(resultPath)`。
- 成功 toast：“已保存到相册”；取消不提示错误。
- `ad-slot` 位于保存按钮下方。
- 广告无论成功或失败都不参与按钮 enable 条件。

- [ ] **Step 5: 验证压缩页面**

~~~powershell
node --check pages/image-compress/image-compress.js
npm test
rg -n "uploadFile|wx\.request|https?://" pages/image-compress utils
~~~

在开发者工具手工验证普通 JPG 和透明 PNG：JPG 质量变化可导出；PNG 透明区域不被白底替换。

- [ ] **Step 6: 精确提交并推送**

~~~powershell
git add -- tests/image-format.test.js utils/image-format.js pages/image-compress/image-compress.js pages/image-compress/image-compress.json pages/image-compress/image-compress.wxml pages/image-compress/image-compress.wxss
git commit -m "feat: add local image compression"
git push
~~~

## Task 7：完成尺寸调整闭环

**Files:**

- Replace: `pages/image-resize/image-resize.js`
- Replace: `pages/image-resize/image-resize.json`
- Replace: `pages/image-resize/image-resize.wxml`
- Replace: `pages/image-resize/image-resize.wxss`

- [ ] **Step 1: 增加边界测试**

在 `tests/image-math.test.js` 增加无效尺寸测试：

~~~javascript
test('invalid resize values fail explicitly', () => {
  assert.throws(() => resizeByPercent(100, 100, 0), RangeError)
  assert.throws(() => resolveLockedSize(100, 100, 'width', ''), RangeError)
  assert.throws(() => fitWithinSide(0, 100, 4096), RangeError)
})
~~~

运行 `npm test`，确认规则已被锁定。

- [ ] **Step 2: 实现三种尺寸模式**

页面仅提供：

- “原图”：输出原始宽高。
- “50%”：调用 `resizeByPercent`。
- “自定义”：两个 number input。
- “锁定宽高比”：默认开启。

锁定时，宽度输入调用 `resolveLockedSize(sourceWidth, sourceHeight, 'width', value)`；高度输入同理。关闭锁定时只更新当前输入。宽高必须是 1–4096 的整数；超出时在处理按钮上方显示明确错误，不静默截断。

- [ ] **Step 3: 实现 Canvas 导出**

- 保持整个原图，不裁剪、不拉伸为不同宽高比。
- 如果用户关闭比例锁并输入不同宽高比，允许按目标宽高缩放，页面明确显示“关闭比例锁后图片可能变形”。
- PNG 输出 PNG 且不填背景；其他输出 JPG、白底、质量 0.92。
- 开始新处理前清空旧结果。
- 保存和广告行为与压缩页相同。

- [ ] **Step 4: 验证尺寸页**

~~~powershell
node --check pages/image-resize/image-resize.js
npm test
rg -n "passport|template|cover|contain|stretch|uploadFile|wx\.request" pages/image-resize
~~~

预期：旧上游证件照模板和 fit mode 概念没有残留。手工验证原图、50%、自定义锁定与不锁定、透明 PNG。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- tests/image-math.test.js utils/image-math.js pages/image-resize/image-resize.js pages/image-resize/image-resize.json pages/image-resize/image-resize.wxml pages/image-resize/image-resize.wxss
git commit -m "feat: add local image resizing"
git push
~~~

## Task 8：完成九宫格切图与顺序保存

**Files:**

- Replace: `pages/nine-grid/nine-grid.js`
- Replace: `pages/nine-grid/nine-grid.json`
- Replace: `pages/nine-grid/nine-grid.wxml`
- Replace: `pages/nine-grid/nine-grid.wxss`

- [ ] **Step 1: 补充完整九格顺序测试**

在 `tests/image-math.test.js` 增加循环断言，确认索引 0–8 的 row-major 坐标唯一且顺序正确；增加索引 -1、9、1.5 抛 `RangeError` 的测试。

- [ ] **Step 2: 实现正方形居中裁剪**

页面不提供多种裁剪模式。选图后用 `getSquareCrop` 展示居中正方形预览说明；横图裁掉左右，竖图裁掉上下。

生成流程：

1. 输出 tile 边长为 `Math.min(Math.floor(crop.size / 3), 1024)`。
2. 依次遍历索引 0–8。
3. 每次使用 `getNineGridTile(crop, index)` 取得 source rect。
4. 将 source rect 绘制到完整 tile Canvas。
5. PNG source 按 PNG 导出，不填背景；其他按 JPG 0.92 导出。
6. 每张成功导出后再处理下一张，避免同时占用九个 Canvas。
7. 任一张失败则丢弃本轮结果数组，不显示不完整九宫格。
8. 全部成功后以 3×3 预览网格呈现。

- [ ] **Step 3: 实现顺序保存**

“按顺序保存 9 张”按钮：

- 先确认结果数组长度严格为 9。
- 从索引 0 到 8 串行调用 `saveImageToAlbum`。
- 中途用户取消权限或保存时立即停止，提示“已保存 X/9 张，可重新点击继续”；页面记录 `savedCount`，再次点击从该索引继续。
- 全部完成后 toast：“9 张图片已按顺序保存”。
- 新选图或重新生成时 `savedCount` 归零。
- 广告位在保存按钮下方，不插入九张保存过程。

- [ ] **Step 4: 验证九宫格**

~~~powershell
node --check pages/nine-grid/nine-grid.js
npm test
rg -n "uploadFile|wx\.request|https?://" pages/nine-grid
~~~

手工用带有明显 1–9 标记的正方形测试图验证预览和相册顺序；再测极端横图、极端竖图、透明 PNG。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- tests/image-math.test.js utils/image-math.js pages/nine-grid/nine-grid.js pages/nine-grid/nine-grid.json pages/nine-grid/nine-grid.wxml pages/nine-grid/nine-grid.wxss
git commit -m "feat: add local nine-grid generator"
git push
~~~

## Task 9：完成固定位置文字水印

**Files:**

- Replace: `pages/image-watermark/image-watermark.js`
- Replace: `pages/image-watermark/image-watermark.json`
- Replace: `pages/image-watermark/image-watermark.wxml`
- Replace: `pages/image-watermark/image-watermark.wxss`

- [ ] **Step 1: 增加全部五位置测试**

在 `tests/image-math.test.js` 补齐右上、左下，并验证未知位置抛 `RangeError`。使用固定 input，期望：

- top-right：`x=968, y=32, textAlign='right', textBaseline='top'`
- bottom-left：`x=32, y=768, textAlign='left', textBaseline='bottom'`

- [ ] **Step 2: 实现最小水印参数**

页面只包含：

- text input，最多 30 个 Unicode 字符，trim 后不能为空。
- 颜色：黑 `#000000`、白 `#ffffff`。
- 位置：左上、右上、居中、左下、右下。
- opacity slider：20–100，步长 5，默认 70。

不出现 Logo、在线素材、平铺、旋转或字体下载选项。

- [ ] **Step 3: 实现单个文字水印**

绘制规则：

1. 先按原格式绘制整张原图；PNG 不填白底。
2. 字号为 `Math.max(24, Math.round(Math.min(width, height) * 0.055))`，最大不超过 96。
3. padding 为 `Math.max(16, Math.round(fontSize * 0.8))`。
4. 用 `context.measureText(text).width` 得到 textWidth。
5. 用 `getWatermarkPoint` 得到坐标与对齐方式。
6. `context.globalAlpha = opacityPercentToAlpha(opacity)`。
7. 设置 color、font、textAlign、textBaseline，调用一次 `fillText`。
8. 立即恢复 `globalAlpha = 1`。
9. PNG 按 PNG 导出，其他按 JPG 0.92。

文字过长超过可用宽度时，逐步减小字号到 24；仍超宽则截断绘制并在处理前提示用户缩短文字，不允许绘出 Canvas 边界。

- [ ] **Step 4: 验证水印页**

~~~powershell
node --check pages/image-watermark/image-watermark.js
npm test
rg -n "logo|repeat|rotate|uploadFile|wx\.request|https?://" pages/image-watermark
~~~

手工验证黑/白、五位置、20%/70%/100%、透明 PNG、极端横竖图和连续处理。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- tests/image-math.test.js utils/image-math.js pages/image-watermark/image-watermark.js pages/image-watermark/image-watermark.json pages/image-watermark/image-watermark.wxml pages/image-watermark/image-watermark.wxss
git commit -m "feat: add local text watermarking"
git push
~~~

## Task 10：加入可自动执行的“无网络能力”门禁

**Files:**

- Create: `scripts/check-no-network.js`
- Modify: `package.json`

- [ ] **Step 1: 写一个会被故意违规文件触发的检查器测试**

创建 `tests/check-no-network.test.js`，在系统临时目录生成：

- 一个包含 `wx.uploadFile` 的 JS 文件，断言扫描返回违规。
- 一个只包含 `wx.chooseMedia` 的 JS 文件，断言扫描通过。
- 一个 `NOTICE` 文本 URL，断言非运行时代码不扫描。

先运行测试并确认因模块缺失失败。

- [ ] **Step 2: 实现扫描器**

`scripts/check-no-network.js`：

- 导出 `scanFiles(root)`，供测试调用。
- 只扫描 `app.js`、`pages/**/*.js`、`utils/**/*.js`、`components/**/*.js`、`config/**/*.js`。
- 忽略 `.git`、`.upstream-tools-applet`、`node_modules`、`miniprogram_npm`。
- 禁止模式：
  - `wx.uploadFile`
  - `wx.downloadFile`
  - `wx.request`
  - `wx.cloud`
  - `https://` 或 `http://`
- 输出每个违规文件、行号和模式；存在违规时 `process.exitCode = 1`。
- 直接执行脚本时扫描 `process.cwd()`；被 require 时不自动退出。

- [ ] **Step 3: 将门禁加入测试脚本**

`package.json` scripts 调整为：

~~~json
{
  "test": "node --test && node scripts/check-no-network.js",
  "check:network": "node scripts/check-no-network.js"
}
~~~

- [ ] **Step 4: 验证门禁**

~~~powershell
npm test
npm run check:network
~~~

预期：所有测试和无网络扫描通过。扫描器本身包含禁用模式字符串，因此必须排除 `scripts/`，否则会自报。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- package.json scripts/check-no-network.js tests/check-no-network.test.js
git commit -m "test: block runtime network capabilities"
git push
~~~

## Task 11：补齐 README、隐私说明和个人发布清单

**Files:**

- Create: `README.md`
- Create: `docs/privacy-guide.md`
- Create: `docs/release-checklist.md`

- [ ] **Step 1: 写 README**

README 必须真实包含：

- 产品截图位置暂不伪造；没有真机截图时不放占位图。
- 四个工具及首版明确不包含的功能。
- “图片只在设备本地处理”的技术依据：运行时代码网络门禁、无服务器配置、无登录。
- 环境要求：微信开发者工具、个人小程序 AppID；Node.js 仅用于本地逻辑测试。
- 导入步骤：克隆、`npm test`、开发者工具导入根目录、在本地把 `project.config.json` 的 `touristappid` 改为自己的 AppID，上传完成后恢复该文件，不提交真实 AppID。
- 广告默认关闭；流量主开通后在发布工作区临时填写 `config/ads.js`，上传完成后立即恢复空值，不提交真实广告 ID。
- LICENSE 与上游 NOTICE。
- 收益不保证，取决于用户量、留存、广告填充和平台规则。

- [ ] **Step 2: 写隐私说明**

`docs/privacy-guide.md` 必须逐项映射真实代码：

| 能力 | 用途 | 是否上传 | 保存位置 |
|---|---|---:|---|
| 选择相册图片/拍照 | 用户主动选择待处理图片 | 否 | 微信临时文件 |
| Canvas 处理 | 压缩、调整、切图、水印 | 否 | 微信临时文件 |
| 写入相册 | 用户点击保存结果 | 否 | 用户系统相册 |
| Banner 广告 | 流量主开通后展示 | 不接触用户图片 | 由微信广告组件处理 |

明确不采集手机号、头像、昵称、位置、设备标识和图片内容；说明临时文件由微信运行环境管理，页面不建立历史数据库。

- [ ] **Step 3: 写个人主体发布清单**

`docs/release-checklist.md` 按顺序提供复选框：

1. 注册并实名认证个人小程序。
2. 完成小程序备案和主体扫码。
3. 获取 AppID，放入本地私有配置，不提交仓库。
4. 在微信后台填写名称、类目、简介、服务内容。
5. 根据真实代码配置用户隐私保护指引和相册保存用途。
6. 微信开发者工具干净导入、编译、代码质量检查。
7. 普通 JPG、透明 PNG、超大图片、极端横竖图、取消、拒绝权限、连续处理逐页验证。
8. Android 真机验证。
9. iPhone 真机验证。
10. 上传体验版并用体验成员账号复测。
11. 尚未满足流量主资格时保持广告配置为空。
12. 满足资格后只配置两个 Banner unit ID，验证失败隐藏。
13. 上传审核版、填写功能说明、提交审核。
14. 审核通过后发布，首周查看崩溃、权限和广告异常。

Android 或 iPhone 任一真机未通过时，清单必须保持未完成，不能写成“模拟器已替代”。

- [ ] **Step 4: 文档与源码一致性检查**

~~~powershell
rg -n "登录|支付|云函数|服务器|上传|广告|AppID|隐私" README.md docs
npm test
git diff --check
~~~

逐项对照 app.json、config/ads.js、公共图片层；删除文档中任何源码不存在的能力。

- [ ] **Step 5: 精确提交并推送**

~~~powershell
git add -- README.md docs/privacy-guide.md docs/release-checklist.md
git commit -m "docs: add privacy and release guidance"
git push
~~~

## Task 12：干净检出、开发者工具和真机发布验收

**Files:**

- Modify only if verification exposes a defect: exact affected source/test/doc files
- Update after real verification: `docs/release-checklist.md`

- [ ] **Step 1: 自动化验收**

~~~powershell
git status --short
npm test
node --check app.js
Get-ChildItem -Recurse -File -Include *.js | Where-Object {
  $_.FullName -notmatch '\\.git\\|\\.upstream-tools-applet\\|node_modules'
} | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($_.FullName)" }
}
rg -n "wx[0-9a-f]{16}|adunit-[a-z0-9]+|wx\.uploadFile|wx\.downloadFile|wx\.request|wx\.cloud|https?://" --glob "!.git/**" --glob "!.upstream-tools-applet/**" --glob "!NOTICE" .
git diff --check
~~~

预期：工作区起始干净；测试、语法、网络门禁通过；无真实 AppID/广告 ID/运行时网络能力；diff 无格式错误。

- [ ] **Step 2: 从全新目录验证仓库可复现**

使用临时目录而非当前工作区：

~~~powershell
$verifyRoot = Join-Path $env:TEMP 'lite-image-toolbox-clean-verify'
if (Test-Path -LiteralPath $verifyRoot) {
  throw "Verification directory already exists: $verifyRoot"
}
git clone --branch feat/lite-image-toolbox-v1 https://github.com/xianfanwindy/lite-image-toolbox.git $verifyRoot
git -C $verifyRoot rev-parse HEAD
Push-Location $verifyRoot
npm test
Pop-Location
~~~

不要自动删除验证目录；验证后向用户报告其路径，用户确认后再清理。

- [ ] **Step 3: 微信开发者工具编译验收**

在全新检出目录完成：

- 导入项目，使用测试号或用户私有 AppID。
- 清缓存并重新编译。
- 确认没有缺失组件、WXML/WXSS 错误和基础库 API 错误。
- 四个入口逐一完成选择、处理、预览、保存。
- 广告配置为空时首页和结果页没有空白块。
- 在本地临时填入无效广告 ID，确认广告错误后隐藏且功能可继续。

任何编译或运行缺陷都先添加最小复现测试（纯逻辑适用时），修复后重新从 Step 1 验证。

- [ ] **Step 4: Android 与 iPhone 真机矩阵**

每台设备、每个工具都执行：

- 普通 JPG。
- 透明 PNG。
- 约 20MP 或设备可选的最大图片。
- 极端横图和竖图。
- 取消选图。
- 首次拒绝相册权限，再从设置恢复。
- 连续处理三次。
- 返回首页再进入。
- 锁屏/切后台后返回并再次保存。

记录机型、系统版本、微信版本、结果。两类设备均通过后才勾选发布清单相应项目。

- [ ] **Step 5: 最终来源、秘密和工作区检查**

~~~powershell
git status --short --branch
git log --oneline --decorate -12
git ls-files | rg "project\.private\.config\.json|ads\.local\.js|node_modules|miniprogram_npm|\.upstream-tools-applet"
git grep -n -E "wx[0-9a-f]{16}|adunit-[A-Za-z0-9]+|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"
git remote -v
~~~

预期：功能分支跟踪 origin；被忽略的私有文件和依赖目录均未被跟踪；秘密扫描无输出。

- [ ] **Step 6: 提交验证过程中产生的必要修复并推送**

若无缺陷，不创建空提交。若有修复，先用 `git diff --name-only` 列出实际改动，再逐个运行 `git add -- 路径一 路径二`；命令中必须写出本轮真实文件路径。随后执行 `git commit -m "fix: resolve release verification findings"` 和 `git push`。

## 最终交付物

完成全部任务后应交付：

- GitHub 功能分支 `feat/lite-image-toolbox-v1`。
- 设计规格与本实施计划。
- 可通过 `npm test` 的逻辑测试和无网络门禁。
- 可由微信开发者工具干净导入和编译的源码。
- Android、iPhone 真机验证记录。
- README、隐私说明、个人主体发布清单。
- 空 AppID/空广告配置的安全默认值。
- 上游 MIT License 和固定 commit NOTICE。

如果用户尚未完成账号注册、备案、AppID 获取或最终审核提交，交付状态必须表述为“源码与审核准备就绪”，不得表述为“已上线”。
