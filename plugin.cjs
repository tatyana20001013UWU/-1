// 音乐上传 — 酒馆服务端插件 (CommonJS)
// 放入 plugins/music-upload/index.cjs
// 随酒馆启动自动运行，在 127.0.0.1:3457 启动上传代理
'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const TOKEN = 'sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e';
const PORT = 3457;
const API_HOST = 'playground.z.wiki';
const SONGS_FILE = path.join(__dirname, 'songs.json');

// === 插件信息（酒馆要求） ===
const info = {
    id: 'music-upload',
    name: '音乐上传代理',
    description: '在 127.0.0.1:3457 启动上传代理，接收 FormData 转发到 playground.z.wiki',
};

// === 歌单 ===
function loadSongs() {
    try { if (fs.existsSync(SONGS_FILE)) return JSON.parse(fs.readFileSync(SONGS_FILE, 'utf8')); } catch (e) {}
    return [];
}
function saveSongs(songs) {
    try { fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf8'); } catch (e) {}
}

// === 代理服务器 ===
let server = null;

function startProxy() {
    if (server) return;
    server = http.createServer(function (req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        // 上传: POST — FormData 透明转发
        if (req.method === 'POST') {
            const queryTitle = url.parse(req.url, true).query.title || '';
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const body = Buffer.concat(chunks);
                console.log('[音乐代理] 上传 ' + (body.length / 1024).toFixed(1) + 'KB' + (queryTitle ? ' [' + queryTitle + ']' : ''));
                const preq = https.request({
                    hostname: API_HOST, path: '/img/api/upload', method: 'POST',
                    headers: { 'Content-Type': req.headers['content-type'] || 'multipart/form-data', 'Content-Length': body.length },
                    timeout: 120000,
                }, pres => {
                    const d = [];
                    pres.on('data', c => d.push(c));
                    pres.on('end', () => {
                        const text = Buffer.concat(d).toString();
                        console.log('[音乐代理] HTTP ' + pres.statusCode + ' ' + text.substring(0, 120));
                        try {
                            const json = JSON.parse(text);
                            const dd = json.data || json;
                            const songUrl = dd.url || dd.link || (dd.data && (dd.data.url || dd.data.link)) || '';
                            if (songUrl) {
                                const songs = loadSongs();
                                const song = { id: (dd.id || dd.uid || ('local_' + Date.now())), url: songUrl, title: queryTitle || songUrl.split('/').pop().replace(/\.[^.]+$/, ''), size: body.length, uploadedAt: Date.now() };
                                if (!songs.some(s => s.url === song.url)) { songs.unshift(song); if (songs.length > 500) songs.length = 500; saveSongs(songs); }
                                json._song = song;
                            }
                            res.writeHead(pres.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify(json));
                        } catch (e) {
                            res.writeHead(pres.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(text);
                        }
                    });
                });
                preq.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
                preq.write(body); preq.end();
            });
            return;
        }

        // 删除
        if (req.method === 'DELETE') {
            const id = url.parse(req.url, true).query.id || '';
            https.request({ hostname: API_HOST, path: '/img/delete?id=' + encodeURIComponent(id) + '&uid=' + encodeURIComponent(TOKEN), method: 'DELETE', timeout: 30000 }, pres => {
                const d = []; pres.on('data', c => d.push(c));
                pres.on('end', () => {
                    const songs = loadSongs().filter(s => s.id !== id); saveSongs(songs);
                    res.writeHead(pres.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, songs }));
                });
            }).on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); }).end();
            return;
        }

        // 歌单
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, songs: loadSongs() }));
    });

    server.listen(PORT, '127.0.0.1', () => {
        console.log('[音乐代理] ✅ http://127.0.0.1:' + PORT + ' (POST上传 DELETE删除 GET歌单)');
    });
}

function stopProxy() {
    if (server) { server.close(); server = null; }
}

// === 插件入口 ===
async function init(app) {
    console.log('[音乐插件] 音乐上传代理 v2.0 已加载');
    startProxy();
}

// === 导出 ===
module.exports = { info, init };
