const { useState, useEffect } = React;

const STORAGE_KEY = 'contcoop_261112_v2';
const SEED_VERSION = '261112_v2';

const inputCls = 'w-full border border-crema rounded-xl px-3 py-2 bg-white text-sm';
const btnBase = 'px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-50';
const thCls = 'text-left px-2 py-1 border-b border-crema font-semibold whitespace-nowrap';
const tdCls = 'px-2 py-1 border-b border-crema/70 whitespace-nowrap';

const fmt = (cents) => `$U ${(Number(cents || 0) / 100).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (cents) => (cents < 0 ? `-${fmt(-cents)}` : fmt(cents));
const fmtKg = (n) => `${Number(n || 0).toLocaleString('es-UY')} kg`;
const fmtCostPerKg = (cents, kilos) => (kilos ? `$U ${(cents / kilos / 100).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-');
const periodOf = (date) => String(date || '').slice(0, 7);
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parseCents = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).replace(/[^0-9,.-]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const parseKg = (v) => {
  const n = parseInt(String(v || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const lastDayOf = (period) => {
  const [y, m] = String(period).split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const nextPeriodOf = (period) => {
  const [y, m] = String(period).split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
};

function saveRaw(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.meta && parsed.meta.seedVersion === SEED_VERSION) return parsed;
    }
  } catch (e) {
    // ignore corrupted storage
  }
  const fresh = window.ContCoopSeed.generate();
  saveRaw(fresh);
  return fresh;
}

function isClosed(state, period) {
  return state.closedMonths.includes(period);
}

function monthOptions(state) {
  const set = new Set();
  state.entries.forEach((e) => set.add(periodOf(e.date)));
  state.closedMonths.forEach((m) => set.add(m));
  return Array.from(set).filter(Boolean).sort();
}

function assignEntry(s, entry) {
  const n = s.entries.reduce((m, e) => Math.max(m, e.number || 0), 0) + 1;
  entry.id = `E${String(n).padStart(4, '0')}`;
  entry.number = n;
  return entry;
}

function activeMilling(state, m) {
  const e = state.entries.find((x) => x.id === m.entryId);
  return Boolean(e && e.status === 'confirmed' && !e.reversedBy);
}

function usedShiftCapacity(state, date, shift) {
  return state.millings
    .filter((m) => m.date === date && Number(m.shift) === Number(shift) && activeMilling(state, m))
    .reduce((s, m) => s + m.wheatKilos, 0);
}

function allocateCost(totalCostCents, items, products) {
  const vals = items
    .filter((i) => i.kilos > 0)
    .map((i) => {
      const prod = products.find((p) => p.key === i.product);
      return { ...i, valueCents: i.kilos * (prod ? prod.priceCents : 0) };
    });

  const totalValue = vals.reduce((s, v) => s + v.valueCents, 0);
  let assigned = 0;

  const costs = vals.map((v) => {
    const costCents = totalValue > 0 ? Math.floor((totalCostCents * v.valueCents) / totalValue) : 0;
    assigned += costCents;
    return { ...v, costCents };
  });

  const remainder = totalCostCents - assigned;
  if (remainder !== 0 && costs.length > 0) {
    let idx = 0;
    costs.forEach((c, i) => {
      if (c.valueCents > costs[idx].valueCents) idx = i;
    });
    costs[idx].costCents += remainder;
  }

  return costs;
}

let balanceMemo = {};

function getBalances(state, period) {
  const key = `${state.meta.updatedAt}|${period || 'all'}`;
  if (balanceMemo[key]) return balanceMemo[key];

  const res = {};
  state.entries.forEach((e) => {
    if (e.status !== 'confirmed') return;
    if (period && periodOf(e.date) !== period) return;
    e.lines.forEach((l) => {
      const b = res[l.account] || (res[l.account] = { debit: 0, credit: 0 });
      b.debit += l.debit || 0;
      b.credit += l.credit || 0;
    });
  });

  balanceMemo[key] = res;
  return res;
}

function cumulativeBalances(state, period) {
  const res = {};
  state.entries.forEach((e) => {
    if (e.status !== 'confirmed') return;
    if (period && periodOf(e.date) > period) return;
    e.lines.forEach((l) => {
      const b = res[l.account] || (res[l.account] = { debit: 0, credit: 0 });
      b.debit += l.debit || 0;
      b.credit += l.credit || 0;
    });
  });
  return res;
}

function trialBalance(state, period) {
  const balances = getBalances(state, period || null);
  let totalDebit = 0;
  let totalCredit = 0;

  const rows = state.accounts.map((a) => {
    const b = balances[a.name] || { debit: 0, credit: 0 };
    totalDebit += b.debit;
    totalCredit += b.credit;
    return { ...a, debit: b.debit, credit: b.credit, net: b.debit - b.credit };
  });

  return { rows, totalDebit, totalCredit };
}

function ledgerLines(state, account, period) {
  const rows = [];
  let balance = 0;

  const entries = state.entries
    .filter((e) => e.status === 'confirmed' && (!period || periodOf(e.date) === period))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.number || 0) - (b.number || 0));

  entries.forEach((e) => {
    e.lines.forEach((l) => {
      if (l.account !== account) return;
      balance += (l.debit || 0) - (l.credit || 0);
      rows.push({ entry: e, line: l, balance });
    });
  });

  return rows;
}

function resultCents(state) {
  const balances = getBalances(state, null);
  let income = 0;
  let expense = 0;

  state.accounts.forEach((a) => {
    const b = balances[a.name] || { debit: 0, credit: 0 };
    if (a.type === 'ingreso') income += b.credit - b.debit;
    if (a.type === 'gasto') expense += b.debit - b.credit;
  });

  return income - expense;
}

function partnerTotals(state) {
  const map = {};
  state.partners.forEach((p) => {
    map[p.id] = { partner: p, day: 0, night: 0, extra: 0, advances: 0, blocked: false, blockedMonth: null };
  });

  state.hours.forEach((h) => {
    const t = map[h.partnerId];
    if (!t) return;
    t.day += h.day;
    t.night += h.night;
    t.extra += h.extra;
    if (h.status === 'blocked') {
      t.blocked = true;
      t.blockedMonth = h.month;
    }
  });

  state.advances
    .filter((a) => a.status === 'paid')
    .forEach((a) => {
      if (map[a.partnerId]) map[a.partnerId].advances += a.amountCents;
    });

  return Object.values(map);
}

function distributionCalc(state, surplusCents) {
  const surplus = Math.max(0, Math.floor(surplusCents || 0));
  const reserve = Math.floor((surplus * state.settings.reservePercent) / 100);
  const education = Math.floor((surplus * state.settings.educationPercent) / 100);
  const pool = surplus - reserve - education;

  const hoursBy = {};
  state.hours.forEach((h) => {
    hoursBy[h.partnerId] = (hoursBy[h.partnerId] || 0) + h.day + h.night + h.extra;
  });

  const advancesBy = {};
  state.advances
    .filter((a) => a.status === 'paid')
    .forEach((a) => {
      advancesBy[a.partnerId] = (advancesBy[a.partnerId] || 0) + a.amountCents;
    });

  const totalHours = Object.values(hoursBy).reduce((s, n) => s + n, 0);

  const rows = state.partners.map((p) => ({
    partner: p,
    hours: hoursBy[p.id] || 0,
    advance: advancesBy[p.id] || 0,
    share: 0,
    net: 0
  }));

  if (pool > 0 && totalHours > 0 && rows.length > 0) {
    let sum = 0;
    rows.forEach((r) => {
      r.share = Math.floor((pool * r.hours) / totalHours);
      sum += r.share;
    });
    rows[rows.length - 1].share += pool - sum;
  }

  rows.forEach((r) => {
    r.net = r.share - r.advance;
  });

  return {
    surplus,
    reserve,
    education,
    pool,
    totalHours,
    rows,
    totals: {
      share: rows.reduce((s, r) => s + r.share, 0),
      advance: rows.reduce((s, r) => s + r.advance, 0),
      net: rows.reduce((s, r) => s + r.net, 0)
    }
  };
}

function useRoute() {
  const [route, setRoute] = useState((window.location.hash || '#/').replace(/^#/, ''));
  useEffect(() => {
    const onChange = () => setRoute((window.location.hash || '#/').replace(/^#/, ''));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route || '/';
}

function NavLink({ to, route, label }) {
  const active = route === to;
  return (
    <a
      href={`#${to}`}
      className={`whitespace-nowrap px-3 py-2 rounded-xl text-sm ${active ? 'bg-dorado text-chocolate font-semibold' : 'text-chocolate/80 hover:bg-crema'}`}
    >
      {label}
    </a>
  );
}

function Layout({ route, children }) {
  const links = [
    ['/', 'Inicio'],
    ['/asientos', 'Asientos'],
    ['/moliendas', 'Moliendas'],
    ['/mayor', 'Mayor'],
    ['/reportes', 'Reportes'],
    ['/centros', 'Centros'],
    ['/cierre', 'Cierre'],
    ['/socios', 'Socios'],
    ['/distribucion', 'Distribución'],
    ['/admin', 'Admin']
  ];

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-10 bg-harina/95 backdrop-blur border-b border-crema">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <h1 className="font-title text-xl text-chocolate">Cooperativa de Trabajo Molino Florida</h1>
          <p className="text-xs text-chocolate/70">Contabilidad cooperativa con costeo conjunto — demo local sin backend</p>
          <nav className="mt-2 hidden md:flex gap-1 flex-wrap">
            {links.map(([to, label]) => <NavLink key={to} to={to} route={route} label={label} />)}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-crema flex overflow-x-auto z-20">
        {links.map(([to, label]) => <NavLink key={to} to={to} route={route} label={label} />)}
      </nav>
    </div>
  );
}

function Card({ title, actions, children }) {
  return (
    <section className="bg-white border border-crema rounded-2xl shadow-sm p-4 mb-4">
      {(title || actions) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {title ? <h2 className="font-title text-lg text-chocolate">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled = false, type = 'button' }) {
  const styles = {
    primary: 'bg-campo text-white',
    danger: 'bg-teja text-white',
    soft: 'bg-crema text-chocolate',
    gold: 'bg-dorado text-chocolate'
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${btnBase} ${styles[variant]}`}>
      {children}
    </button>
  );
}

function YieldChart({ outputs, products, wheatKilos }) {
  const items = outputs
    .map((o) => ({ p: products.find((x) => x.key === o.product), o }))
    .filter((x) => x.p && x.o.kilos > 0);

  if (!items.length) return null;

  const max = Math.max(...items.map((x) => x.o.kilos), 1);
  const bw = 34;
  const gap = 8;
  const W = items.length * (bw + gap) + 12;
  const H = 140;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg" role="img" aria-label="Rendimiento de la molienda en kilos por producto">
      {items.map((x, i) => {
        const h = Math.max(4, Math.round((x.o.kilos / max) * 88));
        const px = 8 + i * (bw + gap);
        const py = 108 - h;
        const pct = wheatKilos ? Math.round((x.o.kilos / wheatKilos) * 100) : 0;
        const short = x.p.name.replace('Harina ', 'H. ').replace('Germen de trigo', 'Germen');
        return (
          <g key={x.p.key}>
            <rect x={px} y={py} width={bw} height={h} rx="4" fill={x.p.type === 'harina' ? '#D9A441' : '#5E7D3A'} />
            <text x={px + bw / 2} y={104} textAnchor="middle" fontSize="9" fill="#3B2F1E">{pct}%</text>
            <text x={px + bw / 2} y={122} textAnchor="middle" fontSize="8" fill="#3B2F1E">{short}</text>
          </g>
        );
      })}
      <line x1="0" y1="108" x2={W} y2="108" stroke="#E9DFC8" strokeWidth="2" />
    </svg>
  );
}

function Dashboard({ state }) {
  const confirmed = state.entries.filter((e) => e.status === 'confirmed').length;
  const drafts = state.entries.length - confirmed;
  const result = resultCents(state);
  const balances = getBalances(state, null);
  const bal = (name) => balances[name] || { debit: 0, credit: 0 };
  const bank = bal('Banco').debit - bal('Banco').credit;
  const debtors = bal('Deudores por ventas').debit - bal('Deudores por ventas').credit;

  const cards = [
    ['Asientos confirmados', confirmed],
    ['Borradores', drafts],
    ['Moliendas', state.millings.length],
    ['Meses cerrados', state.closedMonths.length],
    ['Resultado del ejercicio', fmtSigned(result)],
    ['Banco', fmtSigned(bank)],
    ['Deudores por ventas', fmtSigned(debtors)],
    ['Socios', state.partners.length]
  ];

  return (
    <div className="space-y-4">
      <Card title="Panel cooperativo">
        <p className="text-sm leading-relaxed text-chocolate/80">
          Esta aplicación registra partida doble, moliendas con costo conjunto por valor de venta relativo,
          anticipos de retorno de socios, cierre del ejercicio y reportes por período. Todos los datos son
          simulados y persisten en el navegador mediante localStorage.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="bg-white border border-crema rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wide text-chocolate/60">{label}</div>
            <div className="font-title text-lg mt-1">{value}</div>
          </div>
        ))}
      </div>

      <Card title="Accesos rápidos">
        <div className="flex flex-wrap gap-2">
          <a className="px-3 py-2 rounded-xl bg-campo text-white text-sm" href="#/moliendas">Registrar molienda</a>
          <a className="px-3 py-2 rounded-xl bg-dorado text-chocolate text-sm" href="#/asientos">Ver diario</a>
          <a className="px-3 py-2 rounded-xl bg-crema text-chocolate text-sm" href="#/mayor">Libro mayor</a>
          <a className="px-3 py-2 rounded-xl bg-crema text-chocolate text-sm" href="#/reportes">Balance</a>
          <a className="px-3 py-2 rounded-xl bg-crema text-chocolate text-sm" href="#/centros">Centros de costo</a>
          <a className="px-3 py-2 rounded-xl bg-crema text-chocolate text-sm" href="#/cierre">Cierre</a>
          <a className="px-3 py-2 rounded-xl bg-crema text-chocolate text-sm" href="#/distribucion">Distribución</a>
        </div>
      </Card>
    </div>
  );
}

function Entries({ state, persist }) {
  const periods = monthOptions(state);
  const [period, setPeriod] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  const emptyForm = () => ({
    date: todayISO(),
    concept: '',
    lines: [
      { account: '', debit: '', credit: '' },
      { account: '', debit: '', credit: '' }
    ]
  });

  const [form, setForm] = useState(emptyForm);

  const totals = form.lines.reduce((acc, l) => {
    acc.d += parseCents(l.debit);
    acc.c += parseCents(l.credit);
    return acc;
  }, { d: 0, c: 0 });

  const visible = state.entries
    .filter((e) => (!period || periodOf(e.date) === period) && (statusFilter === 'all' || e.status === statusFilter))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.number || 0) - (a.number || 0));

  function updateLine(i, key, value) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[i] = { ...lines[i], [key]: value };
      return { ...f, lines };
    });
  }

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, { account: '', debit: '', credit: '' }] }));
  }

  function removeLine(i) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));
  }

  function saveEntry(status) {
    const lines = form.lines
      .map((l) => ({ account: l.account, debit: parseCents(l.debit), credit: parseCents(l.credit) }))
      .filter((l) => l.account && (l.debit > 0 || l.credit > 0));

    if (!form.date || !form.concept.trim()) {
      alert('Fecha y concepto son obligatorios.');
      return;
    }

    if (lines.length < 2) {
      alert('El asiento necesita al menos dos líneas.');
      return;
    }

    if (status === 'confirmed') {
      if (lines.some((l) => l.debit > 0 && l.credit > 0)) {
        alert('Cada línea debe tener debe o haber, no ambos.');
        return;
      }
      if (totals.d !== totals.c) {
        alert('No se puede confirmar un asiento desbalanceado.');
        return;
      }
      if (isClosed(state, periodOf(form.date))) {
        alert('El período está cerrado.');
        return;
      }
    }

    persist((s) => {
      const entry = {
        id: status === 'confirmed' ? '' : `D${Date.now().toString(36)}`,
        number: null,
        date: form.date,
        concept: form.concept.trim(),
        lines,
        status,
        source: 'manual',
        reversalOf: null,
        reversedBy: null
      };

      if (status === 'confirmed') assignEntry(s, entry);
      s.entries.push(entry);
    });

    setForm(emptyForm());
    setShowForm(false);
  }

  function revert(id) {
    const original = state.entries.find((e) => e.id === id);
    if (!original) return;
    if (original.reversedBy) {
      alert('Este asiento ya está revertido.');
      return;
    }
    if (original.reversalOf) {
      alert('Una reversión no se revierte; se corrige con un nuevo asiento.');
      return;
    }

    const date = todayISO();
    if (isClosed(state, periodOf(date))) {
      alert('El período actual está cerrado.');
      return;
    }

    if (!confirm('¿Revertir este asiento con un contraasiento vinculado?')) return;

    persist((s) => {
      const orig = s.entries.find((e) => e.id === id);
      const reversal = {
        id: '',
        number: null,
        date,
        concept: `Reversión: ${orig.concept}`,
        lines: orig.lines.map((l) => ({ account: l.account, debit: l.credit || 0, credit: l.debit || 0 })),
        status: 'confirmed',
        source: 'reversion',
        reversalOf: orig.id,
        reversedBy: null
      };
      assignEntry(s, reversal);
      orig.reversedBy = reversal.id;
      s.entries.push(reversal);
    });
  }

  return (
    <Card
      title="Asientos contables"
      actions={<Btn onClick={() => setShowForm((v) => !v)} variant={showForm ? 'soft' : 'primary'}>{showForm ? 'Cerrar formulario' : 'Nuevo asiento'}</Btn>}
    >
      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">Todos los períodos</option>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="confirmed">Confirmados</option>
          <option value="draft">Borradores</option>
        </select>
        <div className="text-sm self-center text-chocolate/70">
          Debe {fmt(totals.d)} / Haber {fmt(totals.c)} {totals.d === totals.c ? '— balanceado' : '— desbalanceado'}
        </div>
      </div>

      {showForm && (
        <div className="bg-harina border border-crema rounded-2xl p-3 mb-4">
          <div className="grid gap-2 md:grid-cols-2 mb-2">
            <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <input className={inputCls} placeholder="Concepto" value={form.concept} onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))} />
          </div>

          {form.lines.map((l, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_140px_auto] items-center mb-2">
              <select className={inputCls} value={l.account} onChange={(e) => updateLine(i, 'account', e.target.value)}>
                <option value="">Cuenta</option>
                {state.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
              <input className={inputCls} placeholder="Debe" value={l.debit} onChange={(e) => updateLine(i, 'debit', e.target.value)} />
              <input className={inputCls} placeholder="Haber" value={l.credit} onChange={(e) => updateLine(i, 'credit', e.target.value)} />
              <Btn variant="soft" onClick={() => removeLine(i)}>Quitar</Btn>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 mt-3">
            <Btn variant="soft" onClick={addLine}>Agregar línea</Btn>
            <Btn variant="gold" onClick={() => saveEntry('draft')}>Guardar borrador</Btn>
            <Btn onClick={() => saveEntry('confirmed')}>Confirmar asiento</Btn>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((e) => (
          <details key={e.id} className="border border-crema rounded-xl bg-white">
            <summary className="p-3 cursor-pointer">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{e.number ? `#${e.number}` : 'Borrador'}</span>
                <span>{e.date}</span>
                <span className="flex-1 min-w-40">{e.concept}</span>
                <span className={`px-2 py-1 rounded-lg text-xs ${e.status === 'confirmed' ? 'bg-campo/15 text-campo' : 'bg-dorado/20 text-chocolate'}`}>
                  {e.status === 'confirmed' ? 'Confirmado' : 'Borrador'}
                </span>
                {e.reversalOf ? <span className="px-2 py-1 rounded-lg text-xs bg-crema">Reversión</span> : null}
                {e.reversedBy ? <span className="px-2 py-1 rounded-lg text-xs bg-teja/15 text-teja">Revertido</span> : null}
              </div>
            </summary>
            <div className="p-3 pt-0 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>Cuenta</th>
                    <th className={thCls}>Debe</th>
                    <th className={thCls}>Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {e.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className={tdCls}>{l.account}</td>
                      <td className={tdCls}>{l.debit ? fmt(l.debit) : ''}</td>
                      <td className={tdCls}>{l.credit ? fmt(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e.status === 'confirmed' && !e.reversedBy && (
                <div className="mt-2">
                  <Btn variant="danger" onClick={() => revert(e.id)}>Revertir</Btn>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}

function Millings({ state, persist }) {
  const products = state.products.filter((p) => p.key !== 'merma');
  const productByKey = Object.fromEntries(state.products.map((p) => [p.key, p]));
  const shifts = ['6 a 14', '14 a 22', '22 a 6'];

  const initialForm = () => ({
    date: todayISO(),
    shift: 0,
    wheatKilos: '12000',
    wheatCost: ((12000 * state.settings.wheatReferenceCents) / 100).toFixed(2),
    merma: '',
    outputs: products.map((p) => ({ product: p.key, kilos: '' }))
  });

  const [form, setForm] = useState(initialForm);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const used = usedShiftCapacity(state, form.date, form.shift);

  function updateOutput(idx, value) {
    setForm((f) => {
      const outputs = [...f.outputs];
      outputs[idx] = { ...outputs[idx], kilos: value };
      return { ...f, outputs };
    });
  }

  function loadTheoretical() {
    const wheat = parseKg(form.wheatKilos);
    const outputs = products.map((p) => ({ product: p.key, kilos: String(Math.floor(wheat * p.yield)) }));
    const sum = outputs.reduce((s, o) => s + parseKg(o.kilos), 0);
    setForm((f) => ({
      ...f,
      outputs,
      merma: String(Math.max(0, wheat - sum)),
      wheatCost: f.wheatCost || String((wheat * state.settings.wheatReferenceCents) / 100)
    }));
    setPreview(null);
    setError('');
  }

  function calc() {
    const wheat = parseKg(form.wheatKilos);
    const merma = parseKg(form.merma);
    const items = form.outputs.map((o) => ({ product: o.product, kilos: parseKg(o.kilos) }));
    const outputKilos = items.reduce((s, o) => s + o.kilos, 0);
    const sum = outputKilos + merma;
    const errs = [];

    if (!form.date) errs.push('Ingresá fecha.');
    if (wheat <= 0) errs.push('Los kilos de trigo deben ser mayores a cero.');
    if (outputKilos <= 0) errs.push('Debe existir producción con kilos.');
    if (sum !== wheat) errs.push(`Salidas más merma (${sum} kg) no igualan al trigo (${wheat} kg).`);

    const wheatCost = parseCents(form.wheatCost);
    if (wheatCost <= 0) errs.push('El costo del trigo debe ser mayor a cero.');

    if (used + wheat > state.settings.shiftCapacityKg) {
      errs.push(`Cupo del turno superado: usado ${used} kg, nuevo ${wheat} kg, límite ${state.settings.shiftCapacityKg} kg.`);
    }

    if (isClosed(state, periodOf(form.date))) errs.push('El período está cerrado.');

    if (errs.length) {
      setError(errs.join(' '));
      setPreview(null);
      return;
    }

    const energy = wheat * state.settings.energyCostPerKiloCents;
    const total = wheatCost + energy;
    const allocated = allocateCost(total, items, state.products);

    const byAccount = {};
    allocated.forEach((a) => {
      const prod = state.products.find((p) => p.key === a.product);
      if (prod && prod.account) byAccount[prod.account] = (byAccount[prod.account] || 0) + a.costCents;
    });

    setPreview({
      wheat,
      merma,
      wheatCost,
      energy,
      total,
      allocated,
      accountLines: Object.entries(byAccount).map(([account, amount]) => ({ account, debit: amount, credit: 0 })).filter((l) => l.debit > 0),
      creditLines: [
        { account: 'Stock de trigo', debit: 0, credit: wheatCost },
        { account: 'Energía eléctrica', debit: 0, credit: energy }
      ]
    });
    setError('');
  }

  function confirmMilling() {
    if (!preview || error) return;

    persist((s) => {
      const entry = {
        id: '',
        number: null,
        date: form.date,
        concept: `Molienda turno ${Number(form.shift) + 1}`,
        lines: [...preview.accountLines, ...preview.creditLines],
        status: 'confirmed',
        source: 'molienda',
        reversalOf: null,
        reversedBy: null
      };
      assignEntry(s, entry);

      const id = `M${String(s.millings.length + 1).padStart(3, '0')}`;
      s.entries.push(entry);
      s.millings.push({
        id,
        date: form.date,
        shift: Number(form.shift),
        wheatKilos: preview.wheat,
        wheatCostCents: preview.wheatCost,
        energyCostCents: preview.energy,
        totalCostCents: preview.total,
        outputs: preview.allocated.map((a) => ({ product: a.product, kilos: a.kilos, valueCents: a.valueCents, costCents: a.costCents })),
        mermaKilos: preview.merma,
        entryId: entry.id
      });
    });

    setForm(initialForm());
    setPreview(null);
    setError('');
  }

  const sortedMillings = [...state.millings].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <div>
      <Card title="Calendario y cupos">
        <p className="text-sm text-chocolate/80 leading-relaxed">
          Molienda de lunes a viernes en tres turnos (6 a 14, 14 a 22 y 22 a 6). Embolsado de 7 a 15.
          Reparto martes y jueves. Cada turno tiene un cupo de {fmtKg(state.settings.shiftCapacityKg)} de trigo.
          Anticipos de socios se pagan el día 8 del mes siguiente. Cada socio tiene 184 horas mensuales
          más 24 extra que aprueba el consejo.
        </p>
      </Card>

      <Card title="Registro de moliendas">
        <div className="grid gap-2 md:grid-cols-4 mb-2">
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <select className={inputCls} value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}>
            {shifts.map((s, i) => <option key={s} value={i}>Turno {i + 1}: {s}</option>)}
          </select>
          <input className={inputCls} placeholder="Kilos de trigo" value={form.wheatKilos} onChange={(e) => setForm((f) => ({ ...f, wheatKilos: e.target.value }))} />
          <input className={inputCls} placeholder="Costo total del trigo en $U" value={form.wheatCost} onChange={(e) => setForm((f) => ({ ...f, wheatCost: e.target.value }))} />
        </div>

        <div className="text-sm text-chocolate/70 mb-2">
          Cupo usado en este turno: {fmtKg(used)} de {fmtKg(state.settings.shiftCapacityKg)}.
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 mb-2">
          {products.map((p, idx) => (
            <div key={p.key} className="border border-crema rounded-xl p-2 bg-harina">
              <div className="text-sm font-medium mb-1">{p.name}</div>
              <input className={inputCls} placeholder="Kilos reales" value={form.outputs[idx].kilos} onChange={(e) => updateOutput(idx, e.target.value)} />
            </div>
          ))}
          <div className="border border-crema rounded-xl p-2 bg-harina">
            <div className="text-sm font-medium mb-1">Merma</div>
            <input className={inputCls} placeholder="Kilos de merma" value={form.merma} onChange={(e) => setForm((f) => ({ ...f, merma: e.target.value }))} />
          </div>
        </div>

        {error && <div className="text-sm text-teja mb-2">{error}</div>}

        <div className="flex flex-wrap gap-2">
          <Btn variant="soft" onClick={loadTheoretical}>Cargar rendimientos teóricos</Btn>
          <Btn variant="gold" onClick={calc}>Calcular costo conjunto</Btn>
          <Btn disabled={!preview || Boolean(error)} onClick={confirmMilling}>Confirmar molienda</Btn>
        </div>

        {preview && (
          <div className="mt-4 overflow-x-auto">
            <h3 className="font-title mb-2">Cuenta paso a paso</h3>
            <YieldChart outputs={preview.allocated} products={state.products} wheatKilos={preview.wheat} />
            <table className="min-w-full text-sm mb-2 mt-2">
              <thead>
                <tr>
                  <th className={thCls}>Producto</th>
                  <th className={thCls}>Kilos</th>
                  <th className={thCls}>Valor de venta</th>
                  <th className={thCls}>Costo asignado</th>
                  <th className={thCls}>Costo por kilo</th>
                </tr>
              </thead>
              <tbody>
                {preview.allocated.map((a) => (
                  <tr key={a.product}>
                    <td className={tdCls}>{productByKey[a.product] ? productByKey[a.product].name : a.product}</td>
                    <td className={tdCls}>{fmtKg(a.kilos)}</td>
                    <td className={tdCls}>{fmt(a.valueCents)}</td>
                    <td className={tdCls}>{fmt(a.costCents)}</td>
                    <td className={tdCls}>{fmtCostPerKg(a.costCents, a.kilos)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={tdCls}>Merma</td>
                  <td className={tdCls}>{fmtKg(preview.merma)}</td>
                  <td className={tdCls}>-</td>
                  <td className={tdCls}>Sin costo</td>
                  <td className={tdCls}>-</td>
                </tr>
              </tbody>
            </table>

            <div className="text-sm space-y-1">
              <div>Costo del trigo: {fmt(preview.wheatCost)}</div>
              <div>Energía de molienda: {fmt(preview.energy)}</div>
              <div className="font-semibold">Costo total de la molienda: {fmt(preview.total)}</div>
              <div className="text-chocolate/70">Asiento: débito a stock de productos, crédito a stock de trigo y energía eléctrica.</div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Moliendas registradas">
        <div className="space-y-2">
          {sortedMillings.map((m) => {
            const entry = state.entries.find((e) => e.id === m.entryId);
            return (
              <details key={m.id} className="border border-crema rounded-xl bg-white">
                <summary className="p-3 cursor-pointer text-sm">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-semibold">{m.id}</span>
                    <span>{m.date}</span>
                    <span>Turno {m.shift + 1}</span>
                    <span>{fmtKg(m.wheatKilos)}</span>
                    <span className="flex-1">Costo {fmt(m.totalCostCents)}</span>
                    {entry && entry.reversedBy ? <span className="text-teja">Revertida</span> : null}
                  </div>
                </summary>
                <div className="p-3 pt-0 overflow-x-auto">
                  <YieldChart outputs={m.outputs} products={state.products} wheatKilos={m.wheatKilos} />
                  <table className="min-w-full text-sm mt-2">
                    <thead>
                      <tr>
                        <th className={thCls}>Producto</th>
                        <th className={thCls}>Kilos</th>
                        <th className={thCls}>Valor</th>
                        <th className={thCls}>Costo</th>
                        <th className={thCls}>Costo/kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.outputs.map((o) => (
                        <tr key={o.product}>
                          <td className={tdCls}>{productByKey[o.product] ? productByKey[o.product].name : o.product}</td>
                          <td className={tdCls}>{fmtKg(o.kilos)}</td>
                          <td className={tdCls}>{fmt(o.valueCents)}</td>
                          <td className={tdCls}>{fmt(o.costCents)}</td>
                          <td className={tdCls}>{fmtCostPerKg(o.costCents, o.kilos)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className={tdCls}>Merma</td>
                        <td className={tdCls}>{fmtKg(m.mermaKilos)}</td>
                        <td className={tdCls}>-</td>
                        <td className={tdCls}>Sin costo</td>
                        <td className={tdCls}>-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Ledger({ state }) {
  const [account, setAccount] = useState('Banco');
  const [period, setPeriod] = useState('');
  const periods = monthOptions(state);
  const rows = ledgerLines(state, account, period || null);
  const last = rows.length ? rows[rows.length - 1].balance : 0;

  return (
    <Card title="Libro mayor por cuenta">
      <div className="grid gap-2 md:grid-cols-2 mb-3">
        <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
          {state.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">Todos los períodos</option>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>Fecha</th>
              <th className={thCls}>Asiento</th>
              <th className={thCls}>Concepto</th>
              <th className={thCls}>Debe</th>
              <th className={thCls}>Haber</th>
              <th className={thCls}>Saldo acumulado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.entry.id}-${idx}`}>
                <td className={tdCls}>{r.entry.date}</td>
                <td className={tdCls}>{r.entry.number ? `#${r.entry.number}` : '-'}</td>
                <td className={tdCls}>{r.entry.concept}</td>
                <td className={tdCls}>{r.line.debit ? fmt(r.line.debit) : ''}</td>
                <td className={tdCls}>{r.line.credit ? fmt(r.line.credit) : ''}</td>
                <td className={tdCls}>{fmtSigned(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm">
        Saldo final: <span className="font-semibold">{fmtSigned(last)}</span>
        {rows.length === 0 ? ' — sin movimientos confirmados para ese filtro.' : ''}
      </div>
    </Card>
  );
}

function Reports({ state }) {
  const [period, setPeriod] = useState('');
  const periods = monthOptions(state);
  const { rows, totalDebit, totalCredit } = trialBalance(state, period || null);
  const visibleRows = rows.filter((r) => r.debit || r.credit || r.net);
  const result = resultCents(state);

  return (
    <div>
      <Card
        title="Balance de sumas y saldos"
        actions={
          <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Todo el ejercicio</option>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Cuenta</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Debe</th>
                <th className={thCls}>Haber</th>
                <th className={thCls}>Neto</th>
                <th className={thCls}>Naturaleza</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.name}>
                  <td className={tdCls}>{r.name}</td>
                  <td className={tdCls}>{r.type}</td>
                  <td className={tdCls}>{r.debit ? fmt(r.debit) : '-'}</td>
                  <td className={tdCls}>{r.credit ? fmt(r.credit) : '-'}</td>
                  <td className={tdCls}>{fmtSigned(r.net)}</td>
                  <td className={tdCls}>{r.net > 0 ? 'Deudor' : r.net < 0 ? 'Acreedor' : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={tdCls}>Totales</td>
                <td className={tdCls}></td>
                <td className={tdCls}>{fmt(totalDebit)}</td>
                <td className={tdCls}>{fmt(totalCredit)}</td>
                <td className={tdCls} colSpan="2">{totalDebit === totalCredit ? 'Debe igual a Haber ✔' : 'Desbalance ✘'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="Resultado y meses cerrados">
        <div className="text-sm space-y-2">
          <div>Resultado del ejercicio completo: <span className="font-semibold">{fmtSigned(result)}</span></div>
          <div className="flex flex-wrap gap-2">
            {state.closedMonths.map((m) => (
              <span key={m} className="px-2 py-1 rounded-lg bg-crema text-xs">{m} cerrado</span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Centros({ state }) {
  const productRows = state.products
    .filter((p) => p.type !== 'merma')
    .map((p) => {
      let kilos = 0;
      let cost = 0;
      let value = 0;
      state.millings.forEach((m) => {
        m.outputs.forEach((o) => {
          if (o.product === p.key) {
            kilos += o.kilos;
            cost += o.costCents;
            value += o.valueCents;
          }
        });
      });
      return { name: p.name, kilos, cost, value, margin: value - cost };
    });

  const balances = getBalances(state, null);
  const othersRev = ((balances['Ventas de otros productos'] || {}).credit || 0) - ((balances['Ventas de otros productos'] || {}).debit || 0);
  const othersCost = ((balances['Costo de venta de otros productos'] || {}).debit || 0) - ((balances['Costo de venta de otros productos'] || {}).credit || 0);

  const totalMargin = productRows.reduce((s, r) => s + r.margin, 0);

  return (
    <Card title="Resultados por centro de costo">
      <p className="text-sm text-chocolate/75 mb-3">
        Cada producto es un centro de costo: se compara el valor de venta de referencia de lo producido
        contra el costo conjunto asignado. Así el consejo ve cuánto deja cada producto por molienda acumulada.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>Centro (producto)</th>
              <th className={thCls}>Kilos producidos</th>
              <th className={thCls}>Costo asignado</th>
              <th className={thCls}>Valor de referencia</th>
              <th className={thCls}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {productRows.map((r) => (
              <tr key={r.name}>
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}>{fmtKg(r.kilos)}</td>
                <td className={tdCls}>{fmt(r.cost)}</td>
                <td className={tdCls}>{fmt(r.value)}</td>
                <td className={tdCls}>{fmtSigned(r.margin)}</td>
              </tr>
            ))}
            <tr>
              <td className={tdCls}>Otros productos (costo directo)</td>
              <td className={tdCls}>-</td>
              <td className={tdCls}>{fmt(othersCost)}</td>
              <td className={tdCls}>{fmt(othersRev)}</td>
              <td className={tdCls}>{fmtSigned(othersRev - othersCost)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className={tdCls}>Margen conjunto de producción</td>
              <td className={tdCls}></td>
              <td className={tdCls}></td>
              <td className={tdCls}></td>
              <td className={tdCls}>{fmtSigned(totalMargin + othersRev - othersCost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function Cierre({ state, persist }) {
  const periods = [...state.closedMonths];
  const [period, setPeriod] = useState(periods.length ? periods[periods.length - 1] : '');
  const effectivePeriod = period || (monthOptions(state).slice(-1)[0] || '');
  const balances = getBalances(state, period || null);

  const hasRef = state.entries.some((e) => e.source === `cierre-refundicion:${period}`);
  const hasDist = state.entries.some((e) => e.source === `cierre-distribucion:${period}`);
  const hasAp = state.entries.some((e) => e.source === `cierre-apertura:${period}`);

  let R = 0;
  let G = 0;
  state.accounts.forEach((a) => {
    const b = balances[a.name] || { debit: 0, credit: 0 };
    if (a.type === 'ingreso') R += b.credit - b.debit;
    if (a.type === 'gasto') G += b.debit - b.credit;
  });
  const result = R - G;

  function refundicion() {
    if (hasRef) return;
    const lines = [];
    state.accounts.forEach((a) => {
      const b = balances[a.name] || { debit: 0, credit: 0 };
      if (a.type === 'ingreso') {
        const net = b.credit - b.debit;
        if (net !== 0) lines.push({ account: a.name, debit: net, credit: 0 });
      }
      if (a.type === 'gasto') {
        const net = b.debit - b.credit;
        if (net !== 0) lines.push({ account: a.name, debit: 0, credit: net });
      }
    });
    const diff = R - G;
    if (diff > 0) lines.push({ account: 'Resultado del ejercicio', debit: 0, credit: diff });
    else if (diff < 0) lines.push({ account: 'Resultado del ejercicio', debit: -diff, credit: 0 });

    if (lines.length < 2) {
      alert('No hay cuentas de resultado con movimiento en el período.');
      return;
    }

    const date = period ? lastDayOf(period) : todayISO();
    if (isClosed(state, periodOf(date)) && period) {
      // el cierre se fecha al último día del período aunque esté cerrado: es un asiento de cierre
    }

    persist((s) => {
      const entry = {
        id: '',
        number: null,
        date,
        concept: `Refundición de cuentas de resultado ${period || 'ejercicio'}`,
        lines,
        status: 'confirmed',
        source: `cierre-refundicion:${period}`,
        reversalOf: null,
        reversedBy: null
      };
      assignEntry(s, entry);
      s.entries.push(entry);
    });
  }

  function distribucion() {
    if (!hasRef || hasDist) return;
    if (result <= 0) {
      alert('No hay excedente para distribuir en el período.');
      return;
    }
    const reserve = Math.floor((result * state.settings.reservePercent) / 100);
    const education = Math.floor((result * state.settings.educationPercent) / 100);
    const retorno = result - reserve - education;
    const date = period ? lastDayOf(period) : todayISO();

    persist((s) => {
      const entry = {
        id: '',
        number: null,
        date,
        concept: `Distribución del excedente ${period || 'ejercicio'}`,
        lines: [
          { account: 'Resultado del ejercicio', debit: result, credit: 0 },
          { account: 'Reserva legal', debit: 0, credit: reserve },
          { account: 'Fondo de educación cooperativa', debit: 0, credit: education },
          { account: 'Retorno a socios por pagar', debit: 0, credit: retorno }
        ],
        status: 'confirmed',
        source: `cierre-distribucion:${period}`,
        reversalOf: null,
        reversedBy: null
      };
      assignEntry(s, entry);
      s.entries.push(entry);
    });
  }

  function apertura() {
    if (!hasDist || hasAp) return;
    const next = nextPeriodOf(effectivePeriod);
    if (isClosed(state, next)) {
      alert(`El período ${next} está cerrado; no se puede asentar la apertura.`);
      return;
    }
    const cum = cumulativeBalances(state, effectivePeriod);
    const lines = [];
    state.accounts.forEach((a) => {
      const b = cum[a.name] || { debit: 0, credit: 0 };
      const net = b.debit - b.credit;
      if (net === 0) return;
      if (a.type === 'activo') lines.push(net > 0 ? { account: a.name, debit: net, credit: 0 } : { account: a.name, debit: 0, credit: -net });
      if (a.type === 'pasivo' || a.type === 'patrimonio') lines.push(net < 0 ? { account: a.name, debit: 0, credit: -net } : { account: a.name, debit: net, credit: 0 });
    });

    if (lines.length < 2) {
      alert('No hay saldos patrimoniales para abrir.');
      return;
    }

    const date = `${next}-01`;
    persist((s) => {
      const entry = {
        id: '',
        number: null,
        date,
        concept: `Apertura del ejercicio ${next}`,
        lines,
        status: 'confirmed',
        source: `cierre-apertura:${period}`,
        reversalOf: null,
        reversedBy: null
      };
      assignEntry(s, entry);
      s.entries.push(entry);
    });
  }

  return (
    <Card title="Cierre del ejercicio">
      <div className="grid gap-2 md:grid-cols-3 mb-3">
        <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">Todo el ejercicio</option>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="text-sm self-center">Resultado del período: <span className="font-semibold">{fmtSigned(result)}</span></div>
        <div className="text-sm self-center text-chocolate/70">Pasos: 1 refundición, 2 distribución, 3 apertura.</div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="border border-crema rounded-xl p-3">
          <div className="font-semibold mb-1">1. Refundición</div>
          <p className="text-chocolate/75 mb-2">Cierra las cuentas de ingreso y gasto contra «Resultado del ejercicio».</p>
          <Btn onClick={refundicion} disabled={hasRef}>{hasRef ? 'Refundición asentada' : 'Generar refundición'}</Btn>
        </div>

        <div className="border border-crema rounded-xl p-3">
          <div className="font-semibold mb-1">2. Distribución simulada</div>
          <p className="text-chocolate/75 mb-2">
            Aplica {state.settings.reservePercent} % a reserva legal, {state.settings.educationPercent} % a fondo de educación
            y el resto a retorno a socios por pagar.
          </p>
          <Btn onClick={distribucion} disabled={!hasRef || hasDist}>{hasDist ? 'Distribución asentada' : 'Generar distribución'}</Btn>
        </div>

        <div className="border border-crema rounded-xl p-3">
          <div className="font-semibold mb-1">3. Apertura</div>
          <p className="text-chocolate/75 mb-2">Asienta los saldos patrimoniales al primer día del período siguiente.</p>
          <Btn onClick={apertura} disabled={!hasDist || hasAp}>{hasAp ? 'Apertura asentada' : 'Generar apertura'}</Btn>
        </div>
      </div>
    </Card>
  );
}

function Partners({ state, persist }) {
  const rows = partnerTotals(state);

  function approvePartner(partnerId, month) {
    const date = todayISO();
    if (isClosed(state, periodOf(date))) {
      alert('El período actual está cerrado.');
      return;
    }
    if (!confirm(`¿Aprobar las horas extra del socio ${partnerId} de ${month} y pagar el anticipo bloqueado?`)) return;

    persist((s) => {
      const hh = s.hours.find((x) => x.partnerId === partnerId && x.month === month && x.status === 'blocked');
      if (!hh) return;
      hh.status = 'approved';

      const amount =
        (hh.day + hh.extra) * s.settings.partnerRateCents +
        Math.round((hh.night * s.settings.partnerRateCents * (100 + s.settings.nightSurchargePercent)) / 100);

      const adv = s.advances.find((a) => a.partnerId === partnerId && a.month === month);
      if (adv) {
        adv.amountCents = amount;
        adv.status = 'paid';
      } else {
        s.advances.push({ id: `ADV-${month}-${partnerId}-aprob`, partnerId, month, amountCents: amount, status: 'paid' });
      }

      const entry = {
        id: '',
        number: null,
        date,
        concept: `Anticipo aprobado tras aprobación del consejo ${partnerId} ${month}`,
        lines: [
          { account: 'Anticipos de retorno a socios', debit: amount, credit: 0 },
          { account: 'Banco', debit: 0, credit: amount }
        ],
        status: 'confirmed',
        source: 'aprobacion-consejo',
        reversalOf: null,
        reversedBy: null
      };
      assignEntry(s, entry);
      s.entries.push(entry);
    });
  }

  return (
    <div>
      <Card title="Socios y anticipos">
        <p className="text-sm text-chocolate/75 mb-3">
          Anticipo = horas diurnas × valor hora + horas nocturnas × valor hora × {(100 + state.settings.nightSurchargePercent) / 100}.
          Valor hora actual: {fmt(state.settings.partnerRateCents)}. Si se superan 184 horas mensuales más 24 extra,
          el anticipo queda bloqueado hasta que el consejo apruebe las horas extra.
        </p>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Socio</th>
                <th className={thCls}>Horas diurnas</th>
                <th className={thCls}>Horas nocturnas</th>
                <th className={thCls}>Horas extra</th>
                <th className={thCls}>Anticipos cobrados</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partner.id}>
                  <td className={tdCls}>{r.partner.id} — {r.partner.name}</td>
                  <td className={tdCls}>{r.day}</td>
                  <td className={tdCls}>{r.night}</td>
                  <td className={tdCls}>{r.extra}</td>
                  <td className={tdCls}>{fmt(r.advances)}</td>
                  <td className={tdCls}>{r.blocked ? `Bloqueado (${r.blockedMonth})` : 'Al día'}</td>
                  <td className={tdCls}>
                    {r.blocked ? (
                      <Btn variant="gold" onClick={() => approvePartner(r.partner.id, r.blockedMonth)}>Aprobar horas extra</Btn>
                    ) : (
                      <span className="text-chocolate/50">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Empleados no socios">
        <p className="text-sm text-chocolate/75 mb-3">
          Los empleados no socios cobran sueldos en la cuenta «Sueldos y jornales» y no participan del excedente cooperativo.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Legajo</th>
                <th className={thCls}>Nombre</th>
                <th className={thCls}>Rol</th>
                <th className={thCls}>Sueldo ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {state.employees.map((e) => (
                <tr key={e.id}>
                  <td className={tdCls}>{e.id}</td>
                  <td className={tdCls}>{e.name}</td>
                  <td className={tdCls}>{e.role}</td>
                  <td className={tdCls}>{fmt(e.salaryCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Proveedor de servicio">
        <p className="text-sm text-chocolate/80">
          {state.serviceProvider.name} — {state.serviceProvider.note}
        </p>
      </Card>
    </div>
  );
}

function Distribution({ state }) {
  const defaultSurplus = Math.max(0, resultCents(state));
  const [surplusInput, setSurplusInput] = useState((defaultSurplus / 100).toFixed(2));
  const [calcResult, setCalcResult] = useState(() => distributionCalc(state, defaultSurplus));

  function recalc() {
    setCalcResult(distributionCalc(state, parseCents(surplusInput)));
  }

  return (
    <Card title="Simulador de distribución del excedente">
      <div className="grid gap-2 md:grid-cols-3 items-end mb-3">
        <div>
          <label className="text-xs text-chocolate/70">Excedente en $U</label>
          <input className={inputCls} value={surplusInput} onChange={(e) => setSurplusInput(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-chocolate/70">Reserva legal</label>
          <input className={inputCls} disabled value={`${state.settings.reservePercent} %`} />
        </div>
        <div>
          <label className="text-xs text-chocolate/70">Educación cooperativa</label>
          <input className={inputCls} disabled value={`${state.settings.educationPercent} %`} />
        </div>
      </div>

      <div className="mb-3">
        <Btn onClick={recalc}>Calcular distribución</Btn>
      </div>

      <div className="text-sm space-y-1 mb-4">
        <div>Excedente: <span className="font-semibold">{fmt(calcResult.surplus)}</span></div>
        <div>Reserva legal: <span className="font-semibold">{fmt(calcResult.reserve)}</span></div>
        <div>Fondo de educación: <span className="font-semibold">{fmt(calcResult.education)}</span></div>
        <div>Retorno a socios: <span className="font-semibold">{fmt(calcResult.pool)}</span></div>
        <div>Horas totales de socios: <span className="font-semibold">{calcResult.totalHours}</span></div>
        <div className="text-chocolate/70">El redondeo del retorno se asigna al último socio, al centésimo.</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>Socio</th>
              <th className={thCls}>Horas</th>
              <th className={thCls}>Retorno</th>
              <th className={thCls}>Anticipos</th>
              <th className={thCls}>Neto</th>
            </tr>
          </thead>
          <tbody>
            {calcResult.rows.map((r) => (
              <tr key={r.partner.id}>
                <td className={tdCls}>{r.partner.id} — {r.partner.name}</td>
                <td className={tdCls}>{r.hours}</td>
                <td className={tdCls}>{fmt(r.share)}</td>
                <td className={tdCls}>{fmt(r.advance)}</td>
                <td className={tdCls}>{fmtSigned(r.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={tdCls}>Totales</td>
              <td className={tdCls}>{calcResult.totalHours}</td>
              <td className={tdCls}>{fmt(calcResult.totals.share)}</td>
              <td className={tdCls}>{fmt(calcResult.totals.advance)}</td>
              <td className={tdCls}>{fmtSigned(calcResult.totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function Admin({ state, persist }) {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem('contcoop_admin') === '1');
  const [pass, setPass] = useState('');
  const [newMonth, setNewMonth] = useState('2026-08');

  const [settingsForm, setSettingsForm] = useState({
    nightSurchargePercent: state.settings.nightSurchargePercent,
    reservePercent: state.settings.reservePercent,
    educationPercent: state.settings.educationPercent,
    energyCost: (state.settings.energyCostPerKiloCents / 100).toFixed(2),
    partnerRate: (state.settings.partnerRateCents / 100).toFixed(2),
    adminPass: state.settings.adminPass
  });

  useEffect(() => {
    setSettingsForm({
      nightSurchargePercent: state.settings.nightSurchargePercent,
      reservePercent: state.settings.reservePercent,
      educationPercent: state.settings.educationPercent,
      energyCost: (state.settings.energyCostPerKiloCents / 100).toFixed(2),
      partnerRate: (state.settings.partnerRateCents / 100).toFixed(2),
      adminPass: state.settings.adminPass
    });
  }, [state.settings]);

  if (!unlocked) {
    return (
      <Card title="Administración">
        <p className="text-sm mb-2">La navegación pública es libre. Solo esta vista requiere clave.</p>
        <div className="flex gap-2">
          <input className={inputCls} type="password" placeholder="Clave" value={pass} onChange={(e) => setPass(e.target.value)} />
          <Btn onClick={() => {
            if (pass === state.settings.adminPass) {
              sessionStorage.setItem('contcoop_admin', '1');
              setUnlocked(true);
            } else {
              alert('Clave incorrecta.');
            }
          }}>Entrar</Btn>
        </div>
      </Card>
    );
  }

  function saveSettings() {
    persist((s) => {
      s.settings.nightSurchargePercent = Number(settingsForm.nightSurchargePercent) || 0;
      s.settings.reservePercent = Number(settingsForm.reservePercent) || 0;
      s.settings.educationPercent = Number(settingsForm.educationPercent) || 0;
      s.settings.energyCostPerKiloCents = parseCents(settingsForm.energyCost);
      s.settings.partnerRateCents = parseCents(settingsForm.partnerRate);
      s.settings.adminPass = String(settingsForm.adminPass || 'molino2026');
    });
    alert('Configuración guardada.');
  }

  function addMonth() {
    if (!newMonth) return;
    persist((s) => {
      if (!s.closedMonths.includes(newMonth)) s.closedMonths.push(newMonth);
      s.closedMonths.sort();
    });
  }

  function removeMonth(m) {
    persist((s) => {
      s.closedMonths = s.closedMonths.filter((x) => x !== m);
    });
  }

  return (
    <div>
      <Card title="Configuración simulada" actions={<Btn variant="soft" onClick={() => { sessionStorage.removeItem('contcoop_admin'); setUnlocked(false); }}>Cerrar sesión</Btn>}>
        <div className="grid gap-2 md:grid-cols-3 mb-3">
          <div>
            <label className="text-xs text-chocolate/70">Recargo nocturno %</label>
            <input className={inputCls} value={settingsForm.nightSurchargePercent} onChange={(e) => setSettingsForm((f) => ({ ...f, nightSurchargePercent: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-chocolate/70">Reserva legal %</label>
            <input className={inputCls} value={settingsForm.reservePercent} onChange={(e) => setSettingsForm((f) => ({ ...f, reservePercent: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-chocolate/70">Educación cooperativa %</label>
            <input className={inputCls} value={settingsForm.educationPercent} onChange={(e) => setSettingsForm((f) => ({ ...f, educationPercent: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-chocolate/70">Energía por kilo en $U</label>
            <input className={inputCls} value={settingsForm.energyCost} onChange={(e) => setSettingsForm((f) => ({ ...f, energyCost: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-chocolate/70">Valor hora socio en $U</label>
            <input className={inputCls} value={settingsForm.partnerRate} onChange={(e) => setSettingsForm((f) => ({ ...f, partnerRate: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-chocolate/70">Clave /admin</label>
            <input className={inputCls} value={settingsForm.adminPass} onChange={(e) => setSettingsForm((f) => ({ ...f, adminPass: e.target.value }))} />
          </div>
        </div>
        <Btn onClick={saveSettings}>Guardar configuración</Btn>
      </Card>

      <Card title="Meses cerrados">
        <div className="flex gap-2 mb-3">
          <input className={inputCls} type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          <Btn variant="gold" onClick={addMonth}>Cerrar mes</Btn>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.closedMonths.map((m) => (
            <span key={m} className="px-2 py-1 rounded-lg bg-crema text-sm inline-flex items-center gap-2">
              {m}
              <button className="text-teja font-bold" onClick={() => removeMonth(m)}>×</button>
            </span>
          ))}
        </div>
      </Card>

      <Card title="Datos de ejemplo">
        <p className="text-sm mb-3">
          Este botón borra localStorage y vuelve a generar la semilla completa: 260 asientos, 90 moliendas,
          33 socios, 12 empleados, 70 clientes y 7 meses cerrados.
        </p>
        <Btn
          variant="danger"
          onClick={() => {
            if (confirm('¿Reiniciar los datos de ejemplo?')) {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }
          }}
        >
          Reiniciar datos de ejemplo
        </Btn>
      </Card>
    </div>
  );
}

function NotFound() {
  return (
    <Card title="Página no encontrada">
      <a href="#/" className="text-campo underline">Volver al inicio</a>
    </Card>
  );
}

function App() {
  const [state, setState] = useState(loadState);
  const route = useRoute();

  function persist(mutator) {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      mutator(next);
      next.meta.updatedAt = Date.now();
      saveRaw(next);
      return next;
    });
  }

  let view = <NotFound />;
  if (route === '/') view = <Dashboard state={state} />;
  else if (route === '/asientos') view = <Entries state={state} persist={persist} />;
  else if (route === '/moliendas') view = <Millings state={state} persist={persist} />;
  else if (route === '/mayor') view = <Ledger state={state} />;
  else if (route === '/reportes') view = <Reports state={state} />;
  else if (route === '/centros') view = <Centros state={state} />;
  else if (route === '/cierre') view = <Cierre state={state} persist={persist} />;
  else if (route === '/socios') view = <Partners state={state} persist={persist} />;
  else if (route === '/distribucion') view = <Distribution state={state} />;
  else if (route === '/admin') view = <Admin state={state} persist={persist} />;

  return <Layout route={route}>{view}</Layout>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
