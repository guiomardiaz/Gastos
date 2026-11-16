// Puente seguro Huchi/Rutinas -> Notion. Sin dependencias (Node >= 18).
// El token de Notion vive SOLO en las variables de entorno del servidor.
const NOTION = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = () => ({
  token: process.env.NOTION_TOKEN,
  gastos: process.env.NOTION_GASTOS_DB,
  presupuesto: process.env.NOTION_PRESUPUESTO_DB,
  rutinas: process.env.NOTION_RUTINAS_DB,
});

async function api(method, path, body, attempt = 0) {
  await sleep(350); // Notion admite ~3 peticiones/segundo
  const res = await fetch(NOTION + path, {
    method,
    headers: {
      Authorization: `Bearer ${cfg().token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 4) {
    await sleep((Number(res.headers.get('retry-after')) || 2) * 1000);
    return api(method, path, body, attempt + 1);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data.message || 'error'}`);
  return data;
}

const findOne = async (dbId, filter) => {
  const r = await api('POST', `/databases/${dbId}/query`, { filter, page_size: 1 });
  return r.results[0] || null;
};
const text = (s) => [{ type: 'text', text: { content: String(s || '').slice(0, 1900) } }];

/* ---------- Presupuesto: una fila por categoría ---------- */
async function syncCats(cats, month) {
  const { presupuesto } = cfg();
  const ids = {}; // nombre -> page id
  for (const c of cats) {
    const props = {
      'Límite mensual': { number: c.limit ? c.limit / 100 : null },
      'Gastado este mes': { number: (c.spent || 0) / 100 },
      Mes: { rich_text: text(month) },
    };
    const found = await findOne(presupuesto, { property: 'Categoría', title: { equals: c.name } });
    if (found) {
      await api('PATCH', `/pages/${found.id}`, { properties: props });
      ids[c.name] = found.id;
    } else {
      const p = await api('POST', '/pages', {
        parent: { database_id: presupuesto },
        properties: { Categoría: { title: text(c.name) }, ...props },
      });
      ids[c.name] = p.id;
    }
  }
  return ids;
}

/* ---------- Gastos / ingresos ---------- */
async function syncItems(items, catIds) {
  const { gastos, presupuesto } = cfg();
  for (const it of items) {
    const id = String(it.id);
    const found = await findOne(gastos, { property: 'Huchi ID', rich_text: { equals: id } });
    if (it.op === 'del') {
      if (found) await api('PATCH', `/pages/${found.id}`, { archived: true });
      continue;
    }
    const props = {
      Concepto: { title: text(it.note || it.catName || 'Gasto') },
      Importe: { number: it.amount / 100 },
      Fecha: { date: { start: it.date } },
      Tipo: { select: { name: it.type === 'income' ? '💰 Ingreso' : '💸 Gasto' } },
      Método: { select: { name: '💶 Efectivo' } },
      'Categoría Huchi': { rich_text: text(it.catName) },
      'Huchi ID': { rich_text: text(id) },
    };
    let rel = catIds[it.catName];
    if (!rel && it.type !== 'income' && it.catName) {
      const c = await findOne(presupuesto, { property: 'Categoría', title: { equals: it.catName } });
      rel = c && c.id;
    }
    if (rel && it.type !== 'income') props['Categoría'] = { relation: [{ id: rel }] };
    if (found) await api('PATCH', `/pages/${found.id}`, { properties: props });
    else await api('POST', '/pages', { parent: { database_id: gastos }, properties: props });
  }
}

async function handleSync({ items = [], cats = [], month = '' }) {
  const catIds = await syncCats(cats, month);
  await syncItems(items, catIds);
}

/* ---------- Rutinas: Registro diario ---------- */
async function handleRutinas({ items = [] }) {
  const { rutinas } = cfg();
  for (const it of items) {
    const found = await findOne(rutinas, { property: 'Clave', rich_text: { equals: it.key } });
    if (it.op === 'del') {
      if (found) await api('PATCH', `/pages/${found.id}`, { archived: true });
      continue;
    }
    const props = {
      Nombre: { title: text(it.name) },
      Fecha: { date: { start: it.date } },
      Tipo: { select: { name: it.tipo === 'mood' ? '😊 Ánimo' : '✅ Rutina' } },
      Categoría: { rich_text: text(it.category) },
      Clave: { rich_text: text(it.key) },
    };
    if (found) await api('PATCH', `/pages/${found.id}`, { properties: props });
    else await api('POST', '/pages', { parent: { database_id: rutinas }, properties: props });
  }
}

const ready = () => {
  const c = cfg();
  return !!(process.env.SYNC_KEY && c.token && c.gastos && c.presupuesto && c.rutinas);
};

// Cola en serie: nunca dos sincronizaciones a la vez (respeta el límite de Notion).
let chain = Promise.resolve();
const enqueue = (fn) => (chain = chain.then(fn, fn));

module.exports = { handleSync, handleRutinas, ready, enqueue };
