/* ============================================================
   Dashboard Parque Lumínico - Alumbrado Público
   Carga datos desde GitHub Actions (datos_completos.json.gz)
   ============================================================ */

const DATA_URL = 'https://raw.githubusercontent.com/mondra73/script-GESU-MR/main/datos_completos.json.gz';

const BARRIOS = [
    ["Nuevo Alberdi", -32.87, -60.698], ["Alberdi", -32.894, -60.669], ["Parque Casas", -32.886, -60.681],
    ["La Florida", -32.879, -60.687], ["Villa Hortensia", -32.883, -60.696], ["Sorrento", -32.9, -60.674],
    ["Sarmiento", -32.908, -60.687], ["Empalme Graneros", -32.913, -60.704], ["Industrial", -32.902, -60.718],
    ["La Cerámica", -32.893, -60.729], ["Remanso Valerio", -32.878, -60.738], ["Antártida Argentina", -32.904, -60.744],
    ["Aeropuerto / Fisherton Norte", -32.888, -60.778], ["Fisherton", -32.925, -60.755], ["Santa Teresita", -32.916, -60.774],
    ["Hostal del Sol", -32.937, -60.769], ["Ludueña", -32.925, -60.702], ["Rucci", -32.935, -60.728],
    ["Belgrano", -32.942, -60.71], ["Godoy", -32.948, -60.732], ["Villa Urquiza", -32.933, -60.69],
    ["Triángulo", -32.92, -60.679], ["Azcuénaga", -32.928, -60.668], ["Echesortu", -32.945, -60.682],
    ["Larrea", -32.944, -60.665]
];

const nf = new Intl.NumberFormat("es-AR");
const pf = n => new Intl.NumberFormat("es-AR", { minimumFractionDigits: n < 10 ? 2 : 1, maximumFractionDigits: n < 10 ? 2 : 1 }).format(n);
const pf1 = n => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n);
const kwf = n => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n);

const tecOf = name => {
    const t = String(name).toLowerCase().trim();
    if (t.startsWith("led")) return 0;
    if (t.startsWith("sodio")) return 1;
    if (t.startsWith("mercurio halogenado")) return 2;
    if (t.startsWith("mercurio")) return 3;
    return 4;
};
const watts = s => { const m = String(s).match(/-\s*(\d+)\s*$/); return m ? +m[1] : 0; };

const TECS = [
    { k: 0, key: "LED", label: "LED", col: "#BFE3FF" }, { k: 1, key: "SOD", label: "Sodio", col: "#FFC168" },
    { k: 2, key: "MHX", label: "Mercurio halogenado", col: "#CFC6FF" }, { k: 3, key: "MER", label: "Mercurio", col: "#8FE7D2" },
    { k: 4, key: "OTR", label: "Otras", col: "#9AA8B8" }
];
const BINS = [
    { k: 0, label: "LED", col: "#BFE3FF" }, { k: 1, label: "Tecnología anterior", col: "#FFA94D" }
];

const MATS_COLUMNA = {
    "Acero": "#BFE3FF",
    "Hormigón": "#34D399",
    "Madera": "#FFC168",
    "default": "#9AA8B8"
};

let N = 0, NZ = 0, lat, lon, cls, stx, alt, tec, bar, tpo, yr, zon, PX, PY;
let zonas = [], zonaSel = 0;
let clases = [], calles = [], tipos = [], anios = [];
let clsTec = [], clsW = [], clsCount = [], data = [], streets = [], barrios = [];
let mode = "bin", joinMhx = false, active = new Set(["LED", "OLD", "SOD", "MER", "MHX", "OTR"]);
let on = [true, true, true, true, true];
let sideTab = "bar", query = "";
let stIdx = [], vcls = [];
let map = null, canvas = null, ctx = null, proj = null, mapReady = false, redraw = () => { };

const inZ = i => zonaSel === 0 || zon[i] === zonaSel;
const grp = i => mode === "bin" ? (tec[i] ? 1 : 0) : tec[i];
const colorOf = i => mode === "bin" ? BINS[grp(i)].col : TECS[tec[i]].col;
const visible = i => on[tec[i]];

/* ---------- Carga de datos desde GitHub ---------- */
let tipoSeleccionado = "Lámpara";

async function cargarDatos() {
    document.getElementById("src").textContent = "Descargando datos...";
    try {
        const resp = await fetch(DATA_URL);
        if (!resp.ok) throw new Error("Error HTTP " + resp.status);
        const buffer = await resp.arrayBuffer();
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
        const texto = await new Response(stream).text();
        const json = JSON.parse(texto);
        procesarJSON(json);
    } catch (e) {
        document.getElementById("src").textContent = "Error al cargar: " + e.message;
    } finally {
        // Asegurarse de que no quede "Cargando datos..."
        if (document.getElementById("src").textContent === "Descargando datos...") {
            document.getElementById("src").textContent = "";
        }
    }
}

function procesarJSON(json) {
    const datos = json.datos;
    const cMap = new Map(), sMap = new Map(), tMap = new Map(), ySet = new Set();
    const conteoTipos = { "Lámpara": 0, "Columna": 0, "Transversal": 0, "Tablero": 0 };
    const regs = [];

    datos.forEach(d => {
        const tipoEquip = (d["Tipo"] || "").trim();
        if (tipoSeleccionado !== "todas" && tipoEquip !== tipoSeleccionado) return;
        if (conteoTipos.hasOwnProperty(tipoEquip)) conteoTipos[tipoEquip]++;

        const cla = d["Clasificación"] || "", cal = d["Ubicación: Calle"] || "(sin calle)";
        const tip = d["Tipo de ubicación"] || "(sin dato)";
        const x = parseFloat(d["Ubicación: Coordenada X"]), y = parseFloat(d["Ubicación: Coordenada Y"]);
        if (isNaN(x) || isNaN(y)) return;
        if ((d["Estado"] || "").trim().toLowerCase() !== "en servicio") return;

        if (!cMap.has(cla)) cMap.set(cla, cMap.size);
        if (!sMap.has(cal)) sMap.set(cal, sMap.size);
        if (!tMap.has(tip)) tMap.set(tip, tMap.size);

        const fm = String(d["Fecha alta"] || "").match(/(\d{4})\s*$/);
        const ano = fm ? +fm[1] : 0;
        ySet.add(ano);

        const zm = String(d["Responsable"] || "").match(/zona\s*(\d+)/i);
        const zonaVal = zm ? +zm[1] : 0;

        const [la, lo] = gkInv(x, y);
        regs.push([la, lo, cMap.get(cla), sMap.get(cal), parseInt(d["Ubicación: Altura"]) || 0, tMap.get(tip), ano, zonaVal, tipoEquip]);
    });

    document.getElementById("src").textContent =
        "Actualizado: " + new Date(json.actualizado).toLocaleString("es-AR") + " · " + nf.format(json.total) + " registros" +
        (tipoSeleccionado !== "todas" ? " · " + nf.format(regs.length) + " " + tipoSeleccionado.toLowerCase() + "s" : "");

    clases = [...cMap.keys()]; calles = [...sMap.keys()]; tipos = [...tMap.keys()];
    anios = [...ySet].sort((a, b) => a - b);
    const aIdx = new Map(anios.map((a, i) => [a, i]));
    regs.forEach(r => r[6] = aIdx.get(r[6]) || 0);
    window.conteoTiposGlobal = conteoTipos;

    setDatos(regs);
}

function cambiarTipo(tipo) {
    tipoSeleccionado = tipo;
    document.getElementById("src").textContent = "Cargando...";
    fetch(DATA_URL)
        .then(r => r.arrayBuffer())
        .then(buffer => new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")))
        .then(stream => new Response(stream).text())
        .then(texto => {
            procesarJSON(JSON.parse(texto));
            if (mapReady) { renderLegend(); renderSide(); renderSearch(); redraw(); }
        })
        .catch(e => {
            document.getElementById("src").textContent = "Error al cargar: " + e.message;
        });
}

function setDatos(regs) {
    N = regs.length;
    lat = new Float64Array(N); lon = new Float64Array(N); cls = new Uint16Array(N); stx = new Uint16Array(N);
    alt = new Uint32Array(N); tec = new Uint8Array(N); bar = new Uint8Array(N);
    tpo = new Uint8Array(N); yr = new Uint8Array(N); zon = new Uint8Array(N);
    const tipoNombres = new Array(N);
    PX = new Float32Array(N); PY = new Float32Array(N);
    clsTec = clases.map(tecOf); clsW = clases.map(watts);
    const zs = new Set();
    for (let i = 0; i < N; i++) {
        const r = regs[i];
        lat[i] = r[0]; lon[i] = r[1]; cls[i] = r[2]; stx[i] = r[3]; alt[i] = r[4]; tpo[i] = r[5]; yr[i] = r[6]; zon[i] = r[7] || 0; tipoNombres[i] = r[8] || "";
        tec[i] = clsTec[cls[i]];
        if (zon[i]) zs.add(zon[i]);
    }
    zonas = [...zs].sort((a, b) => a - b);
    // Calcular conteo por tipo (después del filtro de zona, usando nombres reales)
    const conteoTipos = { "Lámpara": 0, "Columna": 0, "Transversal": 0, "Tablero": 0 };
    for (let i = 0; i < N; i++) {
        if (!inZ(i)) continue;
        const tn = tipoNombres[i];
        if (conteoTipos.hasOwnProperty(tn)) conteoTipos[tn]++;
    }
    window.conteoTiposGlobal = conteoTipos;
    index();
    renderZonas(); renderResumen();
}

function gkInv(E, Nn) {
    const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const arc = phi => a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * phi) + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * phi) - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * phi));
    const M0 = arc(-Math.PI / 2), x = E - 5500000, M = M0 + Nn;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(p1) ** 2, 1.5), D = x / N1;
    const la = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lo = -Math.PI / 3 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
    return [la * 180 / Math.PI, lo * 180 / Math.PI];
}

function index() {
    NZ = 0; clsCount = new Array(clases.length).fill(0);
    for (let i = 0; i < N; i++) { if (!inZ(i)) continue; clsCount[cls[i]]++; NZ++; }
    data = clases.map((c, i) => ({ clase: c, n: clsCount[i], tec: clsTec[i], w: clsW[i] })).filter(d => d.n > 0).sort((a, b) => b.n - a.n);
    streets = calles.map((nm, i) => ({ i, nm, led: 0, old: 0, tot: 0, la0: 90, la1: -90, lo0: 180, lo1: -180 }));
    barrios = BARRIOS.map((b, i) => ({ i, nm: b[0], la: b[1], lo: b[2], tot: 0, led: 0, old: 0, la0: 90, la1: -90, lo0: 180, lo1: -180, st: {} }));
    const kx = Math.cos(-32.91 * Math.PI / 180);
    for (let i = 0; i < N; i++) {
        if (!inZ(i)) continue;
        const s = streets[stx[i]]; s.tot++; tec[i] ? s.old++ : s.led++;
        if (lat[i] < s.la0) s.la0 = lat[i]; if (lat[i] > s.la1) s.la1 = lat[i]; if (lon[i] < s.lo0) s.lo0 = lon[i]; if (lon[i] > s.lo1) s.lo1 = lon[i];
        let best = 0, bd = Infinity;
        for (let b = 0; b < barrios.length; b++) { const dy = lat[i] - barrios[b].la, dx = (lon[i] - barrios[b].lo) * kx, d = dy * dy + dx * dx; if (d < bd) { bd = d; best = b; } }
        bar[i] = best; const B = barrios[best]; B.tot++; tec[i] ? B.old++ : B.led++;
        if (lat[i] < B.la0) B.la0 = lat[i]; if (lat[i] > B.la1) B.la1 = lat[i]; if (lon[i] < B.lo0) B.lo0 = lon[i]; if (lon[i] > B.lo1) B.lo1 = lon[i];
        if (tec[i]) B.st[stx[i]] = (B.st[stx[i]] || 0) + 1;
    }
    stIdx = calles.map(() => []);
    for (let i = 0; i < N; i++)if (inZ(i)) stIdx[stx[i]].push(i);
    barrios.forEach(B => { B.top = Object.entries(B.st).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => calles[k] + " (" + nf.format(v) + ")"); });
}

const oldKeys = () => joinMhx ? ["SOD", "MER", "OTR"] : ["SOD", "MHX", "MER", "OTR"];
const detailKeys = () => ["LED", ...oldKeys()];
const TECMAP = { LED: TECS[0], SOD: TECS[1], MHX: TECS[2], MER: TECS[3], OTR: TECS[4], OLD: { label: "Tecnología anterior", col: "#FFA94D" } };
const keyOf = t => ["LED", "SOD", "MHX", "MER", "OTR"][t];

function build(keys, assign) {
    return keys.map(k => {
        const rows = data.filter(r => assign(r) === k).sort((a, b) => b.n - a.n);
        return { k, label: TECMAP[k].label, c: TECMAP[k].col, n: rows.reduce((a, b) => a + b.n, 0), kw: rows.reduce((a, b) => a + b.n * b.w, 0) / 1000, rows };
    }).filter(g => g.n > 0).sort((a, b) => b.n - a.n);
}
const binGroups = () => build(["LED", "OLD"], r => r.tec === 0 ? "LED" : "OLD");
const detailGroups = () => build(detailKeys(), r => (joinMhx && r.tec === 2) ? "MER" : keyOf(r.tec));
const groups = () => mode === "bin" ? binGroups() : detailGroups();

function drawBar(host, segs, denom, size, split, title, note) {
    const block = document.createElement("div"); block.className = "bar-block";
    block.innerHTML = '<div class="bar-head"><span>' + title + '</span><span>' + note + '</span></div>';
    const b = document.createElement("div"); b.className = "bar " + size + (split ? " split" : "");
    segs.forEach(g => {
        const p = g.n / denom * 100, d = document.createElement("div");
        d.className = "seg" + (p < (size === "tall" ? 7 : 11) ? " tiny" : "");
        d.style.cssText = "flex:0 0 " + p + "%;color:" + g.c + ";background:" + g.c + ";box-shadow:0 0 26px -2px " + g.c + "66, inset 0 -14px 26px -14px " + g.c + ";";
        d.title = g.label + ": " + nf.format(g.n) + " (" + pf(p) + " %)";
        d.innerHTML = '<span class="seg-txt">' + g.label.toUpperCase() + '</span><span class="seg-pct">' + pf(p) + ' %</span>';
        b.appendChild(d);
    });
    block.appendChild(b); host.appendChild(block);
}

function renderResumen() {
    const gs = groups(), total = data.reduce((a, b) => a + b.n, 0), bin = binGroups();
    const esLampara = tipoSeleccionado === "Lámpara";
    const esTodas = tipoSeleccionado === "todas";
    const esColumna = tipoSeleccionado === "Columna";
    const ledG = bin.find(g => g.k === "LED") || { n: 0, kw: 0 }, oldG = bin.find(g => g.k === "OLD") || { n: 0, kw: 0, rows: [] };
    const oldDetail = build(oldKeys(), r => (joinMhx && r.tec === 2) ? "MER" : keyOf(r.tec));
    document.getElementById("total").textContent = nf.format(total);
    document.getElementById("totalSub").textContent = esLampara ? "Recambio a LED " + pf(ledG.n / total * 100) + " % · faltan " + nf.format(oldG.n) : "";
    document.getElementById("bars").parentElement.style.display = (esLampara || esTodas || esColumna) ? "" : "none";
    document.getElementById("cardsTitle").style.display = esLampara ? "" : "none";
    document.getElementById("cards").style.display = esLampara ? "" : "none";
    document.querySelector(".controls").style.display = esLampara ? "" : "none";
    document.querySelector(".tbl-wrap").style.display = esLampara ? "" : "none";
    document.getElementById("tabFaltantes").style.display = esLampara ? "" : "none";
    document.querySelector(".total-lbl").textContent = tipoSeleccionado === "todas" ? "Registros en servicio" : tipoSeleccionado + "s en servicio";
    document.querySelector(".ctlrow .modes:first-child").style.display = esLampara ? "" : "none";
    const bars = document.getElementById("bars");
    bars.innerHTML = "";

    if (esTodas) {
        // Contar tipos desde los datos ya filtrados
        const conteoZona = { "Lámpara": 0, "Columna": 0, "Transversal": 0, "Tablero": 0 };
        const tiposMap = { 0: "Lámpara", 1: "Columna", 2: "Transversal", 3: "Tablero" };
        // No tenemos el tipo directamente, pero podemos usar los datos de data
        // que ya están filtrados. Usemos el total y los conteos de la barra.
        // Alternativa: guardar el conteo en setDatos
        const tiposData = [
            { label: "Lámparas", n: window.conteoTiposGlobal ? (window.conteoTiposGlobal["Lámpara"] || 0) : 0, c: "#BFE3FF" },
            { label: "Columnas", n: window.conteoTiposGlobal ? (window.conteoTiposGlobal["Columna"] || 0) : 0, c: "#FFC168" },
            { label: "Transversales", n: window.conteoTiposGlobal ? (window.conteoTiposGlobal["Transversal"] || 0) : 0, c: "#8FE7D2" },
            { label: "Tableros", n: window.conteoTiposGlobal ? (window.conteoTiposGlobal["Tablero"] || 0) : 0, c: "#CFC6FF" }
        ].filter(t => t.n > 0);

        drawBar(bars, tiposData, total, "tall", true, "Composición por tipo de equipamiento", nf.format(total) + " registros = 100 %");
    } else if (esColumna) {
        // Barra de materiales para columnas
        const matData = data.map(d => {
            const mat = d.clase || "";
            const color = MATS_COLUMNA[mat] || MATS_COLUMNA["default"];
            return { label: mat, n: d.n, c: color };
        }).filter(d => d.n > 0).sort((a, b) => b.n - a.n);
        drawBar(bars, matData, total, "tall", true, "Composición por material", nf.format(total) + " columnas = 100 %");
    } else if (esLampara) {
        if (mode === "bin") {
            drawBar(bars, bin, total, "tall", true, "LED frente a tecnologías anteriores", nf.format(total) + " unidades = 100 %");
            drawBar(bars, oldDetail, oldG.n || 1, "short", false, "Desglose de las anteriores", nf.format(oldG.n) + " unidades = 100 %");
        } else {
            drawBar(bars, gs, total, "tall", false, "Composición por tecnología", nf.format(total) + " unidades = 100 %");
            drawBar(bars, bin, total, "short", true, "LED frente a tecnologías anteriores", nf.format(total) + " unidades = 100 %");
        }
    }
    document.getElementById("cardsTitle").textContent = mode === "bin" ? "Los dos grupos, y adentro cada tecnología anterior" : "Cada tecnología por separado";
    const cards = document.getElementById("cards"); cards.innerHTML = "";
    const list = mode === "bin" ? [...bin.map(g => ({ g, sub: false })), ...oldDetail.map(g => ({ g, sub: true }))] : gs.map(g => ({ g, sub: false }));
    list.forEach(({ g, sub }) => {
        const el = document.createElement("article"); el.className = "card" + (sub ? " sub" : ""); el.style.color = g.c;
        const share = (g.k !== "LED" && g.k !== "OLD") ? "<span>" + pf(g.n / (oldG.n || 1) * 100) + " % de las anteriores</span>" : "<span>" + g.rows.length + " clasif.</span>";
        el.innerHTML = '<div class="card-name"><i class="dot"></i>' + g.label + '</div><div><span class="card-n">' + nf.format(g.n) + '</span><span class="card-p">' + pf(g.n / total * 100) + ' %</span></div><div class="card-meta">' + share + '<span><b>' + (g.k === "LED" ? "—" : kwf(g.kw)) + '</b> kW</span></div>';
        cards.appendChild(el);
    });
    const chips = document.getElementById("chips"); chips.innerHTML = "";
    gs.forEach(g => {
        const b = document.createElement("button"); b.className = "chip"; b.style.color = g.c;
        b.setAttribute("aria-pressed", active.has(g.k)); b.innerHTML = "<span>" + g.label + "</span>";
        b.onclick = () => { active.has(g.k) ? active.delete(g.k) : active.add(g.k); if (!gs.some(x => active.has(x.k))) gs.forEach(x => active.add(x.k)); renderResumen(); };
        chips.appendChild(b);
    });
    const tb = document.getElementById("tbody"); tb.innerHTML = "";
    const shown = gs.filter(g => active.has(g.k)), max = Math.max(1, ...shown.flatMap(g => g.rows.map(r => r.n)));
    shown.forEach(g => {
        const inOld = g.k !== "LED" ? pf(g.n / (oldG.n || 1) * 100) + " % de anteriores" : "—";
        const hr = document.createElement("tr"); hr.className = "head-row";
        hr.innerHTML = '<td style="color:' + g.c + '"><span class="grp"><i class="dot"></i><span style="color:var(--ink)">' + g.label + '</span></span></td><td class="hide-sm muted">' + (g.k === "LED" ? "—" : kwf(g.kw) + ' kW') + '</td><td class="qty">' + nf.format(g.n) + '</td><td class="muted">' + pf(g.n / total * 100) + ' %</td><td class="hide-md muted">' + inOld + '</td><td class="pct-cell"></td>';
        tb.appendChild(hr);
        g.rows.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = '<td class="indent">' + r.clase + '</td><td class="hide-sm muted">' + (g.k === "LED" ? (r.w ? nf.format(r.w * 1000) + " lm" : "—") : (r.w ? r.w + " W" : "—")) + '</td><td>' + nf.format(r.n) + '</td><td class="muted">' + pf(r.n / total * 100) + ' %</td><td class="hide-md muted">' + pf(r.n / g.n * 100) + ' % de ' + g.label.toLowerCase() + '</td><td class="pct-cell"><div class="minibar" style="color:' + g.c + '"><i style="width:' + (r.n / max * 100).toFixed(2) + '%"></i></div></td>';
            tb.appendChild(tr);
        });
    });
    const sel = shown.reduce((a, b) => a + b.n, 0), shownOld = shown.filter(g => g.k !== "LED"), selKw = shownOld.reduce((a, b) => a + b.kw, 0), hayOld = shownOld.length > 0;
    renderMontaje(); renderFaltantes();
    document.getElementById("tfoot").innerHTML = '<td>Seleccionado</td><td class="hide-sm">' + (hayOld ? kwf(selKw) + ' kW' : "—") + '</td><td>' + nf.format(sel) + '</td><td>' + pf(sel / total * 100) + ' %</td><td class="hide-md"></td><td></td>';
}

function renderMontaje() {
    const total = NZ, agg = tipos.map(() => [0, 0]);
    for (let i = 0; i < N; i++)if (inZ(i)) agg[tpo[i]][tec[i] ? 1 : 0]++;
    const part = t => { const p = String(t).split(" - "); return { sop: (p[0] || "(sin dato)").replace(/^En\s+/, ""), amb: (p[1] || "—").replace(/^En\s+/, "") }; };
    const sop = new Map();
    tipos.forEach((t, i) => { const { so, amb } = part(t); if (!sop.has(so)) sop.set(so, { nm: so, led: 0, old: 0, hijos: [] }); const g = sop.get(so); g.led += agg[i][0]; g.old += agg[i][1]; if (agg[i][0] + agg[i][1] > 0) g.hijos.push({ nm: amb, led: agg[i][0], old: agg[i][1] }); });
    const grupos = [...sop.values()].filter(g => g.led + g.old > 0).sort((a, b) => (b.led + b.old) - (a.led + a.old));
    grupos.forEach(g => g.hijos.sort((a, b) => (b.led + b.old) - (a.led + a.old)));
    const tb = document.getElementById("mBody"); tb.innerHTML = "";
    const fila = (nm, led, old, cabecera) => {
        const tot = led + old, p = tot ? led / tot * 100 : 0, tr = document.createElement("tr");
        if (cabecera) tr.className = "head-row";
        tr.innerHTML = (cabecera ? '<td style="color:#BFE3FF"><span class="grp"><i class="dot"></i><span style="color:var(--ink)">' + nm + '</span></span></td>' : '<td class="indent">' + nm + '</td>') + '<td' + (cabecera ? ' class="qty"' : '') + '>' + nf.format(tot) + '</td><td class="muted">' + pf(tot / total * 100) + ' %</td><td style="color:#BFE3FF">' + nf.format(led) + '</td><td style="color:#FFA94D">' + nf.format(old) + '</td><td class="pct-cell"><div class="st-bar"><i style="width:' + p + '%;background:#BFE3FF"></i><i style="width:' + (100 - p) + '%;background:#FFA94D"></i></div><div class="st-meta"><span>' + pf1(p) + ' % LED</span><span></span></div></td>';
        return tr;
    };
    grupos.forEach(g => { tb.appendChild(fila(g.nm, g.led, g.old, true)); if (g.hijos.length > 1) g.hijos.forEach(h => tb.appendChild(fila(h.nm, h.led, h.old, false))); });
    const led = grupos.reduce((a, b) => a + b.led, 0), old = grupos.reduce((a, b) => a + b.old, 0);
    document.getElementById("mFoot").innerHTML = '<td>Total</td><td>' + nf.format(led + old) + '</td><td>100 %</td><td>' + nf.format(led) + '</td><td>' + nf.format(old) + '</td><td></td>';
}

function renderFaltantes() {
    const partSop = t => { const so = (String(t).split(" - ")[0] || "").replace(/^En\s+/, "").trim(); return so === "Transversal" ? "Transversal" : so === "Columna" ? "Columna" : "Otro"; };
    const partAmb = t => { const amb = (String(t).split(" - ")[1] || "").replace(/^En\s+/, "").trim(); if (amb === "Calle") return "Calle"; if (amb === "Espacios Verdes") return "Espacio Verde"; return "Otros"; };
    const cont = { Transversal: { Calle: 0, "Espacio Verde": 0, Otros: 0 }, Columna: { Calle: 0, "Espacio Verde": 0, Otros: 0 }, Otro: { Calle: 0, "Espacio Verde": 0, Otros: 0 } };
    for (let i = 0; i < N; i++) { if (!inZ(i) || !tec[i]) continue; const t = tipos[tpo[i]]; cont[partSop(t)][partAmb(t)]++; }
    const rowTot = so => cont[so].Calle + cont[so]["Espacio Verde"] + cont[so].Otros;
    const total = rowTot("Transversal") + rowTot("Columna") + rowTot("Otro");
    document.getElementById("fTotal").textContent = nf.format(total);
    const tb = document.getElementById("fBody"); if (!tb) return; tb.innerHTML = "";
    ["Transversal", "Columna", "Otro"].forEach(so => { if (so === "Otro" && rowTot(so) === 0) return; const tr = document.createElement("tr"); tr.innerHTML = '<td>' + so + '</td><td class="qty">' + nf.format(cont[so].Calle) + '</td><td class="qty">' + nf.format(cont[so]["Espacio Verde"]) + '</td><td class="hide-sm muted">' + nf.format(cont[so].Otros) + '</td><td class="qty"><b>' + nf.format(rowTot(so)) + '</b></td>'; tb.appendChild(tr); });
}

function draw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.width / dpr, H = canvas.height / dpr; ctx.clearRect(0, 0, W, H);
    const r = 4.5;
    const list = mode === "bin" ? BINS : TECS;
    const vb = barrios.map(() => [0, 0, 0, 0, 0]); vcls = new Array(clases.length).fill(0); const vtec = [0, 0, 0, 0, 0]; let vt = 0, vl = 0, vo = 0;
    for (let i = 0; i < N; i++) {
        if (!visible(i) || !inZ(i)) { PX[i] = NaN; continue; }
        const p = proj(lat[i], lon[i]); if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) { PX[i] = NaN; continue; }
        PX[i] = p[0]; PY[i] = p[1]; vt++; tec[i] ? vo++ : vl++; vb[bar[i]][tec[i]]++; vcls[cls[i]]++; vtec[tec[i]]++;
    }
    if (tipoSeleccionado === "Columna") {
        // Dibujar punto por punto con color según material
        const mats = Object.keys(MATS_COLUMNA);
        for (let m = mats.length - 1; m >= 0; m--) {
            const mat = mats[m];
            if (mat === "default") continue;
            ctx.fillStyle = MATS_COLUMNA[mat];
            ctx.globalAlpha = .88;
            ctx.beginPath();
            for (let i = 0; i < N; i++) {
                if (PX[i] !== PX[i]) continue;
                const claseMat = clases[cls[i]] || "";
                if (claseMat !== mat) continue;
                ctx.moveTo(PX[i] + r, PY[i]);
                ctx.arc(PX[i], PY[i], r, 0, 6.2832);
            }
            ctx.fill();
        }
    } else {
        for (let g = list.length - 1; g >= 0; g--) {
            ctx.fillStyle = list[g].col; ctx.globalAlpha = .88; ctx.beginPath();
            for (let i = 0; i < N; i++) {
                if (PX[i] !== PX[i] || grp(i) !== list[g].k) continue;
                ctx.moveTo(PX[i] + r, PY[i]);
                ctx.arc(PX[i], PY[i], r, 0, 6.2832);
            }
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    renderViewSummary(vt, vl, vo, vb); renderFsLegend(vtec, vt); if (sideTab === "pot") renderSide();
}

function renderViewSummary(vt, vl, vo, vb) {
    document.getElementById("vTot").textContent = nf.format(vt);
    document.querySelector(".vs-stat").childNodes[1].textContent = tipoSeleccionado === "todas" ? "Registros" : tipoSeleccionado + "s";
    if (tipoSeleccionado === "Columna") {
        document.querySelector(".vs-stat:nth-child(2)").style.display = "none";
        document.querySelector(".vs-stat:nth-child(3)").style.display = "none";
    } else {
        document.querySelector(".vs-stat:nth-child(2)").style.display = "";
        document.querySelector(".vs-stat:nth-child(3)").style.display = "";
        document.getElementById("vLed").textContent = nf.format(vl);
        document.getElementById("vOld").textContent = nf.format(vo);
    }
    const rows = barrios.map((B, i) => { const v = vb[i]; return { nm: B.nm, i, led: v[0], sod: v[1], mhx: v[2], mer: v[3], otr: v[4], old: v[1] + v[2] + v[3] + v[4], top: B.top }; }).filter(r => r.old > 0).sort((a, b) => b.old - a.old);
    document.getElementById("vBar").textContent = nf.format(rows.length);
    const tb = document.getElementById("bBody"); tb.innerHTML = "";
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" class="muted" style="padding:20px 16px">' + (vt ? "En este encuadre no queda ninguna lámpara de tecnología anterior." : "Acercá o desplazá el mapa para ver el detalle por barrio.") + '</td></tr>'; document.getElementById("bFoot").innerHTML = ""; return; }
    rows.forEach(r => { const tot = r.old + r.led, p = r.led / tot * 100, tr = document.createElement("tr"); tr.style.cursor = "pointer"; tr.onclick = () => { const B = barrios[r.i]; if (map && map.fitBounds) map.fitBounds([[B.la0, B.lo0], [B.la1, B.lo1]], { maxZoom: 17 }); }; tr.innerHTML = '<td><span class="bcell"><i class="dot" style="color:#FFA94D"></i><span><span style="color:var(--ink)">' + r.nm + '</span>' + (r.top && r.top.length ? '<span class="streets-in">' + r.top.join(" · ") + '</span>' : '') + '</span></span></td><td style="color:#FFC168">' + (r.sod ? nf.format(r.sod) : '<span class="muted">—</span>') + '</td><td class="hide-sm" style="color:#CFC6FF">' + (r.mhx ? nf.format(r.mhx) : '<span class="muted">—</span>') + '</td><td class="hide-sm" style="color:#8FE7D2">' + (r.mer ? nf.format(r.mer) : '<span class="muted">—</span>') + '</td><td class="hide-sm" style="color:#9AA8B8">' + (r.otr ? nf.format(r.otr) : '<span class="muted">—</span>') + '</td><td style="color:#FFA94D">' + nf.format(r.old) + '</td><td class="hide-md" style="color:#BFE3FF">' + nf.format(r.led) + '</td><td class="pct-cell"><div class="st-bar"><i style="width:' + p + '%;background:#BFE3FF"></i><i style="width:' + (100 - p) + '%;background:#FFA94D"></i></div><div class="st-meta"><span>' + pf1(p) + ' % LED</span><span>' + nf.format(tot) + '</span></div></td>'; tb.appendChild(tr); });
    const s = k => rows.reduce((a, b) => a + b[k], 0);
    document.getElementById("bFoot").innerHTML = '<td>' + rows.length + ' barrios con pendientes</td><td>' + nf.format(s("sod")) + '</td><td class="hide-sm">' + nf.format(s("mhx")) + '</td><td class="hide-sm">' + nf.format(s("mer")) + '</td><td class="hide-sm">' + nf.format(s("otr")) + '</td><td>' + nf.format(s("old")) + '</td><td class="hide-md">' + nf.format(s("led")) + '</td><td></td>';
}

function initLeaflet() {
    const oscuro = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' });
    const satelital = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: '&copy; Esri' });
    map = L.map("map", { preferCanvas: true, minZoom: 11, maxZoom: 19, layers: [oscuro] }).fitBounds(limites());
    L.control.layers({ "Oscuro": oscuro, "Satelital": satelital }, null, { position: 'topright' }).addTo(map);
    const Pts = L.Layer.extend({ onAdd(m) { canvas = L.DomUtil.create("canvas", "leaflet-zoom-hide"); canvas.style.position = "absolute"; m.getPanes().overlayPane.appendChild(canvas); ctx = canvas.getContext("2d"); const reset = () => { const size = m.getSize(), dpr = window.devicePixelRatio || 1; canvas.width = size.x * dpr; canvas.height = size.y * dpr; canvas.style.width = size.x + "px"; canvas.style.height = size.y + "px"; L.DomUtil.setPosition(canvas, m.containerPointToLayerPoint([0, 0])); draw(); }; m.on("moveend zoomend resize", reset); redraw = reset; reset(); } });
    proj = (la, lo) => { const p = map.latLngToContainerPoint([la, lo]); return [p.x, p.y]; }; map.addLayer(new Pts());
    canvas.style.cursor = "pointer";
    map.on("click", ev => { const c = ev.containerPoint; let best = -1, bd = 196; for (let i = 0; i < N; i++) { if (PX[i] !== PX[i]) continue; const d = (PX[i] - c.x) * (PX[i] - c.x) + (PY[i] - c.y) * (PY[i] - c.y); if (d < bd) { bd = d; best = i; } } if (best < 0) return; const dir = calles[stx[best]] + (alt[best] ? " " + nf.format(alt[best]) : ""); L.popup().setLatLng([lat[best], lon[best]]).setContent('<b style="color:' + colorOf(best) + '">' + clases[cls[best]] + '</b><br>' + dir + '<br><span class="dim">' + (tec[best] ? "Tecnología anterior" : "LED") + ' · ' + tipos[tpo[best]] + '<br>' + barrios[bar[best]].nm + ' (aprox.) · alta ' + anios[yr[best]] + '</span>').openOn(map); });
    mapReady = true;
}

function limites() { let s = 90, n = -90, w = 180, e = -180; for (let i = 0; i < N; i++) { if (!inZ(i)) continue; if (lat[i] < s) s = lat[i]; if (lat[i] > n) n = lat[i]; if (lon[i] < w) w = lon[i]; if (lon[i] > e) e = lon[i]; } return s > n ? [[-32.95, -60.79], [-32.86, -60.65]] : [[s, w], [n, e]]; }

function initFallback() { const nt = document.getElementById("notice"); nt.style.display = "block"; nt.textContent = "No se pudo cargar el mapa base."; const host = document.getElementById("map"); canvas = document.createElement("canvas"); canvas.style.cssText = "width:100%;height:100%;display:block;cursor:pointer"; host.appendChild(canvas); ctx = canvas.getContext("2d"); const lm = limites(), S = lm[0][0], W0 = lm[0][1], Nn = lm[1][0], E0 = lm[1][1]; let z = 1, ox = 0, oy = 0, drag = null; const fit = () => { const dpr = window.devicePixelRatio || 1, w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + "px"; canvas.style.height = h + "px"; const s = Math.min(w / (E0 - W0), h / (Nn - S)) * .94; proj = (la, lo) => [(lo - W0) * s * z + ox + (w - (E0 - W0) * s) / 2, (Nn - la) * s * z + oy + (h - (Nn - S) * s) / 2]; draw(); }; redraw = fit; canvas.onmousedown = e => { drag = [e.clientX - ox, e.clientY - oy]; canvas.style.cursor = "grabbing"; }; window.addEventListener("mouseup", () => { drag = null; canvas.style.cursor = "grab"; }); window.addEventListener("mousemove", e => { if (drag) { ox = e.clientX - drag[0]; oy = e.clientY - drag[1]; fit(); } }); canvas.onwheel = e => { e.preventDefault(); z *= e.deltaY < 0 ? 1.2 : 1 / 1.2; fit(); }; window.addEventListener("resize", fit); map = { getZoom: () => 11 + Math.log2(z) * 1.6 }; mapReady = true; fit(); }

function renderFsLegend(vtec, vt) { const host = document.getElementById("fsLegend"); if (!host) return; const list = mode === "bin" ? BINS : TECS; host.innerHTML = ""; list.forEach(l => { const n = mode === "bin" ? (l.k === 0 ? vtec[0] : vtec[1] + vtec[2] + vtec[3] + vtec[4]) : vtec[l.k], isOn = mode === "bin" ? (l.k === 0 ? on[0] : on.slice(1).some(Boolean)) : on[l.k], b = document.createElement("button"); b.className = "fsl"; b.style.color = l.col; b.setAttribute("aria-pressed", isOn); b.title = "Mostrar u ocultar " + l.label; b.innerHTML = '<i class="dot"></i>' + l.label + ' <b>' + nf.format(n) + '</b>'; b.onclick = () => { if (mode === "bin") { if (l.k === 0) on[0] = !on[0]; else { const v = !on.slice(1).some(Boolean); on[1] = on[2] = on[3] = on[4] = v; } } else on[l.k] = !on[l.k]; if (!on.some(Boolean)) on = [true, true, true, true, true]; renderLegend(); redraw(); }; host.appendChild(b); }); const sep = document.createElement("i"); sep.className = "fsl-sep"; host.appendChild(sep); const tot = document.createElement("span"); tot.className = "fsl-tot"; tot.innerHTML = 'En pantalla <b>' + nf.format(vt) + '</b>'; host.appendChild(tot); }

function renderLegend() { 
    if (tipoSeleccionado !== "Lámpara" && tipoSeleccionado !== "todas") {
        document.getElementById("legend").innerHTML = "";
        return;
    }
    document.querySelector(".side .block:first-child").style.display = "";
    const list = mode === "bin" ? BINS : TECS, host = document.getElementById("legend"); host.innerHTML = ""; const totals = list.map(() => 0); for (let i = 0; i < N; i++)if (inZ(i)) totals[list.findIndex(l => l.k === grp(i))]++; list.forEach((l, ix) => { const b = document.createElement("button"); b.className = "leg"; b.style.color = l.col; const isOn = mode === "bin" ? (l.k === 0 ? on[0] : on.slice(1).some(Boolean)) : on[l.k]; b.setAttribute("aria-pressed", isOn); b.innerHTML = '<i class="dot"></i><span class="nm">' + l.label + '</span><span class="qt">' + nf.format(totals[ix]) + '</span>'; b.onclick = () => { if (mode === "bin") { if (l.k === 0) on[0] = !on[0]; else { const v = !on.slice(1).some(Boolean); on[1] = on[2] = on[3] = on[4] = v; } } else on[l.k] = !on[l.k]; if (!on.some(Boolean)) on = [true, true, true, true, true]; renderLegend(); redraw(); }; host.appendChild(b); });
}

function renderSearch() {
    const host = document.getElementById("qres"), raw = query.trim(); if (raw.length < 2) { host.innerHTML = ""; return; } const m = raw.match(/^(.*?)[\s,]*(\d{1,6})?$/), nom = (m[1] || raw).trim().toLowerCase(), alt0 = m[2] ? +m[2] : null, hits = []; calles.forEach((nm, si) => { if (nom && !nm.toLowerCase().includes(nom)) return; stIdx[si].forEach(i => hits.push(i)); }); if (!hits.length) { host.innerHTML = '<p class="hint">Ninguna calle coincide.</p>'; return; } hits.sort((a, b) => alt0 !== null ? Math.abs(alt[a] - alt0) - Math.abs(alt[b] - alt0) || alt[a] - alt[b] : alt[a] - alt[b]); const top = hits.slice(0, 12); const nombreTipo = tipoSeleccionado === "todas" ? "registros" : tipoSeleccionado.toLowerCase() + "s";
    host.innerHTML = '<div class="res"></div><p class="hint">' + nf.format(hits.length) + ' ' + nombreTipo + ' coinciden' + (alt0 !== null ? '. Ordenadas por cercanía a la altura ' + nf.format(alt0) + '.' : '. Escribí también la altura para afinar.') + '</p>'; const res = host.querySelector(".res"); top.forEach(i => { const b = document.createElement("button"); b.className = "rw"; b.style.color = colorOf(i); b.innerHTML = '<i class="dot"></i><span class="rw-n">' + calles[stx[i]] + (alt[i] ? " " + nf.format(alt[i]) : "") + '<span class="rw-s">' + clases[cls[i]] + ' · ' + barrios[bar[i]].nm + '</span></span>'; b.onclick = () => { if (!map || !map.setView) return; map.setView([lat[i], lon[i]], 19); setTimeout(() => { L.popup().setLatLng([lat[i], lon[i]]).setContent('<b style="color:' + colorOf(i) + '">' + clases[cls[i]] + '</b><br>' + calles[stx[i]] + (alt[i] ? " " + nf.format(alt[i]) : "") + '<br><span class="dim">' + (tec[i] ? "Tecnología anterior" : "LED") + ' · ' + barrios[bar[i]].nm + ' (aprox.)</span>').openOn(map); }, 260); }; res.appendChild(b); });
}

function renderSide() {
    const host = document.getElementById("sideList"); host.innerHTML = "";
        if (tipoSeleccionado !== "Lámpara" && tipoSeleccionado !== "todas") {
        const h = document.createElement("p");
        h.className = "side-head";
        h.innerHTML = 'Total en pantalla · <b>' + nf.format(NZ) + '</b> ' + tipoSeleccionado.toLowerCase() + 's';
        host.appendChild(h);
        
        // Si es columna, mostrar leyenda de materiales
        if (tipoSeleccionado === "Columna") {
            const matCounts = {};
            for (let i = 0; i < N; i++) {
                if (!inZ(i)) continue;
                const mat = clases[cls[i]] || "Otro";
                matCounts[mat] = (matCounts[mat] || 0) + 1;
            }
            const sorted = Object.entries(matCounts).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([mat, n]) => {
                const color = MATS_COLUMNA[mat] || MATS_COLUMNA["default"];
                const b = document.createElement("button");
                b.className = "leg";
                b.style.color = color;
                b.innerHTML = '<i class="dot"></i><span class="nm">' + mat + '</span><span class="qt">' + nf.format(n) + '</span>';
                host.appendChild(b);
            });
        }
        
        document.getElementById("legend").innerHTML = "";
        document.querySelector(".side .block:first-child").style.display = "none";
        return;
    }
    if (sideTab === "bar") { const list = barrios.filter(b => b.old > 0).sort((a, b) => b.old - a.old), tot = list.reduce((a, b) => a + b.old, 0), h = document.createElement("p"); h.className = "side-head"; h.innerHTML = 'Todo el padrón · <b>' + nf.format(tot) + '</b> pendientes en ' + list.length + ' barrios'; host.appendChild(h); list.forEach(B => { const p = B.led / B.tot * 100, b = document.createElement("button"); b.className = "st"; b.innerHTML = '<div class="st-h"><span class="st-n">' + B.nm + '</span><span class="st-q" style="color:#FFA94D">' + nf.format(B.old) + '</span></div><div class="st-bar"><i style="width:' + p + '%;background:#BFE3FF"></i><i style="width:' + (100 - p) + '%;background:#FFA94D"></i></div><div class="st-meta"><span style="color:#BFE3FF">LED <b>' + nf.format(B.led) + '</b></span><span>' + pf1(p) + ' % · ' + nf.format(B.tot) + ' total</span></div>'; b.onclick = () => { if (map && map.fitBounds) map.fitBounds([[B.la0, B.lo0], [B.la1, B.lo1]], { maxZoom: 17 }); }; host.appendChild(b); }); return; } const rows = clases.map((c, i) => ({ c, n: vcls[i] || 0, t: clsTec[i], w: clsW[i] })).filter(r => r.n > 0 && r.t !== 0).sort((a, b) => b.n - a.n); const led = clases.map((c, i) => ({ c, n: vcls[i] || 0, t: clsTec[i], w: clsW[i] })).filter(r => r.n > 0 && r.t === 0).sort((a, b) => b.n - a.n); const h = document.createElement("p"); h.className = "side-head"; const tot = rows.reduce((a, b) => a + b.n, 0), kw = rows.reduce((a, b) => a + b.n * b.w, 0) / 1000; h.innerHTML = 'En pantalla · <b>' + nf.format(tot) + '</b> equipos a reemplazar · <b>' + kwf(kw) + '</b> kW'; host.appendChild(h); if (!rows.length) { const e = document.createElement("p"); e.className = "empty"; e.textContent = "No hay tecnología anterior en este encuadre."; host.appendChild(e); return; } const max = rows[0].n; rows.forEach(r => { const col = TECS[r.t].col, d = document.createElement("div"); d.className = "pot"; d.style.color = col; d.innerHTML = '<div class="pot-h"><span class="pot-n">' + r.c + '</span><span class="pot-q">' + nf.format(r.n) + '</span></div><div class="pot-bar"><i style="width:' + (r.n / max * 100) + '%"></i></div><div class="pot-m"><span>' + (r.w ? r.w + " W c/u" : "—") + '</span><span>' + kwf(r.n * r.w / 1000) + ' kW</span></div>'; host.appendChild(d); });
}

function showTab(which) { const esMapa = which === "mapa", esFalt = which === "faltantes"; document.getElementById("panelResumen").hidden = esMapa || esFalt; document.getElementById("panelMapa").hidden = !esMapa; document.getElementById("panelFaltantes").hidden = !esFalt; document.getElementById("tabResumen").setAttribute("aria-selected", !esMapa && !esFalt); document.getElementById("tabMapa").setAttribute("aria-selected", esMapa); document.getElementById("tabFaltantes").setAttribute("aria-selected", esFalt); if (esMapa) { if (!mapReady) { (typeof L !== "undefined") ? initLeaflet() : initFallback(); renderLegend(); renderSide(); } else { if (map && map.invalidateSize) { map.invalidateSize(); redraw(); } else redraw(); } } if (esFalt) renderFaltantes(); }

document.getElementById("tabResumen").onclick = () => showTab("resumen");
document.getElementById("tabMapa").onclick = () => showTab("mapa");
document.getElementById("tabFaltantes").onclick = () => showTab("faltantes");

document.querySelectorAll(".mode").forEach(b => { b.onclick = () => { mode = b.dataset.mode; document.querySelectorAll(".mode").forEach(x => x.setAttribute("aria-pressed", x === b)); active = new Set(["LED", "OLD", "SOD", "MER", "MHX", "OTR"]); renderResumen(); if (mapReady) { renderLegend(); renderSide(); redraw(); } }; });
document.getElementById("mhx").addEventListener("change", e => { joinMhx = e.target.checked; active = new Set(["LED", "OLD", "SOD", "MER", "MHX", "OTR"]); renderResumen(); });
document.querySelectorAll(".sortb").forEach(b => { b.onclick = () => { sideTab = b.dataset.side; document.querySelectorAll(".sortb").forEach(x => x.setAttribute("aria-pressed", x === b)); renderSide(); }; });
document.getElementById("q").addEventListener("input", e => { query = e.target.value; renderSearch(); });

function renderZonas() {
    const host = document.getElementById("zonas"); host.innerHTML = ""; if (!zonas.length) { host.style.display = "none"; return; } host.style.display = ""; const items = [{ v: 0, t: "Todas" }, ...zonas.map(z => ({ v: z, t: "Zona " + z }))]; items.forEach(it => {
        const b = document.createElement("button"); b.className = "mode"; b.setAttribute("aria-pressed", zonaSel === it.v); b.textContent = it.t;
        b.onclick = () => { if (zonaSel === it.v) return; zonaSel = it.v; cambiarTipo(tipoSeleccionado); }; host.appendChild(b);
    });
}

document.getElementById("fsBtn").onclick = () => { const box = document.querySelector(".maprow"); if (document.fullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (box.requestFullscreen || box.webkitRequestFullscreen || (() => { })).call(box); };
["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => { setTimeout(() => { if (map && map.invalidateSize) map.invalidateSize(); redraw(); }, 140); }));
window.addEventListener("resize", () => { if (mapReady && map && map.invalidateSize) map.invalidateSize(); });

document.querySelectorAll("#tipos .mode").forEach(b => {
    b.onclick = () => {
        document.querySelectorAll("#tipos .mode").forEach(x => x.setAttribute("aria-pressed", x === b));
        cambiarTipo(b.dataset.tipo);
    };
});

cargarDatos();