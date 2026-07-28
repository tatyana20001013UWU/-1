// 音乐上传 — 酒馆服务端插件 v2.2 (共享歌单)
// 歌单存 API "歌曲" 目录，所有人共享
'use strict';
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const TOKEN = 'sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e', PORT = 3457, API_HOST = 'playground.z.wiki';
const CATALOG_ID_FILE = path.join(__dirname, 'songs_catalog_id.txt');
const info = { id: 'music-upload', name: '音乐上传代理', description: '代理上传 + 共享歌单' };

function apiReq(method, apiPath, body, ct) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: API_HOST, path: apiPath, method, timeout: 30000 };
    if (body) opts.headers = { 'Content-Type': ct || 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const req = https.request(opts, res => { const d = []; res.on('data', c => d.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(d).toString() })); });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
function getCatalogId() { try { return fs.readFileSync(CATALOG_ID_FILE, 'utf8').trim(); } catch (e) { return ''; } }
function saveCatalogId(id) { fs.writeFileSync(CATALOG_ID_FILE, id); }

async function downloadCatalog() {
  const cid = getCatalogId(); if (!cid) return [];
  try {
    const raw = await new Promise((ok, no) => {
      https.get('https://' + API_HOST + '/' + cid + '/songs.json', res => { let d = ''; res.on('data', c => d += c); res.on('end', () => ok(d)); }).on('error', no);
    });
    return JSON.parse(raw);
  } catch (e) { return []; }
}

async function uploadCatalog(songs) {
  const oldId = getCatalogId(), jsonStr = JSON.stringify(songs);
  const boundary = '----Cat' + Date.now(), CRLF = '\r\n', parts = [];
  function add(n, v, fn) { let h = '--' + boundary + CRLF + 'Content-Disposition: form-data; name="' + n + '"'; if (fn) h += '; filename="' + fn + '"'; h += CRLF + CRLF; parts.push(Buffer.from(h), Buffer.from(v), Buffer.from(CRLF)); }
  add('file', jsonStr, 'songs.json'); add('fileName', 'songs.json'); add('uid', TOKEN);
  const body = Buffer.concat([...parts, Buffer.from('--' + boundary + '--' + CRLF)]);
  try {
    const res = await apiReq('POST', '/img/api/upload', body, 'multipart/form-data; boundary=' + boundary);
    const j = JSON.parse(res.body), dd = j.data || j;
    const newId = dd.id || dd.uid || '';
    if (newId) { saveCatalogId(newId); if (oldId && oldId !== newId) apiReq('DELETE', '/img/delete?id=' + oldId + '&uid=' + TOKEN).catch(() => {}); }
    else console.error('[代理] 歌单上传失败: 无ID', res.body.substring(0, 200));
  } catch (e) { console.error('[代理] 歌单上传异常:', e.message); }
}

// 代理服务器
function startProxy() {
  http.createServer(async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'POST') {
      const qTitle = url.parse(req.url, true).query.title || '';
      const chunks = []; req.on('data', c => chunks.push(c));
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks);
          console.log('[代理] 上传 ' + (body.length / 1024).toFixed(1) + 'KB' + (qTitle ? ' [' + qTitle + ']' : ''));
          const ct = req.headers['content-type'] || 'multipart/form-data';
          const result = await new Promise((ok, no) => {
            const r = https.request({ hostname: API_HOST, path: '/img/api/upload', method: 'POST', headers: { 'Content-Type': ct, 'Content-Length': body.length }, timeout: 120000 }, pres => { const d = []; pres.on('data', c => d.push(c)); pres.on('end', () => ok({ status: pres.statusCode, body: Buffer.concat(d).toString() })); });
            r.on('error', no); r.write(body); r.end();
          });
          const json = JSON.parse(result.body), dd = json.data || json;
          const songUrl = dd.url || dd.link || (dd.data && (dd.data.url || dd.data.link)) || '';
          if (songUrl) {
            const song = { id: (dd.id || dd.uid || Date.now().toString(36)), url: songUrl, title: qTitle || songUrl.split('/').pop().replace(/\.[^.]+$/, ''), size: body.length, uploadedAt: Date.now() };
            const catalog = await downloadCatalog();
            if (!catalog.some(s => s.url === song.url)) { catalog.unshift(song); if (catalog.length > 500) catalog.length = 500; }
            await uploadCatalog(catalog);
            json._song = song;
          }
          res.writeHead(result.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(json));
        } catch (e) { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    if (req.method === 'DELETE') {
      const id = url.parse(req.url, true).query.id || '';
      try {
        await apiReq('DELETE', '/img/delete?id=' + encodeURIComponent(id) + '&uid=' + TOKEN);
        const catalog = await downloadCatalog(); const filtered = catalog.filter(s => s.id !== id);
        await uploadCatalog(filtered);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, songs: filtered }));
      } catch (e) { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); }
      return;
    }

    // GET → 返回共享歌单
    try { const catalog = await downloadCatalog(); res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ success: true, songs: catalog })); }
    catch (e) { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ success: true, songs: [] })); }
  }).listen(PORT, '127.0.0.1', () => console.log('[音乐代理] ✅ http://127.0.0.1:' + PORT + ' 共享歌单模式'));
}

async function init(app) {
  console.log('[音乐插件] v2.2 共享歌单模式');
  downloadCatalog().then(c => console.log('[音乐插件] 共享歌单 ' + c.length + ' 首')).catch(() => {});
  startProxy();
}
module.exports = { info, init };
