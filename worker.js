// Cloudflare Worker: liefert die App (Ordner public/) aus und stellt unter /api/spiele
// die Heimspiele auf dem Sportplatz Rechberg aus den fussball.de-Vereinsspielplänen bereit.

const CLUBS = {
  '00ES8GNB10000028VV0AG08LVUPGND5I': 'TSGV Rechberg',
  '00ES8GNAUG00002SVV0AG08LVUPGND5I': '1. FC Donzdorf',
  '00ES8GNB1000002DVV0AG08LVUPGND5I': 'TG Reichenbach u.R.',
};
// Spielstätte auf fussball.de: "neuer Sportplatz Rechberg | Im Lehr 3 | 73529 Schwäbisch Gmünd"
const VENUE_MATCH = /sportplatz rechberg|im lehr 3/i;
const CACHE_SECONDS = 3600;

const planUrl = id => `https://www.fussball.de/ajax.club.matchplan/-/id/${id}/match-type/-1/max/999/mode/PRINT/show-venues/true`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/spiele')) return spiele(url, ctx);
    return env.ASSETS.fetch(request);
  },
};

async function spiele(url, ctx) {
  // Diagnose: /api/spiele/debug  bzw.  /api/spiele/raw/<0|1|2>/<offset>
  const seg = url.pathname.split('/').filter(Boolean).slice(2);
  const debug = seg[0] || null;
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/spiele/v2');
  if (!debug) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const games = [], errors = [], raw = {};
  await Promise.all(Object.entries(CLUBS).map(async ([id, name]) => {
    try {
      const r = await fetch(planUrl(id), { headers: { 'User-Agent': 'Mozilla/5.0 (TSGV Rechberg Platzbelegung)', 'Accept': 'text/html' }, cf: { cacheTtl: 600 } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      if (debug) raw[name] = html;
      games.push(...parsePlan(html, name));
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  }));
  if (debug === 'raw') {
    const name = Object.values(CLUBS)[Number(seg[1] || 0)];
    const html = raw[name] || '';
    const at = Math.max(0, html.search(/<tbody/i));
    const off = Number(seg[2] || 0);
    return new Response(html.slice(at + off, at + off + 6000), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  // Doppelte (gleiche Partie aus mehreren Vereinsplänen / Verlegungen) zusammenführen
  const byKey = new Map();
  for (const g of games) {
    const k = g.matchId || `${g.date}|${g.kickoff}|${g.home}|${g.away}`;
    if (!byKey.has(k) || (!byKey.get(k).venue && g.venue)) byKey.set(k, g);
  }
  const all = [...byKey.values()];
  const home = all.filter(g => VENUE_MATCH.test(g.venue || '')).sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff));
  const body = debug
    ? { updated: new Date().toISOString(), errors, total: all.length, sample: all.slice(0, 15), games: home }
    : { updated: new Date().toISOString(), errors, games: home };
  const res = new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${CACHE_SECONDS}` },
  });
  if (!debug && !errors.length && home.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ---------- Parser ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' };
const decode = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const text = h => decode(h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

function parseDate(t) {
  const m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  return `${y}-${pad(m[2])}-${pad(m[1])}`;
}
function parseTime(t) {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : null;
}
const TYPE_RE = /(Herren-Reserve|Alte Herren|Altherren|Senioren|Ü\s?\d{2}|Frauen|[A-G]-Junior(?:en|innen)|Herren)/i;

function parsePlan(html, source) {
  const tbody = html.slice(Math.max(0, html.search(/<tbody/i)));
  const rows = tbody.split(/<tr\b/i).slice(1).map(r => {
    const cls = (r.match(/^[^>]*class="([^"]*)"/i) || [])[1] || '';
    return { cls, html: r.split(/<\/tr>/i)[0] };
  });
  const out = [];
  let ctx = { date: null, kickoff: null, type: null, competition: null };
  let cur = null;
  const flush = () => {
    if (cur && cur.home && cur.away && ctx.date) out.push({ ...cur, date: cur.date || ctx.date, kickoff: cur.kickoff || ctx.kickoff, type: cur.type || ctx.type, competition: cur.competition || ctx.competition, source });
    cur = null;
  };
  for (const row of rows) {
    const t = text(row.html);
    if (!t) continue;
    const clubs = [...row.html.matchAll(/class="club-name"[^>]*>([\s\S]*?)<\/div>/gi)].map(m => text(m[1]));
    if (/row-venue/i.test(row.cls) || (/\|/.test(t) && /\b\d{5}\b/.test(t) && !clubs.length && !parseDate(t))) {
      if (cur) { cur.venue = t; flush(); }
      continue;
    }
    if (clubs.length >= 2) {
      flush();
      const id = (row.html.match(/\/spiel\/[^"']*?\/-\/spiel\/([A-Z0-9]+)/i) || [])[1] || null;
      cur = { home: clubs[0], away: clubs[1], matchId: id, venue: '' };
      continue;
    }
    const d = parseDate(t), k = parseTime(t), ty = (t.match(TYPE_RE) || [])[1];
    if (d || k || /row-headline|row-competition/i.test(row.cls)) {
      flush();
      if (d) ctx.date = d;
      if (k) ctx.kickoff = k; else if (d) ctx.kickoff = null;
      if (ty) ctx.type = ty;
      const parts = t.split('|').map(s => s.trim()).filter(Boolean);
      const comp = parts.find(p => !TYPE_RE.test(p) && !parseDate(p) && !parseTime(p) && !/^(ME|FS|PO|TU)\b/.test(p));
      if (comp) ctx.competition = comp;
    }
  }
  flush();
  return out;
}
