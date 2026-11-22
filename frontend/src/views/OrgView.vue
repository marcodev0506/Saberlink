<script setup>
import { ref, onMounted } from 'vue';
import { get, post, put, del } from '../api.js';
import AppLayout from '../components/AppLayout.vue';
import OrgCard from '../components/OrgCard.vue';

const arbol = ref([]);
const error = ref('');
const modal = ref(null);        // { mode: 'card'|'perfil'|'confirm', padre?, node? }
const user = JSON.parse(localStorage.getItem('user') || '{}');
const esRrhh = user.rol === 'rrhh';
const colapsados = ref(new Set());

const f = ref({ cargo: '', nombre_apellido: '', ci: '', correo: '' });
const p = ref({ descripcion: '', competencias: [], habilidades: [] });
const tagDraft = ref({ competencias: '', habilidades: '' });
const tipoDraft = ref('unidad');

function addTag(campo) {
  const t = tagDraft.value[campo].trim();
  if (t && !p.value[campo].includes(t)) p.value[campo].push(t);
  tagDraft.value[campo] = '';
}
function delTag(campo, i) { p.value[campo].splice(i, 1); }
function fmtCi(e) { f.value.ci = 'V-' + e.target.value.replace(/[^0-9]/g, ''); }

async function cargar() {
  const data = await get('/api/unidades');
  arbol.value = data.unidades;
}

function toggle(id) {
  const s = new Set(colapsados.value);
  s.has(id) ? s.delete(id) : s.add(id);
  colapsados.value = s;
}

function abrirCard(padre = null, node = null) {
  modal.value = { mode: 'card', padre, node };
  f.value = node
    ? { cargo: node.cargo || node.nombre, nombre_apellido: node.nombre_apellido, ci: node.ci, correo: node.correo }
    : { cargo: '', nombre_apellido: '', ci: '', correo: '' };
  tipoDraft.value = node?.tipo || 'unidad';
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
      const payload = {
        nombre: f.value.cargo.trim(),
        cargo: f.value.cargo.trim(),
        tipo: tipoDraft.value,
        nombre_apellido: f.value.nombre_apellido,
        ci: f.value.ci,
        correo: f.value.correo,
      };
      if (modal.value.node) {
        await put(`/api/unidades/${modal.value.node.id}`, payload);
      } else {
        await post('/api/unidades', { ...payload, parent_id: modal.value.padre?.id ?? null });
      }
    } else {
      await put(`/api/unidades/${modal.value.node.id}`, {
        descripcion: p.value.descripcion,
        competencias: p.value.competencias,
        habilidades: p.value.habilidades,
      });
    }
    modal.value = null;
    await cargar();
  } catch (err) { error.value = err.message; }
}

function borrar(node) { modal.value = { mode: 'confirm', node }; }

async function confirmarBorrar() {
  try {
    await del(`/api/unidades/${modal.value.node.id}`);
    modal.value = null;
    await cargar();
  } catch (err) { error.value = err.message; }
}

// drag & drop: soltar una tarjeta sobre otra la anida como hija
const dragId = ref(null);
function onDrop(target) {
  const id = dragId.value;
  dragId.value = null;
  if (!id || id === target.id) return;
  const esDesc = (n) => n.id === id || (n.hijos ?? []).some(esDesc);
  if (esDesc(target)) return;
  put(`/api/unidades/${id}`, { parent_id: target.id })
    .then(cargar)
    .catch((e) => (error.value = e.message));
}
function onDragstart(id) { dragId.value = id; }

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>Estructura organizacional</h1>
        <p class="sub">Arrastra una tarjeta sobre otra para anidarla. ⊕ agrega una sub-unidad y + define descripción, competencias y habilidades.</p>
      </div>
      <button v-if="esRrhh" class="primary" @click="abrirCard()">Agregar</button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <ul class="tree">
      <OrgCard v-for="u in arbol" :key="u.id" :u="u" :es-rrhh="esRrhh" :colapsados="colapsados"
               @toggle="toggle" @drop="onDrop" @perfil="abrirPerfil"
               @editar="(u) => abrirCard(null, u)" @hijo="(u) => abrirCard(u)" @borrar="borrar"
               @dragstart="onDragstart" />
    </ul>
    <p v-if="!arbol.length" class="empty big">Aún no hay estructura. Crea una unidad con “+ Unidad”.</p>

    <div v-if="modal" class="overlay" @click.self="modal = null">
      <div class="dialog">
        <template v-if="modal.mode === 'card'">
          <h2>{{ modal.node ? 'Editar puesto' : modal.padre ? `Sub-unidad de "${modal.padre.cargo || modal.padre.nombre}"` : 'Nueva unidad' }}</h2>
          <label>Tipo <input v-model="tipoDraft" placeholder="gerencia, unidad, analista…" /></label>
          <label>Cargo / Nombre <input v-model="f.cargo" placeholder="Gerente de Operaciones" /></label>
          <label>Nombre y Apellido <input v-model="f.nombre_apellido" /></label>
          <label>CI <input :value="f.ci" @input="fmtCi" placeholder="V-12345678" inputmode="numeric" /></label>
          <label>Correo <input v-model="f.correo" type="email" /></label>
        </template>
        <template v-else-if="modal.mode === 'confirm'">
          <h2>Eliminar "{{ modal.node.cargo || modal.node.nombre }}"</h2>
          <p class="confirmtxt">Se eliminará el puesto{{ modal.node.hijos?.length ? ' y sus sub-unidades' : '' }}. Esta acción no se puede deshacer.</p>
          <div class="dialog-actions">
            <button class="ghost" @click="modal = null">Cancelar</button>
            <button class="primary danger" @click="confirmarBorrar">Eliminar</button>
          </div>
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
        <div v-if="modal.mode === 'card' || modal.mode === 'perfil'" class="dialog-actions">
          <button class="ghost" @click="modal = null">Cancelar</button>
          <button class="primary" @click="guardar">Guardar</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
h1 { color: var(--navy); margin: 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .3rem 0 0; }
.primary { padding: .6rem 1.1rem; border: 0; border-radius: 9px; background: var(--navy); color: #fff; font-weight: 700; cursor: pointer; }
.ghost { padding: .6rem 1.1rem; border: 1px solid #d4d9ea; border-radius: 9px; background: #fff; cursor: pointer; }
.danger { background: #dc2626; }
.confirmtxt { margin: 0; color: #6b7280; font-size: .85rem; }
.error { color: var(--danger); }
.empty { color: #9aa3b5; font-size: .85rem; padding: .6rem 0; }
.big { text-align: center; padding: 3rem 0; }
.tree { list-style: none; padding: 0; margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 2.5rem; justify-content: center; }
.tree > li { display: flex; flex-direction: column; align-items: center; }

.overlay { position: fixed; inset: 0; background: rgba(10,20,50,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: #fff; border-radius: 14px; padding: 1.75rem; width: 360px; display: flex; flex-direction: column; gap: 1rem; max-height: 90vh; overflow-y: auto; }
.dialog h2 { margin: 0; font-size: 1.05rem; color: var(--navy); }
.dialog label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
.dialog input, .dialog select, .dialog textarea { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; font-family: inherit; }
.dialog-actions { display: flex; justify-content: flex-end; gap: .5rem; }
.hint { font-weight: 400; color: #9aa3b5; }
.tagfield label { font-size: .8rem; font-weight: 600; color: #374151; display: block; margin-bottom: .35rem; }
.chips { display: flex; flex-wrap: wrap; gap: .3rem; border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .45rem; }
.chips input { flex: 1; min-width: 110px; border: 0; outline: none; font-family: inherit; font-size: .85rem; }
.chips .tag { cursor: pointer; }
</style>
