<script setup>
import { ref, onMounted } from 'vue';
import { get } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const certs = ref([]);
const error = ref('');
const user = JSON.parse(localStorage.getItem('user') || '{}');
const soloMios = user.rol === 'trabajador';

async function descargar(codigo) {
  const r = await fetch(`${API}/api/certificados/${codigo}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
}

onMounted(async () => {
  try {
    certs.value = (await get('/api/certificados')).certificados;
  } catch (e) { error.value = e.message; }
});
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>{{ soloMios ? 'Mis certificados' : 'Certificados' }}</h1>
        <p class="sub">Acreditaciones PDF con código QR verificable.</p>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <table class="tabla">
      <thead>
        <tr><th v-if="!soloMios">Estudiante</th><th>Curso</th><th>Duración</th><th>Puntaje</th><th>Fecha</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="c in certs" :key="c.codigo">
          <td v-if="!soloMios" class="nombre">{{ c.estudiante }}</td>
          <td class="nombre">{{ c.curso }}</td>
          <td>{{ c.duracion || '—' }}</td>
          <td>{{ c.puntaje }} / {{ c.total }}</td>
          <td>{{ new Date(c.created_at).toLocaleDateString('es-VE') }}</td>
          <td><button class="certbtn" @click="descargar(c.codigo)">📜 PDF</button></td>
        </tr>
        <tr v-if="!certs.length"><td :colspan="soloMios ? 5 : 6" class="vacio">Aún no hay certificados emitidos.</td></tr>
      </tbody>
    </table>
  </AppLayout>
</template>

<style scoped>
h1 { color: var(--navy); margin: 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .3rem 0 1.5rem; }
.error { color: var(--danger); }
.tabla { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(15,30,80,.08); }
th { text-align: left; padding: .8rem 1rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--navy); background: #f3f6fb; border-bottom: 2px solid #e2e6f0; }
td { padding: .8rem 1rem; font-size: .85rem; color: #374151; border-bottom: 1px solid #eef1f6; }
.nombre { font-weight: 600; color: var(--navy); }
.certbtn { border: 0; background: var(--orange); color: #fff; padding: .3rem .8rem; border-radius: 999px; font-size: .75rem; font-weight: 700; cursor: pointer; }
.vacio { text-align: center; color: #9aa3b5; padding: 2.5rem; }
</style>
