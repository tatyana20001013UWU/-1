# 🎵 音乐上传扩展

酒馆扩展 — 所有用户共享歌单，MP3 上传到同一账户。

## 安装

### 1. 安装 UI
酒馆扩展面板 → 粘贴 URL：
```
https://gitee.com/tatyana1013/zigetuirouyinyueshangchuan.git
```

### 2. 安装代理
`plugin.cjs` → `plugins/music-upload/index.cjs`  
`config.yaml` 加 `enableServerPlugins: true`  
重启酒馆

## 共享歌单

歌单文件 `songs.json` 存在 API 上，人人上传/删除都会同步。打开面板看到的是所有人的上传记录。
