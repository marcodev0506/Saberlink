<script setup>
import { ref, computed, onMounted } from 'vue';
import { get, post, put, del } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const flat = ref([]);           // lista plana de unidades
const error = ref('');
const modal = ref(null);        // { mode: 'card'|'perfil', nivel?, node? }
const user = JSON.parse(localStorage.getItem('user') || '{}');
const esRrhh = user.rol === 'rrhh';

// formulario tarjeta (puesto/persona)
const f = ref({ nombre: '', cargo: '', nombre_apellido: '', ci: '', correo: '' });
// formulario perfil (botón +)
const p = ref({ descripcion: '', competencias: [], habilidades: [] });
const tagDraft = ref({ competencias: '', habilidades: '' });

function addTag(campo) {
  const t = tagDraft.value[campo].trim();
  if (t && !p.value[campo].includes(t)) p.value[campo].push(t);
  tagDraft.value[campo] = '';
}
function delTag(campo, i) { p.value[campo].splice(i, 1); }
const niveles = computed(() => [...new Set(flat.value.map((u) => u.tipo))]);
const porNivel = (nivel) => flat.value.filter((u) => u.tipo === nivel);

function flatten(nodos, acc = []) {
  for (const n of nodos) { acc.push(n); flatten(n.hijos ?? [], acc); }
  return acc;
}

async function cargar() {
  const data = await get('/api/unidades');
  flat.value = flatten(data.unidades);
}

function abrirCard(nivel, node = null) {
  modal.value = { mode: 'card', nivel, node };
  f.value = node
    ? { nombre: node.nombre, cargo: node.cargo, nombre_apellido: node.nombre_apellido, ci: node.ci, correo: node.correo }
    : { nombre: '', cargo: '', nombre_apellido: '', ci: '', correo: '' };
}

function abrirPerfil(node) {
  modal.value = { mode: 'perfil', node };
  p.value = {
    descripcion: node.descripcion || '',
    competencias: [...(node.competencias || [])],
    habilidades: [...(node.habilidades || [])],
  };
  tagDraft.value = { competencias: '', habilidades: '' };
}

async function guardar() {
  error.value = '';
  try {
    if (modal.value.mode === 'card') {
      const payload = { nombre: f.value.cargo || f.value.nombre, tipo: modal.value.nivel || modal.value.node?.tipo, ...f.value };
      if (modal.value.node) await put(`/api/unidades/${modal.value.node.id}`, payload);
      else await post('/api/unidades', payload);
    } else {
      await put(`/api/unidades/${modal.value.node.id}`, {
        descripcion: p.value.descripcion,
        competencias: p.value.competencias,
        habilidades: p.value.habilidades,
      });
    }
    modal.value = null;
    await cargar();
  } catch (err) {
    error.value = err.message;
  }
}

async function borrar(node) {
  if (!confirm(`Eliminar "${node.cargo || node.nombre}"${node.hijos?.length ? ' y sus sub-unidades' : ''}?`)) return;
  try {
    await del(`/api/unidades/${node.id}`);
    await cargar();
  } catch (err) {
    error.value = err.message;
  }
}

// drag & drop entre niveles
const dragId = ref(null);
function onDrop(nivel) {
  const node = flat.value.find((u) => u.id === dragId.value);
  dragId.value = null;
  if (!node || node.tipo === nivel) return;
  put(`/api/unidades/${node.id}`, { tipo: nivel }).then(cargar).catch((e) => (error.value = e.message));
}

async function nuevoNivel() {
  const nivel = prompt('Nombre del nuevo nivel (ej: Gerentes, Analistas, Supervisores)');
  if (!nivel?.trim()) return;
  try {
    await post('/api/unidades', { nombre: nivel.trim(), tipo: nivel.trim().toLowerCase() });
    await cargar();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>Estructura organizacional</h1>
        <p class="sub">Arrastra tarjetas entre niveles. El botón + de cada tarjeta define la descripción del puesto, competencias y habilidades.</p>
      </div>
      <button v-if="esRrhh" class="primary" @click="nuevoNivel">+ Nivel</button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-for="nivel in niveles" :key="nivel" class="board-row"
             @dragover.prevent @drop="onDrop(nivel)">
      <div class="row-head">
        <h2>{{ nivel }}</h2>
        <button v-if="esRrhh" class="add" @click="abrirCard(nivel)">Agregar</button>
      </div>
      <div class="cards">
        <article v-for="u in porNivel(nivel)" :key="u.id" class="post"
                 :draggable="esRrhh" @dragstart="dragId = u.id">
          <header>
            <strong>{{ u.cargo || u.nombre }}</strong>
            <button v-if="esRrhh" class="plus" title="Descripción, competencias y habilidades" @click="abrirPerfil(u)">+</button>
          </header>
          <p v-if="u.nombre_apellido"><b>Nombre:</b> {{ u.nombre_apellido }}</p>
          <p v-if="u.ci"><b>CI:</b> {{ u.ci }}</p>
          <p v-if="u.correo"><b>Correo:</b> {{ u.correo }}</p>
          <p v-if="u.descripcion" class="desc"><b>Descripción:</b> {{ u.descripcion }}</p>
          <div class="group" v-if="u.competencias?.length">
            <b class="lbl comp-l">Competencias</b>
            <div class="tags"><em v-for="c in u.competencias" :key="`c${c}`" class="tag comp">{{ c }}</em></div>
          </div>
          <div class="group" v-if="u.habilidades?.length">
            <b class="lbl hab-l">Habilidades</b>
            <div class="tags"><em v-for="h in u.habilidades" :key="`h${h}`" class="tag hab">{{ h }}</em></div>
          </div>
          <footer v-if="esRrhh">
            <button @click="abrirCard(nivel, u)">✎</button>
            <button @click="borrar(u)">🗑</button>
          </footer>
        </article>
        <p v-if="!porNivel(nivel).length" class="empty">Arrastra tarjetas aquí o usa “Agregar”.</p>
      </div>
    </section>
    <p v-if="!niveles.length" class="empty big">Aún no hay estructura. Crea un nivel con “+ Nivel”.</p>

    <div v-if="modal" class="overlay" @click.self="modal = null">
      <div class="dialog">
        <template v-if="modal.mode === 'card'">
          <h2>{{ modal.node ? 'Editar puesto' : `Nuevo puesto en "${modal.nivel}"` }}</h2>
          <label>Cargo <input v-model="f.cargo" placeholder="Gerente de Operaciones" /></label>
          <label>Nombre y Apellido <input v-model="f.nombre_apellido" /></label>
          <label>CI <input v-model="f.ci" placeholder="V-12345678" /></label>
          <label>Correo <input v-model="f.correo" type="email" /></label>
        </template>
        <template v-else>
          <h2>Perfil de "{{ modal.node.cargo || modal.node.nombre }}"</h2>
          <label>Descripción del puesto <textarea v-model="p.descripcion" rows="3" placeholder="Funciones y alcance" /></label>
          <div class="tagfield" v-for="campo in ['competencias','habilidades']" :key="campo">
            <label>{{ campo === 'competencias' ? 'Competencias' : 'Habilidades' }}
              <span class="hint">(Enter para agregar — enlazan a cursos)</span></label>
            <div class="chips">
              <em v-for="(t, i) in p[campo]" :key="t" class="tag"
                  :class="campo === 'competencias' ? 'comp' : 'hab'"
                  @click="delTag(campo, i)">{{ t }} ×</em>
              <input v-model="tagDraft[campo]" @keydown.enter.prevent="addTag(campo)"
                     @keydown.tab="addTag(campo)" placeholder="Escribe y presiona Enter" />
            </div>
          </div>
        </template>
        <div class="dialog-actions">
          <button class="ghost" @click="modal = null">Cancelar</button>
          <button class="primary" @click="guardar">Guardar</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
h1 { color: #14204a; margin: 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .3rem 0 0; }
.primary { padding: .6rem 1.1rem; border: 0; border-radius: 9px; background: #1a56db; color: #fff; font-weight: 700; cursor: pointer; }
.ghost { padding: .6rem 1.1rem; border: 1px solid #d4d9ea; border-radius: 9px; background: #fff; cursor: pointer; }
.error { color: #b42318; }
.empty { color: #9aa3b5; font-size: .85rem; padding: .6rem 0; }
.big { text-align: center; padding: 3rem 0; }

.board-row { margin-top: 1.5rem; }
.row-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #c9d2e8; padding-bottom: .4rem; }
.row-head h2 { margin: 0; font-size: 1rem; color: #14204a; text-transform: capitalize; }
.add { padding: .4rem 1.2rem; border: 0; border-radius: 999px; background: #3d5bf0; color: #fff; font-weight: 700; font-size: .85rem; cursor: pointer; }

.cards { display: flex; flex-wrap: wrap; gap: .9rem; padding: .9rem 0; }
.post {
  background: #fff; border-radius: 14px; padding: 1rem 1.1rem; min-width: 200px; max-width: 260px;
  box-shadow: 0 4px 16px rgba(15,30,80,.1); cursor: grab; display: flex; flex-direction: column; gap: .25rem;
}
.post:active { cursor: grabbing; }
.post header { display: flex; justify-content: space-between; align-items: center; }
.post strong { color: #14204a; font-size: .95rem; }
.plus { border: 0; background: #3d5bf0; color: #fff; width: 26px; height: 26px; border-radius: 50%; font-size: 1rem; cursor: pointer; line-height: 1; }
.post p { margin: 0; font-size: .8rem; color: #4b5563; }
.post p b { color: #374151; }
.post .desc { color: #6b7280; font-size: .78rem; }
.group { margin-top: .35rem; }
.lbl { font-size: .68rem; text-transform: uppercase; letter-spacing: .03em; }
.comp-l { color: #b45309; }
.hab-l { color: #166534; }
.tags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .2rem; }
.tag { font-style: normal; font-size: .68rem; padding: .1rem .5rem; border-radius: 999px; font-weight: 600; }
.comp { background: #fdf3e3; color: #b45309; }
.hab { background: #e8f7ee; color: #166534; }
.post footer { display: flex; gap: .3rem; margin-top: .5rem; }
.post footer button { border: 0; background: #eef1f7; border-radius: 6px; padding: .15rem .5rem; cursor: pointer; font-size: .8rem; }

.overlay { position: fixed; inset: 0; background: rgba(10,20,50,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: #fff; border-radius: 14px; padding: 1.75rem; width: 360px; display: flex; flex-direction: column; gap: 1rem; max-height: 90vh; overflow-y: auto; }
.dialog h2 { margin: 0; font-size: 1.05rem; color: #14204a; }
.dialog label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
.dialog input, .dialog select, .dialog textarea { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; font-family: inherit; }
.dialog-actions { display: flex; justify-content: flex-end; gap: .5rem; }
.hint { font-weight: 400; color: #9aa3b5; }
.tagfield label { font-size: .8rem; font-weight: 600; color: #374151; display: block; margin-bottom: .35rem; }
.chips { display: flex; flex-wrap: wrap; gap: .3rem; border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .45rem; }
.chips input { flex: 1; min-width: 110px; border: 0; outline: none; font-family: inherit; font-size: .85rem; }
.chips .tag { cursor: pointer; }
</style>
