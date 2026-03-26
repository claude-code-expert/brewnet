/**
 * Brewnet Telemetry Worker
 *
 * Endpoints:
 *   GET /telemetry/install?v=VERSION&os=PLATFORM&source=curl|npm
 *     → Anonymous install counter. Called by install.sh and postinstall hook.
 *
 *   GET /telemetry/stats
 *     → Public stats dashboard JSON.
 *
 *   GET /telemetry/stats/details?days=30
 *     → Daily breakdown for the last N days.
 *
 * Storage: Cloudflare KV (INSTALL_COUNTS binding)
 *
 * KV key schema:
 *   total              → cumulative install count
 *   daily:{YYYY-MM-DD} → installs per day
 *   os:{macOS|Linux}   → installs per OS
 *   ver:{version}      → installs per CLI version
 *   src:{curl|npm}     → installs per source channel
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function increment(kv, key) {
  const val = parseInt(await kv.get(key) || '0', 10) + 1;
  await kv.put(key, String(val));
  return val;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── POST/GET /telemetry/install ──────────────────────────────────────
    if (url.pathname === '/telemetry/install') {
      const version = url.searchParams.get('v') || 'unknown';
      const os = url.searchParams.get('os') || 'unknown';
      const source = url.searchParams.get('source') || 'curl';
      const today = new Date().toISOString().slice(0, 10);

      const [total] = await Promise.all([
        increment(env.INSTALL_COUNTS, 'total'),
        increment(env.INSTALL_COUNTS, `daily:${today}`),
        increment(env.INSTALL_COUNTS, `os:${os}`),
        increment(env.INSTALL_COUNTS, `ver:${version}`),
        increment(env.INSTALL_COUNTS, `src:${source}`),
      ]);

      return json({ ok: true, total });
    }

    // ── GET /telemetry/stats ─────────────────────────────────────────────
    if (url.pathname === '/telemetry/stats') {
      const today = new Date().toISOString().slice(0, 10);

      const [total, daily, macOS, linux, curl, npm] = await Promise.all([
        env.INSTALL_COUNTS.get('total'),
        env.INSTALL_COUNTS.get(`daily:${today}`),
        env.INSTALL_COUNTS.get('os:macOS'),
        env.INSTALL_COUNTS.get('os:Linux'),
        env.INSTALL_COUNTS.get('src:curl'),
        env.INSTALL_COUNTS.get('src:npm'),
      ]);

      return json({
        total: parseInt(total || '0', 10),
        today: parseInt(daily || '0', 10),
        os: {
          macOS: parseInt(macOS || '0', 10),
          Linux: parseInt(linux || '0', 10),
        },
        source: {
          curl: parseInt(curl || '0', 10),
          npm: parseInt(npm || '0', 10),
        },
      });
    }

    // ── GET /telemetry/stats/details?days=30 ─────────────────────────────
    if (url.pathname === '/telemetry/stats/details') {
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
      const entries = [];

      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const count = parseInt(await env.INSTALL_COUNTS.get(`daily:${key}`) || '0', 10);
        entries.push({ date: key, count });
      }

      // Version breakdown
      const versions = {};
      const verList = await env.INSTALL_COUNTS.list({ prefix: 'ver:' });
      for (const key of verList.keys) {
        const val = await env.INSTALL_COUNTS.get(key.name);
        versions[key.name.replace('ver:', '')] = parseInt(val || '0', 10);
      }

      return json({ daily: entries, versions });
    }

    return json({ error: 'Not found' }, 404);
  },
};
