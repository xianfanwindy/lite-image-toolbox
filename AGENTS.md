# AGENTS.md - 轻图工具箱

原生微信小程序，四个纯本地图片工具：压缩、尺寸调整、九宫格切图、文字水印。
不接入后端、云函数、外部 API、用户账号、微信支付。

## 红线：运行时禁止网络

`app.js`、`pages/`、`utils/`、`components/`、`config/` 中的运行时代码禁止出现 `wx.request`、`wx.uploadFile`、`wx.downloadFile`、`wx.cloud` 及任何 HTTP(S) 地址。
`scripts/check-no-network.js` 在 `npm test` 中强制门禁，违反即测试失败。新增功能必须先过此门禁。

## 测试

- 框架：Node.js 内置 `node:test`，运行 `npm test`（先跑全部 `tests/*.test.js`，再跑网络门禁）。
- 每个工具页面都有生命周期硬化测试：canvas 释放、结果失效保护、保存互斥、卸载阻断延迟更新。新增页面交互必须延续此模式。
- 纯逻辑（尺寸计算、格式判断、广告开关）写在 `utils/`，配独立单测。

## Canvas 约定

- `utils/canvas.js` 限制单边 ≤ 4096px、总像素 ≤ 16MP（`MAX_CANVAS_PIXELS = 16777216`）。超限抛 `RangeError` 并给出恢复指引，不要静默截断。
- 水印文字按 Unicode code point / grapheme cluster 计数（上限 30），不要用 `string.length`。
- PNG 保持透明通道，导出不传 quality；仅 JPG 传 quality。

## 默认值与秘密

- `project.config.json` 的 `appid` 保持 `touristappid`，只在本地临时替换为真实 AppID，禁止提交。
- `config/ads.js` 两个 Banner unit ID 默认为空字符串，只在本地发布时临时填写，禁止提交真实 ID。
- 广告加载失败时静默隐藏，不影响图片处理、预览和保存。

## 上游来源

- 参考自 `LittleWhite1995/tools-applet`，固定 commit `fce4004`，MIT License，来源见 `NOTICE`。
- `.upstream-tools-applet/` 是本地只读参考（已 gitignore），不要把其中代码直接复制进项目。
- 上游 `utils/image-picker.js` 调用 `wx.uploadFile` 做远程图片审核，与本项目"图片不上传"冲突，不可复用。

## 深入文档

| 主题 | 文件 |
|---|---|
| 产品设计规格 | `docs/superpowers/specs/2026-08-21-lite-image-toolbox-design.md` |
| 实施计划 | `docs/superpowers/plans/2026-08-21-lite-image-toolbox-v1.md` |
| 隐私指引 | `docs/privacy-guide.md` |
| 发布清单 | `docs/release-checklist.md` |
