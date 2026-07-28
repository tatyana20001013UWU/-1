# 🎵 音乐上传扩展 — 酒馆扩展

独立于终端的酒馆扩展，提供音乐上传、管理和播放功能。

## 📁 安装方法

### 方法一：复制到酒馆扩展目录

将整个 `音乐上传扩展` 文件夹复制到酒馆的 `extensions` 目录下：

```
SillyTavern/
├── extensions/
│   ├── music-upload/       ← 复制到这里
│   │   ├── index.js        ← 服务端
│   │   ├── inject.js       ← 前端注入脚本
│   │   └── README.md
│   └── ...
```

**注意**：文件夹名必须是 `music-upload`（与酒馆扩展加载约定一致）。

复制后**重启酒馆**即可生效。

### 方法二：独立运行（测试用）

```bash
node index.js
# 启动在 http://localhost:3457
```

---

## 🚀 使用方式

### 自动注入（推荐）
重启酒馆后，前端脚本会**自动注入**到所有 HTML 页面，你会在右下角看到 🎵 悬浮球。

### 独立面板
直接访问：`http://你的酒馆地址:8000/api/plugins/music/panel`

### 手动注入（如果自动注入失效）
在酒馆的「自定义代码」设置中添加：
```html
<script src="/api/plugins/music/inject.js"></script>
```

---

## 🔌 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/plugins/music/upload` | 上传音乐，Body: `{"file":"<base64>","name":"song.mp3"}` |
| `DELETE` | `/api/plugins/music/delete?id=xxx` | 删除音乐 |
| `GET` | `/api/plugins/music/list` | 获取歌单 |
| `GET` | `/api/plugins/music/inject.js` | 前端注入脚本 |
| `GET` | `/api/plugins/music/panel` | 独立管理面板页面 |

---

## 🎨 前端功能

- **悬浮球** 🎵：可拖拽的音乐遥控器
  - 点击展开/折叠控制栏
  - 播放/暂停、上一首/下一首、音量调节
  - 打开的📁按钮进入管理面板
- **上传面板** 📤：
  - 点击或拖拽上传 MP3/WAV/OGG/FLAC/AAC/M4A
  - 多文件队列上传
  - 实时进度显示
- **歌曲列表** 🎶：
  - 浏览所有已上传歌曲
  - 一键播放 / 删除
  - 按上传时间排序

---

## ⚙️ 技术细节

- **上传方式**：前端 base64 编码 → 服务端解码 → 服务端转发 multipart 到 API
- **白名单**：服务端转发确保请求从 `127.0.0.1:8000` 发出
- **歌单存储**：JSON 文件（`songs.json`），存放在扩展目录下
- **依赖**：零额外依赖，使用 Node.js 内置模块（`https`, `fs`, `path`, `crypto`）

---

## 🔑 API 密钥

密钥已嵌入 `index.js` 中：
```
sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e
```

API 端点：`https://playground.z.wiki/img/api/upload`

---

## 📦 替换的旧文件

此扩展完全替代以下旧文件：
- ~~`music-proxy.js`~~ (Node 端代理)
- ~~`music-upload-worker.js`~~ (Cloudflare Worker)
- ~~`音乐悬浮球.js`~~ (浏览器脚本)
- ~~`音乐上传管理器.js`~~ (浏览器脚本 v3)
