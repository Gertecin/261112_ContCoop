(function () {
  const SEED = 261112;
  const YEAR = 2026;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate() {
    const rnd = mulberry32(SEED);
    const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

    const monthKey = (m) => `${YEAR}-${String(m + 1).padStart(2, '0')}`;
    const isoDate = (m, d) => `${YEAR}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    function businessDays(m) {
      const days = [];
      const last = new Date(Date.UTC(YEAR, m + 1, 0)).getUTCDate();
      for (let d = 1; d <= last; d++) {
        const dow = new Date(Date.UTC(YEAR, m, d)).getUTCDay();
        if (dow >= 1 && dow <= 5) days.push(d);
      }
      return days;
    }

    function lastBusinessDay(m) {
      const days = businessDays(m);
      return days[days.length - 1];
    }

    function nextBusinessDay(m, d) {
      let day = d;
      while (true) {
        const dow = new Date(Date.UTC(YEAR, m, day)).getUTCDay();
        if (dow >= 1 && dow <= 5) return day;
        day++;
      }
    }

    const ACCOUNT_DEFS = [
      ['Caja', 'activo'],
      ['Banco', 'activo'],
      ['Deudores por ventas', 'activo'],
      ['Stock de trigo', 'activo'],
      ['Producción en proceso', 'activo'],
      ['Stock de harinas', 'activo'],
      ['Stock de subproductos', 'activo'],
      ['Stock de raciones', 'activo'],
      ['Stock de harina de maíz', 'activo'],
      ['Stock de polenta', 'activo'],
      ['Stock de gofio', 'activo'],
      ['Stock de avena', 'activo'],
      ['Stock de maíz', 'activo'],
      ['Stock de chicharrón', 'activo'],
      ['Stock de grasa', 'activo'],
      ['Stock de margarina', 'activo'],
      ['Stock de envases', 'activo'],
      ['Anticipos de retorno a socios', 'activo'],
      ['Molino y cilindros', 'activo'],
      ['Camión de reparto', 'activo'],
      ['Muebles y útiles', 'activo'],
      ['Herramientas de mantenimiento', 'activo'],
      ['Seguros pagados por anticipado', 'activo'],
      ['Anticipos a proveedores', 'activo'],
      ['Depósitos en garantía', 'activo'],
      ['Proveedores de trigo', 'pasivo'],
      ['Proveedores de otros productos', 'pasivo'],
      ['Acreedores varios', 'pasivo'],
      ['Cargas sociales a pagar', 'pasivo'],
      ['Sueldos a pagar', 'pasivo'],
      ['Previsión para deudores', 'pasivo'],
      ['Préstamos bancarios', 'pasivo'],
      ['Honorarios contador a pagar', 'pasivo'],
      ['Intereses a pagar', 'pasivo'],
      ['Capital social', 'patrimonio'],
      ['Reserva legal', 'patrimonio'],
      ['Fondo de educación cooperativa', 'patrimonio'],
      ['Resultados acumulados', 'patrimonio'],
      ['Resultado del ejercicio', 'patrimonio'],
      ['Ajustes de capital', 'patrimonio'],
      ['Ventas de harinas', 'ingreso'],
      ['Ventas de raciones', 'ingreso'],
      ['Ventas de subproductos', 'ingreso'],
      ['Ventas de otros productos', 'ingreso'],
      ['Ingresos por servicios de molienda', 'ingreso'],
      ['Otros ingresos', 'ingreso'],
      ['Subsidios recibidos', 'ingreso'],
      ['Sueldos y jornales', 'gasto'],
      ['Energía eléctrica', 'gasto'],
      ['Servicio de carga y descarga', 'gasto'],
      ['Fletes', 'gasto'],
      ['Mantenimiento de molino', 'gasto'],
      ['Combustible camión', 'gasto'],
      ['Seguros', 'gasto'],
      ['Amortización molino', 'gasto'],
      ['Amortización camión', 'gasto'],
      ['Gastos administrativos', 'gasto'],
      ['Gastos bancarios', 'gasto'],
      ['Costo de venta de harinas', 'gasto'],
      ['Costo de venta de raciones', 'gasto'],
      ['Costo de venta de subproductos', 'gasto'],
      ['Merma y pérdidas', 'gasto'],
      ['Gastos varios', 'gasto'],
      ['Viáticos y movilidad', 'gasto'],
      ['Comunicaciones', 'gasto'],
      ['Limpieza', 'gasto'],
      ['Honorarios técnicos', 'gasto'],
      ['Contribuciones cooperativas', 'gasto'],
      ['Capacitación cooperativista', 'gasto'],
      ['Insumos de laboratorio', 'gasto'],
      ['Gastos de asamblea', 'gasto']
    ].slice(0, 65);

    const accounts = ACCOUNT_DEFS.map((a, i) => ({
      code: String(i + 1).padStart(2, '0'),
      name: a[0],
      type: a[1]
    }));

    const settings = {
      nightSurchargePercent: 20,
      energyCostPerKiloCents: 85,
      wheatReferenceCents: 1140,
      partnerRateCents: 5000,
      reservePercent: 20,
      educationPercent: 5,
      shiftCapacityKg: 12000,
      adminPass: 'molino2026'
    };

    const products = [
      { key: 'h000', name: 'Harina 000', type: 'harina', yield: 0.52, priceCents: 2800, account: 'Stock de harinas' },
      { key: 'h0000', name: 'Harina 0000', type: 'harina', yield: 0.14, priceCents: 3400, account: 'Stock de harinas' },
      { key: 'h00', name: 'Harina 00', type: 'harina', yield: 0.03, priceCents: 2600, account: 'Stock de harinas' },
      { key: 'h0', name: 'Harina 0', type: 'harina', yield: 0.03, priceCents: 2200, account: 'Stock de harinas' },
      { key: 'hint', name: 'Harina integral', type: 'harina', yield: 0.02, priceCents: 3000, account: 'Stock de harinas' },
      { key: 'salvado', name: 'Salvado', type: 'subproducto', yield: 0.20, priceCents: 900, account: 'Stock de subproductos' },
      { key: 'germen', name: 'Germen de trigo', type: 'subproducto', yield: 0.02, priceCents: 4500, account: 'Stock de subproductos' },
      { key: 'merma', name: 'Merma', type: 'merma', yield: 0.04, priceCents: 0, account: null }
    ];

    const otherProducts = [
      'Harina de maíz', 'Polenta', 'Gofio', 'Avena', 'Maíz',
      'Ración para vacas lecheras', 'Ración para equinos', 'Ración para ovinos',
      'Chicharrón', 'Grasa', 'Margarina', 'Bolsas de 1 kg', 'Bolsas de 25 kg', 'Bolsas de 50 kg'
    ];

    const firstNames = [
      'María', 'Juan', 'Ana', 'Carlos', 'Lucía', 'José', 'Fernanda', 'Antonio', 'Valeria', 'Pedro',
      'Camila', 'Diego', 'Sofía', 'Martín', 'Julia', 'Ricardo', 'Elena', 'Hugo', 'Paula', 'Andrés',
      'Marta', 'Gustavo', 'Verónica', 'Álvaro', 'Cecilia', 'Nicolás', 'Silvia', 'Emilio', 'Lourdes', 'Sebastián',
      'Gabriela', 'Mauricio', 'Inés'
    ];

    const lastNames = [
      'Barrios', 'Techera', 'Ramírez', 'Alves', 'Sosa', 'Olivera', 'González', 'Méndez', 'Fagúndez', 'Alonso',
      'Ríos', 'Viera', 'Aguilar', 'Machado', 'Suárez', 'Fernández', 'Cabrera', 'Godoy', 'Pereira', 'Bentancur',
      'Cardozo', 'Lemos', 'Vázquez', 'Cúneo', 'Zabaleta', 'Iglesias', 'Mesa', 'Ramos', 'Cúparo', 'Silveira'
    ];

    const partners = [];
    for (let i = 0; i < 33; i++) {
      partners.push({
        id: `P${String(i + 1).padStart(2, '0')}`,
        name: `${firstNames[i % firstNames.length]} ${lastNames[(i * 7) % lastNames.length]}`,
        role: 'Socio'
      });
    }

    const employees = [];
    for (let i = 0; i < 12; i++) {
      employees.push({
        id: `EMP${String(i + 1).padStart(2, '0')}`,
        name: `${firstNames[(i + 11) % firstNames.length]} ${lastNames[(i * 5 + 3) % lastNames.length]}`,
        role: 'Empleado no socio',
        salaryCents: 3500000
      });
    }

    const clientDefs = [
      { label: 'Panadería', account: 'Ventas de harinas' },
      { label: 'Almacén', account: 'Ventas de otros productos' },
      { label: 'Productor lechero', account: 'Ventas de raciones' },
      { label: 'Escuela rural', account: 'Ventas de harinas' }
    ];

    const clientBases = [
      'La Espiga', 'El Trigal', 'San Martín', 'La Cuchilla', 'El Amanecer', 'La Florida', 'Los Sauces', 'El Ceibo',
      'La Calandria', 'El Hornero', 'La Cosecha', 'El Molino Viejo', 'Las Totoras', 'El Bagual', 'La Querencia', 'El Ombú'
    ];

    const clients = [];
    for (let i = 0; i < 70; i++) {
      const def = clientDefs[i % clientDefs.length];
      clients.push({
        id: `C${String(i + 1).padStart(2, '0')}`,
        name: `${def.label} ${clientBases[i % clientBases.length]} ${String(i + 1).padStart(2, '0')}`,
        type: def.label,
        account: def.account
      });
    }

    const entries = [];
    let entrySeq = 0;

    function addEntry({ date, concept, lines, source, status = 'confirmed', reversalOf = null, reversedBy = null }) {
      const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
      if (lines.length < 2 || debit !== credit || debit <= 0) {
        throw new Error(`Asiento inválido: ${concept}`);
      }
      entrySeq += 1;
      const id = `E${String(entrySeq).padStart(4, '0')}`;
      entries.push({
        id,
        number: status === 'confirmed' ? entrySeq : null,
        date,
        concept,
        lines,
        status,
        source: source || 'seed',
        reversalOf,
        reversedBy
      });
      return id;
    }

    addEntry({
      date: isoDate(0, 2),
      concept: 'Aporte inicial de capital',
      lines: [
        { account: 'Banco', debit: 300000000, credit: 0 },
        { account: 'Capital social', debit: 0, credit: 300000000 }
      ],
      source: 'apertura'
    });

    const hours = [];
    const advances = [];
    const rate = settings.partnerRateCents;

    for (let m = 0; m < 10; m++) {
      for (let p = 0; p < partners.length; p++) {
        let day;
        let night;
        let extra;
        let status = 'approved';

        if (p === 0) {
          day = 144;
          night = 40;
          extra = 0;
        } else if (p === 1 && m === 2) {
          day = 160;
          night = 40;
          extra = 20;
          status = 'blocked';
        } else if (p === 1) {
          day = 150;
          night = 34;
          extra = 10;
        } else {
          day = int(120, 170);
          const maxNight = Math.max(0, 184 - day);
          night = int(0, Math.min(40, maxNight));
          extra = int(0, 24);
          if (day + night + extra > 208) {
            extra = Math.max(0, 208 - day - night);
          }
        }

        hours.push({
          partnerId: partners[p].id,
          month: monthKey(m),
          day,
          night,
          extra,
          status
        });

        if (m < 7) {
          const amount = status === 'blocked'
            ? 0
            : (day * rate) + (extra * rate) + Math.round(night * rate * (100 + settings.nightSurchargePercent) / 100);

          advances.push({
            id: `ADV-${monthKey(m)}-${partners[p].id}`,
            partnerId: partners[p].id,
            month: monthKey(m),
            amountCents: amount,
            status: status === 'blocked' ? 'blocked' : 'paid'
          });
        }
      }
    }

    function allocateSeed(totalCostCents, items) {
      const vals = items.map((item) => {
        const prod = products.find((p) => p.key === item.product);
        return {
          ...item,
          valueCents: item.kilos * (prod ? prod.priceCents : 0)
        };
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

    const millings = [];
    const monthlyWheat = {};
    const monthlyEnergy = {};
    const perMonth = [13, 13, 13, 13, 13, 13, 12];
    let millingSeq = 0;

    for (let m = 0; m < 7; m++) {
      const days = businessDays(m);

      for (let k = 0; k < perMonth[m]; k++) {
        millingSeq += 1;
        const day = days[k];
        const shift = k % 3;
        const wheatKilos = 12000;
        const wheatCostCents = wheatKilos * settings.wheatReferenceCents;
        const energyCostCents = wheatKilos * settings.energyCostPerKiloCents;
        const totalCostCents = wheatCostCents + energyCostCents;

        const outputItems = products
          .filter((p) => p.key !== 'merma')
          .map((p) => ({ product: p.key, kilos: Math.floor(wheatKilos * p.yield) }));

        const sumOutputs = outputItems.reduce((s, o) => s + o.kilos, 0);
        const mermaKilos = wheatKilos - sumOutputs;
        const costLines = allocateSeed(totalCostCents, outputItems);

        const debitByAccount = {};
        costLines.forEach((cl) => {
          const prod = products.find((p) => p.key === cl.product);
          if (prod && prod.account && cl.costCents > 0) {
            debitByAccount[prod.account] = (debitByAccount[prod.account] || 0) + cl.costCents;
          }
        });

        const lines = [];
        Object.entries(debitByAccount).forEach(([account, amount]) => {
          if (amount > 0) lines.push({ account, debit: amount, credit: 0 });
        });
        lines.push({ account: 'Stock de trigo', debit: 0, credit: wheatCostCents });
        lines.push({ account: 'Energía eléctrica', debit: 0, credit: energyCostCents });

        const entryId = addEntry({
          date: isoDate(m, day),
          concept: `Molienda ${String(millingSeq).padStart(3, '0')} turno ${shift + 1}`,
          lines,
          source: `molienda:${millingSeq}`
        });

        millings.push({
          id: `M${String(millingSeq).padStart(3, '0')}`,
          date: isoDate(m, day),
          shift,
          wheatKilos,
          wheatCostCents,
          energyCostCents,
          totalCostCents,
          outputs: costLines.map((cl) => ({
            product: cl.product,
            kilos: cl.kilos,
            valueCents: cl.valueCents,
            costCents: cl.costCents
          })),
          mermaKilos,
          entryId
        });

        monthlyWheat[monthKey(m)] = (monthlyWheat[monthKey(m)] || 0) + wheatCostCents;
        monthlyEnergy[monthKey(m)] = (monthlyEnergy[monthKey(m)] || 0) + energyCostCents;
      }
    }

    for (let m = 0; m < 7; m++) {
      const day = lastBusinessDay(m);

      if (monthlyWheat[monthKey(m)]) {
        addEntry({
          date: isoDate(m, day),
          concept: `Compra de trigo ${MONTHS[m]}`,
          lines: [
            { account: 'Stock de trigo', debit: monthlyWheat[monthKey(m)], credit: 0 },
            { account: 'Proveedores de trigo', debit: 0, credit: monthlyWheat[monthKey(m)] }
          ],
          source: 'compra-trigo'
        });
      }

      if (monthlyEnergy[monthKey(m)]) {
        addEntry({
          date: isoDate(m, day),
          concept: `Energía eléctrica ${MONTHS[m]}`,
          lines: [
            { account: 'Energía eléctrica', debit: monthlyEnergy[monthKey(m)], credit: 0 },
            { account: 'Banco', debit: 0, credit: monthlyEnergy[monthKey(m)] }
          ],
          source: 'energia'
        });
      }
    }

    for (let i = 0; i < 70; i++) {
      const m = i % 10;
      const days = businessDays(m);
      const day = days[(i * 3) % days.length];
      const client = clients[i];
      const amountCents = (120000 + int(0, 180000)) * 100;

      addEntry({
        date: isoDate(m, day),
        concept: `Venta ${client.name}`,
        lines: [
          { account: 'Deudores por ventas', debit: amountCents, credit: 0 },
          { account: client.account, debit: 0, credit: amountCents }
        ],
        source: 'venta'
      });
    }

    for (let i = 0; i < 28; i++) {
      const m = 2 + (i % 8);
      const days = businessDays(m);
      const day = days[(i * 5) % days.length];
      const client = clients[(i * 9) % clients.length];
      const amountCents = (60000 + int(0, 90000)) * 100;

      addEntry({
        date: isoDate(m, day),
        concept: `Cobranza ${client.name}`,
        lines: [
          { account: 'Banco', debit: amountCents, credit: 0 },
          { account: 'Deudores por ventas', debit: 0, credit: amountCents }
        ],
        source: 'cobranza'
      });
    }

    for (let m = 0; m < 7; m++) {
      const day = lastBusinessDay(m);
      const total = employees.length * 3500000;

      addEntry({
        date: isoDate(m, day),
        concept: `Sueldos y jornales ${MONTHS[m]}`,
        lines: [
          { account: 'Sueldos y jornales', debit: total, credit: 0 },
          { account: 'Banco', debit: 0, credit: total }
        ],
        source: 'sueldos'
      });
    }

    for (let m = 0; m < 7; m++) {
      const total = advances
        .filter((a) => a.month === monthKey(m) && a.status === 'paid')
        .reduce((s, a) => s + a.amountCents, 0);

      if (total > 0) {
        const payDate = nextBusinessDay(m + 1, 8);
        addEntry({
          date: isoDate(m + 1, payDate),
          concept: `Anticipos de retorno ${MONTHS[m]}`,
          lines: [
            { account: 'Anticipos de retorno a socios', debit: total, credit: 0 },
            { account: 'Banco', debit: 0, credit: total }
          ],
          source: 'anticipos'
        });
      }
    }

    const expenseAccounts = [
      'Servicio de carga y descarga',
      'Fletes',
      'Mantenimiento de molino',
      'Combustible camión',
      'Seguros',
      'Gastos administrativos',
      'Gastos bancarios',
      'Gastos varios',
      'Viáticos y movilidad',
      'Comunicaciones'
    ];

    for (let i = 0; i < 41; i++) {
      const m = i % 10;
      const days = businessDays(m);
      const day = days[(i * 7) % days.length];
      const account = expenseAccounts[i % expenseAccounts.length];
      const amountCents = (5000 + int(0, 25000)) * 100;
      const creditAccount = i % 3 === 0 ? 'Caja' : 'Banco';

      addEntry({
        date: isoDate(m, day),
        concept: `Pago ${account.toLowerCase()} ${String(i + 1).padStart(2, '0')}`,
        lines: [
          { account, debit: amountCents, credit: 0 },
          { account: creditAccount, debit: 0, credit: amountCents }
        ],
        source: 'gastos'
      });
    }

    const originalId = addEntry({
      date: isoDate(7, 10),
      concept: 'Compra de útiles administrativos',
      lines: [
        { account: 'Gastos administrativos', debit: 850000, credit: 0 },
        { account: 'Banco', debit: 0, credit: 850000 }
      ],
      source: 'ejemplo-reversion'
    });

    const reversalId = addEntry({
      date: isoDate(7, 11),
      concept: 'Reversión: Compra de útiles administrativos',
      lines: [
        { account: 'Gastos administrativos', debit: 0, credit: 850000 },
        { account: 'Banco', debit: 850000, credit: 0 }
      ],
      source: 'ejemplo-reversion',
      reversalOf: originalId
    });

    const originalEntry = entries.find((e) => e.id === originalId);
    if (originalEntry) originalEntry.reversedBy = reversalId;

    const closedMonths = [];
    for (let m = 0; m < 7; m++) closedMonths.push(monthKey(m));

    return {
      meta: {
        business: 'Cooperativa de Trabajo Molino Florida',
        seedVersion: '261112_v1',
        seed: SEED,
        updatedAt: Date.now(),
        counts: {
          entries: entries.length,
          millings: millings.length,
          partners: partners.length,
          employees: employees.length,
          clients: clients.length,
          closedMonths: closedMonths.length
        }
      },
      settings,
      closedMonths,
      accounts,
      products,
      otherProducts,
      partners,
      employees,
      clients,
      hours,
      advances,
      entries,
      millings
    };
  }

  window.ContCoopSeed = { generate };
})();
