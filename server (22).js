const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');
const crypto  = require('crypto');

const YOUTUBE_API_KEY = 'AIzaSyCZPTiiAzgXdnltJj46WZVn2Ps_4OeoLDU';

// ── CONFIG ────────────────────────────────────────────────────────────
const DISCORD_CLIENT_ID    = process.env.DISCORD_CLIENT_ID || '1504071583466131476';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://a743e2d0-4048-4418-b36a-996e19b8454b-00-2hy4179zaq5fk.picard.replit.dev/';
const LOGIN_WEBHOOK        = 'https://discord.com/api/webhooks/1494004740336390345/ZWnD17QQrLpvdRb02iQMh6FCCTqrrIlUN1sGmNTIFGcWrIsr5V2brjtLaJXmdD9m5iEz';

// ── OAUTH STATE STORE (CSRF) ──────────────────────────────────────────
const oauthStates = new Map();
function makeState() {
  const s = crypto.randomBytes(16).toString('hex');
  oauthStates.set(s, Date.now());
  setTimeout(() => oauthStates.delete(s), 10 * 60 * 1000);
  return s;
}

// ── DISCORD HELPERS ────────────────────────────────────────────────────
function discordRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'discord.com', ...options }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
async function getDiscordUser(accessToken) {
  return discordRequest({
    path:    '/api/users/@me',
    method:  'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
function getDiscordAvatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
  return `https://cdn.discordapp.com/embed/avatars/${(parseInt(user.discriminator || '0') % 5)}.png`;
}

// ── SEND LOGIN WEBHOOK ─────────────────────────────────────────────────
function sendLoginWebhook(type, user, ip, ua, geo) {
  const flag = geo?.flag || '🌍';
  const loc  = geo ? `${flag} ${geo.country}${geo.city && geo.city !== '?' ? ` — ${geo.city}` : ''}` : '🌍 Unknown';
  const avatar = getDiscordAvatarUrl(user);
  const embed = {
    title: type === 'login' ? '🔐 User Logged In' : '🚪 User Logged Out',
    color: type === 'login' ? 0x57F287 : 0xED4245,
    thumbnail: { url: avatar },
    fields: [
      { name: '👤 Username',   value: `${user.global_name || user.username}`, inline: true },
      { name: '🆔 Discord ID', value: `\`${user.id}\``,                       inline: true },
      { name: '📧 Email',      value: user.email || 'Not provided',            inline: true },
      { name: '🌍 Location',   value: loc,                                     inline: true },
      { name: '💻 Device',     value: parseDevice(ua),                         inline: true },
      { name: '🔍 Browser',    value: parseBrowser(ua),                        inline: true },
      { name: '🔗 Profile',    value: `[View on Aimo](${DISCORD_REDIRECT_URI.replace(/\/+$/, '')}/${user.username})`, inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Aimo Login System' }
  };
  const bodyStr = JSON.stringify({ embeds: [embed] });
  const parsed  = new URL(LOGIN_WEBHOOK);
  const req = https.request({ hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } });
  req.on('error', () => {});
  req.write(bodyStr);
  req.end();
}

// ── PURE NODE.JS ZIP BUILDER ────────────────────────────────────────────
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC32_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  const parts = [], central = [];
  let offset = 0;
  const dos = (() => {
    const n = new Date();
    return { t: ((n.getHours()<<11)|(n.getMinutes()<<5)|(n.getSeconds()>>1))>>>0,
             d: (((n.getFullYear()-1980)<<9)|((n.getMonth()+1)<<5)|n.getDate())>>>0 };
  })();
  for (const { name, data } of files) {
    const nb = Buffer.from(name), db = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const crc = crc32(db), sz = db.length;
    const lfh = Buffer.alloc(30 + nb.length);
    lfh.writeUInt32LE(0x04034b50,0); lfh.writeUInt16LE(20,4); lfh.writeUInt16LE(0,6);
    lfh.writeUInt16LE(0,8); lfh.writeUInt16LE(dos.t,10); lfh.writeUInt16LE(dos.d,12);
    lfh.writeUInt32LE(crc,14); lfh.writeUInt32LE(sz,18); lfh.writeUInt32LE(sz,22);
    lfh.writeUInt16LE(nb.length,26); lfh.writeUInt16LE(0,28); nb.copy(lfh,30);
    const cde = Buffer.alloc(46 + nb.length);
    cde.writeUInt32LE(0x02014b50,0); cde.writeUInt16LE(20,4); cde.writeUInt16LE(20,6);
    cde.writeUInt16LE(0,8); cde.writeUInt16LE(0,10); cde.writeUInt16LE(dos.t,12);
    cde.writeUInt16LE(dos.d,14); cde.writeUInt32LE(crc,16); cde.writeUInt32LE(sz,20);
    cde.writeUInt32LE(sz,24); cde.writeUInt16LE(nb.length,28); cde.writeUInt16LE(0,30);
    cde.writeUInt16LE(0,32); cde.writeUInt16LE(0,34); cde.writeUInt16LE(0,36);
    cde.writeUInt32LE(0,38); cde.writeUInt32LE(offset,42); nb.copy(cde,46);
    parts.push(lfh, db); central.push(cde); offset += lfh.length + sz;
  }
  const cb = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0); eocd.writeUInt16LE(0,4); eocd.writeUInt16LE(0,6);
  eocd.writeUInt16LE(files.length,8); eocd.writeUInt16LE(files.length,10);
  eocd.writeUInt32LE(cb.length,12); eocd.writeUInt32LE(offset,16); eocd.writeUInt16LE(0,20);
  return Buffer.concat([...parts, cb, eocd]);
}

const PORT           = process.env.PORT || 5000;
const ROOT           = __dirname;
const OWNER_PASS     = process.env.OWNER_PASS || '0785';

// ── USER STORE (in-memory) ──────────────────────────────────────────────
// Persists across requests, cleared on server restart (users re-populate on next login)
const userStore = new Map(); // key: username.toLowerCase() → user object
const WEBSITE_WEBHOOK = process.env.WEBSITE_WEBHOOK || 'https://discord.com/api/webhooks/1494004740336390345/ZWnD17QQrLpvdRb02iQMh6FCCTqrrIlUN1sGmNTIFGcWrIsr5V2brjtLaJXmdD9m5iEz';
const BOT_START = Date.now();


// ── YOUTUBE SEARCH (YouTube Data API v3) ──────────────────────────────
const ytSearchCache = new Map();
function searchYouTube(query) {
  if (ytSearchCache.has(query)) return Promise.resolve(ytSearchCache.get(query));
  return new Promise(resolve => {
    const apiPath = `/youtube/v3/search?part=id&type=video&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}&maxResults=1&videoCategoryId=10`;
    https.get({ hostname: 'www.googleapis.com', path: apiPath, timeout: 10000 }, apiRes => {
      let raw = '';
      apiRes.on('data', d => raw += d);
      apiRes.on('end', () => {
        try {
          const j = JSON.parse(raw);
          const videoId = j.items?.[0]?.id?.videoId || null;
          if (videoId) ytSearchCache.set(query, videoId);
          if (videoId) return resolve(videoId);
          // Fallback: scrape YouTube
          scrapeYouTube(query).then(resolve);
        } catch { scrapeYouTube(query).then(resolve); }
      });
    }).on('error', () => scrapeYouTube(query).then(resolve))
      .on('timeout', () => scrapeYouTube(query).then(resolve));
  });
}
function scrapeYouTube(query) {
  return new Promise(resolve => {
    const searchPath = `/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
    https.get({ hostname: 'www.youtube.com', path: searchPath,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html,application/xhtml+xml' }, timeout: 12000 },
      apiRes => {
        let raw = '';
        apiRes.on('data', d => raw += d);
        apiRes.on('end', () => {
          try {
            const m = raw.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s);
            if (!m) return resolve(null);
            const data = JSON.parse(m[1]);
            const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
            if (!contents) return resolve(null);
            for (const section of contents) {
              const items = section?.itemSectionRenderer?.contents;
              if (!items) continue;
              for (const item of items) {
                const vr = item?.videoRenderer;
                if (vr?.videoId) { ytSearchCache.set(query, vr.videoId); return resolve(vr.videoId); }
              }
            }
            resolve(null);
          } catch { resolve(null); }
        });
      }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}


// ── VISIT LOG ─────────────────────────────────────────────────────────
const visitLog = [
  { page:'home',     ip:'185.220.101.12', country:'Germany',       city:'Berlin',    device:'🖥️ Desktop', browser:'Chrome',  referer:'Direct', time: Date.now()-3420000 },
  { page:'songs',    ip:'104.131.0.230',  country:'United States', city:'New York',  device:'📱 Mobile',  browser:'Safari',  referer:'https://discord.gg', time: Date.now()-3380000 },
  { page:'albums',   ip:'91.108.4.50',    country:'Turkey',        city:'Istanbul',  device:'🖥️ Desktop', browser:'Chrome',  referer:'Direct', time: Date.now()-3260000 },
];
const visitStats = { total: 0, pages: {}, countries: {} };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.zip':  'application/zip',
};

const PAGES = {
  '':         'index.html',
  'commands': 'commands.html',
  'premium':  'premium.html',
  'privacy':  'privacy.html',
  'terms':    'terms.html',
  'owner':    'owner.html',
  'status':   'status.html',
  '404':      '404.html',
};

const ASSETS = new Set(['style.css', 'logo.webp']);
const WEBSITE_FILES = ['index.html','commands.html','premium.html','privacy.html','terms.html','owner.html','status.html','404.html','style.css','server.js'];

// ── SEND DISCORD WEBHOOK ───────────────────────────────────────────────
function sendWebhook(embed) {
  if (!WEBSITE_WEBHOOK || !WEBSITE_WEBHOOK.startsWith('https://discord.com')) return;
  const body = JSON.stringify({ embeds: [embed] });
  const parsed = new URL(WEBSITE_WEBHOOK);
  const req = https.request({ hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E0 + c.charCodeAt(0) - 65));
}

const geoCache = new Map();
function getGeo(ip, cb) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127') || ip.startsWith('10.') || ip.startsWith('192.168.'))
    return cb({ country: 'Local', city: 'Dev', region: 'Dev', isp: 'Local', countryCode: 'XX', mobile: false, flag: '🏠' });
  const clean = ip.replace(/^::ffff:/, '');
  if (geoCache.has(clean)) return cb(geoCache.get(clean));
  http.get(`http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,country,countryCode,regionName,city,isp,mobile,proxy`, res => {
    let raw = '';
    res.on('data', d => raw += d);
    res.on('end', () => {
      try {
        const d = JSON.parse(raw);
        if (d.status === 'fail') return cb({ country: '?', city: '?', flag: '🌍' });
        const info = { country: d.country||'?', countryCode: d.countryCode||'??', city: d.city||'?',
          region: d.regionName||'?', isp: d.isp||'?', mobile: d.mobile||false, proxy: d.proxy||false,
          flag: countryFlag(d.countryCode) };
        geoCache.set(clean, info);
        cb(info);
      } catch { cb({ country: '?', city: '?', flag: '🌍' }); }
    });
  }).on('error', () => cb({ country: '?', city: '?', flag: '🌍' }));
}

function parseDevice(ua = '') {
  if (/Mobile|Android|iPhone/i.test(ua) && !/iPad/i.test(ua)) return '📱 Mobile';
  if (/Tablet|iPad/i.test(ua)) return '📟 Tablet';
  return '🖥️ Desktop';
}
function parseBrowser(ua = '') {
  if (/Chrome/i.test(ua) && !/Edge|OPR|Samsung/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Edge/i.test(ua)) return 'Edge';
  if (/OPR|Opera/i.test(ua)) return 'Opera';
  if (/Samsung/i.test(ua)) return 'Samsung';
  return 'Unknown';
}

function logVisit(page, ip, ua, referer) {
  visitStats.total++;
  visitStats.pages[page] = (visitStats.pages[page] || 0) + 1;
  getGeo(ip, geo => {
    visitStats.countries[geo.country] = (visitStats.countries[geo.country] || 0) + 1;
    const device = parseDevice(ua), browser = parseBrowser(ua);
    visitLog.push({ page, ip, country: geo.country, city: geo.city, device, browser,
      referer: referer ? referer.slice(0, 80) : 'Direct', time: Date.now() });
    const locStr = `${geo.flag||'🌍'} ${geo.country}${geo.city&&geo.city!=='?'?` — ${geo.city}`:''}`;
    sendWebhook({
      title: '🌐 Page Visit', color: 0x7C3AED,
      fields: [
        { name: '📄 Page',   value: `\`/${page||'home'}\``, inline: true },
        { name: '🌍 Loc',    value: locStr,                  inline: true },
        { name: '💻 Device', value: device,                  inline: true },
        { name: '🔍 Browser',value: browser,                 inline: true },
        { name: '🔗 Ref',    value: referer?referer.slice(0,60):'Direct', inline: true },
        { name: '📊 Total',  value: String(visitStats.total), inline: true },
      ],
      timestamp: new Date().toISOString(), footer: { text: 'Aimo Website Logger' }
    });
  });
}

function logSongPlay(title, artist, artUrl, ip, ua) {
  getGeo(ip, geo => {
    const device = parseDevice(ua), browser = parseBrowser(ua);
    const locStr = `${geo.flag||'🌍'} ${geo.country}${geo.city&&geo.city!=='?'?` — ${geo.city}`:''}`;
    const embed = {
      title: '🎵 Song Played', color: 0xEC4899,
      fields: [
        { name: '🎶 Track',    value: `**${title}**`, inline: true },
        { name: '👤 Artist',   value: artist,          inline: true },
        { name: '🌍 Location', value: locStr,          inline: true },
        { name: '💻 Device',   value: device,          inline: true },
        { name: '🔍 Browser',  value: browser,         inline: true },
      ],
      timestamp: new Date().toISOString(), footer: { text: 'Aimo Songs Logger' }
    };
    if (artUrl && artUrl.startsWith('http')) embed.thumbnail = { url: artUrl };
    sendWebhook(embed);
  });
}

function getClusterInfo() {
  const upSecs = Math.floor((Date.now() - BOT_START) / 1000);
  const upMin  = Math.floor(upSecs / 60);
  const upHr   = Math.floor(upMin / 60);
  return {
    shards: 1, totalShards: 1, status: 'online',
    uptime: upHr > 0 ? `${upHr}h ${upMin%60}m` : `${upMin}m ${upSecs%60}s`,
    totalVisits: visitStats.total,
    topPages: Object.entries(visitStats.pages).sort((a,b)=>b[1]-a[1]).slice(0,5),
    topCountries: Object.entries(visitStats.countries).sort((a,b)=>b[1]-a[1]).slice(0,5),
    serverTime: new Date().toUTCString(),
    recentVisits: visitLog.slice(-20).reverse().map(v => ({
      page: v.page, country: v.country, city: v.city, device: v.device, browser: v.browser,
      time: new Date(v.time).toUTCString()
    })),
  };
}

function serve404(res) {
  const f = path.join(ROOT, '404.html');
  fs.readFile(f, (err, data) => {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data || '<h1>404 — Page Not Found</h1>');
  });
}

// ── MAIN SERVER ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const parsed  = url.parse(req.url || '/', true);
  const raw     = parsed.pathname || '/';
  let   slug    = raw.replace(/^\/+/, '').replace(/\.html$/, '').toLowerCase();
  const ip      = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const ua      = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';

  // ── API: cluster info ─────────────────────────────────────────────────
  if (raw === '/api/cluster') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(getClusterInfo()));
  }

  // ── API: Deezer track lookup (proxy to avoid CORS) ────────────────────
  if (raw === '/api/deezer-track') {
    const q = (parsed.query.q || '').trim();
    if (!q) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'No query'})); }
    const apiPath = '/search?q=' + encodeURIComponent(q) + '&limit=3&output=json';
    const apiReq = https.get({
      hostname: 'api.deezer.com', path: apiPath,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Accept-Encoding': 'identity' }
    }, apiRes => {
      let raw = [];
      apiRes.on('data', c => raw.push(c));
      apiRes.on('end', () => {
        try {
          const data = Buffer.concat(raw).toString('utf8');
          const json = JSON.parse(data);
          const track = json.data?.[0];
          if (!track) { res.writeHead(404, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'Not found'})); }
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({
            id: track.id, title: track.title,
            artist: track.artist?.name,
            preview: track.preview,
            artwork: track.album?.cover_xl || track.album?.cover_big || track.album?.cover_medium || track.album?.cover,
            duration: track.duration
          }));
        } catch(e) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Parse error: '+e.message})); }
      });
    });
    apiReq.setTimeout(8000, () => { apiReq.destroy(); res.writeHead(504, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Timeout'})); });
    apiReq.on('error', (e) => { if (!res.headersSent) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); } });
    return;
  }

  // ── API: log song play ─────────────────────────────────────────────────
  if (raw === '/api/log-play' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { const d = JSON.parse(body); logSongPlay(d.title||'?', d.artist||'?', d.artwork||'', ip, ua); } catch {}
      res.writeHead(204); res.end();
    });
    return;
  }

  // ── API: status config (reads status.changer.json) ────────────────────
  if (raw === '/api/status-config') {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'status.changer.json'), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(cfg));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ bot: { status: 'online' }, lavalink: { status: 'online', nodes: [] }, announcements: [] }));
    }
  }

  // ── API: owner ────────────────────────────────────────────────────────
  if (raw === '/api/owner/check') {
    const pass = parsed.query.pass || '';
    res.writeHead(pass === OWNER_PASS ? 200 : 403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: pass === OWNER_PASS }));
  }
  if (raw === '/api/owner/visits') {
    const pass = parsed.query.pass || '';
    if (pass !== OWNER_PASS) { res.writeHead(403); return res.end('[]'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(visitLog.slice(-100).reverse()));
  }
  if (raw === '/api/owner/download') {
    const pass = parsed.query.pass || '';
    if (parsed.query.check === '1') {
      res.writeHead(pass === OWNER_PASS ? 204 : 403); return res.end();
    }
    if (pass !== OWNER_PASS) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
    try {
      const entries = WEBSITE_FILES.map(f => ({ name: f, fp: path.join(ROOT, f) }))
        .filter(({ fp }) => fs.existsSync(fp))
        .map(({ name, fp }) => ({ name, data: fs.readFileSync(fp) }));
      const zipBuf = buildZip(entries);
      res.writeHead(200, { 'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="aimo-website.zip"',
        'Content-Length': zipBuf.length });
      res.end(zipBuf);
    } catch (err) { res.writeHead(500); res.end('ZIP error'); }
    return;
  }

  // ── Route pages ────────────────────────────────────────────────────────
  if (slug in PAGES) {
    const file = path.join(ROOT, PAGES[slug]);
    return fs.readFile(file, (err, data) => {
      if (err) return serve404(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      logVisit(slug, ip, ua, referer);
    });
  }

  // ── Serve assets ───────────────────────────────────────────────────────
  const assetName = raw.replace(/^\//, '');
  if (ASSETS.has(assetName)) {
    const dest = req.headers['sec-fetch-dest'];
    if (dest === 'document' || dest === 'frame' || dest === 'iframe') return serve404(res);
    const file = path.join(ROOT, assetName);
    return fs.readFile(file, (err, data) => {
      if (err) return serve404(res);
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  serve404(res);
});

server.on('error', err => console.error('[Website]', err.message));
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[95m♪\x1b[0m Aimo Website → http://0.0.0.0:${PORT}`);
  sendWebhook({
    title: '🚀 Website Started', color: 0x22c55e,
    fields: [
      { name: '🎵 Songs', value: 'Loading…', inline: true },
      { name: '🌐 Port',  value: String(PORT), inline: true },
      { name: '🕐 Time',  value: new Date().toUTCString(), inline: false },
    ],
    timestamp: new Date().toISOString(), footer: { text: 'Aimo Website' }
  });
});

module.exports = server;
