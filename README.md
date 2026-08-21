# 轻图工具箱

“轻图工具箱”是一款面向个人用户的原生微信小程序。首版只提供四个在设备本地完成的图片工具，目标是保持功能简单、隐私边界清晰，并降低上线后的维护成本。

当前仓库的 Node.js 自动化测试和运行时网络门禁已通过；由于尚无可用的个人小程序 AppID、WeChat DevTools 和 Android / iPhone 真机，本项目还没有完成开发者工具编译与真机验收，不能据此视为已经上线或可以直接发布。

## 首版功能

- 图片压缩：调整 JPG 导出质量；PNG 保持透明通道，不承诺仅靠质量参数显著减小体积。
- 图片尺寸调整：支持原尺寸、50% 和自定义宽高，可锁定宽高比。
- 九宫格切图：居中裁成正方形后，按顺序生成并保存九张图片。
- 图片文字水印：支持黑色或白色文字、五个固定位置和透明度调整。

首版明确不包含后端服务、服务器、云函数、外部 API、用户登录、微信支付、会员、云存储、历史记录、在线素材库、激励视频和插屏广告。

## 本地处理与隐私边界

- 用户通过微信的选图能力选择相册图片或拍照，源码只接收微信临时文件路径。
- 压缩、尺寸调整、切图和水印都通过小程序 Canvas 在本地完成，结果仍是微信临时文件；只有用户主动点击保存后，结果才写入系统相册。
- 项目没有服务器地址、账号体系、图片数据库或登录流程。运行时 JavaScript 位于 `app.js`、`pages/`、`utils/`、`components/` 和 `config/`，`npm test` 会执行 `scripts/check-no-network.js`，阻止 `wx.request`、`wx.uploadFile`、`wx.downloadFile`、`wx.cloud` 和 HTTP(S) 地址进入这些运行时代码。
- Banner 广告是与图片处理分离的微信原生组件；默认不渲染，且项目代码不会向广告组件传递或开放用户图片。

更完整的数据路径和微信后台填写参考见 [隐私保护指引](docs/privacy-guide.md)。

## 环境要求

- WeChat DevTools：用于导入、编译、预览和上传微信小程序。
- 已注册并实名认证的个人小程序 AppID。
- Node.js：只用于运行本地逻辑测试和 network gate，不参与小程序运行时，也不需要安装运行时第三方依赖。

## 本地测试与导入

```powershell
git clone https://github.com/xianfanwindy/lite-image-toolbox.git
cd lite-image-toolbox
npm test
```

随后在 WeChat DevTools 中导入克隆后的项目根目录。导入前，仅在自己的本地工作区把 `project.config.json` 中的：

```json
"appid": "touristappid"
```

替换为自己的个人小程序 AppID。编译、预览或上传完成后，立即把该值恢复为 `touristappid`，并确认没有把真实 AppID 提交到 Git。Node.js 测试通过不能替代 WeChat DevTools 编译、Android 真机和 iPhone 真机验证。

完整上线步骤见 [个人主体发布清单](docs/release-checklist.md)。

## 广告配置

广告默认关闭，`config/ads.js` 中两个值保持为空：

```javascript
module.exports = {
  homeBannerUnitId: '',
  resultBannerUnitId: '',
}
```

只有账号已经满足并开通微信流量主资格后，才在专门用于发布的本地工作区临时填写首页和结果页两个 Banner unit ID。上传对应版本后立即恢复为空，并且不要把真实广告 unit ID 提交到 Git。未配置 ID 或 Banner 加载失败时，广告容器会隐藏，不影响图片处理、预览和保存。

本项目不保证获得广告收益。实际收益取决于真实用户量、留存、广告填充和平台规则。

## 许可证与来源

本项目依据 [MIT License](LICENSE) 发布。实现参考并改编自 `LittleWhite1995/tools-applet` 的固定版本，来源、固定 commit 和修改范围见 [NOTICE](NOTICE)。

仓库目前没有经过真机确认的产品截图，因此不放置截图或占位图。
