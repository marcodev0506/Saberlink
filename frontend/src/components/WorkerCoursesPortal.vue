<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { get } from '../api.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const loading = ref(true);
const error = ref('');
const perfil = ref(null);
const resumen = ref({ avance_general_pct: 0, en_progreso: 0, disponibles: 0, completados: 0, total_relacionados: 0 });
const competenciasResumen = ref([]);
const cursosEnCurso = ref([]);
const cursosRelacionados = ref([]);
const certificados = ref([]);

const tab = ref('panel'); // 'panel' | 'catalogo' | 'certificados'
const filtroTag = ref(''); // competencia o habilidad seleccionada
const busqueda = ref('');
const pagina = ref(1);
const POR_PAGINA = 10;
const carruselIdx = ref(0);
const imagenes = ref({});

onMounted(async () => {
  try {
    const data = await get('/api/cursos/mi-portal');
    perfil.value = data.perfil;
    resumen.value = data.resumen;
    competenciasResumen.value = data.competencias_resumen || [];
    cursosEnCurso.value = data.cursos_en_curso || [];
    cursosRelacionados.value = data.cursos_relacionados || [];
    certificados.value = data.certificados || [];
    await cargarImagenes(cursosRelacionados.value.slice(0, POR_PAGINA));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function cargarImagenes(lista) {
  const token = localStorage.getItem('token');
  for (const c of lista) {
    if (!c.imagen_path || imagenes.value[c.id]) continue;
    try {
      const r = await fetch(`${API}/api/cursos/${c.id}/imagen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) imagenes.value[c.id] = URL.createObjectURL(await r.blob());
    } catch { /* ignorar */ }
  }
}

// Cursos destacados en el bloque naranja: si hay en progreso los muestra, si no muestra los recomendados
const cursosDestacados = computed(() =>
  cursosEnCurso.value.length ? cursosEnCurso.value : cursosRelacionados.value.filter((c) => !c.acreditado)
);
const destacadosVisibles = computed(() => cursosDestacados.value.slice(carruselIdx.value, carruselIdx.value + 3));
const puedePrev = computed(() => carruselIdx.value > 0);
const puedeNext = computed(() => carruselIdx.value + 3 < cursosDestacados.value.length);

// Catálogo filtrado por competencia/habilidad seleccionada y búsqueda
const norm = (s) => String(s || '').trim().toLowerCase();
const catalogoFiltrado = computed(() => {
  const q = norm(busqueda.value);
  const tag = norm(filtroTag.value);
  return cursosRelacionados.value.filter((c) => {
    if (tag) {
      const tiene = [...(c.competencias || []), ...(c.habilidades || [])].some((x) => norm(x) === tag);
      if (!tiene) return false;
    }
    if (q) {
      const txt = [c.titulo, c.objetivo, ...(c.competencias || []), ...(c.habilidades || [])].join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });
});
const totalPaginas = computed(() => Math.max(1, Math.ceil(catalogoFiltrado.value.length / POR_PAGINA)));
const catalogoPaginado = computed(() => {
  const start = (pagina.value - 1) * POR_PAGINA;
  return catalogoFiltrado.value.slice(start, start + POR_PAGINA);
});
watch([busqueda, filtroTag, tab], () => { pagina.value = 1; });
watch(catalogoPaginado, (list) => cargarImagenes(list));

// Iniciales para el avatar
const iniciales = computed(() => {
  const n = (perfil.value?.nombre || 'T').trim().split(/\s+/);
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase() || 'T';
});

// Anillo de progreso circular del avatar
const avatarRing = computed(() => {
  const r = 46;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, resumen.value.avance_general_pct || 0));
  return { C: C.toFixed(1), dash: ((pct / 100) * C).toFixed(1) };
});

// Porcentajes para la barra tricolor de actividad
const pctsActividad = computed(() => {
  const t = resumen.value.total_relacionados || 1;
  const pProg = Math.round((resumen.value.en_progreso / t) * 100);
  const pDisp = Math.round((resumen.value.disponibles / t) * 100);
  const pComp = Math.round((resumen.value.completados / t) * 100);
  return { pProg, pDisp, pComp };
});

// Top 4-6 competencias/habilidades para la gráfica de barras verticales estilo EasyLearn
const barrasCompetencias = computed(() => competenciasResumen.value.slice(0, 5));

function seleccionarTag(nombre) {
  filtroTag.value = filtroTag.value === nombre ? '' : nombre;
}

function verTodoCatalogo() {
  tab.value = 'catalogo';
}

async function descargarCert(codigo) {
  const r = await fetch(`${API}/api/certificados/${codigo}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
}

function vigenciaLabel(v) {
  return { vigente: 'Vigente', proximo_vencer: 'Próximo a vencer', vencido: 'Vencido' }[v] || v;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
</script>

<template>
  <div class="portal-shell">
    <!-- Barra de navegación modular tipo pill (inspiración EasyLearn) -->
    <div class="portal-nav">
      <div class="portal-brand">
        <span class="portal-dot">✦</span>
        <div>
          <strong>Portal del Trabajador</strong>
          <small v-if="perfil">{{ perfil.empresa }}</small>
        </div>
      </div>

      <div class="pill-tabs">
        <button :class="{ active: tab === 'panel' }" @click="tab = 'panel'">
          ⊞ Mi Panel
        </button>
        <button :class="{ active: tab === 'catalogo' }" @click="tab = 'catalogo'">
          📚 Cursos Disponibles <span class="cnt">{{ cursosRelacionados.length }}</span>
        </button>
        <button :class="{ active: tab === 'certificados' }" @click="tab = 'certificados'">
          🏅 Certificados <span class="cnt">{{ certificados.length }}</span>
        </button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="loading-box">Cargando tu ruta formativa y competencias…</p>

    <template v-else-if="perfil">
      <!-- ==================== TAB 1: MI PANEL ==================== -->
      <div v-if="tab === 'panel'" class="panel-view">
        <div class="bento-grid">
          <!-- COLUMNA IZQUIERDA: 1. Panel de Perfil y Resumen del Trabajador -->
          <aside class="profile-card">
            <div class="card-top">
              <span class="card-kicker">Mi Perfil</span>
              <button class="pill-mini" @click="tab = 'certificados'">Ver historial</button>
            </div>

            <div class="avatar-block">
              <div class="avatar-ring">
                <svg viewBox="0 0 104 104" class="ring-svg">
                  <circle cx="52" cy="52" r="46" fill="none" stroke="#eef1f6" stroke-width="5" />
                  <circle cx="52" cy="52" r="46" fill="none" stroke="#EC6A11" stroke-width="5" stroke-linecap="round"
                    :stroke-dasharray="`${avatarRing.dash} ${avatarRing.C}`"
                    transform="rotate(-90 52 52)" />
                </svg>
                <div class="avatar-circle">{{ iniciales }}</div>
                <span class="insignia-pill">{{ perfil.insignia }}</span>
              </div>

              <h2 class="welcome">Hola, {{ perfil.nombre }} 👋</h2>
              <div class="worker-meta">
                <span v-if="perfil.cargo" class="meta-role">{{ perfil.cargo }}</span>
                <span v-else class="meta-role muted">Cargo no asignado en estructura</span>
                <div class="meta-details">
                  <span v-if="perfil.ci">🪪 {{ perfil.ci }}</span>
                  <span v-if="perfil.unidad">🏢 {{ perfil.unidad }}</span>
                </div>
              </div>
            </div>

            <!-- Avance general + barra tricolor -->
            <div class="activity-block">
              <div class="act-head">
                <span class="act-big">{{ resumen.avance_general_pct }}%</span>
                <span class="act-label">Avance general<br>de ruta formativa</span>
              </div>
              <div class="tri-bar">
                <span class="seg prog" :style="{ flex: Math.max(resumen.en_progreso, 0.3) }"></span>
                <span class="seg disp" :style="{ flex: Math.max(resumen.disponibles, 0.3) }"></span>
                <span class="seg comp" :style="{ flex: Math.max(resumen.completados, 0.3) }"></span>
              </div>
              <div class="tri-labels">
                <span>{{ pctsActividad.pProg }}%</span>
                <span>{{ pctsActividad.pDisp }}%</span>
                <span>{{ pctsActividad.pComp }}%</span>
              </div>
            </div>

            <!-- 3 Tarjetas de resumen inferior -->
            <div class="stat-tri">
              <div class="stat-box" @click="tab = 'catalogo'">
                <span class="s-ico purple">◷</span>
                <b>{{ resumen.en_progreso }}</b>
                <small>En curso</small>
              </div>
              <div class="stat-box" @click="tab = 'catalogo'">
                <span class="s-ico yellow">▤</span>
                <b>{{ resumen.disponibles }}</b>
                <small>Disponibles</small>
              </div>
              <div class="stat-box" @click="tab = 'certificados'">
                <span class="s-ico coral">✦</span>
                <b>{{ resumen.completados }}</b>
                <small>Acreditados</small>
              </div>
            </div>
          </aside>

          <!-- COLUMNA DERECHA -->
          <div class="right-col">
            <!-- 3. BLOQUE CORAL DESTACADO: Progreso de Cursos Actuales -->
            <section class="featured-courses">
              <div class="fc-head">
                <div>
                  <h2>{{ cursosEnCurso.length ? 'Tus cursos en progreso' : 'Cursos recomendados para tu puesto' }}</h2>
                  <p v-if="!cursosEnCurso.length && cursosDestacados.length" class="fc-sub">
                    Alineados con tus competencias y habilidades — selecciona uno para comenzar.
                  </p>
                </div>
                <div class="fc-controls">
                  <div class="arrows" v-if="cursosDestacados.length > 3">
                    <button :disabled="!puedePrev" @click="carruselIdx--">‹</button>
                    <button :disabled="!puedeNext" @click="carruselIdx++">›</button>
                  </div>
                  <button class="btn-white-pill" @click="verTodoCatalogo">Ver todos</button>
                </div>
              </div>

              <div v-if="destacadosVisibles.length" class="fc-cards">
                <article v-for="c in destacadosVisibles" :key="c.id" class="fc-card" @click="$router.push(`/cursos/${c.id}`)">
                  <div>
                    <h3 :title="c.titulo">{{ c.titulo }}</h3>
                    <div class="fc-pills">
                      <span class="soft-pill">{{ c.nivel }}</span>
                      <span class="soft-pill" v-if="c.modulos_total">{{ c.modulos_completados }}/{{ c.modulos_total }} módulos</span>
                      <span class="soft-pill" v-else-if="c.duracion">{{ c.duracion }}</span>
                    </div>
                    <div class="fc-comp-tag" v-if="c.match_competencias[0] || c.match_habilidades[0]">
                      ★ {{ c.match_competencias[0] || c.match_habilidades[0] }}
                    </div>
                  </div>

                  <div class="fc-bottom">
                    <div class="prog-row">
                      <span><b>{{ c.progreso_pct }}%</b> completado</span>
                      <span v-if="c.diag_pct !== null" class="nota-chip">Diag: {{ c.diag_pct }}%</span>
                    </div>
                    <div class="prog-track">
                      <div class="prog-fill" :style="{ width: Math.max(c.progreso_pct, 4) + '%' }"></div>
                    </div>
                    <div class="fc-footer">
                      <div class="mentor">
                        <span class="m-ava">{{ c.facilitador[0] }}</span>
                        <div>
                          <small>Facilitador</small>
                          <b>{{ c.facilitador }}</b>
                        </div>
                      </div>
                      <button class="btn-go" @click.stop="$router.push(`/cursos/${c.id}`)">
                        {{ c.en_progreso ? 'Continuar →' : 'Iniciar →' }}
                      </button>
                    </div>
                  </div>
                </article>
              </div>

              <div v-else class="fc-empty">
                <template v-if="!perfil.tiene_puesto || (!perfil.competencias_puesto.length && !perfil.habilidades_puesto.length)">
                  Tu perfil aún no tiene competencias ni habilidades asignadas en la Estructura Organizacional.
                  Solicita a RRHH vincular tu correo (<b>{{ perfil.email }}</b>) y perfil de cargo para desbloquear tu ruta formativa.
                </template>
                <template v-else-if="resumen.completados > 0">
                  ¡Excelente trabajo! Has completado todos los cursos relacionados con tus competencias actuales. 🎉
                </template>
                <template v-else>
                  No hay cursos publicados que coincidan aún con tus competencias o habilidades inscritas.
                </template>
              </div>
            </section>

            <!-- FILA INFERIOR DERECHA: 2. Habilidades/Competencias + Resumen de Acreditación -->
            <div class="lower-grid">
              <!-- Tarjeta: Habilidades y Competencias Inscritas (gráfica de columnas estilo Study process) -->
              <section class="white-card">
                <div class="card-top">
                  <h3>Habilidades y Competencias</h3>
                  <span class="pill-mini soft">{{ competenciasResumen.length }} vinculadas</span>
                </div>

                <div v-if="barrasCompetencias.length" class="skills-chart">
                  <div v-for="(item, idx) in barrasCompetencias" :key="item.tipo + item.nombre"
                       class="skill-col"
                       :class="{ selected: filtroTag === item.nombre }"
                       @click="seleccionarTag(item.nombre)"
                       :title="`${item.nombre} (${item.cursos_acreditados}/${item.cursos_relacionados} cursos acreditados)`">
                    <div class="col-track">
                      <div class="col-bar" :class="{ highlight: idx === 0 || item.dominio_pct >= 70 || filtroTag === item.nombre }"
                           :style="{ height: Math.max(22, item.dominio_pct) + '%' }">
                        <span class="col-pct" :class="{ dark: idx === 0 || item.dominio_pct >= 70 || filtroTag === item.nombre }">
                          {{ item.dominio_pct }}%
                        </span>
                      </div>
                    </div>
                    <span class="col-label">{{ item.nombre.length > 13 ? item.nombre.slice(0, 12) + '…' : item.nombre }}</span>
                  </div>
                </div>
                <p v-else class="muted-empty">Sin competencias o habilidades registradas en tu puesto.</p>

                <!-- Chips filtrables de todas las competencias/habilidades -->
                <div v-if="competenciasResumen.length" class="skill-chips">
                  <button v-for="c in competenciasResumen" :key="`ch-${c.tipo}-${c.nombre}`"
                          :class="['sk-chip', c.tipo, { active: filtroTag === c.nombre }]"
                          @click="seleccionarTag(c.nombre)">
                    {{ c.nombre }} <b>({{ c.cursos_relacionados }})</b>
                  </button>
                </div>
              </section>

              <!-- Tarjeta: Resumen de Acreditación y Último Certificado (estilo AI card con degradado suave) -->
              <section class="accent-card">
                <div class="accent-top">
                  <span class="pill-white">🏅 Acreditación</span>
                  <button class="pill-white" @click="tab = 'certificados'">Ver todos</button>
                </div>

                <div class="accent-body">
                  <h3>Tu avance en acreditaciones</h3>
                  <p v-if="certificados.length" class="accent-desc">
                    Último certificado obtenido: <b>{{ certificados[0].curso }}</b>
                    ({{ certificados[0].final_pct }}% · {{ fmtFecha(certificados[0].created_at) }}).
                  </p>
                  <p v-else class="accent-desc">
                    Aprueba la evaluación teórica de tus cursos relacionados para obtener certificados PDF con código QR verificable.
                  </p>

                  <div class="accent-actions">
                    <button v-if="certificados.length" class="btn-dark" @click="descargarCert(certificados[0].codigo)">
                      📜 Descargar último PDF
                    </button>
                    <button class="btn-outline" @click="tab = 'catalogo'">
                      Explorar mis cursos ({{ cursosRelacionados.length }})
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- 4. CATÁLOGO VISUAL DE CURSOS RELACIONADOS (también visible al bajar en Mi Panel) -->
        <section class="catalog-section">
          <div class="sec-head">
            <div>
              <h2>Cursos para tu Ruta Formativa</h2>
              <p class="sec-sub">
                Mostrando únicamente cursos con al menos una competencia o habilidad vinculada a tu cargo.
                <button v-if="filtroTag" class="clear-tag" @click="filtroTag = ''">Filtro: {{ filtroTag }} ✕</button>
              </p>
            </div>
            <input v-model="busqueda" class="search-pill" placeholder="🔍 Buscar en mis cursos…" />
          </div>

          <div v-if="catalogoPaginado.length" class="course-grid">
            <article v-for="c in catalogoPaginado" :key="c.id" class="c-card" @click="$router.push(`/cursos/${c.id}`)">
              <div class="c-cover" :style="imagenes[c.id] ? { backgroundImage: `url(${imagenes[c.id]})` } : {}">
                <span v-if="!imagenes[c.id]" class="cover-ph">📘</span>
                <span :class="['c-badge', c.acreditado ? 'ok' : c.en_progreso ? 'prog' : 'disp']">
                  {{ c.acreditado ? '✓ Acreditado' : c.en_progreso ? 'En progreso' : c.nivel }}
                </span>
              </div>
              <div class="c-body">
                <h3>{{ c.titulo }}</h3>
                <p class="c-obj">{{ c.objetivo || 'Formación alineada con las competencias de tu puesto.' }}</p>

                <div class="c-tags">
                  <span v-for="t in c.match_competencias" :key="`mc-${t}`" class="t-pill comp" title="Coincide con tu puesto">★ {{ t }}</span>
                  <span v-for="t in c.match_habilidades" :key="`mh-${t}`" class="t-pill hab" title="Coincide con tu puesto">★ {{ t }}</span>
                </div>

                <div v-if="c.en_progreso || c.acreditado" class="c-prog">
                  <div class="prog-track">
                    <div class="prog-fill" :style="{ width: c.progreso_pct + '%' }"></div>
                  </div>
                  <small>{{ c.progreso_pct }}%</small>
                </div>

                <div class="c-foot">
                  <span class="c-dur">{{ c.duracion || (c.modulos_total ? `${c.modulos_total} módulos` : 'Autoestudio') }}</span>
                  <button class="c-cta" @click.stop="$router.push(`/cursos/${c.id}`)">
                    {{ c.acreditado ? 'Repasar' : c.en_progreso ? 'Continuar →' : 'Iniciar curso →' }}
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="empty-catalog">
            <p v-if="!cursosRelacionados.length">
              No tienes cursos relacionados todavía. Verifica con RRHH que tu puesto en la Estructura Organizacional tenga competencias o habilidades asignadas.
            </p>
            <p v-else>No hay cursos que coincidan con el filtro seleccionado.</p>
          </div>

          <div v-if="catalogoFiltrado.length > POR_PAGINA" class="pager">
            <span class="pager-info">
              Mostrando {{ (pagina - 1) * POR_PAGINA + 1 }}–{{ Math.min(pagina * POR_PAGINA, catalogoFiltrado.length) }} de {{ catalogoFiltrado.length }} cursos · Página {{ pagina }} de {{ totalPaginas }}
            </span>
            <div class="pager-btns">
              <button :disabled="pagina === 1" @click="pagina--">← Anterior</button>
              <button :disabled="pagina === totalPaginas" @click="pagina++">Siguiente →</button>
            </div>
          </div>
        </section>
      </div>

      <!-- ==================== TAB 2: CATÁLOGO COMPLETO RELACIONADO ==================== -->
      <div v-else-if="tab === 'catalogo'" class="tab-panel">
        <div class="sec-head">
          <div>
            <h2>Catálogo de Cursos para tu Perfil</h2>
            <p class="sec-sub">Solo se muestran cursos vinculados a tus competencias y habilidades del puesto ({{ cursosRelacionados.length }} disponibles).</p>
          </div>
          <input v-model="busqueda" class="search-pill" placeholder="🔍 Buscar curso, competencia o habilidad…" />
        </div>

        <div v-if="competenciasResumen.length" class="filter-chips">
          <button :class="['sk-chip', { active: !filtroTag }]" @click="filtroTag = ''">Todas ({{ cursosRelacionados.length }})</button>
          <button v-for="c in competenciasResumen" :key="`f-${c.tipo}-${c.nombre}`"
                  :class="['sk-chip', c.tipo, { active: filtroTag === c.nombre }]"
                  @click="seleccionarTag(c.nombre)">
            {{ c.nombre }} ({{ c.cursos_relacionados }})
          </button>
        </div>

        <div v-if="catalogoPaginado.length" class="course-grid">
          <article v-for="c in catalogoPaginado" :key="c.id" class="c-card" @click="$router.push(`/cursos/${c.id}`)">
            <div class="c-cover" :style="imagenes[c.id] ? { backgroundImage: `url(${imagenes[c.id]})` } : {}">
              <span v-if="!imagenes[c.id]" class="cover-ph">📘</span>
              <span :class="['c-badge', c.acreditado ? 'ok' : c.en_progreso ? 'prog' : 'disp']">
                {{ c.acreditado ? '✓ Acreditado' : c.en_progreso ? 'En progreso' : c.nivel }}
              </span>
            </div>
            <div class="c-body">
              <h3>{{ c.titulo }}</h3>
              <p class="c-obj">{{ c.objetivo || 'Formación alineada con las competencias de tu puesto.' }}</p>
              <div class="c-tags">
                <span v-for="t in c.match_competencias" :key="`mc2-${t}`" class="t-pill comp">★ {{ t }}</span>
                <span v-for="t in c.match_habilidades" :key="`mh2-${t}`" class="t-pill hab">★ {{ t }}</span>
              </div>
              <div class="c-foot">
                <span class="c-dur">{{ c.duracion || (c.modulos_total ? `${c.modulos_total} módulos` : 'Autoestudio') }}</span>
                <button class="c-cta" @click.stop="$router.push(`/cursos/${c.id}`)">
                  {{ c.acreditado ? 'Repasar' : c.en_progreso ? 'Continuar →' : 'Iniciar curso →' }}
                </button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="empty-catalog">
          No se encontraron cursos vinculados a tus competencias con los filtros actuales.
        </div>

        <div v-if="catalogoFiltrado.length > POR_PAGINA" class="pager">
          <span class="pager-info">
            Mostrando {{ (pagina - 1) * POR_PAGINA + 1 }}–{{ Math.min(pagina * POR_PAGINA, catalogoFiltrado.length) }} de {{ catalogoFiltrado.length }} cursos · Página {{ pagina }} de {{ totalPaginas }}
          </span>
          <div class="pager-btns">
            <button :disabled="pagina === 1" @click="pagina--">← Anterior</button>
            <button :disabled="pagina === totalPaginas" @click="pagina++">Siguiente →</button>
          </div>
        </div>
      </div>

      <!-- ==================== TAB 3: 5. HISTÓRICO DE CERTIFICADOS ACREDITADOS ==================== -->
      <div v-else class="tab-panel">
        <div class="sec-head">
          <div>
            <h2>Histórico de Certificados Acreditados</h2>
            <p class="sec-sub">Registro formal de tus cursos aprobados, avance diagnóstico vs. final, competencias acreditadas y vigencia.</p>
          </div>
        </div>

        <div class="cert-table-wrap">
          <table class="cert-table">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Competencias / Habilidades Acreditadas</th>
                <th class="num">Diagnóstica</th>
                <th class="num">Final</th>
                <th class="num">Avance</th>
                <th>Emisión</th>
                <th>Vigencia</th>
                <th>Certificado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ce in certificados" :key="ce.codigo">
                <td>
                  <div class="ct-title">{{ ce.curso }}</div>
                  <small class="muted" v-if="ce.duracion">{{ ce.duracion }}</small>
                </td>
                <td>
                  <div class="c-tags">
                    <span v-for="t in ce.competencias" :key="`cc-${t}`" class="t-pill comp">✓ {{ t }}</span>
                    <span v-for="t in ce.habilidades" :key="`ch-${t}`" class="t-pill hab">✓ {{ t }}</span>
                    <span v-if="!ce.competencias.length && !ce.habilidades.length" class="muted">—</span>
                  </div>
                </td>
                <td class="num">
                  <template v-if="ce.diag_pct !== null">
                    <b>{{ ce.diag_pct }}%</b>
                    <div class="muted">{{ ce.diag_puntaje }}/{{ ce.diag_total }}</div>
                  </template>
                  <span v-else class="muted">—</span>
                </td>
                <td class="num">
                  <b>{{ ce.final_pct }}%</b>
                  <div class="muted">{{ ce.final_puntaje }}/{{ ce.final_total }}</div>
                </td>
                <td class="num">
                  <span v-if="ce.ganancia_pct !== null" :class="['gain-chip', ce.ganancia_pct >= 0 ? 'pos' : 'neg']">
                    {{ ce.ganancia_pct > 0 ? '+' : '' }}{{ ce.ganancia_pct }}%
                  </span>
                  <span v-else class="muted">—</span>
                </td>
                <td>{{ fmtFecha(ce.created_at) }}</td>
                <td>
                  <span :class="['vig-badge', ce.vigencia_estado]">{{ vigenciaLabel(ce.vigencia_estado) }}</span>
                  <div class="muted">Hasta {{ fmtFecha(ce.vence_at) }}</div>
                </td>
                <td>
                  <button class="btn-pdf" @click="descargarCert(ce.codigo)">📜 Ver PDF</button>
                </td>
              </tr>
              <tr v-if="!certificados.length">
                <td colspan="8" class="empty-cert">
                  Aún no tienes certificados acreditados. Completa un curso y aprueba su evaluación teórica para obtener tu acreditación.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.portal-shell {
  background: #f4f6fa;
  border-radius: 26px;
  padding: 1.25rem;
  color: #1f2937;
}

/* Top Pill Nav */
.portal-nav {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 1rem; margin-bottom: 1.2rem;
}
.portal-brand { display: flex; align-items: center; gap: .65rem; }
.portal-dot {
  width: 36px; height: 36px; border-radius: 12px;
  background: linear-gradient(135deg, #FF6446, #EC6A11);
  color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
}
.portal-brand strong { display: block; color: var(--navy); font-size: 1.05rem; line-height: 1.1; }
.portal-brand small { color: #64748b; font-size: .78rem; }

.pill-tabs {
  display: inline-flex; background: #fff; padding: 4px; border-radius: 999px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, .06); gap: .25rem; flex-wrap: wrap;
}
.pill-tabs button {
  border: 0; background: transparent; color: #475569; font-weight: 700; font-size: .82rem;
  padding: .5rem 1.05rem; border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; gap: .4rem;
  transition: all .15s;
}
.pill-tabs button:hover { color: var(--navy); }
.pill-tabs button.active { background: #14171f; color: #fff; }
.pill-tabs .cnt {
  background: rgba(148, 163, 184, .22); padding: .05rem .45rem; border-radius: 999px; font-size: .72rem;
}
.pill-tabs button.active .cnt { background: rgba(255, 255, 255, .2); color: #fff; }

.error { color: var(--danger); font-weight: 600; }
.loading-box { text-align: center; padding: 3rem 0; color: #64748b; }

/* Main Bento Grid (EasyLearn layout) */
.bento-grid {
  display: grid; grid-template-columns: 315px 1fr; gap: 1.15rem; align-items: stretch;
}

/* Profile Card */
.profile-card {
  background: #fff; border-radius: 24px; padding: 1.35rem;
  box-shadow: 0 6px 24px rgba(15, 23, 42, .05);
  display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;
}
.card-top { display: flex; justify-content: space-between; align-items: center; }
.card-kicker { font-weight: 800; font-size: 1rem; color: #111827; }
.pill-mini {
  border: 0; background: #f1f5f9; color: #475569; font-size: .74rem; font-weight: 700;
  padding: .3rem .75rem; border-radius: 999px; cursor: pointer;
}
.pill-mini:hover { background: #e2e8f0; }

.avatar-block { text-align: center; }
.avatar-ring { position: relative; width: 104px; height: 104px; margin: 0 auto .7rem; }
.ring-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.avatar-circle {
  position: absolute; inset: 10px; border-radius: 50%;
  background: linear-gradient(135deg, var(--navy), #1e4b7a);
  color: #fff; font-size: 1.7rem; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.insignia-pill {
  position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
  background: #FF6446; color: #fff; font-size: .68rem; font-weight: 800;
  padding: .18rem .7rem; border-radius: 999px; white-space: nowrap;
  box-shadow: 0 3px 8px rgba(255, 100, 70, .35);
}
.welcome { margin: .85rem 0 .25rem; font-size: 1.18rem; color: #111827; }
.worker-meta { display: flex; flex-direction: column; gap: .25rem; }
.meta-role { font-size: .82rem; font-weight: 700; color: var(--navy); }
.meta-details { display: flex; justify-content: center; flex-wrap: wrap; gap: .5rem; font-size: .74rem; color: #64748b; }

.activity-block { margin-top: .25rem; }
.act-head { display: flex; align-items: center; gap: .75rem; margin-bottom: .55rem; }
.act-big { font-size: 2.3rem; font-weight: 800; color: #111827; line-height: 1; }
.act-label { font-size: .78rem; color: #64748b; line-height: 1.3; }
.tri-bar { display: flex; gap: 4px; height: 7px; }
.tri-bar .seg { border-radius: 999px; }
.tri-bar .prog { background: #e879f9; }
.tri-bar .disp { background: #facc15; }
.tri-bar .comp { background: #FF6446; }
.tri-labels { display: flex; justify-content: space-between; font-size: .72rem; font-weight: 700; color: #475569; margin-top: .3rem; }

.stat-tri {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem;
  background: #f8fafc; border-radius: 18px; padding: .75rem .45rem;
}
.stat-box {
  display: flex; flex-direction: column; align-items: center; gap: .25rem; cursor: pointer;
  padding: .25rem; border-radius: 12px; transition: background .15s;
}
.stat-box:hover { background: #fff; }
.stat-box b { font-size: 1.25rem; color: #111827; line-height: 1; }
.stat-box small { font-size: .7rem; color: #64748b; font-weight: 600; }
.s-ico {
  width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: .85rem; margin-bottom: .15rem;
}
.s-ico.purple { background: #f3e8ff; color: #9333ea; }
.s-ico.yellow { background: #fef3c7; color: #d97706; }
.s-ico.coral { background: #ffedd5; color: #ea580c; }

/* Right Column */
.right-col { display: flex; flex-direction: column; gap: 1.15rem; min-width: 0; }

/* Coral Featured Block ("Your courses") */
.featured-courses {
  background: linear-gradient(135deg, #FF6747 0%, #EC6A11 100%);
  border-radius: 24px; padding: 1.35rem; color: #fff;
  box-shadow: 0 10px 26px rgba(236, 106, 17, .22);
}
.fc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
.fc-head h2 { margin: 0; font-size: 1.35rem; font-weight: 700; }
.fc-sub { margin: .2rem 0 0; font-size: .82rem; opacity: .9; }
.fc-controls { display: flex; align-items: center; gap: .5rem; }
.arrows { display: inline-flex; background: #fff; border-radius: 999px; overflow: hidden; }
.arrows button {
  border: 0; background: transparent; color: #111827; width: 30px; height: 30px;
  cursor: pointer; font-size: 1rem; font-weight: 700;
}
.arrows button:disabled { opacity: .35; cursor: default; }
.btn-white-pill {
  border: 0; background: #fff; color: #111827; font-weight: 700; font-size: .78rem;
  padding: .42rem .9rem; border-radius: 999px; cursor: pointer;
}

.fc-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: .85rem; }
.fc-card {
  background: #fff; color: #111827; border-radius: 18px; padding: 1.05rem;
  display: flex; flex-direction: column; justify-content: space-between; gap: .85rem;
  cursor: pointer; transition: transform .15s, box-shadow .15s;
}
.fc-card:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(0, 0, 0, .14); }
.fc-card h3 {
  margin: 0 0 .5rem; font-size: .95rem; color: #111827; line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.fc-pills { display: flex; flex-wrap: wrap; gap: .3rem; }
.soft-pill {
  background: #fff1ed; color: #c2410c; font-size: .68rem; font-weight: 700;
  padding: .16rem .55rem; border-radius: 999px;
}
.fc-comp-tag {
  margin-top: .45rem; font-size: .72rem; font-weight: 700; color: var(--navy);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.prog-row { display: flex; justify-content: space-between; align-items: center; font-size: .76rem; color: #475569; margin-bottom: .35rem; }
.prog-row b { color: #111827; font-size: .92rem; }
.nota-chip { background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: .68rem; padding: .1rem .45rem; border-radius: 999px; }
.prog-track { height: 6px; background: #eef1f6; border-radius: 999px; overflow: hidden; }
.prog-fill { height: 100%; background: linear-gradient(90deg, #FF6747, #EC6A11); border-radius: 999px; }

.fc-footer { display: flex; justify-content: space-between; align-items: center; gap: .4rem; margin-top: .75rem; }
.mentor { display: flex; align-items: center; gap: .45rem; min-width: 0; }
.m-ava {
  width: 28px; height: 28px; border-radius: 50%; background: #e2e8f0; color: var(--navy);
  font-weight: 800; font-size: .75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mentor small { display: block; font-size: .65rem; color: #94a3b8; line-height: 1; }
.mentor b { display: block; font-size: .73rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95px; }
.btn-go {
  border: 0; background: #14171f; color: #fff; font-size: .72rem; font-weight: 700;
  padding: .34rem .7rem; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.btn-go:hover { background: var(--navy); }
.fc-empty {
  background: rgba(255, 255, 255, .16); border-radius: 16px; padding: 1.25rem;
  font-size: .88rem; line-height: 1.5;
}

/* Lower Right Row (2 cards) */
.lower-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 1.15rem; }
.white-card {
  background: #fff; border-radius: 24px; padding: 1.25rem;
  box-shadow: 0 6px 24px rgba(15, 23, 42, .05);
  display: flex; flex-direction: column; gap: .85rem;
}
.white-card h3 { margin: 0; font-size: 1rem; color: #111827; }

/* Study Process style vertical bars */
.skills-chart {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: .65rem; align-items: end; height: 150px; padding-top: .5rem;
}
.skill-col { display: flex; flex-direction: column; align-items: center; gap: .35rem; height: 100%; cursor: pointer; }
.col-track { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.col-bar {
  width: 100%; max-width: 54px; border-radius: 14px; background: #e2e8f0;
  position: relative; display: flex; justify-content: center; padding-top: 8px;
  transition: transform .15s, background .15s;
}
.skill-col:hover .col-bar { transform: translateY(-2px); }
.col-bar.highlight { background: linear-gradient(180deg, #FF6747, #EC6A11); }
.col-pct {
  font-size: .68rem; font-weight: 800; padding: .12rem .4rem; border-radius: 999px;
  background: #FF6747; color: #fff;
}
.col-pct.dark { background: #14171f; color: #fff; }
.col-label { font-size: .7rem; font-weight: 700; color: #475569; text-align: center; }
.skill-col.selected .col-label { color: var(--orange); }

.skill-chips, .filter-chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.sk-chip {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #334155;
  font-size: .72rem; font-weight: 700; padding: .24rem .65rem; border-radius: 999px; cursor: pointer;
}
.sk-chip.competencia { border-color: #fed7aa; background: #fff7ed; color: #c2410c; }
.sk-chip.habilidad { border-color: #bae6fd; background: #f0f9ff; color: #0369a1; }
.sk-chip.active { background: #14171f !important; color: #fff !important; border-color: #14171f !important; }
.muted-empty { color: #94a3b8; font-size: .82rem; margin: .5rem 0; }

/* Accent Card (Accreditation summary) */
.accent-card {
  border-radius: 24px; padding: 1.25rem;
  background:
    radial-gradient(circle at 85% 20%, rgba(255, 103, 71, .28), transparent 55%),
    radial-gradient(circle at 15% 80%, rgba(250, 204, 21, .22), transparent 55%),
    linear-gradient(135deg, #fff5f2 0%, #fef9ee 100%);
  box-shadow: 0 6px 24px rgba(15, 23, 42, .05);
  display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;
}
.accent-top { display: flex; justify-content: space-between; align-items: center; }
.pill-white {
  border: 0; background: #fff; color: #111827; font-size: .74rem; font-weight: 700;
  padding: .3rem .75rem; border-radius: 999px; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, .06);
}
.accent-body {
  background: rgba(255, 255, 255, .92); border-radius: 18px; padding: 1.05rem;
  backdrop-filter: blur(6px);
}
.accent-body h3 { margin: 0 0 .35rem; font-size: 1rem; color: var(--navy); }
.accent-desc { margin: 0 0 .9rem; font-size: .82rem; color: #475569; line-height: 1.45; }
.accent-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.btn-dark {
  border: 0; background: #14171f; color: #fff; font-size: .78rem; font-weight: 700;
  padding: .5rem .95rem; border-radius: 999px; cursor: pointer;
}
.btn-outline {
  border: 1.5px solid var(--navy); background: #fff; color: var(--navy); font-size: .78rem; font-weight: 700;
  padding: .46rem .9rem; border-radius: 999px; cursor: pointer;
}

/* Catalog Section */
.catalog-section, .tab-panel { margin-top: 1.5rem; }
.tab-panel { margin-top: .25rem; }
.sec-head {
  display: flex; justify-content: space-between; align-items: flex-end;
  flex-wrap: wrap; gap: .85rem; margin-bottom: 1rem;
}
.sec-head h2 { margin: 0; font-size: 1.25rem; color: var(--navy); }
.sec-sub { margin: .2rem 0 0; font-size: .84rem; color: #64748b; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.clear-tag {
  border: 0; background: var(--orange); color: #fff; font-size: .72rem; font-weight: 700;
  padding: .16rem .6rem; border-radius: 999px; cursor: pointer;
}
.search-pill {
  width: 260px; padding: .52rem .95rem; border: 1.5px solid #e2e8f0; border-radius: 999px;
  background: #fff; font-family: inherit; font-size: .84rem; color: var(--navy);
}
.search-pill:focus { outline: none; border-color: var(--orange); }
.filter-chips { margin-bottom: 1rem; }

.course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(295px, 1fr)); gap: 1.1rem; }
.c-card {
  background: #fff; border-radius: 20px; overflow: hidden;
  box-shadow: 0 6px 20px rgba(15, 23, 42, .06);
  display: flex; flex-direction: column; cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.c-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(15, 23, 42, .11); }
.c-cover {
  height: 155px; position: relative; background-size: cover; background-position: center;
  background-color: #dde6f0; display: flex; align-items: center; justify-content: center;
}
.cover-ph { font-size: 2.5rem; }
.c-badge {
  position: absolute; top: 10px; right: 10px; font-size: .68rem; font-weight: 800;
  padding: .22rem .65rem; border-radius: 999px; text-transform: uppercase;
}
.c-badge.ok { background: #dcfce7; color: #15803d; }
.c-badge.prog { background: #ffedd5; color: #c2410c; }
.c-badge.disp { background: rgba(5, 40, 75, .88); color: #fff; }

.c-body { padding: 1.05rem; display: flex; flex-direction: column; gap: .55rem; flex: 1; }
.c-body h3 { margin: 0; font-size: .98rem; color: var(--navy); line-height: 1.25; }
.c-obj {
  margin: 0; font-size: .8rem; color: #64748b; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.c-tags { display: flex; flex-wrap: wrap; gap: .25rem; }
.t-pill { font-size: .68rem; font-weight: 700; padding: .14rem .5rem; border-radius: 999px; }
.t-pill.comp { background: #fdeee3; color: #c2410c; }
.t-pill.hab { background: #e0f2fe; color: #0369a1; }

.c-prog { display: flex; align-items: center; gap: .5rem; }
.c-prog .prog-track { flex: 1; }
.c-prog small { font-size: .72rem; font-weight: 700; color: var(--navy); }

.c-foot {
  margin-top: auto; padding-top: .55rem; border-top: 1px solid #f1f5f9;
  display: flex; justify-content: space-between; align-items: center;
}
.c-dur { font-size: .75rem; color: #64748b; font-weight: 600; }
.c-cta {
  border: 0; background: var(--navy); color: #fff; font-size: .76rem; font-weight: 700;
  padding: .38rem .85rem; border-radius: 999px; cursor: pointer;
}
.c-cta:hover { background: var(--orange); }

.empty-catalog {
  background: #fff; border-radius: 20px; padding: 2.5rem; text-align: center;
  color: #64748b; font-size: .9rem; box-shadow: 0 4px 16px rgba(15, 23, 42, .05);
}

.pager {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: .75rem; margin-top: 1.25rem;
}
.pager-info { font-size: .82rem; font-weight: 600; color: #64748b; }
.pager-btns { display: flex; gap: .45rem; }
.pager-btns button {
  border: 1.5px solid #e2e8f0; background: #fff; color: var(--navy);
  font-weight: 700; font-size: .8rem; padding: .45rem 1rem; border-radius: 999px; cursor: pointer;
}
.pager-btns button:hover:not(:disabled) { background: var(--navy); color: #fff; border-color: var(--navy); }
.pager-btns button:disabled { opacity: .4; cursor: default; }

/* Certificados Table */
.cert-table-wrap {
  background: #fff; border-radius: 20px; overflow-x: auto;
  box-shadow: 0 6px 20px rgba(15, 23, 42, .06);
}
.cert-table { width: 100%; border-collapse: collapse; font-size: .84rem; }
.cert-table th {
  text-align: left; padding: .85rem 1rem; font-size: .72rem; text-transform: uppercase;
  letter-spacing: .04em; color: var(--navy); background: #f8fafc; border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}
.cert-table td { padding: .85rem 1rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.ct-title { font-weight: 700; color: var(--navy); }
.num { text-align: right !important; white-space: nowrap; }
.muted { font-size: .74rem; color: #94a3b8; }
.gain-chip { font-size: .74rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; }
.gain-chip.pos { background: #dcfce7; color: #15803d; }
.gain-chip.neg { background: #fee2e2; color: #b91c1c; }
.vig-badge { font-size: .72rem; font-weight: 700; padding: .16rem .6rem; border-radius: 999px; display: inline-block; }
.vig-badge.vigente { background: #e6f4ea; color: #1a7f37; }
.vig-badge.proximo_vencer { background: #fef3c7; color: #92400e; }
.vig-badge.vencido { background: #fdecec; color: #b42318; }
.btn-pdf {
  border: 0; background: var(--orange); color: #fff; font-size: .75rem; font-weight: 700;
  padding: .35rem .8rem; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.empty-cert { text-align: center; color: #94a3b8; padding: 2.5rem !important; }

@media (max-width: 1120px) {
  .bento-grid { grid-template-columns: 1fr; }
  .fc-cards { grid-template-columns: repeat(2, 1fr); }
  .lower-grid { grid-template-columns: 1fr; }
}
@media (max-width: 680px) {
  .fc-cards { grid-template-columns: 1fr; }
}
</style>
