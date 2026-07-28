// 音乐上传代理 v2.3 — 本地歌单为主，API目录为辅
'use strict';
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const TOKEN = 'sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e', PORT = 3457, API_HOST = 'playground.z.wiki';
const SONGS_FILE = path.join(__dirname, 'songs.json');
const CAT_URL_FILE = path.join(__dirname, 'catalog_url.txt');
const info = { id: 'music-upload', name: '音乐上传代理', description: '代理上传 + 共享歌单' };

function loadLocal() { try { if (fs.existsSync(SONGS_FILE)) return JSON.parse(fs.readFileSync(SONGS_FILE, 'utf8')); } catch (e) {} return []; }
function saveLocal(songs) { try { fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf8'); } catch (e) {} }

function apiReq(method, apiPath, body, ct) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: API_HOST, path: apiPath, method, timeout: 30000 };
    if (body) opts.headers = { 'Content-Type': ct || 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const req = https.request(opts, res => { const d = []; res.on('data', c => d.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(d).toString() })); });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
function httpGet(urlStr) {
  return new Promise((ok, no) => { https.get(urlStr, res => { if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return httpGet(res.headers.location).then(ok).catch(no); let d = ''; res.on('data', c => d += c); res.on('end', () => ok(d)); }).on('error', no); });
}

function getCatUrl() { try { return fs.readFileSync(CAT_URL_FILE, 'utf8').trim(); } catch (e) { return ''; } }
function saveCatUrl(u) { fs.writeFileSync(CAT_URL_FILE, u); }

async function syncDownload() { const u = getCatUrl(); if (!u) return null; try { return JSON.parse(await httpGet(u)); } catch (e) { return null; } }

async function syncUpload(songs) {
  const oldUrl = getCatUrl(), jsonStr = JSON.stringify(songs);
  const boundary = '----Cat' + Date.now(), CRLF = '\r\n', parts = [];
  function add(n, v, fn) { let h = '--' + boundary + CRLF + 'Content-Disposition: form-data; name="' + n + '"'; if (fn) h += '; filename="' + fn + '"'; h += CRLF + CRLF; parts.push(Buffer.from(h), Buffer.from(v), Buffer.from(CRLF)); }
  add('file', jsonStr, 'songs.json'); add('fileName', 'songs.json'); add('uid', TOKEN);
  const body = Buffer.concat([...parts, Buffer.from('--' + boundary + '--' + CRLF)]);
  try {
    const res = await apiReq('POST', '/img/api/upload', body, 'multipart/form-data; boundary=' + boundary);
    const j = JSON.parse(res.body), dd = j.data || j;
    const newUrl = dd.url || dd.link || (dd.data && (dd.data.url || dd.data.link)) || '';
    if (newUrl) { saveCatUrl(newUrl); if (oldUrl) { const m = oldUrl.match(/\/([a-zA-Z0-9]+)\//); if (m) apiReq('DELETE', '/img/delete?id=' + m[1] + '&uid=' + TOKEN).catch(() => {}); } }
  } catch (e) { console.error('[代理] 目录同步失败:', e.message); }
}

async function initCatalog() { const shared = await syncDownload(); if (shared && shared.length) { const local = loadLocal(); for (const s of shared) { if (!local.some(x => x.url === s.url)) local.push(s); } saveLocal(local); } }

function startProxy() {
  http.createServer(async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'POST') {
      const qTitle = url.parse(req.url, true).query.title || '';
      const chunks = []; req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const ct = req.headers['content-type'] || 'multipart/form-data';
        const preq = https.request({ hostname: API_HOST, path: '/img/api/upload', method: 'POST', headers: { 'Content-Type': ct, 'Content-Length': body.length }, timeout: 120000 }, pres => {
          const d = []; pres.on('data', c => d.push(c));
          pres.on('end', () => {
            const text = Buffer.concat(d).toString();
            try {
              const json = JSON.parse(text), dd = json.data || json;
              const songUrl = dd.url || dd.link || (dd.data && (dd.data.url || dd.data.link)) || '';
              if (songUrl) {
                const song = { id: (dd.id || dd.uid || Date.now().toString(36)), url: songUrl, title: qTitle || songUrl.split('/').pop().replace(/\.[^.]+$/, ''), size: body.length, uploadedAt: Date.now() };
                const local = loadLocal(); if (!local.some(s => s.url === song.url)) { local.unshift(song); if (local.length > 500) local.length = 500; } saveLocal(local);
                json._song = song; syncUpload(local).catch(() => {});
              }
              res.writeHead(pres.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(json));
            } catch (e) { res.writeHead(pres.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(text); }
          });
        });
        preq.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
        preq.write(body); preq.end();
      });
      return;
    }

    if (req.method === 'DELETE') {
      const id = url.parse(req.url, true).query.id || '';
      apiReq('DELETE', '/img/delete?id=' + encodeURIComponent(id) + '&uid=' + TOKEN).catch(e => console.error('[代理] 删除API失败:', e.message));
      const local = loadLocal().filter(s => s.id !== id); saveLocal(local);
      syncUpload(local).catch(() => {});
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ success: true, songs: local }));
      return;
    }

    const songs = loadLocal();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ success: true, songs }));
  }).listen(PORT, '127.0.0.1', () => console.log('[音乐代理] http://127.0.0.1:' + PORT));
}

async function init(app) { console.log('[音乐插件] v2.3'); await initCatalog(); startProxy(); }
module.exports = { info, init };
