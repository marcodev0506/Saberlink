<script setup>
import { ref, onMounted } from 'vue';
import { get } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const cursos = ref([]);
const error = ref('');

onMounted(async () => {
  try {
    const data = await get('/api/cursos');
    cursos.value = data.cursos;
  } catch (e) { error.value = e.message; }
});
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>Catálogo de cursos</h1>
        <p class="sub">Todos los cursos con sus habilidades, competencias y duración.</p>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <table class="tabla">
      <thead>
        <tr><th>Nombre del curso</th><th>Habilidades</th><th>Competencias</th><th>Duración</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in cursos" :key="c.id" @click="$router.push(`/cursos/${c.id}`)">
          <td class="nombre">{{ c.titulo }}</td>
          <td><em v-for="t in c.habilidades" :key="`h${t}`" class="tag hab">{{ t }}</em><span v-if="!c.habilidades?.length">—</span></td>
          <td><em v-for="t in c.competencias" :key="`c${t}`" class="tag comp">{{ t }}</em><span v-if="!c.competencias?.length">—</span></td>
          <td>{{ c.duracion || '—' }}</td>
        </tr>
        <tr v-if="!cursos.length"><td colspan="4" class="vacio">Aún no hay cursos.</td></tr>
      </tbody>
    </table>
  </AppLayout>
</template>

<style scoped>
.top h1 { color: var(--navy); margin: 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .3rem 0 1.5rem; }
.error { color: var(--danger); }
.tabla { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(15,30,80,.08); }
th { text-align: left; padding: .8rem 1rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--navy); background: #f3f6fb; border-bottom: 2px solid #e2e6f0; }
td { padding: .8rem 1rem; font-size: .85rem; color: #374151; border-bottom: 1px solid #eef1f6; vertical-align: top; }
tbody tr { cursor: pointer; transition: background .12s; }
tbody tr:hover { background: #f8fafd; }
.nombre { font-weight: 600; color: var(--navy); }
.tag { font-style: normal; font-size: .72rem; padding: .15rem .55rem; border-radius: 999px; margin: 0 .3rem .3rem 0; display: inline-block; }
.tag.hab { background: var(--navy); color: #fff; }
.tag.comp { background: var(--orange); color: #fff; }
.vacio { text-align: center; color: #9aa3b5; padding: 2rem; }
</style>
