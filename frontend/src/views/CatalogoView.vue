<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { get } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const cursos = ref([]);
const error = ref('');
const busqueda = ref('');
const pagina = ref(1);
const POR_PAGINA = 10;

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return cursos.value;
  return cursos.value.filter((c) =>
    c.titulo.toLowerCase().includes(q) ||
    c.habilidades?.some((t) => t.toLowerCase().includes(q)) ||
    c.competencias?.some((t) => t.toLowerCase().includes(q))
  );
});
const paginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / POR_PAGINA)));
const visibles = computed(() => filtrados.value.slice((pagina.value - 1) * POR_PAGINA, pagina.value * POR_PAGINA));
watch(busqueda, () => { pagina.value = 1; });

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
      <input v-model="busqueda" class="buscador" placeholder="🔍 Buscar curso, habilidad o competencia…" />
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <table class="tabla">
      <thead>
        <tr><th>Nombre del curso</th><th>Habilidades</th><th>Competencias</th><th>Duración</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in visibles" :key="c.id" @click="$router.push(`/cursos/${c.id}`)">
          <td class="nombre">{{ c.titulo }}</td>
          <td><em v-for="t in c.habilidades" :key="`h${t}`" class="tag hab">{{ t }}</em><span v-if="!c.habilidades?.length">—</span></td>
          <td><em v-for="t in c.competencias" :key="`c${t}`" class="tag comp">{{ t }}</em><span v-if="!c.competencias?.length">—</span></td>
          <td>{{ c.duracion || '—' }}</td>
        </tr>
        <tr v-if="!cursos.length"><td colspan="4" class="vacio">Aún no hay cursos.</td></tr>
      </tbody>
    </table>

    <div v-if="paginas > 1" class="pager">
      <button :disabled="pagina === 1" @click="pagina--">← Anterior</button>
      <span>Página {{ pagina }} de {{ paginas }} · {{ filtrados.length }} cursos</span>
      <button :disabled="pagina === paginas" @click="pagina++">Siguiente →</button>
    </div>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.top h1 { color: var(--navy); margin: 0; }
.buscador { width: 300px; padding: .55rem .8rem; border: 1.5px solid #e2e6f0; border-radius: 9px; font-family: inherit; }
.pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1rem; }
.pager button { padding: .45rem 1rem; border: 1px solid #d4d9ea; border-radius: 8px; background: #fff; cursor: pointer; font-family: inherit; }
.pager button:disabled { opacity: .4; cursor: default; }
.pager span { font-size: .8rem; color: #6b7280; }
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
