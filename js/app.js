const { useState, useEffect } = React;

const STORAGE_KEY = 'contcoop_261112_v1';
const SEED_VERSION = '261112_v1';

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
    .sort((a, b) => a.date.localeCompare(b.date) || (a.number
