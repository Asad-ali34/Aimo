const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');
const crypto  = require('crypto');

const DISCORD_CLIENT_ID    = process.env.DISCORD_CLIENT_ID    || '1504071583466131476';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://a743e2d0-4048-4418-b36a-996e19b8454b-00-2hy4179zaq5fk.picard.replit.dev/';
const LOGIN_WEBHOOK        = process.env.LOGIN_WEBHOOK || 'https://discord.com/api/webhooks/1494004740336390345/ZWnD17QQrLpvdRb02iQMh6FCCTqrrIlUN1sGmNTIFGcWrIsr5V2brjtLaJXmdD9m5iEz';
const WEBSITE_WEBHOOK      = process.env.WEBSITE_WEBHOOK || LOGIN_WEBHOOK;

const oauthStates = new Map();
function makeState() {
  const s = crypto.randomBytes(16).toString('hex');
  oauthStates.set(s, Date.now());
  setTimeout(() => oauthStates.delete(s), 10 * 60 * 1000);
  return s;
}

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
    path: '/api/users/@me', method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
function getDiscordAvatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
  return `https://cdn.discordapp.com/embed/avatars/${(parseInt(user.discriminator || '0') % 5)}.png`;
}

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
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Aimo Login System' }
  };
  sendRawWebhook(LOGIN_WEBHOOK, embed);
}

// ── ZIP builder ────────────────────────────────────────────────────────────
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

// ── Config ────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 5000;
const ROOT       = __dirname;
const OWNER_PASS = process.env.OWNER_PASS || '0785';

const userStore  = new Map();
const visitLog   = [];
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
  '.json': 'application/json',
};

const PAGES = {
  '':           'index.html',
  'commands':   'commands.html',
  'premium':    'premium.html',
  'privacy':    'privacy.html',
  'terms':      'terms.html',
  'owner':      'owner.html',
  'status':     'status.html',
  'changelogs': 'changelogs.html',
  '404':        '404.html',
};

const ASSETS = new Set(['style.css', 'logo.svg', 'music.svg', 'aimo-char.jpg']);

const WEBSITE_FILES = [
  'index.html', 'status.html', 'changelogs.html', 'commands.html',
  'premium.html', 'privacy.html', 'terms.html', 'owner.html', '404.html',
  'style.css', 'server.js', 'package.json', 'status.changer.json',
];

// ── Webhook helper ─────────────────────────────────────────────────────────
function sendRawWebhook(webhookUrl, embed) {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com')) return;
  const body = JSON.stringify({ embeds: [embed] });
  let parsed;
  try { parsed = new URL(webhookUrl); } catch { return; }
  const req = https.request({
    hostname: parsed.hostname,
    path: parsed.pathname + (parsed.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'AimoBot/1.0'
    }
  }, (res) => {
    let raw = '';
    res.on('data', d => raw += d);
    res.on('end', () => {
      if (res.statusCode >= 400) {
        console.error(`[Webhook] Error ${res.statusCode}: ${raw.slice(0, 120)}`);
      }
    });
  });
  req.on('error', (e) => console.error('[Webhook] Request error:', e.message));
  req.write(body);
  req.end();
}

function sendWebhook(embed) {
  sendRawWebhook(WEBSITE_WEBHOOK, embed);
}

// ── Geo & device helpers ──────────────────────────────────────────────────
function countryFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E0 + c.charCodeAt(0) - 65));
}

const geoCache = new Map();
function getGeo(ip, cb) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127') || ip.startsWith('10.') || ip.startsWith('192.168.'))
    return cb({ country: 'Local', city: 'Dev', region: 'Dev', isp: 'Local', countryCode: 'XX', mobile: false, proxy: false, flag: '🏠' });
  const clean = ip.replace(/^::ffff:/, '');
  if (geoCache.has(clean)) return cb(geoCache.get(clean));
  const reqUrl = `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,country,countryCode,regionName,city,isp,mobile,proxy`;
  http.get(reqUrl, res => {
    let raw = '';
    res.on('data', d => raw += d);
    res.on('end', () => {
      try {
        const d = JSON.parse(raw);
        if (d.status === 'fail') return cb({ country: '?', city: '?', flag: '🌍', isp: '?', mobile: false, proxy: false });
        const info = {
          country: d.country || '?', countryCode: d.countryCode || '??',
          city: d.city || '?', region: d.regionName || '?',
          isp: d.isp || '?', mobile: d.mobile || false, proxy: d.proxy || false,
          flag: countryFlag(d.countryCode)
        };
        geoCache.set(clean, info);
        cb(info);
      } catch { cb({ country: '?', city: '?', flag: '🌍', isp: '?', mobile: false, proxy: false }); }
    });
  }).on('error', () => cb({ country: '?', city: '?', flag: '🌍', isp: '?', mobile: false, proxy: false }));
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
    const device  = parseDevice(ua);
    const browser = parseBrowser(ua);
    const entry = {
      page, ip: ip ? ip.slice(0, 40) : '?',
      country: geo.country, countryCode: geo.countryCode,
      city: geo.city, region: geo.region,
      isp: geo.isp, mobile: geo.mobile, proxy: geo.proxy,
      flag: geo.flag, device, browser,
      referer: referer ? referer.slice(0, 80) : 'Direct',
      time: Date.now()
    };
    visitLog.push(entry);
    if (visitLog.length > 500) visitLog.shift();

    const locStr = `${geo.flag || '🌍'} ${geo.country}${geo.city && geo.city !== '?' ? ` — ${geo.city}` : ''}`;
    const proxyStr = geo.proxy ? '⚠️ Proxy/VPN detected' : '✓ Clean';
    const mobileStr = geo.mobile ? '📱 Mobile ISP' : '';
    sendWebhook({
      title: '🌐 Page Visit',
      color: 0x7C3AED,
      fields: [
        { name: '📄 Page',      value: `\`/${page || 'home'}\``,                  inline: true },
        { name: '🌍 Location',  value: locStr,                                     inline: true },
        { name: '🏢 ISP',       value: geo.isp || '?',                             inline: true },
        { name: '💻 Device',    value: device,                                     inline: true },
        { name: '🔍 Browser',   value: browser,                                    inline: true },
        { name: '🔒 Proxy',     value: `${proxyStr} ${mobileStr}`.trim(),          inline: true },
        { name: '🔗 Referer',   value: referer ? referer.slice(0, 60) : 'Direct',  inline: true },
        { name: '📊 Total',     value: String(visitStats.total),                   inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Aimo Website Logger • ${geo.city || '?'}, ${geo.region || '?'}` }
    });
  });
}

function serve404(res) {
  const f = path.join(ROOT, '404.html');
  fs.readFile(f, (err, data) => {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data || '<h1>404 — Page Not Found</h1>');
  });
}

// ── Server ────────────────────────────────────────────────────────────────
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

  // ── API: status config ────────────────────────────────────────────────
  if (raw === '/api/status-config') {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'status.changer.json'), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(cfg));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        bot: { status: 'online' }, website: { status: 'online' },
        lavalink: { status: 'online', nodes: [] }, database: { status: 'online' },
        lyrics: { status: 'online', providers: [] }, ai: { status: 'online', providers: [] },
        announcements: []
      }));
    }
  }

  // ── API: owner check ──────────────────────────────────────────────────
  if (raw === '/api/owner/check') {
    const pass = parsed.query.pass || '';
    res.writeHead(pass === OWNER_PASS ? 200 : 403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: pass === OWNER_PASS }));
  }

  // ── API: visit log ────────────────────────────────────────────────────
  if (raw === '/api/owner/visits') {
    const pass = parsed.query.pass || '';
    if (pass !== OWNER_PASS) { res.writeHead(403); return res.end('[]'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(visitLog.slice(-100).reverse()));
  }

  // ── API: download all ZIP ────────────────────────────────────────────
  if (raw === '/api/owner/download') {
    const pass = parsed.query.pass || '';
    if (parsed.query.check === '1') {
      res.writeHead(pass === OWNER_PASS ? 204 : 403); return res.end();
    }
    if (pass !== OWNER_PASS) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
    try {
      const entries = WEBSITE_FILES
        .map(f => ({ name: f, fp: path.join(ROOT, f) }))
        .filter(({ fp }) => fs.existsSync(fp))
        .map(({ name, fp }) => ({ name, data: fs.readFileSync(fp) }));
      const zipBuf = buildZip(entries);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="aimo-website.zip"',
        'Content-Length': zipBuf.length
      });
      return res.end(zipBuf);
    } catch (e) {
      console.error('[Download] ZIP error:', e.message);
      res.writeHead(500); return res.end('ZIP error');
    }
  }

  // ── API: download single file ─────────────────────────────────────────
  if (raw === '/api/owner/download-single') {
    const pass     = parsed.query.pass || '';
    const filename = (parsed.query.file || '').replace(/\.\./g, '').replace(/\//g, '');
    if (pass !== OWNER_PASS) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
    if (!WEBSITE_FILES.includes(filename)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'File not allowed' })); }
    const fp = path.join(ROOT, filename);
    if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'File not found' })); }
    try {
      const data = fs.readFileSync(fp);
      const ext  = path.extname(filename);
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': data.length
      });
      return res.end(data);
    } catch (e) {
      console.error('[Download-Single] Error:', e.message);
      res.writeHead(500); return res.end('Read error');
    }
  }

  // ── API: cluster info ─────────────────────────────────────────────────
  if (raw === '/api/cluster') {
    const upSecs = Math.floor(process.uptime());
    const h = Math.floor(upSecs / 3600), m = Math.floor((upSecs % 3600) / 60), s = upSecs % 60;
    const uptime = `${h}h ${m}m ${s}s`;
    const topCountries = Object.entries(visitStats.countries).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([c, n]) => {
        const e = visitLog.find(v => v.country === c);
        return [`${e?.flag || '🌍'} ${c}`, n];
      });
    const topPages = Object.entries(visitStats.pages).sort((a, b) => b[1] - a[1]).slice(0, 8);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      uptime, shards: 1, totalShards: 1,
      serverTime: new Date().toString(),
      totalVisits: visitStats.total,
      songsInLibrary: 0,
      topCountries, topPages
    }));
  }

  // ── Route pages ───────────────────────────────────────────────────────
  if (slug in PAGES) {
    const file = path.join(ROOT, PAGES[slug]);
    return fs.readFile(file, (err, data) => {
      if (err) return serve404(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      logVisit(slug, ip, ua, referer);
    });
  }

  // ── Serve static assets ───────────────────────────────────────────────
  const assetName = raw.replace(/^\//, '');
  if (ASSETS.has(assetName)) {
    const dest = req.headers['sec-fetch-dest'];
    if (dest === 'document' || dest === 'frame' || dest === 'iframe') return serve404(res);
    const ext  = path.extname(assetName);
    const mime = MIME[ext] || 'application/octet-stream';
    const fp   = path.join(ROOT, assetName);
    return fs.readFile(fp, (err, data) => {
      if (err) return serve404(res);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  }

  serve404(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Aimo website running on port ${PORT}`);
});
