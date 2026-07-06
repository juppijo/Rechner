/* =========================================================
   ORES Verbrauchsstatistik — Logik
   Liest ORES-Rapport (.xlsx) im Browser ein (SheetJS) und
   berechnet Tages-, Wochen- und Monatsverbrauch.
   Erwartete Spalten: Adresse, EAN, Jour, Consommation, Valeur, Unité
   ========================================================= */

(function () {
  "use strict";

  const CAT = {
    QH_IN: "Energie prélevée",
    QH_OUT: "Energie injectée",
    DAY_IN_PEAK: "Energie prélevée heures pleines",
    DAY_IN_OFF: "Energie prélevée heures creuses",
    DAY_OUT_PEAK: "Energie injectée heures pleines",
    DAY_OUT_OFF: "Energie injectée heures creuses",
  };

  const THEMES = ["dark-gold", "dark-copper", "dark-teal", "light"];

  const state = {
    model: null,
    view: "dashboard",
    selectedDay: null,   // 'YYYY-MM-DD'
    selectedWeek: null,  // monday key 'YYYY-MM-DD'
    selectedMonth: null, // 'YYYY-MM'
    selectedYear: null,  // 'YYYY'
    tableGranularity: "day",
    sort: { col: "key", dir: 1 },
    fileName: "",
    rawRows: new Map(),   // key: `${timestamp}|${Consommation}` -> raw row, merged across all loaded files
    loadedFiles: [],      // names of files loaded so far
    filters: { in: { total: true, peak: false, off: false }, out: { total: true, peak: false, off: false } },
    dayGranularity: "quarter",   // 'quarter' | 'hour'
    monthGranularity: "day",     // 'day' | 'week'
  };

  const charts = {};

  // ---------- Utility ----------
  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");

  // WICHTIG: Der ORES-Export enthält keine Zeitzone. SheetJS legt jeden
  // Excel-Zeitstempel so ab, dass die *UTC*-Felder des Date-Objekts das
  // tatsächliche Kalenderdatum/-uhrzeit des Zählers enthalten. Würden wir
  // stattdessen lokale Felder lesen (getFullYear(), getHours(), ...), hinge
  // das Ergebnis von der Zeitzone des Browsers ab — späte 15-Min-Werte am
  // Abend würden je nach Zeitzone in den nächsten Tag rutschen. Deshalb:
  // überall lesen mit getUTC*, überall bauen mit Date.UTC()/setUTC*, überall
  // anzeigen mit timeZone:"UTC". So bleibt das Ergebnis unabhängig vom
  // Rechner des Betrachters immer korrekt.
  function dateKey(d) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  function monthKey(d) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  }
  function keyToUTCDate(key) {
    const [y, m, day] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  function mondayOf(d) {
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (nd.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    nd.setUTCDate(nd.getUTCDate() - day);
    return nd;
  }
  function isoWeekNumber(d) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    const diff = (dt - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7);
    return 1 + Math.round(diff / 7);
  }
  function fmtNum(n, digits = 1) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function fmtKWh(n, digits = 1) {
    return `${fmtNum(n, digits)} kWh`;
  }
  function fmtDateDE(d, opts) {
    return d.toLocaleDateString("de-DE", { timeZone: "UTC", ...(opts || { day: "2-digit", month: "2-digit", year: "numeric" }) });
  }
  function fmtDateShort(d) {
    return d.toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  }
  function fmtTime(d) {
    return d.toLocaleTimeString("de-DE", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
  }
  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
  }

  // Applies the Bezug/Einspeisung selector — each side picks exactly ONE of
  // the 3 real Consommation categories (Gesamt / Spitzenzeit / Nebenzeit), so
  // values are never summed together and can't double-count. Works for day,
  // week AND month records since they all carry the same field names.
  function filteredBezug(rec) {
    let v = 0;
    if (state.filters.in.total) v += rec.prelevee || 0;
    if (state.filters.in.peak) v += rec.pleinesPrelevee || 0;
    if (state.filters.in.off) v += rec.creusesPrelevee || 0;
    return v;
  }
  function filteredEinspeisung(rec) {
    let v = 0;
    if (state.filters.out.total) v += rec.injectee || 0;
    if (state.filters.out.peak) v += rec.pleinesInjectee || 0;
    if (state.filters.out.off) v += rec.creusesInjectee || 0;
    return v;
  }

  function filterLabel(side) {
    const f = state.filters[side];
    const names = [];
    if (f.total) names.push("Gesamt");
    if (f.peak) names.push("Spitzenzeit");
    if (f.off) names.push("Nebenzeit");
    return names.length ? names.join(" + ") : "keine Auswahl";
  }

  function css(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // ---------- Parsing & model building ----------
  function buildModel(rows) {
    const valid = rows.filter(
      (r) => r && r.Consommation && r.Jour instanceof Date && !isNaN(r.Jour)
    );
    if (!valid.length) return null;

    const days = new Map();

    function dayRec(d) {
      const key = dateKey(d);
      if (!days.has(key)) {
        days.set(key, {
          key,
          date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
          prelevee: 0,
          injectee: 0,
          pleinesPrelevee: null,
          creusesPrelevee: null,
          pleinesInjectee: null,
          creusesInjectee: null,
          profilePrelevee: [],
          profileInjectee: [],
        });
      }
      return days.get(key);
    }

    let address = "";
    let ean = "";

    for (const r of valid) {
      if (!address && r.Adresse) address = r.Adresse;
      if (!ean && r.EAN) ean = r.EAN;
      const val = Number(r.Valeur) || 0;
      const rec = dayRec(r.Jour);
      switch (r.Consommation) {
        case CAT.QH_IN:
          rec.prelevee += val;
          rec.profilePrelevee.push({ t: r.Jour, v: val });
          break;
        case CAT.QH_OUT:
          rec.injectee += val;
          rec.profileInjectee.push({ t: r.Jour, v: val });
          break;
        case CAT.DAY_IN_PEAK:
          rec.pleinesPrelevee = (rec.pleinesPrelevee || 0) + val;
          break;
        case CAT.DAY_IN_OFF:
          rec.creusesPrelevee = (rec.creusesPrelevee || 0) + val;
          break;
        case CAT.DAY_OUT_PEAK:
          rec.pleinesInjectee = (rec.pleinesInjectee || 0) + val;
          break;
        case CAT.DAY_OUT_OFF:
          rec.creusesInjectee = (rec.creusesInjectee || 0) + val;
          break;
      }
    }

    const dayArr = Array.from(days.values()).sort((a, b) => a.date - b.date);
    dayArr.forEach((d) => {
      d.profilePrelevee.sort((a, b) => a.t - b.t);
      d.profileInjectee.sort((a, b) => a.t - b.t);
    });

    // Weeks (Mon-Sun)
    const weeksMap = new Map();
    dayArr.forEach((d) => {
      const mon = mondayOf(d.date);
      const key = dateKey(mon);
      if (!weeksMap.has(key)) {
        const sun = new Date(mon);
        sun.setUTCDate(sun.getUTCDate() + 6);
        weeksMap.set(key, {
          key,
          monday: mon,
          sunday: sun,
          isoWeek: isoWeekNumber(mon),
          prelevee: 0,
          injectee: 0,
          pleinesPrelevee: 0,
          creusesPrelevee: 0,
          pleinesInjectee: 0,
          creusesInjectee: 0,
          days: [],
        });
      }
      const w = weeksMap.get(key);
      w.prelevee += d.prelevee;
      w.injectee += d.injectee;
      w.pleinesPrelevee += d.pleinesPrelevee || 0;
      w.creusesPrelevee += d.creusesPrelevee || 0;
      w.pleinesInjectee += d.pleinesInjectee || 0;
      w.creusesInjectee += d.creusesInjectee || 0;
      w.days.push(d);
    });
    const weekArr = Array.from(weeksMap.values()).sort((a, b) => a.monday - b.monday);

    // Months
    const monthsMap = new Map();
    dayArr.forEach((d) => {
      const key = monthKey(d.date);
      if (!monthsMap.has(key)) {
        monthsMap.set(key, {
          key,
          label: monthLabel(key),
          prelevee: 0,
          injectee: 0,
          pleinesPrelevee: 0,
          creusesPrelevee: 0,
          pleinesInjectee: 0,
          creusesInjectee: 0,
          days: [],
        });
      }
      const m = monthsMap.get(key);
      m.prelevee += d.prelevee;
      m.injectee += d.injectee;
      m.pleinesPrelevee += d.pleinesPrelevee || 0;
      m.creusesPrelevee += d.creusesPrelevee || 0;
      m.pleinesInjectee += d.pleinesInjectee || 0;
      m.creusesInjectee += d.creusesInjectee || 0;
      m.days.push(d);
    });
    const monthArr = Array.from(monthsMap.values()).sort((a, b) => (a.key > b.key ? 1 : -1));

    // Years
    const yearsMap = new Map();
    dayArr.forEach((d) => {
      const key = String(d.date.getUTCFullYear());
      if (!yearsMap.has(key)) {
        yearsMap.set(key, {
          key,
          label: key,
          prelevee: 0,
          injectee: 0,
          pleinesPrelevee: 0,
          creusesPrelevee: 0,
          pleinesInjectee: 0,
          creusesInjectee: 0,
          days: [],
        });
      }
      const y = yearsMap.get(key);
      y.prelevee += d.prelevee;
      y.injectee += d.injectee;
      y.pleinesPrelevee += d.pleinesPrelevee || 0;
      y.creusesPrelevee += d.creusesPrelevee || 0;
      y.pleinesInjectee += d.pleinesInjectee || 0;
      y.creusesInjectee += d.creusesInjectee || 0;
      y.days.push(d);
    });
    const yearArr = Array.from(yearsMap.values()).sort((a, b) => (a.key > b.key ? 1 : -1));

    return { days: dayArr, weeks: weekArr, months: monthArr, years: yearArr, address, ean };
  }

  // ---------- File handling ----------
  // Rows are merged into a Map keyed by exact timestamp+category so loading
  // several monthly exports accumulates into one continuous dataset instead
  // of replacing it — re-loading the same file just overwrites the same keys.
  function readWorkbookRows(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read-failed"));
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: null }));
        } catch (ex) {
          reject(ex);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const err = $("#dzError");
    err.style.display = "none";
    err.textContent = "";

    let anyLoaded = false;
    for (const file of files) {
      try {
        const rows = await readWorkbookRows(file);
        const valid = rows.filter((r) => r && r.Consommation && r.Jour instanceof Date && !isNaN(r.Jour));
        if (!valid.length) {
          showError(`"${file.name}" enthält keine gültigen Verbrauchsdaten und wurde übersprungen.`);
          continue;
        }
        valid.forEach((r) => state.rawRows.set(`${r.Jour.getTime()}|${r.Consommation}`, r));
        if (!state.loadedFiles.includes(file.name)) state.loadedFiles.push(file.name);
        anyLoaded = true;
      } catch (ex) {
        console.error(ex);
        showError(`"${file.name}" konnte nicht verarbeitet werden. Ist es ein gültiger ORES-Rapport (.xlsx)?`);
      }
    }
    if (!anyLoaded && state.rawRows.size === 0) return;

    const model = buildModel(Array.from(state.rawRows.values()));
    if (!model) {
      showError("Keine gültigen Verbrauchsdaten gefunden. Erwartet werden die Spalten Adresse, EAN, Jour, Consommation, Valeur, Unité.");
      return;
    }
    state.model = model;
    state.selectedDay = dateKey(model.days[model.days.length - 1].date);
    state.selectedWeek = dateKey(mondayOf(model.days[model.days.length - 1].date));
    state.selectedMonth = monthKey(model.days[model.days.length - 1].date);
    state.selectedYear = String(model.days[model.days.length - 1].date.getUTCFullYear());

    updateFileNameTag();
    $("#dropZone").classList.add("hidden");
    $("#appMain").classList.remove("hidden");

    populatePickers();
    renderAll();
  }

  function updateFileNameTag() {
    const tag = $("#fileNameTag");
    const n = state.loadedFiles.length;
    tag.textContent = n === 1 ? state.loadedFiles[0] : `${n} Dateien geladen`;
    tag.title = state.loadedFiles.join(", ");
    tag.style.display = "inline";
    $("#resetFilesBtn").classList.toggle("hidden", n === 0);
  }

  function resetFiles() {
    state.rawRows.clear();
    state.loadedFiles = [];
    state.model = null;
    $("#fileNameTag").style.display = "none";
    $("#resetFilesBtn").classList.add("hidden");
    $("#appMain").classList.add("hidden");
    $("#dropZone").classList.remove("hidden");
    $("#fileInput").value = "";
  }

  function showError(msg) {
    const err = $("#dzError");
    err.textContent = msg;
    err.style.display = "block";
  }

  // ---------- Rendering: KPIs ----------
  function renderKPIs() {
    const { days } = state.model;
    const totalIn = days.reduce((s, d) => s + filteredBezug(d), 0);
    const totalOut = days.reduce((s, d) => s + filteredEinspeisung(d), 0);
    const net = totalIn - totalOut;
    const avgDay = totalIn / days.length;
    const maxDay = days.reduce((m, d) => (filteredBezug(d) > filteredBezug(m) ? d : m), days[0]);
    const minDay = days.reduce((m, d) => (filteredBezug(d) < filteredBezug(m) ? d : m), days[0]);
    const first = days[0].date, last = days[days.length - 1].date;

    const cards = [
      { label: `Netzbezug (${filterLabel("in")})`, value: fmtKWh(totalIn), sub: `${days.length} Tage` },
      { label: `Einspeisung (${filterLabel("out")})`, value: fmtKWh(totalOut), sub: totalOut > 0 ? "PV / Rückspeisung" : "keine Einspeisung" },
      { label: "Netto-Verbrauch", value: fmtKWh(net), sub: net >= 0 ? "Bezug > Einspeisung" : "Einspeisung > Bezug" },
      { label: "Ø Bezug / Tag", value: fmtKWh(avgDay), sub: `${fmtDateShort(first)} – ${fmtDateShort(last)}` },
      { label: "Spitzentag", value: fmtKWh(filteredBezug(maxDay)), sub: fmtDateDE(maxDay.date) },
      { label: "Schwächster Tag", value: fmtKWh(filteredBezug(minDay)), sub: fmtDateDE(minDay.date) },
    ];

    $("#kpiRow").innerHTML = cards
      .map(
        (c) => `<div class="kpi">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`
      )
      .join("");
  }

  // ---------- Chart helpers ----------
  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function lineOrBarDataset(labels, inData, outData, opts = {}) {
    const accent = css("--accent");
    const up = css("--up");
    const gridColor = css("--border");
    const textColor = css("--text-dim");
    return {
      type: opts.bar ? "bar" : "line",
      data: {
        labels,
        datasets: [
          {
            label: "Bezug",
            data: inData,
            borderColor: accent,
            backgroundColor: opts.bar ? accent : "transparent",
            pointRadius: opts.points === false ? 0 : 2,
            tension: 0.25,
            fill: opts.bar ? false : { target: "origin", above: accent + "22" },
            borderWidth: 2,
          },
          {
            label: "Einspeisung",
            data: outData,
            borderColor: up,
            backgroundColor: opts.bar ? up : "transparent",
            pointRadius: opts.points === false ? 0 : 2,
            tension: 0.25,
            fill: opts.bar ? false : { target: "origin", above: up + "1a" },
            borderWidth: 2,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "index", intersect: false },
        onClick: opts.onClick
          ? (evt, elements, chart) => {
              const points = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
              if (points.length) opts.onClick(points[0].index);
            }
          : undefined,
        onHover: opts.onClick
          ? (evt, elements) => {
              evt.native.target.style.cursor = elements.length ? "pointer" : "default";
            }
          : undefined,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtKWh(ctx.parsed.y, 2)}`,
            },
          },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 0, autoSkip: true } },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (v) => fmtNum(v, 0) },
            title: { display: true, text: "kWh", color: textColor },
          },
        },
      },
    };
  }

  function peakDoughnut(id, peak, off, labelPeak = "Spitzenzeit", labelOff = "Nebenzeit") {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext("2d");
    const accent = css("--accent");
    const dim = css("--bg-panel-2");
    const textColor = css("--text-dim");
    charts[id] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: [labelPeak, labelOff],
        datasets: [{ data: [peak || 0, off || 0], backgroundColor: [accent, dim], borderWidth: 0 }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: textColor, boxWidth: 12, padding: 14 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmtKWh(ctx.parsed, 1)}` } },
        },
      },
    });
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const { days } = state.model;
    const labels = days.map((d) => fmtDateShort(d.date));
    const inData = days.map((d) => +filteredBezug(d).toFixed(3));
    const outData = days.map((d) => +filteredEinspeisung(d).toFixed(3));

    destroyChart("chartOverview");
    const cfg = lineOrBarDataset(labels, inData, outData, {
      points: false,
      onClick: (idx) => {
        state.selectedDay = days[idx].key;
        renderDay();
        setView("day");
      },
    });
    charts.chartOverview = new Chart($("#chartOverview").getContext("2d"), cfg);

    const totalPeak = days.reduce((s, d) => s + (d.pleinesPrelevee || 0), 0);
    const totalOff = days.reduce((s, d) => s + (d.creusesPrelevee || 0), 0);
    peakDoughnut("chartPeakDash", totalPeak, totalOff);

    const totalIn = days.reduce((s, d) => s + filteredBezug(d), 0);
    const totalOut = days.reduce((s, d) => s + filteredEinspeisung(d), 0);
    const selfRatio = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;
    const stats = [
      { label: "Anzahl Tage", value: days.length },
      { label: "Anzahl Wochen", value: state.model.weeks.length },
      { label: "Anzahl Monate", value: state.model.months.length },
      { label: "Spitzenanteil", value: `${fmtNum((totalPeak / (totalPeak + totalOff || 1)) * 100, 0)}%` },
      { label: "Einspeise-Quote", value: `${fmtNum(selfRatio, 0)}%` },
    ];
    $("#dashStats").innerHTML = stats
      .map((s) => `<div class="stat-chip"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div></div>`)
      .join("");
  }

  // ---------- Day view ----------
  function findDay(key) {
    return state.model.days.find((d) => d.key === key);
  }

  function renderDay() {
    const days = state.model.days;
    const picker = $("#dayPicker");
    picker.min = days[0].key;
    picker.max = days[days.length - 1].key;
    picker.value = state.selectedDay;

    const rec = findDay(state.selectedDay);
    $("#dayLabel").textContent = rec ? fmtDateDE(rec.date, { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "Keine Daten";

    destroyChart("chartDay");
    if (!rec || (!rec.profilePrelevee.length && !rec.profileInjectee.length)) {
      $("#dayStats").innerHTML = `<div class="stat-chip"><div class="sc-label">Hinweis</div><div class="sc-value">Keine 15-Min-Daten für diesen Tag</div></div>`;
      $("#dayFilterNote").classList.add("hidden");
      peakDoughnut("chartDayPeak", 0, 0);
      return;
    }

    const showIn = state.filters.in.total === true;
    const showOut = state.filters.out.total === true;

    let labels, inData, outData;
    if (state.dayGranularity === "hour") {
      labels = Array.from({ length: 24 }, (_, i) => `${pad2(i)}:00`);
      const inBuckets = new Array(24).fill(0);
      const outBuckets = new Array(24).fill(0);
      rec.profilePrelevee.forEach((p) => (inBuckets[p.t.getUTCHours()] += p.v));
      rec.profileInjectee.forEach((p) => (outBuckets[p.t.getUTCHours()] += p.v));
      inData = showIn ? inBuckets.map((v) => +v.toFixed(3)) : labels.map(() => 0);
      outData = showOut ? outBuckets.map((v) => +v.toFixed(3)) : labels.map(() => 0);
    } else {
      labels = rec.profilePrelevee.length
        ? rec.profilePrelevee.map((p) => fmtTime(p.t))
        : rec.profileInjectee.map((p) => fmtTime(p.t));
      inData = showIn ? rec.profilePrelevee.map((p) => +p.v.toFixed(3)) : labels.map(() => 0);
      outData = showOut ? rec.profileInjectee.map((p) => +p.v.toFixed(3)) : labels.map(() => 0);
    }

    const cfg = lineOrBarDataset(labels, inData, outData, { points: false });
    charts.chartDay = new Chart($("#chartDay").getContext("2d"), cfg);

    peakDoughnut("chartDayPeak", rec.pleinesPrelevee, rec.creusesPrelevee);

    const note = $("#dayFilterNote");
    const allActive =
      state.filters.in.total && !state.filters.in.peak && !state.filters.in.off &&
      state.filters.out.total && !state.filters.out.peak && !state.filters.out.off;
    note.classList.toggle("hidden", allActive);
    $("#dayLegendIn").textContent = `Bezug · ${filterLabel("in")}`;
    $("#dayLegendOut").textContent = `Einspeisung · ${filterLabel("out")}`;

    const maxInterval = rec.profilePrelevee.reduce((m, p) => (p.v > m.v ? p : m), rec.profilePrelevee[0] || { v: 0, t: null });
    const stats = [
      { label: `Bezug (${filterLabel("in")})`, value: fmtKWh(filteredBezug(rec), 2) },
      { label: `Einspeisung (${filterLabel("out")})`, value: fmtKWh(filteredEinspeisung(rec), 2) },
      { label: "Netto", value: fmtKWh(filteredBezug(rec) - filteredEinspeisung(rec), 2) },
      { label: "Spitzenlast (15 Min)", value: maxInterval.t ? `${fmtKWh(maxInterval.v, 2)} · ${fmtTime(maxInterval.t)}` : "–" },
      { label: "Spitzenzeit-Anteil", value: `${fmtNum(((rec.pleinesPrelevee || 0) / ((rec.pleinesPrelevee || 0) + (rec.creusesPrelevee || 0) || 1)) * 100, 0)}%` },
    ];
    $("#dayStats").innerHTML = stats
      .map((s) => `<div class="stat-chip"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div></div>`)
      .join("");
  }

  function shiftDay(delta) {
    const cur = keyToUTCDate(state.selectedDay);
    cur.setUTCDate(cur.getUTCDate() + delta);
    state.selectedDay = dateKey(cur);
    renderDay();
  }

  // ---------- Week view ----------
  function findWeek(key) {
    return state.model.weeks.find((w) => w.key === key);
  }

  function populatePickers() {
    const weekSel = $("#weekPicker");
    weekSel.innerHTML = state.model.weeks
      .map((w) => `<option value="${w.key}">KW ${w.isoWeek} · ${fmtDateShort(w.monday)} – ${fmtDateShort(w.sunday)}</option>`)
      .join("");
    weekSel.value = state.selectedWeek;

    const monthSel = $("#monthPicker");
    monthSel.innerHTML = state.model.months.map((m) => `<option value="${m.key}">${m.label}</option>`).join("");
    monthSel.value = state.selectedMonth;

    const yearSel = $("#yearPicker");
    yearSel.innerHTML = state.model.years.map((y) => `<option value="${y.key}">${y.label}</option>`).join("");
    yearSel.value = state.selectedYear;
  }

  function renderWeek() {
    const w = findWeek(state.selectedWeek);
    if (!w) return;
    $("#weekLabel").textContent = `KW ${w.isoWeek} · ${fmtDateDE(w.monday)} – ${fmtDateDE(w.sunday)}`;
    $("#weekPicker").value = w.key;

    const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const byWeekday = new Array(7).fill(null);
    w.days.forEach((d) => {
      const idx = (d.date.getUTCDay() + 6) % 7;
      byWeekday[idx] = d;
    });
    const labels = dayNames.map((n, i) => `${n} ${byWeekday[i] ? fmtDateShort(byWeekday[i].date) : ""}`);
    const inData = byWeekday.map((d) => (d ? +filteredBezug(d).toFixed(3) : 0));
    const outData = byWeekday.map((d) => (d ? +filteredEinspeisung(d).toFixed(3) : 0));

    destroyChart("chartWeek");
    const cfg = lineOrBarDataset(labels, inData, outData, {
      onClick: (idx) => {
        const d = byWeekday[idx];
        if (!d) return;
        state.selectedDay = d.key;
        renderDay();
        setView("day");
      },
    });
    charts.chartWeek = new Chart($("#chartWeek").getContext("2d"), cfg);

    peakDoughnut("chartWeekPeak", w.pleinesPrelevee, w.creusesPrelevee);

    const wIn = filteredBezug(w), wOut = filteredEinspeisung(w);
    const stats = [
      { label: `Bezug (${filterLabel("in")})`, value: fmtKWh(wIn, 1) },
      { label: `Einspeisung (${filterLabel("out")})`, value: fmtKWh(wOut, 1) },
      { label: "Netto", value: fmtKWh(wIn - wOut, 1) },
      { label: "Ø Bezug / Tag", value: fmtKWh(wIn / w.days.length, 1) },
      { label: "Tage erfasst", value: w.days.length },
    ];
    $("#weekStats").innerHTML = stats
      .map((s) => `<div class="stat-chip"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div></div>`)
      .join("");
  }

  function shiftWeek(delta) {
    const idx = state.model.weeks.findIndex((w) => w.key === state.selectedWeek);
    const next = idx + delta;
    if (next >= 0 && next < state.model.weeks.length) {
      state.selectedWeek = state.model.weeks[next].key;
      renderWeek();
    }
  }

  // ---------- Month view ----------
  function findMonth(key) {
    return state.model.months.find((m) => m.key === key);
  }

  function renderMonth() {
    const m = findMonth(state.selectedMonth);
    if (!m) return;
    $("#monthLabel").textContent = m.label;
    $("#monthPicker").value = m.key;

    destroyChart("chartMonth");
    const hint = $("#monthClickHint");

    if (state.monthGranularity === "week") {
      const weeksInMonth = state.model.weeks
        .map((w) => {
          const daysInMonth = w.days.filter((d) => monthKey(d.date) === m.key);
          if (!daysInMonth.length) return null;
          return {
            week: w,
            inSum: daysInMonth.reduce((s, d) => s + filteredBezug(d), 0),
            outSum: daysInMonth.reduce((s, d) => s + filteredEinspeisung(d), 0),
          };
        })
        .filter(Boolean);

      const labels = weeksInMonth.map((x) => `KW ${x.week.isoWeek}`);
      const inData = weeksInMonth.map((x) => +x.inSum.toFixed(3));
      const outData = weeksInMonth.map((x) => +x.outSum.toFixed(3));

      const cfg = lineOrBarDataset(labels, inData, outData, {
        onClick: (idx) => {
          state.selectedWeek = weeksInMonth[idx].week.key;
          renderWeek();
          setView("week");
        },
      });
      charts.chartMonth = new Chart($("#chartMonth").getContext("2d"), cfg);
      hint.textContent = "Klick auf einen Punkt öffnet die Woche";
    } else {
      const sortedDays = m.days.slice().sort((a, b) => a.date - b.date);
      const labels = sortedDays.map((d) => fmtDateShort(d.date));
      const inData = sortedDays.map((d) => +filteredBezug(d).toFixed(3));
      const outData = sortedDays.map((d) => +filteredEinspeisung(d).toFixed(3));

      const cfg = lineOrBarDataset(labels, inData, outData, {
        onClick: (idx) => {
          state.selectedDay = sortedDays[idx].key;
          renderDay();
          setView("day");
        },
      });
      charts.chartMonth = new Chart($("#chartMonth").getContext("2d"), cfg);
      hint.textContent = "Klick auf einen Punkt öffnet den Tag";
    }

    peakDoughnut("chartMonthPeak", m.pleinesPrelevee, m.creusesPrelevee);

    const mIn = filteredBezug(m), mOut = filteredEinspeisung(m);
    const stats = [
      { label: `Bezug (${filterLabel("in")})`, value: fmtKWh(mIn, 1) },
      { label: `Einspeisung (${filterLabel("out")})`, value: fmtKWh(mOut, 1) },
      { label: "Netto", value: fmtKWh(mIn - mOut, 1) },
      { label: "Ø Bezug / Tag", value: fmtKWh(mIn / m.days.length, 1) },
      { label: "Tage erfasst", value: m.days.length },
    ];
    $("#monthStats").innerHTML = stats
      .map((s) => `<div class="stat-chip"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div></div>`)
      .join("");
  }

  function shiftMonth(delta) {
    const idx = state.model.months.findIndex((m) => m.key === state.selectedMonth);
    const next = idx + delta;
    if (next >= 0 && next < state.model.months.length) {
      state.selectedMonth = state.model.months[next].key;
      renderMonth();
    }
  }

  // ---------- Year view ----------
  function findYear(key) {
    return state.model.years.find((y) => y.key === key);
  }

  function renderYear() {
    const y = findYear(state.selectedYear);
    if (!y) return;
    $("#yearLabel").textContent = y.label;
    $("#yearPicker").value = y.key;

    const monthsInYear = state.model.months.filter((m) => m.key.startsWith(y.key + "-"));
    const labels = monthsInYear.map((m) => m.label.split(" ")[0]);
    const inData = monthsInYear.map((m) => +filteredBezug(m).toFixed(3));
    const outData = monthsInYear.map((m) => +filteredEinspeisung(m).toFixed(3));

    destroyChart("chartYear");
    const cfg = lineOrBarDataset(labels, inData, outData, {
      onClick: (idx) => {
        state.selectedMonth = monthsInYear[idx].key;
        renderMonth();
        setView("month");
      },
    });
    charts.chartYear = new Chart($("#chartYear").getContext("2d"), cfg);

    peakDoughnut("chartYearPeak", y.pleinesPrelevee, y.creusesPrelevee);

    const yIn = filteredBezug(y), yOut = filteredEinspeisung(y);
    const stats = [
      { label: `Bezug (${filterLabel("in")})`, value: fmtKWh(yIn, 0) },
      { label: `Einspeisung (${filterLabel("out")})`, value: fmtKWh(yOut, 0) },
      { label: "Netto", value: fmtKWh(yIn - yOut, 0) },
      { label: "Ø Bezug / Tag", value: fmtKWh(yIn / y.days.length, 1) },
      { label: "Monate erfasst", value: monthsInYear.length },
      { label: "Tage erfasst", value: y.days.length },
    ];
    $("#yearStats").innerHTML = stats
      .map((s) => `<div class="stat-chip"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div></div>`)
      .join("");
  }

  function shiftYear(delta) {
    const idx = state.model.years.findIndex((y) => y.key === state.selectedYear);
    const next = idx + delta;
    if (next >= 0 && next < state.model.years.length) {
      state.selectedYear = state.model.years[next].key;
      renderYear();
    }
  }

  // ---------- Table view ----------
  function tableRowsFor(gran) {
    if (gran === "day") {
      return state.model.days.map((d) => ({
        key: d.key,
        label: fmtDateDE(d.date),
        bezug: filteredBezug(d),
        einspeisung: filteredEinspeisung(d),
        netto: filteredBezug(d) - filteredEinspeisung(d),
        spitzenzeit: d.pleinesPrelevee || 0,
        nebenzeit: d.creusesPrelevee || 0,
      }));
    }
    if (gran === "week") {
      return state.model.weeks.map((w) => ({
        key: w.key,
        label: `KW ${w.isoWeek} (${fmtDateShort(w.monday)}–${fmtDateShort(w.sunday)})`,
        bezug: filteredBezug(w),
        einspeisung: filteredEinspeisung(w),
        netto: filteredBezug(w) - filteredEinspeisung(w),
        spitzenzeit: w.pleinesPrelevee,
        nebenzeit: w.creusesPrelevee,
      }));
    }
    if (gran === "month") {
      return state.model.months.map((m) => ({
        key: m.key,
        label: m.label,
        bezug: filteredBezug(m),
        einspeisung: filteredEinspeisung(m),
        netto: filteredBezug(m) - filteredEinspeisung(m),
        spitzenzeit: m.pleinesPrelevee,
        nebenzeit: m.creusesPrelevee,
      }));
    }
    return state.model.years.map((y) => ({
      key: y.key,
      label: y.label,
      bezug: filteredBezug(y),
      einspeisung: filteredEinspeisung(y),
      netto: filteredBezug(y) - filteredEinspeisung(y),
      spitzenzeit: y.pleinesPrelevee,
      nebenzeit: y.creusesPrelevee,
    }));
  }

  function tableCols() {
    return [
      { key: "label", label: "Zeitraum", num: false },
      { key: "bezug", label: `Bezug · ${filterLabel("in")} (kWh)`, num: true },
      { key: "einspeisung", label: `Einspeisung · ${filterLabel("out")} (kWh)`, num: true },
      { key: "netto", label: "Netto (kWh)", num: true },
      { key: "spitzenzeit", label: "Bezug Spitzenzeit (kWh)", num: true },
      { key: "nebenzeit", label: "Bezug Nebenzeit (kWh)", num: true },
    ];
  }

  function renderTable() {
    let rows = tableRowsFor(state.tableGranularity);
    const { col, dir } = state.sort;
    rows = rows.slice().sort((a, b) => {
      const va = a[col], vb = b[col];
      if (typeof va === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });

    $("#tableHead").innerHTML = tableCols().map(
      (c) => `<th data-col="${c.key}">${c.label} ${state.sort.col === c.key ? `<span class="sort-arrow">${state.sort.dir === 1 ? "▲" : "▼"}</span>` : ""}</th>`
    ).join("");

    $("#tableBody").innerHTML = rows
      .map(
        (r) => `<tr>
        <td>${r.label}</td>
        <td class="num">${fmtNum(r.bezug, 2)}</td>
        <td class="num">${fmtNum(r.einspeisung, 2)}</td>
        <td class="num">${fmtNum(r.netto, 2)}</td>
        <td class="num">${fmtNum(r.spitzenzeit, 2)}</td>
        <td class="num">${fmtNum(r.nebenzeit, 2)}</td>
      </tr>`
      )
      .join("");

    $all("#tableHead th").forEach((th) =>
      th.addEventListener("click", () => {
        const key = th.dataset.col;
        if (state.sort.col === key) state.sort.dir *= -1;
        else state.sort = { col: key, dir: 1 };
        renderTable();
      })
    );
  }

  function exportCsv() {
    const rows = tableRowsFor(state.tableGranularity);
    const header = tableCols().map((c) => c.label).join(";");
    const lines = rows.map((r) =>
      [r.label, r.bezug.toFixed(3), r.einspeisung.toFixed(3), r.netto.toFixed(3), r.spitzenzeit.toFixed(3), r.nebenzeit.toFixed(3)]
        .join(";")
        .replace(/\./g, ",")
    );
    const csv = "\uFEFF" + [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ores_verbrauch_${state.tableGranularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- View switching ----------
  function renderAll() {
    renderKPIs();
    renderDashboard();
    renderDay();
    renderWeek();
    renderMonth();
    renderYear();
    renderTable();
  }

  function syncFilterChips() {
    $all(".filter-chip").forEach((chip) => {
      chip.classList.toggle("selected", !!state.filters[chip.dataset.group][chip.dataset.value]);
    });
  }

  function setView(view) {
    state.view = view;
    $all(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
    $all(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  }

  // ---------- Theme & fullscreen ----------
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ores_theme", theme);
    // Re-render charts so colors follow the CSS variables of the new theme
    if (state.model) renderAll();
  }

  function cycleTheme() {
    const cur = document.documentElement.dataset.theme;
    const idx = THEMES.indexOf(cur);
    applyTheme(THEMES[(idx + 1) % THEMES.length]);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      $("#appRoot").requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  // ---------- Init ----------
  function init() {
    if (typeof XLSX === "undefined" || typeof Chart === "undefined") {
      showError("Die Diagramm-/Excel-Bibliothek konnte nicht geladen werden (CDN nicht erreichbar). Bitte Internetverbindung prüfen und die Seite neu laden.");
    }

    const savedTheme = localStorage.getItem("ores_theme");
    if (savedTheme && THEMES.includes(savedTheme)) {
      document.documentElement.dataset.theme = savedTheme;
    }

    $("#fileInput").addEventListener("change", (e) => {
      processFiles(e.target.files);
    });
    $("#resetFilesBtn").addEventListener("click", resetFiles);

    const dz = $("#dropZone");
    ["dragenter", "dragover"].forEach((evt) =>
      dz.addEventListener(evt, (e) => {
        e.preventDefault();
        dz.classList.add("drag-over");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dz.addEventListener(evt, (e) => {
        e.preventDefault();
        dz.classList.remove("drag-over");
      })
    );
    dz.addEventListener("drop", (e) => {
      processFiles(e.dataTransfer.files);
    });

    $("#themeBtn").addEventListener("click", cycleTheme);
    $("#fullscreenBtn").addEventListener("click", toggleFullscreen);

    $all(".tab").forEach((t) => t.addEventListener("click", () => setView(t.dataset.view)));

    $all(".filter-chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        const group = state.filters[chip.dataset.group];
        group[chip.dataset.value] = !group[chip.dataset.value];
        syncFilterChips();
        if (state.model) renderAll();
      })
    );
    $("#filterReset").addEventListener("click", () => {
      state.filters = { in: { total: true, peak: false, off: false }, out: { total: true, peak: false, off: false } };
      syncFilterChips();
      if (state.model) renderAll();
    });

    $("#dayPrev").addEventListener("click", () => shiftDay(-1));
    $("#dayNext").addEventListener("click", () => shiftDay(1));
    $("#dayPicker").addEventListener("change", (e) => {
      state.selectedDay = e.target.value;
      renderDay();
    });

    $("#weekPrev").addEventListener("click", () => shiftWeek(-1));
    $("#weekNext").addEventListener("click", () => shiftWeek(1));
    $("#weekPicker").addEventListener("change", (e) => {
      state.selectedWeek = e.target.value;
      renderWeek();
    });

    $("#monthPrev").addEventListener("click", () => shiftMonth(-1));
    $("#monthNext").addEventListener("click", () => shiftMonth(1));
    $("#monthPicker").addEventListener("change", (e) => {
      state.selectedMonth = e.target.value;
      renderMonth();
    });

    $("#yearPrev").addEventListener("click", () => shiftYear(-1));
    $("#yearNext").addEventListener("click", () => shiftYear(1));
    $("#yearPicker").addEventListener("change", (e) => {
      state.selectedYear = e.target.value;
      renderYear();
    });

    $all("#dayGranToggle .gran-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.dayGranularity = btn.dataset.gran;
        $all("#dayGranToggle .gran-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderDay();
      })
    );
    $all("#monthGranToggle .gran-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.monthGranularity = btn.dataset.gran;
        $all("#monthGranToggle .gran-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderMonth();
      })
    );

    $("#tableGranularity").addEventListener("change", (e) => {
      state.tableGranularity = e.target.value;
      state.sort = { col: "key", dir: 1 };
      renderTable();
    });
    $("#exportCsvBtn").addEventListener("click", exportCsv);

    syncFilterChips();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
