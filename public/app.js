(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const fmt = (cents) => money.format(cents / 100);
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const parseAmount = (txt) => {
    const n = parseFloat(String(txt).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    (Array.isArray(children) ? children : [children]).forEach((c) =>
      n.append(c instanceof Node ? c : document.createTextNode(c))
    );
    return n;
  };

  const INCOME_CAT = '_ingreso';
  const DEFAULT_CATS = [
    { id: 'comida', emoji: '🍔', name: 'Comida', limit: 0 },
    { id: 'cafe', emoji: '☕', name: 'Café', limit: 0 },
    { id: 'transporte', emoji: '🚌', name: 'Transporte', limit: 0 },
    { id: 'compra', emoji: '🛒', name: 'Compra', limit: 0 },
    { id: 'ocio', emoji: '🎉', name: 'Ocio', limit: 0 },
    { id: 'casa', emoji: '🏠', name: 'Casa', limit: 0 },
    { id: 'salud', emoji: '💊', name: 'Salud', limit: 0 },
    { id: 'otros', emoji: '🎁', name: 'Otros', limit: 0 },
  ];
  const COLORS = ['#0f766e', '#d97706', '#2563eb', '#be185d', '#7c3aed', '#65a30d', '#dc2626', '#0891b2', '#a16207', '#4b5563'];

  /* ---------- Base de datos local (IndexedDB) ---------- */
  let db;
  const openDB = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open('gastos', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('tx', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('cats', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const wrap = (r) =>
    new Promise((res, rej) => {
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const st = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
  const dbAll = (name) => wrap(st(name).getAll());
  const dbPut = (name, val) => wrap(st(name, 'readwrite').put(val));
  const dbDel = (name, key) => wrap(st(name, 'readwrite').delete(key));
  const dbClear = (name) => wrap(st(name, 'readwrite').clear());

  /* ---------- Estado ---------- */
  const now = new Date();
  const state = {
    cats: [],
    txs: [],
    tone: 'suave',
    type: 'expense',
    selectedCat: null,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
  const monthKey = () => `${state.year}-${pad(state.month)}`;
  const catById = (id) =>
    id === INCOME_CAT
      ? { id, emoji: '💶', name: 'Ingreso', limit: 0 }
      : state.cats.find((c) => c.id === id) || { id, emoji: '📦', name: 'Sin categoría', limit: 0 };

  async function load() {
    state.cats = await dbAll('cats');
    if (!state.cats.length) {
      for (const c of DEFAULT_CATS) await dbPut('cats', c);
      state.cats = DEFAULT_CATS.slice();
    }
    state.txs = (await dbAll('tx')).sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    const tone = (await dbAll('meta')).find((m) => m.key === 'tone');
    if (tone) state.tone = tone.value;
    if (!state.selectedCat || !state.cats.some((c) => c.id === state.selectedCat)) {
      state.selectedCat = state.cats[0] ? state.cats[0].id : null;
    }
  }

  const monthTxs = (key = monthKey()) => state.txs.filter((t) => t.date.slice(0, 7) === key);
  const spentByCat = (key = monthKey()) => {
    const m = {};
    monthTxs(key).forEach((t) => {
      if (t.type === 'expense') m[t.cat] = (m[t.cat] || 0) + t.amount;
    });
    return m;
  };

  /* ---------- Avisos de límite ---------- */
  const MESSAGES = {
    suave: {
      warn: (c, pct) => `Ojo, llevas el ${pct}% del límite de ${c.name} este mes.`,
      over: (c, s, l) => `Te has pasado del límite de ${c.name} (${fmt(s)} de ${fmt(l)}). Pasa, el próximo mes lo ajustamos.`,
    },
    directo: {
      warn: (c, pct) => `${c.name}: ya vas por el ${pct}%. Frena un poco.`,
      over: (c, s, l) => `Límite de ${c.name} superado: ${fmt(s)} de ${fmt(l)}.`,
    },
    'sin-filtro': {
      warn: (c, pct) => `${pct}% en ${c.name} y aún quedan días de mes... piénsatelo.`,
      over: (c, s, l) => `${fmt(s)} en ${c.name} cuando el límite eran ${fmt(l)}. ¿En serio?`,
    },
  };

  function checkLimit(tx) {
    if (tx.type !== 'expense') return null;
    const cat = catById(tx.cat);
    if (!cat.limit) return null;
    const spent = spentByCat(tx.date.slice(0, 7))[tx.cat] || 0;
    const pct = Math.round((spent / cat.limit) * 100);
    const msgs = MESSAGES[state.tone] || MESSAGES.suave;
    if (spent > cat.limit) return { alert: true, text: msgs.over(cat, spent, cat.limit) };
    if (pct >= 80) return { alert: false, text: msgs.warn(cat, pct) };
    return null;
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(text, alert = false) {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast show' + (alert ? ' alert' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 4200);
  }

  /* ---------- Guardar movimiento ---------- */
  async function saveTx(catId) {
    const amount = parseAmount($('amount').value);
    if (!amount) {
      toast('Pon un importe mayor que 0');
      $('amount').focus();
      return;
    }
    const tx = {
      type: state.type,
      amount,
      cat: state.type === 'income' ? INCOME_CAT : catId || state.selectedCat,
      note: $('note').value.trim(),
      date: $('date').value || todayStr(),
    };
    tx.id = await wrap(st('tx', 'readwrite').add(tx));
    await load();
    $('amount').value = '';
    $('note').value = '';
    $('date').value = todayStr();
    const warning = checkLimit(tx);
    if (warning) toast(warning.text, warning.alert);
    else toast(`${tx.type === 'income' ? 'Ingreso' : 'Gasto'} guardado: ${fmt(amount)}`);
    renderAll();
    $('amount').focus();
  }

  /* ---------- Render ---------- */
  function renderHeader() {
    $('monthLabel').textContent = new Date(state.year, state.month - 1, 1).toLocaleDateString('es-ES', {
      month: 'long',
      year: 'numeric',
    });
  }

  function renderHome() {
    const total = state.txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    $('cashBalance').textContent = fmt(total);
    const mt = monthTxs();
    const out = mt.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const inc = mt.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    $('monthSummary').textContent = `Este mes: −${fmt(out)} · +${fmt(inc)}`;

    $('catButtons').hidden = state.type === 'income';
    $('catHint').hidden = state.type === 'income';
    const grid = $('catButtons');
    grid.replaceChildren(
      ...state.cats.map((c) => {
        const b = el('button', { type: 'button', className: 'cat-btn' + (c.id === state.selectedCat ? ' selected' : '') }, [
          el('span', { className: 'e' }, c.emoji),
          c.name,
        ]);
        b.addEventListener('click', () => {
          state.selectedCat = c.id;
          const quick = parseAmount($('amount').value) && !$('note').value.trim();
          if (quick) saveTx(c.id);
          else {
            renderHome();
            $('amount').focus();
          }
        });
        return b;
      })
    );
    document.querySelectorAll('.type-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
  }

  function renderList() {
    const list = $('txList');
    const mt = monthTxs();
    $('txEmpty').hidden = mt.length > 0;
    list.replaceChildren(
      ...mt.map((t) => {
        const c = catById(t.cat);
        const [y, m, d] = t.date.split('-');
        const del = el('button', { className: 'del', title: 'Borrar', ariaLabel: 'Borrar movimiento' }, '🗑');
        del.addEventListener('click', async () => {
          if (!confirm('¿Borrar este movimiento?')) return;
          await dbDel('tx', t.id);
          await load();
          renderAll();
        });
        return el('li', {}, [
          el('span', { className: 'e' }, c.emoji),
          el('div', { className: 'info' }, [el('b', {}, c.name), el('small', {}, `${d}/${m}/${y}${t.note ? ' · ' + t.note : ''}`)]),
          el('span', { className: 'amt' + (t.type === 'income' ? ' in' : '') }, (t.type === 'income' ? '+' : '−') + fmt(t.amount)),
          del,
        ]);
      })
    );
  }

  function renderStats() {
    const spent = spentByCat();
    const budgets = state.cats.filter((c) => c.limit > 0);
    const bl = $('budgetList');
    if (!budgets.length) {
      bl.replaceChildren(el('p', { className: 'hint' }, 'Aún no has puesto límites. Hazlo en Ajustes → Categorías.'));
    } else {
      bl.replaceChildren(
        ...budgets.map((c) => {
          const s = spent[c.id] || 0;
          const pct = (s / c.limit) * 100;
          const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
          const left = c.limit - s;
          return el('div', { className: 'budget' }, [
            el('div', { className: 'top' }, [el('span', {}, `${c.emoji} ${c.name}`), el('b', {}, `${fmt(s)} / ${fmt(c.limit)}`)]),
            el('div', { className: 'bar' }, [el('i', { className: cls, style: `width:${Math.min(pct, 100)}%` })]),
            el('small', {}, left >= 0 ? `Te quedan ${fmt(left)}` : `Te has pasado ${fmt(-left)}`),
          ]);
        })
      );
    }
    drawChart(spent);
  }

  function drawChart(spent) {
    const canvas = $('chart');
    const dpr = window.devicePixelRatio || 1;
    const size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const css = getComputedStyle(document.documentElement);
    const legend = $('legend');
    if (!total) {
      ctx.fillStyle = css.getPropertyValue('--muted');
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin gastos este mes', size / 2, size / 2);
      legend.replaceChildren();
      return;
    }
    let start = -Math.PI / 2;
    const cx = size / 2, cy = size / 2, R = 140, r = 88;
    entries.forEach(([, v], i) => {
      const ang = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, start, start + ang);
      ctx.arc(cx, cy, r, start + ang, start, true);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      start += ang;
    });
    ctx.fillStyle = css.getPropertyValue('--text');
    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(fmt(total), cx, cy + 4);
    ctx.fillStyle = css.getPropertyValue('--muted');
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('gastado', cx, cy + 24);
    legend.replaceChildren(
      ...entries.map(([id, v], i) => {
        const c = catById(id);
        return el('li', {}, [
          el('span', { className: 'dot', style: `background:${COLORS[i % COLORS.length]}` }),
          `${c.emoji} ${c.name}`,
          el('span', { className: 'v' }, `${fmt(v)} · ${Math.round((v / total) * 100)}%`),
        ]);
      })
    );
  }

  function renderSettings() {
    $('tone').value = state.tone;
    $('catSettings').replaceChildren(
      ...state.cats.map((c) => {
        const input = el('input', {
          type: 'number', min: '0', step: '1', inputMode: 'decimal', placeholder: 'Límite €',
          value: c.limit ? String(c.limit / 100) : '', ariaLabel: `Límite de ${c.name}`,
        });
        input.addEventListener('change', async () => {
          const cents = parseAmount(input.value);
          await dbPut('cats', { ...c, limit: cents });
          await load();
          renderStats();
          toast(cents ? `Límite de ${c.name}: ${fmt(cents)}` : `Sin límite en ${c.name}`);
        });
        const del = el('button', { className: 'del', ariaLabel: `Borrar ${c.name}` }, '✕');
        del.addEventListener('click', async () => {
          if (!confirm(`¿Borrar la categoría "${c.name}"? Los movimientos se mantienen como "Sin categoría".`)) return;
          await dbDel('cats', c.id);
          await load();
          renderAll();
        });
        return el('li', {}, [el('span', { className: 'e' }, c.emoji), el('span', { className: 'name' }, c.name), input, del]);
      })
    );
  }

  function renderAll() {
    renderHeader();
    renderHome();
    renderList();
    renderStats();
    renderSettings();
  }

  /* ---------- Eventos ---------- */
  function bind() {
    $('quickForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveTx();
    });
    document.querySelectorAll('.type-toggle button').forEach((b) =>
      b.addEventListener('click', () => {
        state.type = b.dataset.type;
        renderHome();
      })
    );
    document.querySelectorAll('nav button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
        document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
        if (b.dataset.view === 'stats') renderStats();
      })
    );
    const shift = (d) => {
      state.month += d;
      if (state.month < 1) { state.month = 12; state.year--; }
      if (state.month > 12) { state.month = 1; state.year++; }
      renderAll();
    };
    $('prevMonth').addEventListener('click', () => shift(-1));
    $('nextMonth').addEventListener('click', () => shift(1));

    $('tone').addEventListener('change', async (e) => {
      state.tone = e.target.value;
      await dbPut('meta', { key: 'tone', value: state.tone });
      toast('Tono cambiado');
    });

    $('newCatForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('newCatName').value.trim();
      if (!name) return;
      await dbPut('cats', { id: 'c' + Date.now(), emoji: $('newCatEmoji').value.trim() || '🏷️', name, limit: 0 });
      $('newCatName').value = '';
      $('newCatEmoji').value = '';
      await load();
      renderAll();
    });

    $('exportBtn').addEventListener('click', () => {
      const data = { version: 1, exportedAt: new Date().toISOString(), tone: state.tone, cats: state.cats, tx: state.txs };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `gastos-${todayStr()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.cats) || !Array.isArray(data.tx)) throw new Error('formato');
        if (!confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) return;
        await dbClear('tx');
        await dbClear('cats');
        for (const c of data.cats) await dbPut('cats', c);
        for (const t of data.tx) await dbPut('tx', t);
        if (data.tone) await dbPut('meta', { key: 'tone', value: data.tone });
        await load();
        renderAll();
        toast('Copia importada');
      } catch {
        toast('Ese archivo no es una copia válida', true);
      }
    });
  }

  /* ---------- Inicio ---------- */
  async function init() {
    db = await openDB();
    await load();
    $('date').value = todayStr();
    bind();
    renderAll();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
})();
