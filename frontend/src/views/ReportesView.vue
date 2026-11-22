<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { get } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const loading = ref(true);
const error = ref('');
const registros = ref([]);
const cursos = ref([]);
const trabajadores = ref([]);

// Pestaña y filtros dinámicos
const vista = ref('trabajador'); // 'trabajador' | 'curso'
const cursoId = ref('');
const trabajadorId = ref('');
const estadoFiltro = ref('todos'); // 'todos' | 'acreditado' | 'en_curso' | 'reprobado'
const busqueda = ref('');
const incluirSinCursar = ref(false);
const tooltip = ref(null); // { x, y, titulo, lineas }

onMounted(async () => {
  try {
    const data = await get('/api/cursos/reportes');
    registros.value = data.registros || [];
    cursos.value = data.cursos || [];
    trabajadores.value = data.trabajadores || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

// Al cambiar a vista "Por Curso", preseleccionar el primer curso con participantes si no hay ninguno elegido
watch(vista, (v) => {
  if (v === 'curso' && !cursoId.value && cursos.value.length) {
    cursoId.value = cursos.value[0].id;
  }
});

const cursoSeleccionado = computed(() =>
  cursos.value.find((c) => c.id === cursoId.value) || null
);

// Registros filtrados para KPIs, gráficas y tabla
const registrosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return registros.value.filter((r) => {
    if (cursoId.value && r.curso_id !== cursoId.value) return false;
    if (vista.value === 'trabajador' && trabajadorId.value && r.usuario_id !== trabajadorId.value) return false;
    if (estadoFiltro.value !== 'todos' && r.estado !== estadoFiltro.value) return false;
    if (q) {
      const hay = [
        r.trabajador, r.email, r.puesto, r.area, r.curso,
        ...(r.curso_competencias || []), ...(r.curso_habilidades || []),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

// En vista por curso, filas incluyendo opcionalmente trabajadores activos que aún no lo cursan
const filasDetalle = computed(() => {
  const base = registrosFiltrados.value;
  if (vista.value !== 'curso' || !cursoSeleccionado.value || !incluirSinCursar.value) {
    return base;
  }
  const cursados = new Set(registros.value.filter((r) => r.curso_id === cursoSeleccionado.value.id).map((r) => r.usuario_id));
  const q = busqueda.value.trim().toLowerCase();
  const faltantes = trabajadores.value
    .filter((t) => !cursados.has(t.id))
    .filter((t) => {
      if (estadoFiltro.value !== 'todos' && estadoFiltro.value !== 'pendiente') return false;
      if (!q) return true;
      return `${t.nombre} ${t.email} ${t.puesto} ${t.area}`.toLowerCase().includes(q);
    })
    .map((t) => ({
      id: `pend:${t.id}`,
      usuario_id: t.id,
      trabajador: t.nombre,
      email: t.email,
      puesto: t.puesto,
      area: t.area,
      curso_id: cursoSeleccionado.value.id,
      curso: cursoSeleccionado.value.titulo,
      diag_puntaje: null, diag_total: null, diag_pct: null,
      final_puntaje: null, final_total: null, final_pct: null,
      ganancia_pct: null, ganancia_pts: null,
      acreditado: false,
      estado: 'pendiente',
      certificado: null,
      curso_competencias: cursoSeleccionado.value.competencias || [],
      curso_habilidades: cursoSeleccionado.value.habilidades || [],
      competencias_vinculadas: [],
      habilidades_vinculadas: [],
      alineado_puesto: false,
      competencias_acreditadas: [],
      habilidades_acreditadas: [],
      ultima_fecha: null,
    }));
  return [...base, ...faltantes];
});

// ---- KPIs Exactos (4 tarjetas superiores estilo diseño) ----
const kpis = computed(() => {
  const list = registrosFiltrados.value;
  const conDiag = list.filter((r) => r.diag_pct !== null);
  const conFinal = list.filter((r) => r.final_pct !== null);
  const conGanancia = list.filter((r) => r.ganancia_pct !== null);
  const acreditados = list.filter((r) => r.acreditado);
  const mejoraPositiva = conGanancia.filter((r) => r.ganancia_pct > 0).length;

  const avg = (arr, fn) => arr.length
    ? Math.round((arr.reduce((s, x) => s + fn(x), 0) / arr.length) * 10) / 10
    : null;

  const promDiag = avg(conDiag, (r) => r.diag_pct);
  const promFinal = avg(conFinal, (r) => r.final_pct);
  const promGanancia = avg(conGanancia, (r) => r.ganancia_pct);
  const tasaAcreditacion = list.length ? Math.round((acreditados.length / list.length) * 100) : 0;

  return {
    total: list.length,
    conDiagCount: conDiag.length,
    conFinalCount: conFinal.length,
    acreditadosCount: acreditados.length,
    mejoraPositiva,
    promDiag,
    promFinal,
    promGanancia,
    tasaAcreditacion,
    diagSeries: conDiag.slice(0, 10).map((r) => r.diag_pct),
    finalSeries: conFinal.slice(0, 10).map((r) => r.final_pct),
    gainSeries: conGanancia.slice(0, 10).map((r) => r.ganancia_pct),
  };
});

// Sparkline SVG helper
function sparkPoints(values, w = 220, h = 54) {
  if (!values || !values.length) return [];
  const arr = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...arr, 0);
  const max = Math.max(...arr, 100);
  const span = max - min || 1;
  return arr.map((v, i) => ({
    x: 10 + (i / (arr.length - 1)) * (w - 20),
    y: h - 10 - ((v - min) / span) * (h - 20),
    v,
  }));
}
function sparkPath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

const sparkDiag = computed(() => sparkPoints(kpis.value.diagSeries));
const sparkFinal = computed(() => sparkPoints(kpis.value.finalSeries));
const sparkGain = computed(() => {
  const vals = kpis.value.gainSeries;
  if (!vals.length) return [];
  const arr = vals.length === 1 ? [0, vals[0]] : vals;
  const min = Math.min(...arr, -20);
  const max = Math.max(...arr, 20);
  const span = max - min || 1;
  return arr.map((v, i) => ({
    x: 14 + (i / (arr.length - 1)) * 192,
    y: 44 - ((v - min) / span) * 32,
    v,
  }));
});

// Gauge semicircular para KPI 4 (Tasa de Acreditación)
const gaugeArc = computed(() => {
  const pct = Math.max(0, Math.min(100, kpis.value.tasaAcreditacion));
  const r = 62;
  const circ = Math.PI * r; // semicircunferencia
  const dash = (pct / 100) * circ;
  return { circ: circ.toFixed(1), dash: dash.toFixed(1) };
});

// ---- Gráfica Principal: Barras Agrupadas Diagnóstica vs Final ----
const barData = computed(() => {
  const list = registrosFiltrados.value;
  if (vista.value === 'curso' || cursoId.value) {
    // Una entrada por trabajador en el curso
    return list.slice(0, 8).map((r) => ({
      label: r.trabajador,
      short: r.trabajador.length > 16 ? r.trabajador.slice(0, 15) + '…' : r.trabajador,
      sub: r.curso,
      diag: r.diag_pct ?? 0,
      hasDiag: r.diag_pct !== null,
      final: r.final_pct ?? 0,
      hasFinal: r.final_pct !== null,
      gain: r.ganancia_pct,
    }));
  }
  // Agrupar por curso (promedio diagnóstica vs promedio final)
  const map = new Map();
  for (const r of list) {
    if (!map.has(r.curso_id)) {
      map.set(r.curso_id, { label: r.curso, diags: [], finals: [], gains: [] });
    }
    const g = map.get(r.curso_id);
    if (r.diag_pct !== null) g.diags.push(r.diag_pct);
    if (r.final_pct !== null) g.finals.push(r.final_pct);
    if (r.ganancia_pct !== null) g.gains.push(r.ganancia_pct);
  }
  const avg = (a) => a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null;
  return [...map.values()].slice(0, 8).map((g) => {
    const d = avg(g.diags);
    const f = avg(g.finals);
    const gn = avg(g.gains);
    return {
      label: g.label,
      short: g.label.length > 16 ? g.label.slice(0, 15) + '…' : g.label,
      sub: `${Math.max(g.diags.length, g.finals.length)} eval.`,
      diag: d ?? 0,
      hasDiag: d !== null,
      final: f ?? 0,
      hasFinal: f !== null,
      gain: gn,
    };
  });
});

// ---- Tabla Lateral Compacta (Top Desempeño / Cumplimiento) ----
const topTabla = computed(() => {
  return [...registrosFiltrados.value]
    .sort((a, b) => (b.ganancia_pct ?? -999) - (a.ganancia_pct ?? -999) || (b.final_pct ?? -1) - (a.final_pct ?? -1))
    .slice(0, 8);
});

// ---- Dona: Distribución de Estado de Cumplimiento ----
const donutSlices = computed(() => {
  const list = registrosFiltrados.value;
  const counts = [
    { key: 'acreditado', label: 'Acreditados', color: '#EC6A11', count: list.filter((r) => r.estado === 'acreditado').length },
    { key: 'en_curso', label: 'En curso', color: '#00B2B2', count: list.filter((r) => r.estado === 'en_curso').length },
    { key: 'reprobado', label: 'Reprobados', color: '#006B6B', count: list.filter((r) => r.estado === 'reprobado').length },
    { key: 'pendiente', label: 'Pendiente', color: '#EC9A00', count: list.filter((r) => r.estado === 'pendiente').length },
  ].filter((x) => x.count > 0);

  const total = counts.reduce((s, x) => s + x.count, 0) || 1;
  const r = 56;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return counts.map((item) => {
    const frac = item.count / total;
    const len = frac * C;
    const slice = {
      ...item,
      pct: Math.round(frac * 1000) / 10,
      dash: `${len.toFixed(2)} ${(C - len).toFixed(2)}`,
      offset: (-offset).toFixed(2),
    };
    offset += len;
    return slice;
  });
});

// ---- Burbujas: Diagnóstica vs Final (Mapa de Ganancia) ----
const bubblePoints = computed(() => {
  return registrosFiltrados.value
    .filter((r) => r.diag_pct !== null || r.final_pct !== null)
    .slice(0, 20)
    .map((r) => {
      const dx = r.diag_pct ?? 0;
      const fy = r.final_pct ?? 0;
      const gainAbs = Math.abs(r.ganancia_pct ?? 0);
      return {
        id: r.id,
        label: `${r.trabajador} — ${r.curso}`,
        diag: r.diag_pct,
        final: r.final_pct,
        gain: r.ganancia_pct,
        acreditado: r.acreditado,
        cx: 42 + (dx / 100) * 260,
        cy: 162 - (fy / 100) * 138,
        rad: Math.max(5.5, Math.min(14, 6 + gainAbs / 10)),
      };
    });
});

// ---- Barras Horizontales: Top Competencias Acreditadas (o Cursos) ----
const topCompetencias = computed(() => {
  const counts = new Map();
  for (const r of registrosFiltrados.value) {
    const items = r.acreditado
      ? [...(r.competencias_acreditadas || []), ...(r.habilidades_acreditadas || [])]
      : [];
    for (const c of items) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  // Si aún no hay competencias acreditadas, mostrar top cursos por participantes
  if (!counts.size) {
    const byCourse = new Map();
    for (const r of registrosFiltrados.value) {
      byCourse.set(r.curso, (byCourse.get(r.curso) || 0) + 1);
    }
    const arr = [...byCourse.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 5);
    const max = Math.max(...arr.map((x) => x.total), 1);
    return { modo: 'cursos', items: arr.map((x) => ({ ...x, pct: (x.total / max) * 100 })) };
  }
  const arr = [...counts.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  const max = Math.max(...arr.map((x) => x.total), 1);
  return { modo: 'competencias', items: arr.map((x) => ({ ...x, pct: (x.total / max) * 100 })) };
});

// ---- Acciones ----
async function descargarCert(codigo) {
  const r = await fetch(`${API}/api/certificados/${codigo}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
}

function exportarCsv() {
  const cols = [
    'Trabajador', 'Correo', 'Puesto', 'Area', 'Curso',
    'Diagnostica', 'Diagnostica %', 'Evaluacion Final', 'Final %',
    'Ganancia %', 'Estado', 'Competencias Acreditadas', 'Habilidades Acreditadas', 'Alineado al Puesto',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map(esc).join(',')];
  for (const r of filasDetalle.value) {
    lines.push([
      r.trabajador,
      r.email,
      r.puesto || 'Sin asignar',
      r.area || '',
      r.curso,
      r.diag_total != null ? `${r.diag_puntaje}/${r.diag_total}` : '',
      r.diag_pct != null ? `${r.diag_pct}%` : '',
      r.final_total != null ? `${r.final_puntaje}/${r.final_total}` : '',
      r.final_pct != null ? `${r.final_pct}%` : '',
      r.ganancia_pct != null ? `${r.ganancia_pct > 0 ? '+' : ''}${r.ganancia_pct}%` : '',
      estadoLabel(r.estado),
      (r.competencias_acreditadas || []).join('; '),
      (r.habilidades_acreditadas || []).join('; '),
      r.alineado_puesto ? 'Sí' : 'No',
    ].map(esc).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reporte-desempeno-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function estadoLabel(e) {
  return { acreditado: 'Acreditado', reprobado: 'No aprobado', en_curso: 'En curso', pendiente: 'Pendiente' }[e] || e;
}

function fmtGain(g) {
  if (g === null || g === undefined) return '—';
  return `${g > 0 ? '+' : ''}${g}%`;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showTip(ev, titulo, lineas) {
  tooltip.value = { x: ev.clientX + 12, y: ev.clientY - 12, titulo, lineas };
}
function hideTip() { tooltip.value = null; }
</script>

<template>
  <AppLayout>
    <div class="rep-page">
      <!-- Encabezado y Pestañas -->
      <header class="rep-head">
        <div>
          <h1>Reportes de Desempeño y Acreditación</h1>
          <p class="sub">Medición exacta de avance (Diagnóstica vs. Evaluación Final), cumplimiento por curso y competencias acreditadas.</p>
        </div>
        <div class="head-actions">
          <div class="mode-tabs">
            <button :class="{ active: vista === 'trabajador' }" @click="vista = 'trabajador'; cursoId = ''">
              👤 Por Trabajador
            </button>
            <button :class="{ active: vista === 'curso' }" @click="vista = 'curso'">
              📘 Por Curso
            </button>
          </div>
          <button class="btn-export" @click="exportarCsv" :disabled="!filasDetalle.length">⬇ Exportar CSV</button>
        </div>
      </header>

      <!-- Barra de Filtros Dinámicos -->
      <section class="filters-bar">
        <div class="f-item">
          <label>Curso</label>
          <select v-model="cursoId">
            <option value="">Todos los cursos ({{ cursos.length }})</option>
            <option v-for="c in cursos" :key="c.id" :value="c.id">
              {{ c.titulo }} {{ c.participantes ? `(${c.participantes})` : '' }}
            </option>
          </select>
        </div>

        <div class="f-item" v-if="vista === 'trabajador'">
          <label>Trabajador</label>
          <select v-model="trabajadorId">
            <option value="">Todos los trabajadores</option>
            <option v-for="t in trabajadores" :key="t.id" :value="t.id">
              {{ t.nombre }}{{ t.puesto ? ` — ${t.puesto}` : '' }}
            </option>
          </select>
        </div>

        <div class="f-item">
          <label>Estado de cumplimiento</label>
          <select v-model="estadoFiltro">
            <option value="todos">Todos los estados</option>
            <option value="acreditado">Acreditados</option>
            <option value="en_curso">En curso (solo diagnóstica)</option>
            <option value="reprobado">No aprobados</option>
          </select>
        </div>

        <div class="f-item grow">
          <label>Buscar</label>
          <input v-model="busqueda" placeholder="🔍 Nombre, puesto, curso o competencia…" />
        </div>

        <label v-if="vista === 'curso' && cursoSeleccionado" class="chk-faltantes">
          <input type="checkbox" v-model="incluirSinCursar" />
          Incluir sin cursar
        </label>
      </section>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="loading" class="loading-msg">Cargando indicadores de desempeño…</p>

      <div v-else class="dashboard-canvas">
        <!-- Banner del Curso seleccionado en pestaña Por Curso -->
        <section v-if="cursoSeleccionado" class="curso-banner">
          <div class="cb-main">
            <span class="cb-kicker">ANÁLISIS DEL CURSO</span>
            <h2>{{ cursoSeleccionado.titulo }}</h2>
            <p class="cb-meta">
              <span v-if="cursoSeleccionado.duracion">⏱ {{ cursoSeleccionado.duracion }}</span>
              <span>👥 {{ cursoSeleccionado.participantes }} participante{{ cursoSeleccionado.participantes === 1 ? '' : 's' }}</span>
              <span>🏅 {{ cursoSeleccionado.acreditados }} acreditado{{ cursoSeleccionado.acreditados === 1 ? '' : 's' }}</span>
            </p>
          </div>
          <div class="cb-tags">
            <div v-if="cursoSeleccionado.competencias?.length" class="cb-tag-group">
              <small>Competencias que acredita:</small>
              <div class="tags-wrap">
                <span v-for="c in cursoSeleccionado.competencias" :key="c" class="pill comp">{{ c }}</span>
              </div>
            </div>
            <div v-if="cursoSeleccionado.habilidades?.length" class="cb-tag-group">
              <small>Habilidades asociadas:</small>
              <div class="tags-wrap">
                <span v-for="h in cursoSeleccionado.habilidades" :key="h" class="pill hab">{{ h }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- FILA 1: 4 TARJETAS KPI DE COLORES (Diseño de referencia) -->
        <section class="kpi-row">
          <!-- KPI 1: Teal Oscuro -->
          <div class="kpi-card kpi-teal">
            <span class="kpi-title">Promedio Diagnóstica Inicial</span>
            <div class="kpi-visual">
              <svg v-if="sparkDiag.length" viewBox="0 0 220 54" class="spark">
                <path :d="sparkPath(sparkDiag)" fill="none" stroke="#F2B705" stroke-width="2" />
                <circle v-for="(p, i) in sparkDiag" :key="i" :cx="p.x" :cy="p.y" r="2.8" fill="#F2B705" />
              </svg>
              <div class="kpi-val">{{ kpis.promDiag !== null ? `${kpis.promDiag}%` : '—' }}</div>
              <div class="kpi-delta">▲ {{ kpis.conDiagCount }} evaluaciones iniciales</div>
            </div>
          </div>

          <!-- KPI 2: Turquesa -->
          <div class="kpi-card kpi-cyan">
            <span class="kpi-title">Promedio Evaluación Final</span>
            <div class="kpi-visual">
              <svg v-if="sparkFinal.length" viewBox="0 0 220 54" class="spark">
                <path :d="sparkPath(sparkFinal)" fill="none" stroke="#006666" stroke-width="2" opacity="0.65" />
                <circle v-for="(p, i) in sparkFinal" :key="i" :cx="p.x" :cy="p.y" r="2.8" fill="#006666" opacity="0.75" />
              </svg>
              <div class="kpi-val">{{ kpis.promFinal !== null ? `${kpis.promFinal}%` : '—' }}</div>
              <div class="kpi-delta dark">▲ {{ kpis.conFinalCount }} evaluaciones finales</div>
            </div>
          </div>

          <!-- KPI 3: Ámbar / Dorado -->
          <div class="kpi-card kpi-amber">
            <span class="kpi-title">Avance / Ganancia Promedio</span>
            <div class="kpi-visual">
              <svg v-if="sparkGain.length" viewBox="0 0 220 54" class="spark">
                <path :d="sparkPath(sparkGain)" fill="none" stroke="#1b5e20" stroke-width="2" opacity="0.75" />
                <circle v-for="(p, i) in sparkGain" :key="i" :cx="p.x" :cy="p.y" r="2.6" fill="#1b5e20" opacity="0.8" />
              </svg>
              <div class="kpi-val">{{ fmtGain(kpis.promGanancia) }}</div>
              <div class="kpi-delta dark">▲ {{ kpis.mejoraPositiva }} con avance positivo</div>
            </div>
          </div>

          <!-- KPI 4: Naranja con Gauge Semicircular -->
          <div class="kpi-card kpi-orange">
            <span class="kpi-title">KPI de Acreditación</span>
            <div class="gauge-wrap">
              <svg viewBox="0 0 180 104" class="gauge-svg">
                <path d="M 28 88 A 62 62 0 0 1 152 88" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="14" stroke-linecap="round" />
                <path d="M 28 88 A 62 62 0 0 1 152 88" fill="none" stroke="#FCE38A" stroke-width="14" stroke-linecap="round"
                  :stroke-dasharray="`${gaugeArc.dash} ${gaugeArc.circ}`" />
                <text x="18" y="92" font-size="9" fill="rgba(255,255,255,0.85)" text-anchor="middle">0</text>
                <text x="90" y="18" font-size="9" fill="rgba(255,255,255,0.85)" text-anchor="middle">50%</text>
                <text x="164" y="92" font-size="9" fill="rgba(255,255,255,0.85)" text-anchor="middle">100</text>
                <text x="90" y="76" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">{{ kpis.tasaAcreditacion }}%</text>
                <text x="90" y="94" font-size="9.5" fill="rgba(255,255,255,0.9)" text-anchor="middle">{{ kpis.acreditadosCount }} de {{ kpis.total }} acreditados</text>
              </svg>
            </div>
          </div>
        </section>

        <!-- FILA 2: Gráfica Comparativa de Barras (2fr) + Tabla Compacta Top (1fr) -->
        <section class="mid-row">
          <div class="panel">
            <div class="panel-head">
              <h3>{{ (vista === 'curso' || cursoId) ? 'Comparativa Diagnóstica vs. Evaluación Final por Participante' : 'Comparativa Diagnóstica vs. Evaluación Final por Curso' }}</h3>
              <div class="legend-inline">
                <span><i class="dot" style="background:#006B6B"></i> Diagnóstica %</span>
                <span><i class="dot" style="background:#00B2B2"></i> Evaluación Final %</span>
              </div>
            </div>
            <div v-if="barData.length" class="chart-box">
              <svg :viewBox="`0 0 ${Math.max(540, barData.length * 82 + 60)} 235`" class="bar-svg">
                <!-- Líneas de grilla Y -->
                <g v-for="tick in [0, 25, 50, 75, 100]" :key="tick">
                  <line x1="42" :x2="Math.max(525, barData.length * 82 + 45)" :y1="175 - tick * 1.45" :y2="175 - tick * 1.45" stroke="#e5e9f0" stroke-width="1" />
                  <text x="36" :y="179 - tick * 1.45" font-size="9.5" fill="#6b7280" text-anchor="end">{{ tick }}%</text>
                </g>
                <line x1="42" y1="25" x2="42" y2="175" stroke="#9ca3af" stroke-width="1" />
                <line x1="42" y1="175" :x2="Math.max(525, barData.length * 82 + 45)" y2="175" stroke="#9ca3af" stroke-width="1" />

                <!-- Grupos de barras -->
                <g v-for="(b, idx) in barData" :key="idx" :transform="`translate(${56 + idx * 80}, 0)`"
                   class="bar-group"
                   @mousemove="showTip($event, b.label, [
                     `Diagnóstica: ${b.hasDiag ? b.diag + '%' : 'Sin presentar'}`,
                     `Evaluación Final: ${b.hasFinal ? b.final + '%' : 'Sin presentar'}`,
                     `Avance exacto: ${fmtGain(b.gain)}`
                   ])"
                   @mouseleave="hideTip">
                  <!-- Barra Diagnóstica -->
                  <rect x="2" :y="175 - b.diag * 1.45" width="26" :height="Math.max(2, b.diag * 1.45)" fill="#006B6B" rx="2" />
                  <text v-if="b.hasDiag" x="15" :y="170 - b.diag * 1.45" font-size="9" font-weight="700" fill="#006B6B" text-anchor="middle">{{ b.diag }}%</text>

                  <!-- Barra Final -->
                  <rect x="30" :y="175 - b.final * 1.45" width="26" :height="Math.max(2, b.final * 1.45)" fill="#00B2B2" rx="2" />
                  <text v-if="b.hasFinal" x="43" :y="170 - b.final * 1.45" font-size="9" font-weight="700" fill="#008080" text-anchor="middle">{{ b.final }}%</text>

                  <!-- Etiqueta Eje X -->
                  <text x="29" y="191" font-size="9.5" fill="#4b5563" text-anchor="middle">{{ b.short }}</text>
                  <text x="29" y="204" font-size="8.5" fill="#9ca3af" text-anchor="middle">{{ b.sub }}</text>
                </g>
              </svg>
            </div>
            <p v-else class="empty-chart">Sin datos suficientes para los filtros actuales.</p>
          </div>

          <!-- Tabla Compacta Lateral estilo "Top 5 Channels" -->
          <div class="panel">
            <div class="panel-head">
              <h3>Resumen de Avance</h3>
            </div>
            <div class="mini-table-wrap">
              <table class="mini-table">
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Curso</th>
                    <th class="num">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in topTabla" :key="r.id">
                    <td class="clip" :title="r.trabajador">{{ r.trabajador }}</td>
                    <td class="clip" :title="r.curso">{{ r.curso }}</td>
                    <td class="num">
                      <span :class="['mini-gain', r.ganancia_pct > 0 ? 'pos' : r.ganancia_pct < 0 ? 'neg' : 'neu']">
                        {{ fmtGain(r.ganancia_pct) }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!topTabla.length">
                    <td colspan="3" class="mini-empty">Sin registros</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- FILA 3: 3 Tarjetas Analíticas Inferiores (Dona + Burbujas + Barras Horizontales) -->
        <section class="bot-row">
          <!-- Dona: Estado de Cumplimiento -->
          <div class="panel">
            <div class="panel-head">
              <h3>Estado de Cumplimiento</h3>
            </div>
            <div v-if="donutSlices.length" class="donut-layout">
              <svg viewBox="0 0 160 160" class="donut-svg">
                <circle cx="80" cy="80" r="56" fill="none" stroke="#eef2f6" stroke-width="24" />
                <circle v-for="s in donutSlices" :key="s.key"
                  cx="80" cy="80" r="56" fill="none"
                  :stroke="s.color" stroke-width="24"
                  :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset"
                  transform="rotate(-90 80 80)"
                  @mousemove="showTip($event, s.label, [`${s.count} registros (${s.pct}%)`])"
                  @mouseleave="hideTip" />
                <text x="80" y="77" text-anchor="middle" font-size="20" font-weight="800" fill="#05284B">{{ kpis.total }}</text>
                <text x="80" y="93" text-anchor="middle" font-size="9" fill="#6b7280">evaluados</text>
              </svg>
              <ul class="donut-legend">
                <li v-for="s in donutSlices" :key="s.key">
                  <span class="dot" :style="{ background: s.color }"></span>
                  <span class="dl-name">{{ s.label }}</span>
                  <b>{{ s.pct }}% ({{ s.count }})</b>
                </li>
              </ul>
            </div>
            <p v-else class="empty-chart">Sin evaluaciones registradas.</p>
          </div>

          <!-- Burbujas: Mapa de Ganancia (Diagnóstica vs Final) -->
          <div class="panel">
            <div class="panel-head">
              <h3>Mapa de Avance (Diagnóstica vs. Final)</h3>
              <div class="legend-inline">
                <span><i class="dot" style="background:#EC6A11"></i> Acreditado</span>
                <span><i class="dot" style="background:#006B6B"></i> Sin acreditar</span>
              </div>
            </div>
            <div v-if="bubblePoints.length" class="chart-box">
              <svg viewBox="0 0 330 190" class="bubble-svg">
                <!-- Ejes y línea y = x -->
                <line x1="42" y1="24" x2="42" y2="162" stroke="#9ca3af" stroke-width="1" />
                <line x1="42" y1="162" x2="306" y2="162" stroke="#9ca3af" stroke-width="1" />
                <line x1="42" y1="162" x2="302" y2="24" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="4 3" />
                <text x="295" y="20" font-size="8.5" fill="#94a3b8" text-anchor="end">Sin cambio (y=x)</text>

                <!-- Ticks X / Y -->
                <g v-for="t in [0, 50, 100]" :key="t">
                  <text x="36" :y="165 - (t / 100) * 138" font-size="8.5" fill="#6b7280" text-anchor="end">{{ t }}%</text>
                  <text :x="42 + (t / 100) * 260" y="175" font-size="8.5" fill="#6b7280" text-anchor="middle">{{ t }}%</text>
                </g>
                <text x="174" y="187" font-size="9" fill="#6b7280" text-anchor="middle">Nota Diagnóstica Inicial (%)</text>

                <!-- Burbujas -->
                <circle v-for="b in bubblePoints" :key="b.id"
                  :cx="b.cx" :cy="b.cy" :r="b.rad"
                  :fill="b.acreditado ? '#EC6A11' : '#006B6B'" fill-opacity="0.84"
                  stroke="#fff" stroke-width="1.5"
                  class="bubble-pt"
                  @mousemove="showTip($event, b.label, [
                    `Diagnóstica: ${b.diag !== null ? b.diag + '%' : '—'}`,
                    `Final: ${b.final !== null ? b.final + '%' : '—'}`,
                    `Ganancia: ${fmtGain(b.gain)}`
                  ])"
                  @mouseleave="hideTip" />
              </svg>
            </div>
            <p v-else class="empty-chart">Sin puntos para graficar.</p>
          </div>

          <!-- Barras Horizontales: Top Competencias Acreditadas -->
          <div class="panel">
            <div class="panel-head">
              <h3>{{ topCompetencias.modo === 'competencias' ? 'Top Competencias Acreditadas' : 'Cursos con Mayor Actividad' }}</h3>
            </div>
            <div v-if="topCompetencias.items.length" class="hbar-list">
              <div v-for="(item, i) in topCompetencias.items" :key="item.nombre" class="hbar-item">
                <div class="hbar-meta">
                  <span class="hbar-name" :title="item.nombre">{{ item.nombre }}</span>
                  <b>{{ item.total }}</b>
                </div>
                <div class="hbar-track">
                  <div class="hbar-fill" :style="{ width: item.pct + '%', background: i % 2 === 0 ? '#006B6B' : '#EC9A00' }"></div>
                </div>
              </div>
            </div>
            <p v-else class="empty-chart">Aún no hay competencias acreditadas.</p>
          </div>
        </section>

        <!-- FILA 4: TABLA DETALLADA DE INDICADORES INDIVIDUALES Y ACREDITACIONES -->
        <section class="panel detail-panel">
          <div class="panel-head">
            <div>
              <h3>
                {{ vista === 'curso' && cursoSeleccionado
                  ? `Participantes en "${cursoSeleccionado.titulo}" (${filasDetalle.length})`
                  : `Detalle Individual de Desempeño y Ruta Formativa (${filasDetalle.length})` }}
              </h3>
              <p class="panel-sub">
                Muestra la nota diagnóstica inicial, evaluación final, ganancia exacta y la vinculación con competencias y habilidades del puesto.
              </p>
            </div>
          </div>

          <div class="table-scroll">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>Trabajador / Puesto</th>
                  <th v-if="!(vista === 'curso' && cursoSeleccionado)">Curso</th>
                  <th class="num">Diagnóstica Inicial</th>
                  <th class="num">Evaluación Final</th>
                  <th class="num">Avance / Ganancia</th>
                  <th>Competencias y Habilidades (Vinculación)</th>
                  <th>Estado</th>
                  <th>Certificado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in filasDetalle" :key="r.id">
                  <td>
                    <div class="worker-name">{{ r.trabajador }}</div>
                    <div class="worker-role">
                      <span v-if="r.puesto">{{ r.puesto }}<template v-if="r.area"> · {{ r.area }}</template></span>
                      <span v-else class="muted">{{ r.email }}</span>
                    </div>
                  </td>
                  <td v-if="!(vista === 'curso' && cursoSeleccionado)">
                    <div class="course-title">{{ r.curso }}</div>
                    <div class="muted" v-if="r.duracion">{{ r.duracion }}</div>
                  </td>
                  <td class="num">
                    <template v-if="r.diag_pct !== null">
                      <b class="score">{{ r.diag_pct }}%</b>
                      <div class="muted">{{ r.diag_puntaje }} / {{ r.diag_total }} pts</div>
                    </template>
                    <span v-else class="muted">Sin presentar</span>
                  </td>
                  <td class="num">
                    <template v-if="r.final_pct !== null">
                      <b class="score">{{ r.final_pct }}%</b>
                      <div class="muted">{{ r.final_puntaje }} / {{ r.final_total }} pts</div>
                    </template>
                    <span v-else class="muted">Pendiente</span>
                  </td>
                  <td class="num">
                    <span v-if="r.ganancia_pct !== null"
                          :class="['gain-pill', r.ganancia_pct > 0 ? 'pos' : r.ganancia_pct < 0 ? 'neg' : 'neu']">
                      {{ r.ganancia_pct > 0 ? '▲' : r.ganancia_pct < 0 ? '▼' : '●' }} {{ fmtGain(r.ganancia_pct) }}
                    </span>
                    <div v-if="r.ganancia_pts !== null" class="muted">
                      ({{ r.ganancia_pts > 0 ? '+' : '' }}{{ r.ganancia_pts }} pts)
                    </div>
                    <span v-else-if="r.ganancia_pct === null" class="muted">—</span>
                  </td>
                  <td>
                    <div class="comp-cell">
                      <span v-if="r.alineado_puesto" class="align-badge" title="Coincide con el perfil del puesto en la estructura organizacional">★ Ruta del puesto</span>
                      <div v-if="r.curso_competencias?.length || r.curso_habilidades?.length" class="tags-wrap">
                        <span v-for="c in r.curso_competencias" :key="`c-${c}`"
                              :class="['pill comp', { match: r.competencias_vinculadas?.includes(c), acred: r.acreditado }]">
                          {{ r.acreditado ? '✓ ' : '' }}{{ c }}
                        </span>
                        <span v-for="h in r.curso_habilidades" :key="`h-${h}`"
                              :class="['pill hab', { match: r.habilidades_vinculadas?.includes(h), acred: r.acreditado }]">
                          {{ r.acreditado ? '✓ ' : '' }}{{ h }}
                        </span>
                      </div>
                      <span v-else class="muted">Sin competencias asignadas</span>
                    </div>
                  </td>
                  <td>
                    <span :class="['status-badge', r.estado]">{{ estadoLabel(r.estado) }}</span>
                    <div class="muted" v-if="r.ultima_fecha">{{ fmtFecha(r.ultima_fecha) }}</div>
                  </td>
                  <td>
                    <button v-if="r.certificado" class="cert-btn" @click="descargarCert(r.certificado)">📜 PDF</button>
                    <span v-else class="muted">—</span>
                  </td>
                </tr>
                <tr v-if="!filasDetalle.length">
                  <td :colspan="(vista === 'curso' && cursoSeleccionado) ? 7 : 8" class="empty-row">
                    No se encontraron registros con los filtros seleccionados.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Tooltip flotante interactivo -->
      <div v-if="tooltip" class="chart-tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        <strong>{{ tooltip.titulo }}</strong>
        <div v-for="(l, i) in tooltip.lineas" :key="i">{{ l }}</div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.rep-page { color: #1f2937; }
.rep-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;
}
.rep-head h1 { color: var(--navy); margin: 0; font-size: 1.65rem; }
.sub { color: #6b7280; font-size: .88rem; margin: .25rem 0 0; }

.head-actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.mode-tabs {
  display: inline-flex; background: #eef2f6; padding: 3px; border-radius: 999px;
}
.mode-tabs button {
  border: 0; background: transparent; color: #4b5563; font-weight: 700; font-size: .82rem;
  padding: .45rem 1rem; border-radius: 999px; cursor: pointer; transition: all .15s;
}
.mode-tabs button.active { background: var(--navy); color: #fff; box-shadow: 0 2px 8px rgba(5,40,75,.2); }

.btn-export {
  border: 1.5px solid #006B6B; background: #fff; color: #006B6B;
  font-weight: 700; font-size: .8rem; padding: .45rem .95rem; border-radius: 999px; cursor: pointer;
}
.btn-export:hover:not(:disabled) { background: #006B6B; color: #fff; }
.btn-export:disabled { opacity: .45; cursor: default; }

/* Filtros */
.filters-bar {
  display: flex; flex-wrap: wrap; gap: .75rem; align-items: flex-end;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: .85rem 1rem; margin-bottom: 1.1rem;
}
.f-item { display: flex; flex-direction: column; gap: .25rem; min-width: 190px; }
.f-item.grow { flex: 1; min-width: 210px; }
.f-item label { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
.f-item select, .f-item input {
  padding: .48rem .75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;
  background: #fff; color: var(--navy); font-size: .84rem; font-family: inherit;
}
.f-item select:focus, .f-item input:focus { outline: none; border-color: #006B6B; }
.chk-faltantes {
  display: inline-flex; align-items: center; gap: .4rem; font-size: .82rem; font-weight: 600;
  color: var(--navy); padding: .5rem .3rem; cursor: pointer;
}

.error { color: var(--danger); font-weight: 600; }
.loading-msg { color: #6b7280; padding: 2rem 0; text-align: center; }

/* Contenedor tipo Dashboard Ejecutivo (imagen 2) */
.dashboard-canvas {
  background: #f1f4f8; border-radius: 14px; padding: 1rem;
  display: flex; flex-direction: column; gap: 1rem;
}

/* Banner de curso */
.curso-banner {
  background: linear-gradient(135deg, #05284B 0%, #0b4a6f 100%);
  color: #fff; border-radius: 10px; padding: 1.1rem 1.3rem;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;
}
.cb-kicker { font-size: .68rem; font-weight: 800; letter-spacing: .08em; color: #FCE38A; }
.curso-banner h2 { margin: .15rem 0 .35rem; font-size: 1.25rem; }
.cb-meta { margin: 0; display: flex; gap: 1rem; font-size: .84rem; opacity: .92; flex-wrap: wrap; }
.cb-tags { display: flex; flex-direction: column; gap: .4rem; max-width: 520px; }
.cb-tag-group small { display: block; font-size: .7rem; opacity: .8; margin-bottom: .2rem; }

/* Fila 1: 4 KPI Cards */
.kpi-row {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: .9rem;
}
.kpi-card {
  border-radius: 6px; padding: .95rem 1.1rem; color: #fff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, .12);
  display: flex; flex-direction: column; justify-content: space-between; min-height: 132px;
  position: relative; overflow: hidden;
}
.kpi-teal { background: #006B6B; }
.kpi-cyan { background: #00B2B2; }
.kpi-amber { background: #EC9A00; }
.kpi-orange { background: #EC6A11; }

.kpi-title { font-size: .82rem; font-weight: 600; opacity: .92; z-index: 2; }
.kpi-visual { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: .35rem; }
.spark { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.kpi-val { font-size: 2.15rem; font-weight: 700; line-height: 1.1; z-index: 2; text-shadow: 0 1px 4px rgba(0,0,0,.12); }
.kpi-delta { font-size: .78rem; font-weight: 600; margin-top: .25rem; z-index: 2; color: #a7f3d0; }
.kpi-delta.dark { color: rgba(255,255,255,.92); }
.gauge-wrap { display: flex; justify-content: center; align-items: center; }
.gauge-svg { width: 175px; height: 98px; }

/* Paneles blancos */
.panel {
  background: #fff; border-radius: 6px; padding: 1rem 1.15rem;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .06);
}
.panel-head {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: .5rem; margin-bottom: .75rem;
}
.panel-head h3 { margin: 0; font-size: .92rem; font-weight: 700; color: #334155; }
.panel-sub { margin: .2rem 0 0; font-size: .78rem; color: #64748b; }

.legend-inline { display: flex; gap: .85rem; font-size: .74rem; color: #475569; align-items: center; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }

/* Fila 2 */
.mid-row { display: grid; grid-template-columns: 2fr 1fr; gap: .9rem; }
.chart-box { width: 100%; overflow-x: auto; }
.bar-svg { width: 100%; min-width: 460px; height: 225px; display: block; }
.bar-group { cursor: pointer; }
.bar-group:hover rect { opacity: .85; }

/* Tabla compacta lateral estilo referencia */
.mini-table-wrap { overflow-x: auto; }
.mini-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.mini-table thead th {
  background: #006B6B; color: #fff; text-align: left; padding: .48rem .55rem; font-weight: 700;
}
.mini-table tbody td {
  padding: .42rem .55rem; border-bottom: 1px solid #d7ecec; color: #1e293b;
}
.mini-table tbody tr:nth-child(odd) { background: #e8f5f5; }
.mini-table tbody tr:nth-child(even) { background: #f6fbfb; }
.mini-table .clip { max-width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-empty { text-align: center; color: #94a3b8; padding: 1.5rem !important; background: #fff !important; }
.mini-gain { font-weight: 700; }
.mini-gain.pos { color: #047857; }
.mini-gain.neg { color: #b91c1c; }
.mini-gain.neu { color: #64748b; }

/* Fila 3 */
.bot-row { display: grid; grid-template-columns: 1fr 1.35fr 1fr; gap: .9rem; }
.donut-layout { display: flex; flex-direction: column; align-items: center; gap: .6rem; }
.donut-svg { width: 150px; height: 150px; }
.donut-legend { list-style: none; padding: 0; margin: 0; width: 100%; display: flex; flex-direction: column; gap: .3rem; font-size: .78rem; }
.donut-legend li { display: flex; align-items: center; gap: .35rem; color: #334155; }
.dl-name { flex: 1; }

.bubble-svg { width: 100%; height: 195px; display: block; }
.bubble-pt { cursor: pointer; transition: r .15s; }

.hbar-list { display: flex; flex-direction: column; gap: .7rem; margin-top: .35rem; }
.hbar-meta { display: flex; justify-content: space-between; font-size: .78rem; margin-bottom: .22rem; color: #334155; gap: .5rem; }
.hbar-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hbar-track { height: 11px; background: #eef2f6; border-radius: 4px; overflow: hidden; }
.hbar-fill { height: 100%; border-radius: 4px; transition: width .3s ease; }

.empty-chart { text-align: center; color: #94a3b8; font-size: .82rem; padding: 2.5rem 0; margin: 0; }

/* Fila 4: Tabla detallada */
.table-scroll { overflow-x: auto; }
.detail-table { width: 100%; border-collapse: collapse; font-size: .83rem; }
.detail-table th {
  text-align: left; padding: .68rem .8rem; font-size: .72rem; text-transform: uppercase;
  letter-spacing: .04em; color: var(--navy); background: #f3f6fb; border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}
.detail-table td {
  padding: .7rem .8rem; border-bottom: 1px solid #eef2f6; vertical-align: middle;
}
.detail-table tbody tr:hover { background: #f8fafd; }
.num { text-align: right !important; white-space: nowrap; }
.worker-name { font-weight: 700; color: var(--navy); }
.worker-role { font-size: .75rem; color: #64748b; }
.course-title { font-weight: 600; color: #1e293b; }
.score { color: var(--navy); font-size: .9rem; }
.muted { font-size: .74rem; color: #94a3b8; }

.gain-pill {
  display: inline-block; padding: .18rem .6rem; border-radius: 999px; font-weight: 700; font-size: .76rem;
}
.gain-pill.pos { background: #dcfce7; color: #15803d; }
.gain-pill.neg { background: #fee2e2; color: #b91c1c; }
.gain-pill.neu { background: #f1f5f9; color: #475569; }

.comp-cell { display: flex; flex-direction: column; gap: .3rem; max-width: 300px; }
.align-badge {
  align-self: flex-start; font-size: .68rem; font-weight: 800; padding: .12rem .5rem;
  border-radius: 999px; background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;
}
.tags-wrap { display: flex; flex-wrap: wrap; gap: .25rem; }
.pill {
  font-size: .7rem; font-weight: 700; padding: .12rem .5rem; border-radius: 999px;
}
.pill.comp { background: #fdeee3; color: #c2410c; }
.pill.hab { background: #e0f2fe; color: #0369a1; }
.pill.acred.comp { background: #EC6A11; color: #fff; }
.pill.acred.hab { background: #006B6B; color: #fff; }
.pill.match { box-shadow: 0 0 0 1.5px #f59e0b; }

.status-badge {
  display: inline-block; font-size: .72rem; font-weight: 700; padding: .16rem .6rem; border-radius: 999px;
}
.status-badge.acreditado { background: #e6f4ea; color: #1a7f37; }
.status-badge.reprobado { background: #fdecec; color: #b42318; }
.status-badge.en_curso { background: #e0f7fa; color: #006B6B; }
.status-badge.pendiente { background: #fef3c7; color: #92400e; }

.cert-btn {
  border: 0; background: var(--orange); color: #fff; padding: .28rem .7rem;
  border-radius: 999px; font-size: .73rem; font-weight: 700; cursor: pointer;
}
.empty-row { text-align: center; color: #94a3b8; padding: 2.5rem !important; }

/* Tooltip */
.chart-tooltip {
  position: fixed; z-index: 999; pointer-events: none;
  background: rgba(5, 40, 75, .94); color: #fff; padding: .5rem .75rem;
  border-radius: 8px; font-size: .75rem; line-height: 1.45;
  box-shadow: 0 8px 20px rgba(0,0,0,.22); max-width: 260px;
}
.chart-tooltip strong { display: block; margin-bottom: .15rem; color: #FCE38A; }

@media (max-width: 1080px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .mid-row, .bot-row { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .kpi-row { grid-template-columns: 1fr; }
}
</style>
