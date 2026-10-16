(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const fmt = (cents) => money.format(cents / 100);
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dstr(new Date());
  const parseAmount = (txt) => {
    const n = parseFloat(String(txt).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  const toInput = (cents) => String(cents / 100).replace('.', ',');
  // Como parseAmount, pero acepta 0 (devuelve null si no es un número válido)
  const parseAmountOrZero = (txt) => {
    const s = String(txt).replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    const n = parseFloat(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Como addEventListener, pero si el elemento no existe (HTML antiguo) no rompe el arranque
  const on = (id, ev, fn) => { const n = document.getElementById(id); if (n) n.addEventListener(ev, fn); };
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('aria-') || k === 'title') n.setAttribute(k, v);
      else n[k] = v;
    }
    (Array.isArray(children) ? children : [children]).forEach((c) =>
      n.append(c instanceof Node ? c : document.createTextNode(c))
    );
    return n;
  };

  /* ---------- Datos por defecto ---------- */
  const LEGACY_INCOME = '_ingreso';
  const DEFAULT_CATS = [
    ['vivienda', '🏠', 'Vivienda'], ['alimentacion', '🛒', 'Alimentación'], ['comida-fuera', '🍔', 'Comida fuera'],
    ['transporte', '🚗', 'Transporte'], ['salud', '💊', 'Salud'], ['compras-ocio', '🛍️', 'Compras / ocio'],
    ['entretenimiento', '🎬', 'Entretenimiento'], ['hogar', '🧼', 'Hogar'], ['perros', '🐶', 'Perros'],
  ].map(([id, emoji, name], i) => ({ id, emoji, name, kind: 'expense', limit: 0, order: i }));
  const DEFAULT_INCOME = [
    ['perros-in', '🐶', 'Perros'], ['pagas', '👵', 'Pagas'],
  ].map(([id, emoji, name], i) => ({ id, emoji, name, kind: 'income', limit: 0, order: 100 + i }));
  // Equivalencias de las categorías de la primera versión
  const OLD_TO_NEW = {
    comida: 'comida-fuera', cafe: 'comida-fuera', super: 'alimentacion', ocio: 'entretenimiento',
    compras: 'compras-ocio', casa: 'vivienda', belleza: 'compras-ocio', mascotas: 'perros',
    regalos: 'compras-ocio', otros: 'hogar', paga: 'pagas', 'regalo-in': 'pagas', venta: 'pagas', 'otros-in': 'pagas',
  };
  const COLORS = ['#db2777', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#6366f1', '#84cc16', '#fb923c', '#64748b', '#e879f9', '#14b8a6'];

  /* ---------- Tonos: avisos y mensajes de la mascota ---------- */
  const TONES = {
    suave: {
      warn: [
        (c, p) => `Ojo, llevas el ${p}% de ${c.name} este mes.`,
        (c, p) => `${c.name} va por el ${p}%. ¡Con cariño, pero con cuidado!`,
      ],
      over: [
        (c, s, l) => `Te has pasado en ${c.name} (${fmt(s)} de ${fmt(l)}). No pasa nada, el mes que viene lo ajustamos.`,
        (c, s, l) => `${c.name} ha superado el límite: ${fmt(s)} de ${fmt(l)}. Respira, que se arregla.`,
      ],
      mood: {
        ok: ['Todo en orden, ¡qué bien lo estás llevando! 💕', 'Respira: vas genial este mes.', 'Tu cartera está tranquila y contenta.'],
        idle: ['¿Has gastado algo hoy? Apúntalo antes de que se te olvide.', 'Un momentito: ¿algún gasto de hoy sin apuntar?'],
        warn: ['Ojito, ya vas rozando algún límite.', 'Alguna categoría está casi llena. Vamos con calma.'],
        over: ['Te has pasado en alguna categoría. No pasa nada, mañana es otro día.', 'Límite superado. Respira y ajustamos el resto del mes.'],
      },
    },
    directo: {
      warn: [
        (c, p) => `${c.name}: ya vas por el ${p}%. Frena un poco.`,
        (c, p) => `Cuidado, ${c.name} está al ${p}% del límite.`,
      ],
      over: [
        (c, s, l) => `Límite de ${c.name} superado: ${fmt(s)} de ${fmt(l)}.`,
        (c, s, l) => `Te has pasado en ${c.name}: ${fmt(s)} y el límite era ${fmt(l)}.`,
      ],
      mood: {
        ok: ['Vas dentro de los límites.', 'Sin problemas este mes. Mantén el ritmo.'],
        idle: ['¿Gastos de hoy apuntados? Hazlo ya.', 'Si has pagado en efectivo hoy, apúntalo.'],
        warn: ['Hay categorías por encima del 80%.', 'Te acercas al límite. Frena.'],
        over: ['Has superado un límite. Revisa el resumen.', 'Te has pasado. Recorta en lo que queda de mes.'],
      },
    },
    'sin-filtro': {
      warn: [
        (c, p) => `${p}% en ${c.name} y aún quedan días de mes... piénsatelo.`,
        (c, p) => `${c.name} al ${p}%. ¿Otro capricho? Tú sabrás.`,
      ],
      over: [
        (c, s, l) => `${fmt(s)} en ${c.name} cuando el límite eran ${fmt(l)}. ¿En serio?`,
        (c, s, l) => `Te has pasado en ${c.name} (${fmt(s)} de ${fmt(l)}). Enhorabuena... supongo.`,
      ],
      mood: {
        ok: ['Mira qué bien va la cosa... por ahora.', 'Todo bien. No te lo creas demasiado.'],
        idle: ['¿Hoy no has gastado nada? Ya, claro. Apunta.', 'Esa cartera se ha vaciado sola, ¿no? Apunta lo de hoy.'],
        warn: ['Casi al límite. ¿Otro capricho? Piénsalo.', 'Vas camino de pasarte. Tú sabrás.'],
        over: ['Te has pasado. Otra vez. Aplausos.', 'Límite reventado. Esa cartera pide auxilio.'],
      },
    },
  };

  /* ---------- Mascota (huchi) ---------- */
  function pigSVG(mood) {
    const ink = '#4a1233';
    const eyes = {
      happy: `<g class="eyes blink"><circle cx="35" cy="50" r="4.2" fill="${ink}"/><circle cx="65" cy="50" r="4.2" fill="${ink}"/>
              <circle cx="36.4" cy="48.4" r="1.5" fill="#fff"/><circle cx="66.4" cy="48.4" r="1.5" fill="#fff"/></g>
              <path d="M44 63 Q50 69 56 63" stroke="${ink}" stroke-width="0" fill="none"/>`,
      worried: `<g class="eyes blink"><circle cx="35" cy="50" r="4" fill="${ink}"/><circle cx="65" cy="50" r="4" fill="${ink}"/>
                <circle cx="36.2" cy="48.6" r="1.4" fill="#fff"/><circle cx="66.2" cy="48.6" r="1.4" fill="#fff"/></g>
                <path d="M29 44 L41 39" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
                <path d="M71 44 L59 39" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
                <path class="sweat" d="M82 28 q6 9 0 12 q-6 -3 0 -12z" fill="#7dd3fc"/>`,
      angry: `<circle cx="35" cy="51" r="3.6" fill="${ink}"/><circle cx="65" cy="51" r="3.6" fill="${ink}"/>
              <path d="M28 40 L42 47" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>
              <path d="M72 40 L58 47" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>
              <path class="steam" d="M20 24 q-4 -6 0 -10 M80 24 q4 -6 0 -10" stroke="#ef4444" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    };
    const blush = mood === 'angry' ? '#ef4444' : '#ff6fb1';
    const mouth = mood === 'happy' ? `<path d="M45 76 Q50 81 55 76" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : mood === 'worried' ? `<path d="M45 78 Q50 74 55 78" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : `<path d="M44 78 L56 78" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    return `<svg class="pig ${mood}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Huchi">
      <path class="tail" d="M88 62 q10 -2 8 -10 q-2 -6 -8 -2" stroke="#ec4899" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <g class="ear l"><polygon points="20,34 34,12 44,40" fill="#f472b6"/><polygon points="26,32 34,19 39,36" fill="#fbcfe8"/></g>
      <g class="ear r"><polygon points="80,34 66,12 56,40" fill="#f472b6"/><polygon points="74,32 66,19 61,36" fill="#fbcfe8"/></g>
      <ellipse cx="50" cy="58" rx="38" ry="33" fill="#ffb3d6" stroke="#e0338a" stroke-width="3"/>
      <ellipse cx="34" cy="40" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-25 34 40)"/>
      <rect x="40" y="25" width="20" height="5.5" rx="2.75" fill="#9d174d"/>
      <g class="coin"><circle cx="50" cy="12" r="9" fill="#ffd54a" stroke="#f59e0b" stroke-width="2.4"/><text x="50" y="16" text-anchor="middle" font-size="11" font-weight="800" fill="#b45309">€</text></g>
      ${eyes[mood] || eyes.happy}
      <ellipse cx="24" cy="62" rx="7" ry="4.5" fill="${blush}" opacity=".45"/>
      <ellipse cx="76" cy="62" rx="7" ry="4.5" fill="${blush}" opacity=".45"/>
      <ellipse cx="50" cy="66" rx="14" ry="9.5" fill="#ffd9ec" stroke="#e0338a" stroke-width="2.5"/>
      <ellipse cx="45" cy="66" rx="2" ry="3.2" fill="#9d174d"/>
      <ellipse cx="55" cy="66" rx="2" ry="3.2" fill="#9d174d"/>
      ${mouth}
      <ellipse class="foot" cx="30" cy="91" rx="9" ry="4.5" fill="#f472b6"/>
      <ellipse class="foot" cx="70" cy="91" rx="9" ry="4.5" fill="#f472b6"/>
    </svg>`;
  }

  /* ---------- Animaciones y efectos ---------- */
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // Lanza emojis desde el centro de un elemento
  function burst(from, list, n = 10, spread = 110) {
    if (reduceMotion() || !from) return;
    const r = from.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.textContent = list[i % list.length];
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.fontSize = 14 + Math.random() * 14 + 'px';
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = spread * (0.5 + Math.random() * 0.7);
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 40;
      const a = p.animate(
        [
          { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${(Math.random() - 0.5) * 120}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 70}px)) scale(.8)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.3,1)' }
      );
      a.onfinish = () => p.remove();
    }
  }

  // Lluvia de confeti a pantalla completa
  function confetti() {
    if (reduceMotion()) return;
    const cols = ['#ff4fa3', '#ffd54a', '#7ee0c3', '#b794f6', '#ff9a8b', '#7dd3fc'];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('i');
      c.className = 'confetto';
      c.style.background = cols[i % cols.length];
      c.style.left = Math.random() * 100 + 'vw';
      c.style.borderRadius = i % 3 ? '2px' : '50%';
      document.body.appendChild(c);
      const a = c.animate(
        [
          { transform: 'translateY(-20px) rotate(0)', opacity: 1 },
          { transform: `translate(${(Math.random() - 0.5) * 120}px, 105vh) rotate(${360 + Math.random() * 540}deg)`, opacity: 1 },
        ],
        { duration: 1800 + Math.random() * 1600, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.5,.6,1)', fill: 'both' }
      );
      a.onfinish = () => c.remove();
    }
  }

  // Reinicia una animación CSS de una clase en un elemento
  function replay(node, cls, ms = 900) {
    if (!node || reduceMotion()) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms);
  }

  // Cuenta hasta el nuevo saldo
  let shownBal = null, balRaf;
  function animateBalance(target) {
    const node = $('cashBalance');
    if (shownBal === null || reduceMotion() || shownBal === target) {
      node.textContent = fmt(target);
      shownBal = target;
      return;
    }
    cancelAnimationFrame(balRaf);
    const from = shownBal, t0 = performance.now(), dur = 650;
    replay(node, 'bump', 700);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(Math.round(from + (target - from) * e));
      if (k < 1) balRaf = requestAnimationFrame(step);
      else shownBal = target;
    };
    shownBal = target;
    balRaf = requestAnimationFrame(step);
  }

  // Huchi se traga la moneda
  function munch(kind) {
    const m = $('mascot');
    if (!m) return;
    replay(m, 'munch', 1100);
    buzz(kind === 'income' ? [20, 40, 20] : 25);
    burst(m, kind === 'income' ? ['💖', '✨', '🪙', '💕'] : ['🪙', '✨', '💗'], 7, 90);
  }

  /* ---------- Base de datos local (IndexedDB) ---------- */
  let db;
  const openDB = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open('gastos', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        const mk = (name, opts) => { if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opts); };
        mk('tx', { keyPath: 'id', autoIncrement: true });
        mk('cats', { keyPath: 'id' });
        mk('meta', { keyPath: 'key' });
        mk('goals', { keyPath: 'id', autoIncrement: true });
        mk('rules', { keyPath: 'id', autoIncrement: true });
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
  const dbAdd = (name, val) => wrap(st(name, 'readwrite').add(val));
  const dbDel = (name, key) => wrap(st(name, 'readwrite').delete(key));
  const dbClear = (name) => wrap(st(name, 'readwrite').clear());

  /* ---------- Estado ---------- */
  const now = new Date();
  const state = {
    cats: [], txs: [], goals: [], rules: [],
    tone: 'suave',
    type: 'expense',
    sel: { expense: null, income: null },
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    editing: null,
    contribGoal: null,
  };
  const monthKey = () => `${state.year}-${pad(state.month)}`;
  const isCurrentMonth = () => state.year === new Date().getFullYear() && state.month === new Date().getMonth() + 1;
  const catsOf = (kind) => state.cats.filter((c) => (c.kind || 'expense') === kind);

  function info(t) {
    if (t.type === 'saving') {
      const g = state.goals.find((x) => x.id === t.goalId);
      return { emoji: g ? g.emoji : '🐷', name: g ? `Ahorro · ${g.name}` : 'Ahorro' };
    }
    if (t.type === 'transfer') return t.to === 'cash' ? { emoji: '🏧', name: 'Sacado del cajero' } : { emoji: '🏦', name: 'Pasado al banco' };
    if (t.type === 'adjust') return { emoji: '⚖️', name: 'Ajuste de efectivo' };
    if (t.cat === LEGACY_INCOME) return { emoji: '💶', name: 'Ingreso' };
    return state.cats.find((c) => c.id === t.cat) || { emoji: '📦', name: 'Sin categoría' };
  }
  // Efecto de cada movimiento sobre el efectivo (positivo = entra, negativo = sale)
  const signed = (t) =>
    t.type === 'income' ? t.amount
    : t.type === 'adjust' ? t.delta
    : t.type === 'transfer' ? (t.to === 'cash' ? t.amount : -t.amount)
    : -t.amount;
  const balance = () => state.txs.reduce((s, t) => s + signed(t), 0);

  async function migrateCats() {
    const flag = (await dbAll('meta')).find((m) => m.key === 'catsMig');
    if (flag) return;
    const old = await dbAll('cats');
    const byId = Object.fromEntries(old.map((c) => [c.id, c]));
    const fresh = [...DEFAULT_CATS, ...DEFAULT_INCOME];
    const keep = new Set(fresh.map((c) => c.id));
    for (const c of fresh) await dbPut('cats', { ...c, limit: (byId[c.id] && byId[c.id].limit) || 0 });
    for (const c of old) if (OLD_TO_NEW[c.id] && !keep.has(c.id)) await dbDel('cats', c.id);
    for (const t of await dbAll('tx')) if (OLD_TO_NEW[t.cat] && !keep.has(t.cat)) await dbPut('tx', { ...t, cat: OLD_TO_NEW[t.cat] });
    for (const r of await dbAll('rules')) if (OLD_TO_NEW[r.cat] && !keep.has(r.cat)) await dbPut('rules', { ...r, cat: OLD_TO_NEW[r.cat] });
    await dbPut('meta', { key: 'catsMig', value: 1 });
  }

  async function load() {
    await migrateCats();
    const cats = await dbAll('cats');
    state.cats = cats.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    state.goals = await dbAll('goals');
    state.rules = await dbAll('rules');
    state.txs = (await dbAll('tx')).sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    const tone = (await dbAll('meta')).find((m) => m.key === 'tone');
    if (tone && TONES[tone.value]) state.tone = tone.value;
    for (const kind of ['expense', 'income']) {
      const list = catsOf(kind);
      if (!list.some((c) => c.id === state.sel[kind])) state.sel[kind] = list[0] ? list[0].id : null;
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
  function budgetStatus(key = monthKey()) {
    const spent = spentByCat(key);
    const over = [], warn = [];
    catsOf('expense').forEach((c) => {
      if (!c.limit) return;
      const s = spent[c.id] || 0;
      if (s > c.limit) over.push(c);
      else if (s >= c.limit * 0.8) warn.push(c);
    });
    return { over, warn };
  }

  /* ---------- Repeticiones (gastos/ingresos recurrentes) ---------- */
  async function applyRules() {
    const today = todayStr();
    let created = 0;
    for (const r of state.rules) {
      let [y, m] = r.nextKey.split('-').map(Number);
      let changed = false;
      for (let guard = 0; guard < 24; guard++) {
        const date = `${y}-${pad(m)}-${pad(r.day)}`;
        if (date > today) break;
        await dbAdd('tx', { type: r.type, amount: r.amount, cat: r.cat, note: r.note || '', date, recurring: r.id });
        created++;
        m++;
        if (m > 12) { m = 1; y++; }
        r.nextKey = `${y}-${pad(m)}`;
        changed = true;
      }
      if (changed) await dbPut('rules', r);
    }
    return created;
  }

  /* ---------- Avisos ---------- */
  function saveMessage(tx) {
    const i = info(tx);
    const base = `${tx.type === 'income' ? 'Ingreso' : 'Gasto'} guardado: ${fmt(tx.amount)} en ${i.emoji} ${i.name}`;
    if (tx.type !== 'expense') return { alert: false, text: base };
    const cat = state.cats.find((c) => c.id === tx.cat);
    if (!cat || !cat.limit) return { alert: false, text: base };
    const spent = spentByCat(tx.date.slice(0, 7))[cat.id] || 0;
    const left = cat.limit - spent;
    const pct = Math.round((spent / cat.limit) * 100);
    const t = TONES[state.tone];
    if (left < 0) return { alert: true, text: `${base}. ${pick(t.over)(cat, spent, cat.limit)}` };
    if (pct >= 80) return { alert: false, text: `${base}. ${pick(t.warn)(cat, pct)} Te quedan ${fmt(left)}.` };
    return { alert: false, text: `${base}. Te quedan ${fmt(left)} de ${fmt(cat.limit)} en ${cat.name}.` };
  }

  let toastTimer;
  function toast(text, alert = false) {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast show' + (alert ? ' alert' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 6000);
  }

  /* ---------- Tarjeta de aviso de límite ---------- */
  const OK_LINES = {
    suave: ['Todo bajo control 💕', 'Vas genial, sigue así.', 'Tu cartera te lo agradece.'],
    directo: ['Dentro del límite.', 'Todo en orden. Sigue así.', 'Bien. Mantén el ritmo.'],
    'sin-filtro': ['De momento te portas bien... de momento.', 'Mira tú, sin drama. Por ahora.', 'Sigue así y casi me lo creo.'],
  };
  let alertTimer;
  function hideAlert() {
    clearTimeout(alertTimer);
    const card = $('alertCard');
    card.classList.remove('show');
    setTimeout(() => { if (!card.classList.contains('show')) card.hidden = true; }, 300);
  }

  // Devuelve true si ha enseñado la tarjeta (gasto en una categoría con límite)
  function showLimitAlert(tx) {
    if (tx.type !== 'expense') return false;
    const cat = state.cats.find((c) => c.id === tx.cat);
    if (!cat || !cat.limit) return false;
    const spent = spentByCat(tx.date.slice(0, 7))[cat.id] || 0;
    const left = cat.limit - spent;
    const pct = Math.round((spent / cat.limit) * 100);
    const t = TONES[state.tone];

    let level = 'ok', mood = 'happy', title = 'Gasto guardado', msg = pick(OK_LINES[state.tone]);
    if (left < 0) {
      level = 'over'; mood = 'angry'; title = '¡Te has pasado!';
      msg = pick(t.over)(cat, spent, cat.limit);
    } else if (pct >= 80) {
      level = 'warn'; mood = 'worried';
      title = left === 0 ? '¡Justo al límite!' : '¡Ojo con el límite!';
      msg = pick(t.warn)(cat, pct);
    }

    const card = $('alertCard');
    card.className = `alert-card ${level}`;
    $('alertMascot').innerHTML = pigSVG(mood);
    $('alertTitle').textContent = title;
    $('alertCat').textContent = `${cat.emoji} ${cat.name} · −${fmt(tx.amount)}`;
    $('alertSpent').textContent = `${fmt(spent)} de ${fmt(cat.limit)}`;
    $('alertLeft').textContent = left >= 0 ? `Te quedan ${fmt(left)}` : `Te has pasado ${fmt(-left)}`;
    $('alertMsg').textContent = msg;
    const bar = $('alertBar');
    bar.style.width = '0%';
    card.hidden = false;
    void card.offsetWidth; // fuerza el reflow para que la animación arranque
    card.classList.add('show');
    requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = Math.min(pct, 100) + '%')));
    if (level === 'over') {
      try { navigator.vibrate && navigator.vibrate([90, 60, 90]); } catch { /* sin vibración */ }
    }
    clearTimeout(alertTimer);
    alertTimer = setTimeout(hideAlert, level === 'ok' ? 5000 : level === 'warn' ? 8000 : 10000);
    return true;
  }

  /* ---------- Guardar movimiento ---------- */
  async function saveTx(catId) {
    const amount = parseAmount($('amount').value);
    if (!amount) {
      toast('Pon un importe mayor que 0');
      $('amount').focus();
      return;
    }
    const cat = catId || state.sel[state.type];
    if (!cat) {
      toast('Crea primero una categoría en Ajustes');
      return;
    }
    const tx = {
      type: state.type,
      amount,
      cat,
      note: $('note').value.trim(),
      date: $('date').value || todayStr(),
    };
    tx.id = await dbAdd('tx', tx);
    await load();
    $('amount').value = '';
    $('note').value = '';
    $('date').value = todayStr();
    munch(tx.type);
    if (!showLimitAlert(tx)) {
      const msg = saveMessage(tx);
      toast(msg.text, msg.alert);
    }
    renderAll();
    $('amount').focus();
  }

  /* ---------- Render: cabecera y Añadir ---------- */
  function renderHeader() {
    const ml = new Date(state.year, state.month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    $('monthLabel').textContent = ml.replace(' de ', ' ').replace(/^./, (c) => c.toUpperCase());
  }

  const short = (cents) => (cents % 100 === 0 ? `${cents / 100} €` : fmt(cents));
  function leftTag(c, spentMap) {
    if (state.type !== 'expense' || !c.limit) return [];
    const left = c.limit - (spentMap[c.id] || 0);
    const cls = left < 0 ? ' neg' : left < c.limit * 0.2 ? ' low' : '';
    return [el('small', { className: 'left' + cls }, left >= 0 ? `quedan ${short(left)}` : `pasado ${short(-left)}`)];
  }

  function renderHome() {
    const bal = balance();
    animateBalance(bal);
    const mt = monthTxs();
    const out = mt.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const inc = mt.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    $('monthSummary').textContent = `Este mes: −${fmt(out)} · +${fmt(inc)}`;

    // Mascota y mensaje
    const status = budgetStatus();
    const t = TONES[state.tone].mood;
    let key = 'ok', mood = 'happy';
    if (status.over.length) { key = 'over'; mood = 'angry'; }
    else if (status.warn.length) { key = 'warn'; mood = 'worried'; }
    else if (isCurrentMonth() && !state.txs.some((x) => x.type === 'expense' && x.date === todayStr())) key = 'idle';
    const seed = new Date().getDate() + state.txs.length;
    let msg = t[key][seed % t[key].length];
    const flagged = key === 'over' ? status.over : key === 'warn' ? status.warn : [];
    if (flagged.length) msg += ' → ' + flagged.map((c) => `${c.emoji} ${c.name}`).join(', ');
    if ($('mascot').dataset.mood !== mood) {
      $('mascot').innerHTML = pigSVG(mood);
      $('mascot').dataset.mood = mood;
    }
    if ($('bubble').textContent !== msg) {
      $('bubble').textContent = msg;
      replay($('bubble'), 'pop', 600);
    }

    // Cuánto puedes gastar al día
    const al = $('allowance');
    if (isCurrentMonth()) {
      const d = new Date();
      const daysLeft = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
      al.hidden = false;
      al.textContent =
        bal > 0
          ? `Con lo que tienes, ≈ ${fmt(bal / daysLeft)} al día hasta fin de mes (${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}).`
          : bal === 0
          ? 'Tu cartera está a cero: ojo con gastar más.'
          : 'Tu cartera sale en negativo: ¿te falta apuntar algún ingreso?';
    } else al.hidden = true;

    // Tipo y categorías
    document.querySelectorAll('.type-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
    document.querySelector('.type-toggle').dataset.active = state.type;
    const spentMap = spentByCat();
    $('catButtons').replaceChildren(
      ...catsOf(state.type).map((c) => {
        const b = el('button', { type: 'button', className: 'cat-btn' + (c.id === state.sel[state.type] ? ' selected' : '') }, [
          el('span', { className: 'e' }, c.emoji),
          c.name,
          ...leftTag(c, spentMap),
        ]);
        b.addEventListener('click', () => {
          state.sel[state.type] = c.id;
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
  }

  /* ---------- Render: Movimientos ---------- */
  const dayLabel = (date) => {
    const t = new Date();
    const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
    if (date === dstr(t)) return 'Hoy';
    if (date === dstr(y)) return 'Ayer';
    const [yy, mm, dd] = date.split('-').map(Number);
    const s = new Date(yy, mm - 1, dd).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  function renderList() {
    const mt = monthTxs();
    $('txEmpty').hidden = mt.length > 0;
    const sum = (type) => mt.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
    const chips = [['Gastos', '−' + fmt(sum('expense'))], ['Ingresos', '+' + fmt(sum('income'))]];
    if (sum('saving')) chips.push(['Ahorrado', fmt(sum('saving'))]);
    const toBank = mt.filter((t) => t.type === 'transfer' && t.to === 'bank').reduce((s, t) => s + t.amount, 0);
    if (toBank) chips.push(['Al banco', fmt(toBank)]);
    $('listSummary').replaceChildren(...chips.map(([k, v]) => el('span', { className: 'chip' }, [k, el('b', {}, v)])));

    const dayTotals = {};
    mt.forEach((t) => {
      if (t.type === 'expense') dayTotals[t.date] = (dayTotals[t.date] || 0) + t.amount;
    });
    const items = [];
    let last = null;
    mt.forEach((t) => {
      if (t.date !== last) {
        last = t.date;
        items.push(el('li', { className: 'day' }, [el('span', {}, dayLabel(t.date)), el('span', {}, dayTotals[t.date] ? '−' + fmt(dayTotals[t.date]) : '')]));
      }
      const i = info(t);
      const v = signed(t);
      const sign = v >= 0 ? '+' : '−';
      const cls = t.type === 'saving' ? ' sv' : v > 0 ? ' in' : '';
      const li = el('li', { className: 'tx' }, [
        el('span', { className: 'e' }, i.emoji),
        el('div', { className: 'info' }, [el('b', {}, i.name), el('small', {}, (t.recurring ? '🔁 ' : '') + (t.note || ''))]),
        el('span', { className: 'amt' + cls }, sign + fmt(Math.abs(v))),
      ]);
      li.addEventListener('click', () => openEdit(t));
      items.push(li);
    });
    $('txList').replaceChildren(...items);
  }

  /* ---------- Render: Resumen ---------- */
  function renderStats() {
    const spent = spentByCat();
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - d.getDate() + 1;
    const budgets = catsOf('expense').filter((c) => c.limit > 0);

    // Previsión
    const total = Object.values(spent).reduce((s, v) => s + v, 0);
    const limits = budgets.reduce((s, c) => s + c.limit, 0);
    const lines = [];
    if (!total) lines.push('Todavía no hay gastos este mes.');
    else {
      lines.push(`Llevas gastado ${fmt(total)}.`);
      if (isCurrentMonth() && d.getDate() >= 3) {
        const projected = (total / d.getDate()) * lastDay;
        lines.push(`A este ritmo acabarás el mes en ≈ ${fmt(projected)}.`);
        if (limits) lines.push(projected > limits ? `Tus límites suman ${fmt(limits)}: vas camino de pasarte.` : `Tus límites suman ${fmt(limits)}: vas bien.`);
      }
    }
    $('forecast').replaceChildren(...lines.map((l) => el('p', {}, l)));

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
    const ctx = canvas.getContext && canvas.getContext('2d');
    const legend = $('legend');
    const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const css = getComputedStyle(document.documentElement);
      if (!total) {
        ctx.fillStyle = css.getPropertyValue('--muted');
        ctx.font = '16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sin gastos este mes', size / 2, size / 2);
      } else {
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
        ctx.font = '800 22px system-ui, sans-serif';
        ctx.fillText(fmt(total), cx, cy + 4);
        ctx.fillStyle = css.getPropertyValue('--muted');
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('gastado', cx, cy + 24);
      }
    }
    legend.replaceChildren(
      ...entries.map(([id, v], i) => {
        const c = state.cats.find((x) => x.id === id) || { emoji: '📦', name: 'Sin categoría' };
        return el('li', {}, [
          el('span', { className: 'dot', style: `background:${COLORS[i % COLORS.length]}` }),
          `${c.emoji} ${c.name}`,
          el('span', { className: 'v' }, `${fmt(v)} · ${Math.round((v / total) * 100)}%`),
        ]);
      })
    );
  }

  /* ---------- Render: Límites ---------- */
  function renderLimits() {
    const spent = spentByCat();
    const d = new Date();
    const daysLeft = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
    const cats = catsOf('expense');
    const withLimit = cats.filter((c) => c.limit > 0);
    const totalLimit = withLimit.reduce((sum, c) => sum + c.limit, 0);
    const totalSpent = withLimit.reduce((sum, c) => sum + (spent[c.id] || 0), 0);
    $('limitsTotal').textContent = withLimit.length
      ? `En total: ${fmt(totalSpent)} de ${fmt(totalLimit)} · ` +
        (totalLimit >= totalSpent ? `te quedan ${fmt(totalLimit - totalSpent)}` : `te has pasado ${fmt(totalSpent - totalLimit)}`)
      : 'Pon un límite mensual en las categorías en las que quieras controlarte. Al apuntar un gasto te diré cuánto te queda.';

    $('limitList').replaceChildren(
      ...cats.map((c) => {
        const s = spent[c.id] || 0;
        const input = el('input', {
          type: 'text', inputMode: 'decimal', placeholder: 'Sin límite',
          value: c.limit ? toInput(c.limit) : '', 'aria-label': `Límite mensual de ${c.name}`,
        });
        input.addEventListener('change', async () => {
          const cents = parseAmount(input.value);
          await dbPut('cats', { ...c, limit: cents });
          await load();
          renderAll();
          toast(cents ? `Límite de ${c.name}: ${fmt(cents)} al mes` : `Sin límite en ${c.name}`);
        });
        const kids = [
          el('div', { className: 'top' }, [el('span', {}, `${c.emoji} ${c.name}`), el('span', { className: 'limit-in' }, [input, el('em', {}, '€')])]),
        ];
        if (c.limit) {
          const pct = (s / c.limit) * 100;
          const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
          const left = c.limit - s;
          let note = left >= 0 ? `Llevas ${fmt(s)} de ${fmt(c.limit)} · te quedan ${fmt(left)}` : `Llevas ${fmt(s)} de ${fmt(c.limit)} · te has pasado ${fmt(-left)}`;
          if (isCurrentMonth() && left > 0) note += ` · ≈ ${fmt(left / daysLeft)} al día`;
          kids.push(el('div', { className: 'bar' }, [el('i', { className: cls, style: `width:${Math.min(pct, 100)}%` })]), el('small', {}, note));
        } else {
          kids.push(el('small', {}, s ? `Gastado este mes: ${fmt(s)} · sin límite` : 'Sin límite'));
        }
        return el('div', { className: 'budget' }, kids);
      })
    );
  }

  /* ---------- Render: Metas ---------- */
  const savedByGoal = () => {
    const m = {};
    state.txs.forEach((t) => {
      if (t.type === 'saving') m[t.goalId] = (m[t.goalId] || 0) + t.amount;
    });
    return m;
  };

  function renderGoals() {
    const saved = savedByGoal();
    $('goalEmpty').hidden = state.goals.length > 0;
    $('goalList').replaceChildren(
      ...state.goals.map((g) => {
        const s = saved[g.id] || 0;
        const pct = g.target ? Math.min(100, Math.round((s / g.target) * 100)) : 0;
        const done = g.target > 0 && s >= g.target;
        const add = el('button', { className: 'primary', type: 'button' }, 'Aportar');
        add.addEventListener('click', () => openContrib(g));
        const del = el('button', { className: 'danger', type: 'button', title: 'Borrar meta' }, '🗑');
        del.addEventListener('click', async () => {
          if (!confirm(`¿Borrar la meta "${g.name}"? Los ${fmt(s)} ahorrados volverán a tu cartera.`)) return;
          for (const t of state.txs.filter((x) => x.type === 'saving' && x.goalId === g.id)) await dbDel('tx', t.id);
          await dbDel('goals', g.id);
          await load();
          renderAll();
        });
        return el('li', { className: 'goal' + (done ? ' done' : '') }, [
          el('div', { className: 'top' }, [el('span', { className: 'e' }, g.emoji), el('b', {}, g.name), el('span', {}, `${pct}%`)]),
          el('div', { className: 'bar' }, [el('i', { style: `width:${pct}%` })]),
          el('small', {}, done ? `¡Conseguida! 🎉 ${fmt(s)} de ${fmt(g.target)}` : `${fmt(s)} de ${fmt(g.target)} · te faltan ${fmt(Math.max(g.target - s, 0))}`),
          el('div', { className: 'actions' }, [add, del]),
        ]);
      })
    );
  }

  function openContrib(g) {
    state.contribGoal = g;
    $('contribTitle').textContent = `Aportar a ${g.emoji} ${g.name}`;
    $('contribAmount').value = '';
    $('contribDialog').showModal();
    $('contribAmount').focus();
  }

  /* ---------- Render: Ajustes ---------- */
  function renderSettings() {
    $('tone').value = state.tone;

    const catRow = (c, withLimit) => {
      const kids = [el('span', { className: 'e' }, c.emoji), el('span', { className: 'name' }, c.name)];
      if (withLimit) {
        const input = el('input', {
          type: 'text', inputMode: 'decimal', placeholder: 'Límite €',
          value: c.limit ? toInput(c.limit) : '', 'aria-label': `Límite de ${c.name}`,
        });
        input.addEventListener('change', async () => {
          const cents = parseAmount(input.value);
          await dbPut('cats', { ...c, limit: cents });
          await load();
          renderStats();
          renderHome();
          toast(cents ? `Límite de ${c.name}: ${fmt(cents)} al mes` : `Sin límite en ${c.name}`);
        });
        kids.push(input);
      }
      const del = el('button', { className: 'del', type: 'button', 'aria-label': `Borrar ${c.name}` }, '✕');
      del.addEventListener('click', async () => {
        if (!confirm(`¿Borrar la categoría "${c.name}"? Los movimientos se mantienen como "Sin categoría".`)) return;
        await dbDel('cats', c.id);
        await load();
        renderAll();
      });
      kids.push(del);
      return el('li', {}, kids);
    };
    $('catSettings').replaceChildren(...catsOf('expense').map((c) => catRow(c, false)));
    $('incomeSettings').replaceChildren(...catsOf('income').map((c) => catRow(c, false)));

    // Repeticiones
    fillRuleCats();
    $('ruleList').replaceChildren(
      ...(state.rules.length
        ? state.rules.map((r) => {
            const c = state.cats.find((x) => x.id === r.cat) || { emoji: '📦', name: 'Sin categoría' };
            const del = el('button', { className: 'del', type: 'button', 'aria-label': 'Borrar repetición' }, '✕');
            del.addEventListener('click', async () => {
              if (!confirm('¿Dejar de repetir este movimiento? Los ya creados se mantienen.')) return;
              await dbDel('rules', r.id);
              await load();
              renderSettings();
            });
            return el('li', {}, [
              el('span', { className: 'e' }, '🔁'),
              el('span', { className: 'name' }, [`${c.emoji} ${r.note || c.name}`, el('small', {}, `Día ${r.day} de cada mes`)]),
              el('span', { className: 'amt' }, (r.type === 'income' ? '+' : '−') + fmt(r.amount)),
              del,
            ]);
          })
        : [el('li', {}, [el('span', { className: 'name' }, el('small', {}, 'Aún no tienes ninguna.'))])])
    );
  }

  function fillRuleCats() {
    const kind = $('ruleType').value;
    const prev = $('ruleCat').value;
    $('ruleCat').replaceChildren(...catsOf(kind).map((c) => el('option', { value: c.id }, `${c.emoji} ${c.name}`)));
    if (catsOf(kind).some((c) => c.id === prev)) $('ruleCat').value = prev;
  }

  function renderAll() {
    renderHeader();
    renderHome();
    renderList();
    renderStats();
    renderLimits();
    renderGoals();
    renderSettings();
  }

  /* ---------- Editar movimiento ---------- */
  function openEdit(t) {
    state.editing = t;
    $('editAmount').value = toInput(t.amount);
    $('editNote').value = t.note || '';
    $('editDate').value = t.date;
    const noCat = ['saving', 'transfer', 'adjust'].includes(t.type);
    $('editCatWrap').hidden = noCat;
    if (!noCat) {
      const kind = t.type === 'income' ? 'income' : 'expense';
      const opts = catsOf(kind).map((c) => el('option', { value: c.id }, `${c.emoji} ${c.name}`));
      if (!state.cats.some((c) => c.id === t.cat)) opts.unshift(el('option', { value: t.cat }, 'Sin categoría'));
      $('editCat').replaceChildren(...opts);
      $('editCat').value = t.cat;
    }
    $('editDialog').showModal();
  }

  function showView(name) {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x.dataset.view === name));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    document.body.dataset.view = name;
    if (name === 'stats') renderStats();
    const v = $('view-' + name);
    replay(v, 'enter', 700);
    if (name === 'home') replay($('catButtons'), 'enter', 800);
    replay(document.querySelector('nav button.active span'), 'hop', 600);
    window.scrollTo(0, 0);
  }

  /* ---------- Eventos ---------- */
  function bind() {
    on('alertCard', 'click', hideAlert);
    on('mascot', 'click', () => { replay($('mascot'), 'munch', 1100); burst($('mascot'), ['💗', '✨', '🎀'], 6, 80); buzz(15); });
    on('quickForm', 'submit', (e) => {
      e.preventDefault();
      saveTx();
    });
    document.querySelectorAll('.type-toggle button').forEach((b) =>
      b.addEventListener('click', () => {
        state.type = b.dataset.type;
        renderHome();
        replay($('catButtons'), 'enter', 800);
        buzz(10);
      })
    );
    document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
    const shift = (d) => {
      state.month += d;
      if (state.month < 1) { state.month = 12; state.year--; }
      if (state.month > 12) { state.month = 1; state.year++; }
      renderAll();
    };
    on('prevMonth', 'click', () => shift(-1));
    on('nextMonth', 'click', () => shift(1));

    on('tone', 'change', async (e) => {
      state.tone = e.target.value;
      await dbPut('meta', { key: 'tone', value: state.tone });
      renderHome();
      toast('Tono cambiado');
    });

    on('newCatForm', 'submit', async (e) => {
      e.preventDefault();
      const name = $('newCatName').value.trim();
      if (!name) return;
      await dbPut('cats', {
        id: 'c' + Date.now(), emoji: $('newCatEmoji').value.trim() || '🏷️', name,
        kind: $('newCatKind').value, limit: 0, order: Date.now(),
      });
      $('newCatName').value = '';
      $('newCatEmoji').value = '';
      await load();
      renderAll();
    });

    // Repeticiones
    on('ruleType', 'change', fillRuleCats);
    on('ruleForm', 'submit', async (e) => {
      e.preventDefault();
      const amount = parseAmount($('ruleAmount').value);
      const cat = $('ruleCat').value;
      if (!amount || !cat) { toast('Pon un importe y una categoría'); return; }
      const day = Math.min(28, Math.max(1, parseInt($('ruleDay').value, 10) || 1));
      const d = new Date();
      const next = day >= d.getDate() ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1);
      await dbAdd('rules', {
        type: $('ruleType').value, amount, cat, day, note: $('ruleNote').value.trim(),
        nextKey: `${next.getFullYear()}-${pad(next.getMonth() + 1)}`,
      });
      $('ruleAmount').value = '';
      $('ruleNote').value = '';
      await load();
      await applyRules();
      await load();
      renderAll();
      toast('Repetición añadida');
    });

    // Metas
    on('goalForm', 'submit', async (e) => {
      e.preventDefault();
      const name = $('goalName').value.trim();
      const target = parseAmount($('goalTarget').value);
      if (!name || !target) { toast('Pon un nombre y un objetivo'); return; }
      await dbAdd('goals', { name, emoji: $('goalEmoji').value.trim() || '🎯', target });
      $('goalName').value = '';
      $('goalEmoji').value = '';
      $('goalTarget').value = '';
      await load();
      renderAll();
    });
    on('contribCancel', 'click', () => $('contribDialog').close());
    on('contribForm', 'submit', async (e) => {
      e.preventDefault();
      const g = state.contribGoal;
      const amount = parseAmount($('contribAmount').value);
      if (!g || !amount) { toast('Pon un importe mayor que 0'); return; }
      if (amount > balance() && !confirm('Tu cartera no llega para tanto y quedaría en negativo. ¿Aportar igualmente?')) return;
      const before = savedByGoal()[g.id] || 0;
      await dbAdd('tx', { type: 'saving', goalId: g.id, amount, cat: '', note: '', date: todayStr() });
      $('contribDialog').close();
      await load();
      renderAll();
      const after = before + amount;
      if (g.target && before < g.target && after >= g.target) { toast(`¡Meta conseguida! 🎉 ${g.emoji} ${g.name}`); confetti(); buzz([40, 60, 40, 60, 80]); }
      else toast(`Aportados ${fmt(amount)} a ${g.name} (${Math.min(100, Math.round((after / g.target) * 100))}%)`);
    });

    // Ajustar efectivo: "tengo X en la cartera"
    const updateAdjustDiff = () => {
      const v = parseAmountOrZero($('adjustAmount').value);
      const diff = v === null ? null : v - balance();
      $('adjustDiff').textContent =
        diff === null ? ''
        : diff === 0 ? 'Ya cuadra: no hay nada que ajustar.'
        : `Huchi apuntará un ajuste de ${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}. No cuenta como gasto ni como ingreso.`;
    };
    on('adjustBtn', 'click', () => {
      $('adjustNow').textContent = `Ahora Huchi cree que tienes ${fmt(balance())} en la cartera.`;
      $('adjustAmount').value = '';
      $('adjustDiff').textContent = '';
      $('adjustDialog').showModal();
      $('adjustAmount').focus();
    });
    on('adjustAmount', 'input', updateAdjustDiff);
    on('adjustCancel', 'click', () => $('adjustDialog').close());
    on('adjustForm', 'submit', async (e) => {
      e.preventDefault();
      const v = parseAmountOrZero($('adjustAmount').value);
      if (v === null) { toast('Escribe cuánto efectivo tienes (puede ser 0)'); return; }
      const diff = v - balance();
      $('adjustDialog').close();
      if (diff === 0) { toast('Ya cuadraba: tu cartera tiene justo ese efectivo'); return; }
      await dbAdd('tx', { type: 'adjust', delta: diff, amount: Math.abs(diff), cat: '', note: '', date: todayStr() });
      await load();
      renderAll();
      toast(`Efectivo ajustado a ${fmt(v)} (${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))})`);
    });

    // Pasar efectivo al banco / sacar del cajero
    let transferTo = 'bank';
    const setTransferDir = (dir) => {
      transferTo = dir;
      document.querySelectorAll('#transferDir button').forEach((b) => b.classList.toggle('active', b.dataset.dir === dir));
      $('transferTitle').textContent = dir === 'bank' ? 'Pasar efectivo al banco' : 'Sacar efectivo del cajero';
      $('transferHint').textContent = dir === 'bank'
        ? 'Sale de tu cartera y no cuenta como gasto.'
        : 'Entra en tu cartera y no cuenta como ingreso.';
    };
    on('transferBtn', 'click', () => {
      setTransferDir('bank');
      $('transferAmount').value = '';
      $('transferNote').value = '';
      $('transferDialog').showModal();
      $('transferAmount').focus();
    });
    document.querySelectorAll('#transferDir button').forEach((b) => b.addEventListener('click', () => setTransferDir(b.dataset.dir)));
    on('transferCancel', 'click', () => $('transferDialog').close());
    on('transferForm', 'submit', async (e) => {
      e.preventDefault();
      const amount = parseAmount($('transferAmount').value);
      if (!amount) { toast('Pon un importe mayor que 0'); return; }
      if (transferTo === 'bank' && amount > balance() && !confirm('Tu cartera no llega para tanto y quedaría en negativo. ¿Pasarlo igualmente?')) return;
      await dbAdd('tx', { type: 'transfer', to: transferTo, amount, cat: '', note: $('transferNote').value.trim(), date: todayStr() });
      $('transferDialog').close();
      await load();
      renderAll();
      toast(transferTo === 'bank'
        ? `Pasados ${fmt(amount)} al banco. En la cartera te quedan ${fmt(balance())}.`
        : `Sacados ${fmt(amount)} del cajero. Ahora tienes ${fmt(balance())} en la cartera.`);
    });

    // Editar movimiento
    on('editCancel', 'click', () => $('editDialog').close());
    on('editDelete', 'click', async () => {
      if (!state.editing || !confirm('¿Borrar este movimiento?')) return;
      await dbDel('tx', state.editing.id);
      $('editDialog').close();
      await load();
      renderAll();
    });
    on('editForm', 'submit', async (e) => {
      e.preventDefault();
      const t = state.editing;
      const amount = parseAmount($('editAmount').value);
      if (!t || !amount) { toast('Pon un importe mayor que 0'); return; }
      const updated = { ...t, amount, note: $('editNote').value.trim(), date: $('editDate').value || t.date };
      if (!['saving', 'transfer', 'adjust'].includes(t.type)) updated.cat = $('editCat').value;
      if (t.type === 'adjust') updated.delta = (t.delta < 0 ? -1 : 1) * amount;
      await dbPut('tx', updated);
      $('editDialog').close();
      await load();
      renderAll();
      toast('Movimiento actualizado');
    });

    // Copia de seguridad
    on('exportBtn', 'click', () => {
      const data = { version: 2, exportedAt: new Date().toISOString(), tone: state.tone, cats: state.cats, tx: state.txs, goals: state.goals, rules: state.rules };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `huchi-${todayStr()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    on('importFile', 'change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.cats) || !Array.isArray(data.tx)) throw new Error('formato');
        if (!confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) return;
        for (const s of ['tx', 'cats', 'goals', 'rules']) await dbClear(s);
        for (const c of data.cats) await dbPut('cats', c);
        for (const t of data.tx) await dbPut('tx', t);
        for (const g of data.goals || []) await dbPut('goals', g);
        for (const r of data.rules || []) await dbPut('rules', r);
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
    if (await applyRules()) await load();
    $('date').value = todayStr();
    renderAll();
    bind();
    // Atajos del icono: ?add=expense | ?add=income | ?view=limits ...
    const params = new URLSearchParams(location.search);
    const add = params.get('add');
    const view = params.get('view');
    if (add === 'expense' || add === 'income') {
      state.type = add;
      renderHome();
      showView('home');
      $('amount').focus();
    } else if (view && $('view-' + view)) showView(view);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloaded) { reloaded = true; location.reload(); }
      });
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init().catch((err) => {
    console.error(err);
    const b = document.getElementById('bubble');
    if (b) b.textContent = 'Algo ha fallado al abrir Huchi. Cierra la app y ábrela otra vez.';
  });
})();