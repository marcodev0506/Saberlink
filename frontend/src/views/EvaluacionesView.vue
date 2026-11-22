<script setup>
import { ref, computed, onMounted } from 'vue';
import { get } from '../api.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function descargarCert(codigo) {
  const r = await fetch(`${API}/api/certificados/${codigo}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
}
import AppLayout from '../components/AppLayout.vue';

const resultados = ref([]);
const error = ref('');
const agrupar = ref('estudiantes'); // estudiantes | cursos
const tipoFiltro = ref('todas');

const TIPOS = { diagnostico: 'Diagnóstica', teorica: 'Teórica', practica: 'Práctica', final: 'Teórica' };
const tipoLabel = (t) => TIPOS[t] || t;
const tipoKey = (t) => (t === 'final' ? 'teorica' : t);

const filtrados = computed(() =>
  tipoFiltro.value === 'todas' ? resultados.value : resultados.value.filter((r) => tipoKey(r.tipo) === tipoFiltro.value)
);

// Agrupa filas por estudiante o por curso
const grupos = computed(() => {
  const mapa = new Map();
  for (const r of filtrados.value) {
    const k = agrupar.value === 'estudiantes' ? r.usuario_id : r.curso_id;
    const nombre = agrupar.value === 'estudiantes' ? r.estudiante : r.curso;
    if (!mapa.has(k)) mapa.set(k, { nombre, filas: [] });
    mapa.get(k).filas.push(r);
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
});

onMounted(async () => {
  try {
    const data = await get('/api/cursos/resultados');
    resultados.value = data.resultados;
  } catch (e) { error.value = e.message; }
});

function fecha(iso) {
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>Evaluaciones</h1>
        <p class="sub">Resultados de pruebas diagnósticas, teóricas y prácticas.</p>
      </div>
      <div class="controls">
        <select v-model="agrupar" class="sel">
          <option value="estudiantes">Por estudiante</option>
          <option value="cursos">Por curso</option>
        </select>
        <div class="tipos">
          <button v-for="(lbl, k) in { todas: 'Todas', diagnostico: 'Diagnóstica', teorica: 'Teórica', practica: 'Práctica' }"
            :key="k" :class="{ on: tipoFiltro === k }" @click="tipoFiltro = k">{{ lbl }}</button>
        </div>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-for="g in grupos" :key="g.nombre" class="grupo">
      <h2>{{ agrupar === 'estudiantes' ? '👤' : '📘' }} {{ g.nombre }} <span>{{ g.filas.length }} intento{{ g.filas.length > 1 ? 's' : '' }}</span></h2>
      <table class="tabla">
        <thead>
          <tr>
            <th>{{ agrupar === 'estudiantes' ? 'Curso' : 'Estudiante' }}</th>
            <th>Tipo de prueba</th><th>Puntaje</th><th>Resultado</th><th>Certificado</th><th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in g.filas" :key="r.id">
            <td class="nombre">{{ agrupar === 'estudiantes' ? r.curso : r.estudiante }}</td>
            <td><em class="tagtipo" :class="tipoKey(r.tipo)">{{ tipoLabel(r.tipo) }}</em></td>
            <td>{{ r.puntaje }} / {{ r.total }}</td>
            <td><em class="res" :class="{ ok: r.aprobado }">{{ r.aprobado ? 'Aprobado' : 'Reprobado' }}</em></td>
            <td><button v-if="r.certificado" class="certbtn" @click="descargarCert(r.certificado)">📜 PDF</button><span v-else>—</span></td>
            <td>{{ fecha(r.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <p v-if="!grupos.length && !error" class="empty">Aún no hay resultados de evaluaciones.</p>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; }
h1 { color: var(--navy); margin: 0; }
.sub { color: #6b7280; font-size: .9rem; }
.controls { display: flex; flex-direction: column; gap: .6rem; align-items: flex-end; }
.sel { padding: .55rem .8rem; border: 1.5px solid #e2e6f0; border-radius: 9px; font-family: inherit; font-weight: 600; color: var(--navy); background: #fff; }
.tipos { display: flex; gap: .35rem; }
.tipos button { padding: .35rem .8rem; border: 1px solid #d4d9ea; border-radius: 999px; background: #fff; cursor: pointer; font-size: .75rem; font-family: inherit; }
.tipos button.on { background: var(--navy); color: #fff; border-color: var(--navy); }
.error { color: var(--danger); }
.grupo { margin-top: 1.4rem; }
.grupo h2 { font-size: .95rem; color: var(--navy); margin: 0 0 .5rem; }
.grupo h2 span { font-weight: 400; color: #9aa3b5; font-size: .75rem; margin-left: .4rem; }
.tabla { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(15,30,80,.07); }
th { text-align: left; padding: .7rem .9rem; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--navy); background: #f3f6fb; border-bottom: 2px solid #e2e6f0; }
td { padding: .65rem .9rem; font-size: .82rem; color: #374151; border-bottom: 1px solid #eef1f6; }
.nombre { font-weight: 600; color: var(--navy); }
.tagtipo { font-style: normal; font-size: .7rem; font-weight: 700; padding: .12rem .55rem; border-radius: 999px; }
.tagtipo.diagnostico { background: #fdeee3; color: var(--orange); }
.tagtipo.teorica { background: #dde6f0; color: var(--navy); }
.tagtipo.practica { background: var(--cream); color: #8a5a1a; }
.res { font-style: normal; font-size: .72rem; font-weight: 700; padding: .12rem .55rem; border-radius: 999px; background: #fdecec; color: var(--danger); }
.res.ok { background: #e6f4ea; color: #1a7f37; }
.certbtn { border: 0; background: var(--orange); color: #fff; padding: .25rem .7rem; border-radius: 999px; font-size: .72rem; font-weight: 700; cursor: pointer; }
.empty { color: #9aa3b5; text-align: center; padding: 3rem 0; }
</style>
