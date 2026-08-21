const { homeBannerUnitId } = require('../../config/ads')

const tools = [
  { title: '图片压缩', description: '减小图片体积', icon: '压', path: '/pages/image-compress/image-compress' },
  { title: '尺寸调整', description: '按比例修改宽高', icon: '尺', path: '/pages/image-resize/image-resize' },
  { title: '九宫格切图', description: '一键生成九张图', icon: '九', path: '/pages/nine-grid/nine-grid' },
  { title: '文字水印', description: '为图片添加文字', icon: '印', path: '/pages/image-watermark/image-watermark' },
]

Page({
  data: { homeBannerUnitId, tools },
  openTool(event) {
    const path = event.currentTarget.dataset.path
    if (path) wx.navigateTo({ url: path })
  },
})
