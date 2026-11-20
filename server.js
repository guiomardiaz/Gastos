// Servidor estático mínimo, sin dependencias. Railway define PORT.
const http = require('http');
const fs = require('fs');
const path = require('path');
const sync = require('./notion-sync');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Cobros en efectivo de VicGuiDogs. La clave la manda el móvil (x-vgd-key)
// y aquí solo se reenvía: así el navegador no choca con CORS.
const VGD_API = (process.env.VICGUIDOGS_API_URL || 'https://vicguidogs-production.up.railway.app').replace(/\/+$/, '');
async function vgdEfectivo(req, res) {
  const json = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
  const key = req.headers['x-vgd-key'];
  if (!key) return json(401, { error: 'falta la clave' });
  const desde = new URL(req.url, 'http://x').searchParams.get('desde') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return json(400, { error: 'fecha no válida' });
  try {
    const r = await fetch(`${VGD_API}/api/huchi/efectivo?desde=${desde}`, {
      headers: { 'X-Huchi-Key': key },
      signal: AbortSignal.timeout(20000),
    });
    const body = await r.text();
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body);
  } catch (e) {
    console.error('VicGuiDogs:', e.message);
    json(502, { error: 'VicGuiDogs no responde' });
  }
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && (req.url || '').startsWith('/api/vicguidogs/efectivo')) {
      vgdEfectivo(req, res);
      return;
    }
    if (req.method === 'POST' && (req.url === '/api/sync' || req.url === '/api/rutinas')) {
      const json = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
      if (!sync.ready()) return json(503, { error: 'sync no configurado' });
      if (req.headers['x-sync-key'] !== process.env.SYNC_KEY) return json(401, { error: 'clave incorrecta' });
      let raw = '';
      req.on('data', (d) => { raw += d; if (raw.length > 2e6) req.destroy(); });
      req.on('end', () => {
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'json no válido' }); }
        const run = req.url === '/api/sync' ? sync.handleSync : sync.handleRutinas;
        sync.enqueue(() => run(body)).then(
          () => json(200, { ok: true }),
          (e) => { console.error(e.message); json(502, { error: e.message }); }
        );
      });
      return;
    }
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Mis Gastos escuchando en el puerto ${PORT}`));