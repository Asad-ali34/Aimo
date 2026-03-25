// ============================================================
//  AIMO BOT — CONFIGURATION
// ============================================================
const DISCORD_INVITE  = 'https://discord.com/oauth2/authorize?client_id=1466757680311042060&permissions=8&integration_type=0&scope=bot';
const DISCORD_SUPPORT = 'https://discord.gg/9rSar8Kssg';
const CLIENT_ID       = '1466757680311042060';
const LAVALINK_HOST   = 'lavalinkv4.serenetia.com';
const LAVALINK_PORT   = '443';
const LAVALINK_PASS   = 'https://dsc.gg/ajidevserver';

// ============================================================
//  VISITORS WEBHOOK
// ============================================================
const VISITORS_WEBHOOK = 'https://discord.com/api/webhooks/1485951478010220638/Puwpgr_dpNB1_WXH5f5jZ9jcUWcTsltyoEOKa7VlwQi3M8j9lOiugPQh0xBgyNH6Tz11';
// ============================================================

// ── Visitor Logging ─────────────────────────────────────────
(async function logVisitor() {
  try {
    // ── Only fire ONCE per browser session (reloads don't count) ──
    if (sessionStorage.getItem('aimo_s')) return;
    sessionStorage.setItem('aimo_s', '1');

    // ── Visitor ID (persists across sessions) & session counter ──
    let visitorId = localStorage.getItem('aimo_vid');
    const isNew   = !visitorId;
    if (!visitorId) {
      visitorId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem('aimo_vid', visitorId);
    }
    const visitCount = (parseInt(localStorage.getItem('aimo_visits') || '0', 10)) + 1;
    localStorage.setItem('aimo_visits', String(visitCount));

    // ── Session start time ───────────────────────────────────
    const sessionStart = Date.now();
    sessionStorage.setItem('aimo_st', String(sessionStart));

    // ── Flag emoji from country code ─────────────────────────
    function countryFlag(code) {
      if (!code || code.length !== 2) return '🌐';
      return [...code.toUpperCase()].map(c =>
        String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
      ).join('');
    }

    // ── Browser detection ────────────────────────────────────
    // NOTE: Brave does NOT expose "Brave" in UA — must check navigator.brave API
    function detectBrowser(ua) {
      if (typeof navigator.brave !== 'undefined')     return 'Brave';
      if (/Edg\//.test(ua))                           return 'Microsoft Edge';
      if (/OPR\//.test(ua))                           return 'Opera';
      if (/YaBrowser/.test(ua))                       return 'Yandex Browser';
      if (/SamsungBrowser/.test(ua))                  return 'Samsung Browser';
      if (/UCBrowser/.test(ua))                       return 'UC Browser';
      if (/CriOS/.test(ua))                           return 'Chrome (iOS)';
      if (/FxiOS/.test(ua))                           return 'Firefox (iOS)';
      if (/Chrome\//.test(ua))                        return 'Google Chrome';
      if (/Firefox\//.test(ua))                       return 'Mozilla Firefox';
      if (/Safari\//.test(ua) && !/Chrome/.test(ua))  return 'Apple Safari';
      if (/MSIE|Trident/.test(ua))                    return 'Internet Explorer';
      return 'Unknown Browser';
    }

    // ── Browser version ──────────────────────────────────────
    function detectBrowserVersion(ua) {
      // Edge
      let m = ua.match(/Edg\/([\d.]+)/);       if (m) return m[1];
      // Opera
      m = ua.match(/OPR\/([\d.]+)/);            if (m) return m[1];
      // Samsung
      m = ua.match(/SamsungBrowser\/([\d.]+)/); if (m) return m[1];
      // Firefox / FxiOS
      m = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/); if (m) return m[1];
      // Chrome / CriOS
      m = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/);  if (m) return m[1];
      // Safari
      m = ua.match(/Version\/([\d.]+).*Safari/);   if (m) return m[1];
      return '';
    }

    // ── OS detection ─────────────────────────────────────────
    function detectOS(ua) {
      if (/Windows NT 10|Windows 11/.test(ua))  return 'Windows 10/11';
      if (/Windows NT 6\.3/.test(ua))           return 'Windows 8.1';
      if (/Windows NT 6\.2/.test(ua))           return 'Windows 8';
      if (/Windows NT 6\.1/.test(ua))           return 'Windows 7';
      if (/Windows/.test(ua))                   return 'Windows';
      if (/Android (\d+[\.\d]*)/.test(ua))      return `Android ${RegExp.$1}`;
      if (/iPhone OS ([\d_]+)/.test(ua))        return `iOS ${RegExp.$1.replace(/_/g, '.')}`;
      if (/iPad.*OS ([\d_]+)/.test(ua))         return `iPadOS ${RegExp.$1.replace(/_/g, '.')}`;
      if (/Mac OS X ([\d_]+)/.test(ua))         return `macOS ${RegExp.$1.replace(/_/g, '.')}`;
      if (/CrOS/.test(ua))                      return 'Chrome OS';
      if (/Linux/.test(ua))                     return 'Linux';
      return 'Unknown OS';
    }

    // ── Device type ──────────────────────────────────────────
    function detectDevice(ua) {
      if (/iPad|Tablet|PlayBook|Silk|Kindle|GT-P|SM-T|Tab |SCH-I800|SHW-M180|SGH-T849|GT-N8013/.test(ua))
        return '📟 Tablet';
      if (/Mobile|Android|iPhone|iPod|BlackBerry|Windows Phone|Opera Mini|IEMobile|WPDesktop/.test(ua))
        return '📱 Mobile';
      return '🖥️ Desktop';
    }

    // ── Connection info ──────────────────────────────────────
    function detectConnection() {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) return 'Unknown';
      const parts = [];
      if (conn.effectiveType) parts.push(conn.effectiveType.toUpperCase());
      if (conn.downlink)      parts.push(`↓${conn.downlink} Mbps`);
      if (conn.rtt)           parts.push(`RTT ${conn.rtt}ms`);
      return parts.join(' · ') || 'Unknown';
    }

    // ── Hardware ─────────────────────────────────────────────
    function detectHardware() {
      const cores = navigator.hardwareConcurrency || '?';
      const mem   = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '?';
      return `${cores} cores · ${mem} RAM`;
    }

    // ── Touch support ────────────────────────────────────────
    function detectTouch() {
      return ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? '✅ Touch' : '❌ No touch';
    }

    // ── Dark mode ────────────────────────────────────────────
    function detectColorScheme() {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches)  return '🌙 Dark';
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return '☀️ Light';
      return '⬛ No preference';
    }

    // ── Battery ──────────────────────────────────────────────
    async function fetchBattery() {
      try {
        const bat = await navigator.getBattery();
        const pct  = Math.round(bat.level * 100);
        const icon = bat.charging ? '⚡' : pct <= 20 ? '🪫' : '🔋';
        const timeLeft = bat.charging
          ? (bat.chargingTime !== Infinity ? `full in ${Math.round(bat.chargingTime / 60)}m` : 'charging')
          : (bat.dischargingTime !== Infinity ? `${Math.round(bat.dischargingTime / 60)}m left` : '');
        return `${icon} ${pct}%${timeLeft ? ` (${timeLeft})` : ''}`;
      } catch { return 'N/A'; }
    }

    // ── Geo API with 3 fallbacks ─────────────────────────────
    async function fetchGeo() {
      const tries = [
        async () => {
          const r = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(5000) });
          const d = await r.json();
          if (!d.success) throw new Error('failed');
          return {
            ip: d.ip || '', country: d.country || '', countryCode: d.country_code || '',
            region: d.region || '', city: d.city || '', postal: d.postal || '',
            isp: d.connection?.isp || d.org || '', org: d.org || '',
            asn: d.connection?.asn ? `AS${d.connection.asn}` : '',
            timezone: d.timezone?.id || '', lat: d.latitude || '', lon: d.longitude || '',
          };
        },
        async () => {
          const r = await fetch(
            'https://ip-api.com/json/?fields=status,query,country,countryCode,regionName,city,zip,isp,org,as,timezone,lat,lon',
            { signal: AbortSignal.timeout(5000) }
          );
          const d = await r.json();
          if (d.status !== 'success') throw new Error('failed');
          return {
            ip: d.query || '', country: d.country || '', countryCode: d.countryCode || '',
            region: d.regionName || '', city: d.city || '', postal: d.zip || '',
            isp: d.isp || '', org: d.org || '', asn: d.as || '',
            timezone: d.timezone || '', lat: d.lat || '', lon: d.lon || '',
          };
        },
        async () => {
          const r = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) });
          const d = await r.json();
          if (!d.ip) throw new Error('failed');
          const [lat, lon] = (d.loc || ',').split(',');
          return {
            ip: d.ip || '', country: d.country || '', countryCode: d.country || '',
            region: d.region || '', city: d.city || '', postal: d.postal || '',
            isp: d.org || '', org: d.org || '', asn: d.org || '',
            timezone: d.timezone || '', lat: lat || '', lon: lon || '',
          };
        },
      ];
      for (const fn of tries) {
        try { return await fn(); } catch { /* try next */ }
      }
      return null;
    }

    // ── GPU / WebGL info ─────────────────────────────────────
    function detectGPU() {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'No WebGL';
        const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!dbgInfo) return 'WebGL (info hidden)';
        const vendor   = gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL)   || '';
        const renderer = gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) || '';
        return [vendor, renderer].filter(Boolean).join(' · ').slice(0, 100) || 'Unknown';
      } catch { return 'Unknown'; }
    }

    // ── Screen orientation ────────────────────────────────────
    function detectOrientation() {
      const o = screen.orientation?.type || '';
      if (o.includes('landscape')) return '🔲 Landscape';
      if (o.includes('portrait'))  return '📱 Portrait';
      return window.innerWidth > window.innerHeight ? '🔲 Landscape' : '📱 Portrait';
    }

    // ── Page load time ────────────────────────────────────────
    function detectLoadTime() {
      try {
        const t = performance.timing;
        if (!t) return 'N/A';
        const ms = t.loadEventEnd - t.navigationStart;
        if (ms <= 0) return 'N/A';
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
      } catch { return 'N/A'; }
    }

    // ── Plugin count ──────────────────────────────────────────
    function detectPlugins() {
      const count = navigator.plugins?.length ?? 0;
      return count > 0 ? `${count} plugin${count !== 1 ? 's' : ''}` : 'None / Hidden';
    }

    // ── Collect all data in parallel ─────────────────────────
    const [geo, battery] = await Promise.all([fetchGeo(), fetchBattery()]);

    const now         = new Date();
    const ua          = navigator.userAgent;
    const browser     = detectBrowser(ua);
    const browserVer  = detectBrowserVersion(ua);
    const os          = detectOS(ua);
    const device      = detectDevice(ua);
    const connection  = detectConnection();
    const hardware    = detectHardware();
    const gpu         = detectGPU();
    const touch       = detectTouch();
    const colorScheme = detectColorScheme();
    const orientation = detectOrientation();
    const loadTime    = detectLoadTime();
    const plugins     = detectPlugins();
    const lang        = navigator.language || navigator.languages?.[0] || 'Unknown';
    const langs       = (navigator.languages || [navigator.language]).join(', ');
    const tz          = Intl?.DateTimeFormat?.().resolvedOptions?.()?.timeZone || geo?.timezone || 'Unknown';
    const localTime   = now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
    const utcTime     = now.toUTCString();
    const screen_res  = `${window.screen.width}×${window.screen.height}`;
    const colorDepth  = `${window.screen.colorDepth}-bit`;
    const viewport    = `${window.innerWidth}×${window.innerHeight}`;
    const dpr         = window.devicePixelRatio ? `${window.devicePixelRatio}x` : '1x';
    const referrer    = document.referrer ? document.referrer.slice(0, 120) : 'Direct / None';
    const page        = document.title || window.location.pathname;
    const pageUrl     = window.location.href;
    const pagePath    = window.location.pathname;
    const cookieOk    = navigator.cookieEnabled ? '✅' : '❌';
    const doNotTrack  = navigator.doNotTrack === '1' ? '🚫 DNT On' : '✅ DNT Off';
    const pageHash    = window.location.hash || '';

    const country     = geo?.country     || 'Unknown';
    const countryCode = geo?.countryCode || '';
    const region      = geo?.region      || '';
    const city        = geo?.city        || '';
    const postal      = geo?.postal      || '';
    const isp         = geo?.isp         || 'Unknown';
    const org         = geo?.org         || '';
    const asn         = geo?.asn         || '';
    const timezone    = geo?.timezone    || tz || 'Unknown';
    const lat         = geo?.lat         || '';
    const lon         = geo?.lon         || '';
    const visitorIp   = geo?.ip          || 'Hidden';

    const flag        = countryFlag(countryCode);
    const locationStr = [city, postal, region, country].filter(Boolean).join(', ') || 'Unknown';
    const mapsLink    = (lat && lon) ? `[📍 View on Google Maps](https://maps.google.com/?q=${lat},${lon})` : '';
    const coords      = (lat && lon) ? `${lat}, ${lon}` : 'Unknown';

    // ── Build rich embed ─────────────────────────────────────
    const embedColor  = isNew ? 0x4ade80 : 0xa78bfa;
    const statusLabel = isNew ? '🆕 New Visitor' : '🔄 Returning Visitor';
    const browserFull = browserVer ? `${browser} ${browserVer}` : browser;

    const embed = {
      title:       `👁️  ${statusLabel}  ·  ${flag} ${country}`,
      color:       embedColor,
      description: [
        `**Page:** [${page}](${pageUrl})`,
        `**Path:** \`${pagePath}${pageHash}\``,
        `**Referrer:** ${referrer}`,
        mapsLink,
      ].filter(Boolean).join('\n'),
      fields: [
        {
          name:   '🪪 Visitor ID',
          value:  `\`${visitorId}\``,
          inline: false,
        },
        {
          name:   '🔢 Total Visits',
          value:  `**${visitCount}** session${visitCount !== 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name:   '📡 IP Address',
          value:  `\`${visitorIp}\``,
          inline: true,
        },
        {
          name:   `${flag} Location`,
          value:  locationStr,
          inline: true,
        },
        {
          name:   '🗺️ Coordinates',
          value:  coords,
          inline: true,
        },
        {
          name:   '🕐 Timezone',
          value:  timezone || 'Unknown',
          inline: true,
        },
        {
          name:   '🌐 ISP / Network',
          value:  [isp, org !== isp ? org : '', asn].filter(Boolean).join('\n') || 'Unknown',
          inline: true,
        },
        {
          name:   '🗣️ Language',
          value:  langs.slice(0, 50),
          inline: true,
        },
        {
          name:   '🖥️ OS',
          value:  os,
          inline: true,
        },
        {
          name:   '🌍 Browser',
          value:  browserFull,
          inline: true,
        },
        {
          name:   device + ' · Screen',
          value:  `${screen_res} ${dpr} · ${colorDepth}\nViewport: ${viewport}`,
          inline: true,
        },
        {
          name:   '📶 Connection',
          value:  connection,
          inline: true,
        },
        {
          name:   '⚙️ Hardware',
          value:  hardware,
          inline: true,
        },
        {
          name:   '🎮 GPU / WebGL',
          value:  gpu,
          inline: true,
        },
        {
          name:   '🔋 Battery',
          value:  battery,
          inline: true,
        },
        {
          name:   '🎨 Color Scheme',
          value:  colorScheme,
          inline: true,
        },
        {
          name:   '📐 Orientation',
          value:  orientation,
          inline: true,
        },
        {
          name:   '⚡ Page Load',
          value:  loadTime,
          inline: true,
        },
        {
          name:   '🧩 Browser Plugins',
          value:  plugins,
          inline: true,
        },
        {
          name:   '🍪 Cookies · DNT',
          value:  `${cookieOk} Cookies · ${doNotTrack}`,
          inline: true,
        },
        {
          name:   '🕒 Local Time',
          value:  localTime,
          inline: true,
        },
        {
          name:   '🌐 UTC Time',
          value:  utcTime,
          inline: true,
        },
        {
          name:   '📋 User Agent',
          value:  `\`${ua.slice(0, 220)}\``,
          inline: false,
        },
      ],
      footer:    { text: `Aimo Victoria Logs  •  ${isNew ? 'First visit ever' : `Session #${visitCount}`}` },
      timestamp: new Date().toISOString(),
    };

    await fetch(VISITORS_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username:         'Aimo Victoria Logs',
        avatar_url:       'https://cdn.discordapp.com/avatars/1466757680311042060/aimo-logo.png',
        allowed_mentions: { parse: [] },
        embeds:           [embed],
      }),
    });
  } catch { /* silent — never break the page */ }
})();
// ── End Visitor Logging ─────────────────────────────────────

// Mobile menu toggle
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
    }
  });
}

// Commands page category filter
const filterBtns  = document.querySelectorAll('.filter-btn');
const cmdSections = document.querySelectorAll('.cmd-section');

if (filterBtns.length > 0) {
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      cmdSections.forEach(section => {
        section.style.display = (cat === 'all' || section.dataset.cat === cat) ? 'block' : 'none';
      });
    });
  });
}

// Scroll-in animation
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.08 });

document.querySelectorAll('.feature-card, .cmd-cat-card, .cmd-item, .cmd-section-header, .status-card, .stat-item').forEach(el => {
  el.classList.add('fade-in');
  observer.observe(el);
});
