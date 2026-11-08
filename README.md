# 晾衣绳（tendedero-electron）

Windows 版「晾衣绳」：截图像衣服一样挂在屏幕顶部的绳子上。
复刻 macOS 开源项目 [Tendedero](https://github.com/alejandrobujan/tendedero) 的核心体验，用 Electron 实现。

## 功能

- **截图自动上绳**：按 `PrtScn` 或 `Win+Shift+S` 截图后（图片进入剪贴板），新截图会自动保存并挂上绳子，绳子滑出展示一小会儿（2.5 秒）再收起
- **显示/隐藏**：鼠标光标停在屏幕顶部边缘约 0.25 秒，绳子滑下；移开则收起
- **照片交互**：
  - 单击 → 复制图片到剪贴板（显示"已复制"）
  - 双击 → 用系统默认看图器打开
  - 拖出 → 复制文件到文件夹/聊天窗口（绳子上的保留）
  - 悬停 → 卡片轻微提起，显示角标按钮
  - ✕ 按钮 / `Delete` 键 → 移入回收站并离绳
  - 📌 固定 → 照片移到绳子左端常驻（夹子变深空灰），清空时不受影响
- **托盘**（系统托盘图标）：显示/隐藏、尺寸（小/中/大）、清空、退出
- **全局快捷键**：`Ctrl+Alt+T` 显示/隐藏
- **重启恢复**：绳子上的照片和固定状态自动保存
- **划词翻译**：在屏幕任意位置（浏览器、PDF、图片均可）按住左键划选文字，**右键点击选区**，弹出识别结果与「翻译」「复制文本」菜单（翻译本体待接入）。OCR 本地离线识别（中英混合），托盘可开关

## 运行

```sh
npm install
npm start        # 或 npm run dev（打开 DevTools 便于调试）
```

退出：系统托盘图标 → 退出。

## 说明

- 截图来源**仅监听剪贴板**：任何把图片复制进剪贴板的方式（PrtScn、Win+Shift+S、截图工具）都会触发挂绳；复制纯文本/文件不会误挂
- 所有照片保存为 PNG 于 `%APPDATA%\tendedero-electron\captures\`，✕ 移除时进回收站
- 绳子显示在**主显示器**顶部
- 已知限制：
  - 同一张图片在一次运行期间重复复制不会重复挂绳（哈希去重）
  - 独占全屏游戏、UAC 提示框会盖住绳子（系统层级限制）
  - 点击照片会暂时抢走其他窗口的焦点（为了支持 Delete 键）
  - 剪贴板被其他程序锁住时（罕见），该次轮询会被跳过
- 私有性：无账号、无网络、无遥测，所有数据只在本机

## 项目结构

```
src/
├── shared/constants.js        IPC 通道名、几何与动画常量
├── main/
│   ├── main.js                生命周期、单实例锁、模块装配
│   ├── line-window.js         透明置顶条带窗口、点击穿透、显示器变化重定位
│   ├── cursor.js              光标轮询与揭示/收起状态机
│   ├── state.js               照片状态、哈希去重、JSON 持久化
│   ├── clipboard-watcher.js   剪贴板轮询（唯一截图来源）
│   ├── word-select.js         划词翻译：uiohook 全局鼠标钩子记录拖选 + 右键触发
│   ├── ocr.js                 选区截图（desktopCapturer+crop）+ tesseract.js 离线识别
│   ├── word-popup.js          取词结果弹窗（识别中/文字/翻译占位/复制）
│   ├── ipc.js                 全部 IPC 处理器
│   ├── tray.js                托盘菜单 + 全局快捷键
│   └── tray-icon.js           内存生成托盘图标（纯 Node PNG 编码）
├── preload.js                 contextBridge API
└── renderer/
    ├── index.html / styles.css
    ├── app.js                 增量 diff、布局、微风、按键
    ├── rope.js                SVG 绳子（抛物线 + 两端渐隐）
    ├── card.js                卡片 DOM、入场动画、交互
    └── popup.html/css/js      取词弹窗界面

resources/tessdata/            OCR 语言包（chi_sim + eng，离线，约 7.5MB）
```
