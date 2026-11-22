<script setup>
import { ref, computed, onMounted } from 'vue';
import { get, post, put, del } from '../api.js';
import AppLayout from '../components/AppLayout.vue';
import OrgCard from '../components/OrgCard.vue';
import TagSelect from '../components/TagSelect.vue';

const arbol = ref([]);
const usuariosEmpresa = ref([]);
const error = ref('');
const modal = ref(null);        // { mode: 'card'|'perfil'|'confirm', padre?, node? }
const user = JSON.parse(localStorage.getItem('user') || '{}');
const esRrhh = user.rol === 'rrhh';
const colapsados = ref(new Set());

const f = ref({ cargo: '', usuario_id: null, nombre_apellido: '', ci: '', correo: '' });
const p = ref({ descripcion: '', competencias: [], habilidades: [] });
const tipoDraft = ref('unidad');
const chatTxt = ref('');
const chatLoading = ref(false);
const chatMsg = ref('');
const mostrarSug = ref(false);

async function enviarChat() {
  if (!chatTxt.value.trim()) return;
  chatLoading.value = true; chatMsg.value = '';
  try {
    await post('/api/unidades/chat', { texto: chatTxt.value });
    chatTxt.value = ''; chatMsg.value = 'Estructura creada ✔';
    await cargar();
  } catch (e) { chatMsg.value = e.message; }
  chatLoading.value = false;
}

function seleccionarUsuario(u) {
  f.value.usuario_id = u.id;
  if (u.ci) f.value.ci = u.ci;
  f.value.nombre_apellido = u.nombre;
  f.value.correo = u.email;
  mostrarSug.value = false;
}

function fmtCi(e) {
  const digits = e.target.value.replace(/[^0-9]/g, '');
  f.value.ci = digits ? 'V-' + digits : '';
  f.value.usuario_id = null;
  mostrarSug.value = true;
  if (digits.length >= 5) {
    const exacto = usuariosEmpresa.value.find(
      (u) => u.ci && u.ci.replace(/[^0-9]/g, '') === digits
    );
    if (exacto) seleccionarUsuario(exacto);
  }
}

function onCorreoInput() {
  const q = f.value.correo.trim().toLowerCase();
  if (!q) { f.value.usuario_id = null; return; }
  const exacto = usuariosEmpresa.value.find((u) => u.email.toLowerCase() === q);
  if (exacto) seleccionarUsuario(exacto);
}

const sugerencias = computed(() => {
  const qCi = f.value.ci.replace(/[^0-9]/g, '');
  const qNom = f.value.nombre_apellido.trim().toLowerCase();
  if (!qCi && qNom.length < 2) return [];
  return usuariosEmpresa.value.filter((u) => {
    const matchCi = qCi && u.ci && u.ci.replace(/[^0-9]/g, '').includes(qCi);
    const matchNom = qNom.length >= 2 && (
      u.nombre.toLowerCase().includes(qNom) || u.email.toLowerCase().includes(qNom)
    );
    return matchCi || matchNom;
  }).slice(0, 6);
});

async function cargar() {
  try {
    const [data, uData] = await Promise.all([
      get('/api/unidades'),
      esRrhh ? get('/api/usuarios').catch(() => ({ usuarios: [] })) : Promise.resolve({ usuarios: [] }),
    ]);
    arbol.value = data.unidades;
    usuariosEmpresa.value = uData.usuarios || [];
  } catch (e) { error.value = e.message; }
}

function toggle(id) {
  const s = new Set(colapsados.value);
  s.has(id) ? s.delete(id) : s.add(id);
  colapsados.value = s;
}

function abrirCard(padre = null, node = null) {
  modal.value = { mode: 'card', padre, node };
  mostrarSug.value = false;
  f.value = node
    ? { cargo: node.cargo || node.nombre, usuario_id: node.usuario_id || null, nombre_apellido: node.nombre_apellido, ci: node.ci, correo: node.correo }
    : { cargo: '', usuario_id: null, nombre_apellido: '', ci: '', correo: '' };
  tipoDraft.value = node?.tipo || 'unidad';
}

function abrirPerfil(node) {
  modal.value = { mode: 'perfil', node };
  p.value = {
    descripcion: node.descripcion || '',
    competencias: [...(node.competencias || [])],
    habilidades: [...(node.habilidades || [])],
  };
}

async function guardar() {
  error.value = '';
  try {
    if (modal.value.mode === 'card') {
      const payload = {
        nombre: f.value.cargo.trim(),
        cargo: f.value.cargo.trim(),
        tipo: tipoDraft.value,
        usuario_id: f.value.usuario_id || null,
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
    <div class="board">
    <header class="top">
      <div>
        <h1>Estructura organizacional</h1>
        <p class="sub">Arrastra una tarjeta sobre otra para anidarla. ⊕ agrega una sub-unidad y + define descripción, competencias y habilidades.</p>
      </div>
      <button v-if="esRrhh" class="primary" @click="abrirCard()">Agregar</button>
    </header>
    <section v-if="esRrhh" class="chat">
      <textarea v-model="chatTxt" rows="2" @keydown.ctrl.enter.prevent="enviarChat"
        placeholder="Describe la estructura en lenguaje natural, ej: una gerencia de RRHH con 5 líderes y cada líder 3 analistas" />
      <button class="primary" :disabled="chatLoading" @click="enviarChat">{{ chatLoading ? 'Generando…' : '➤ Crear' }}</button>
      <p v-if="chatMsg" class="chatmsg">{{ chatMsg }}</p>
    </section>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="canvas">
      <ul class="tree">
        <OrgCard v-for="u in arbol" :key="u.id" :u="u" :es-rrhh="esRrhh" :colapsados="colapsados"
                 @toggle="toggle" @drop="onDrop" @perfil="abrirPerfil"
                 @editar="(u) => abrirCard(null, u)" @hijo="(u) => abrirCard(u)" @borrar="borrar"
                 @dragstart="onDragstart" />
      </ul>
      <p v-if="!arbol.length" class="empty big">Aún no hay estructura. Crea una unidad con “+ Unidad”.</p>
    </div>

    <div v-if="modal" class="overlay" @click.self="modal = null">
      <div :class="['dialog', { 'dialog-sm': modal.mode === 'confirm', 'dialog-lg': modal.mode === 'perfil' }]">
        <template v-if="modal.mode === 'card'">
          <h2>{{ modal.node ? 'Editar puesto' : modal.padre ? `Sub-unidad de "${modal.padre.cargo || modal.padre.nombre}"` : 'Nueva unidad' }}</h2>
          <div class="form-row">
            <label>Tipo <input v-model="tipoDraft" placeholder="gerencia, unidad, analista…" /></label>
            <label>Cargo / Nombre <input v-model="f.cargo" placeholder="Gerente de Operaciones" /></label>
          </div>
          <div class="ac-wrap">
            <label>
              <span class="lbl-line">CI (Cédula) <span class="hint">— escribe para autocompletar</span></span>
              <input :value="f.ci" @input="fmtCi" @focus="mostrarSug = true" placeholder="V-12345678" inputmode="numeric" />
            </label>
            <ul v-if="mostrarSug && sugerencias.length" class="ac-list">
              <li v-for="u in sugerencias" :key="u.id" @mousedown.prevent="seleccionarUsuario(u)">
                <b>{{ u.ci || 'Sin CI' }}</b> · {{ u.nombre }} <small>{{ u.email }}</small>
              </li>
            </ul>
          </div>
          <div class="form-row">
            <label>Nombre y Apellido <input v-model="f.nombre_apellido" @focus="mostrarSug = true" /></label>
            <label>Correo <input v-model="f.correo" type="email" @input="onCorreoInput" /></label>
          </div>
          <p v-if="f.usuario_id" class="linked-ok">✓ Vinculado a usuario registrado en la empresa</p>
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
          <label>Descripción del puesto <textarea v-model="p.descripcion" rows="3" placeholder="Funciones y alcance del puesto" /></label>
          <div class="form-row">
            <div class="tagfield" v-for="campo in ['habilidades','competencias']" :key="campo">
              <label>{{ campo === 'competencias' ? 'Competencias' : 'Habilidades' }}
                <span class="hint">(Enter para agregar)</span></label>
              <TagSelect :tipo="campo === 'competencias' ? 'competencia' : 'habilidad'" v-model="p[campo]" />
            </div>
          </div>
        </template>
        <div v-if="modal.mode === 'card' || modal.mode === 'perfil'" class="dialog-actions">
          <button class="ghost" @click="modal = null">Cancelar</button>
          <button class="primary" @click="guardar">Guardar</button>
        </div>
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
.chat { display: flex; gap: .5rem; align-items: flex-start; margin-top: 1.2rem; background: #fff; border-radius: 14px; padding: .9rem; box-shadow: 0 4px 16px rgba(15,30,80,.1); }
.chat textarea { flex: 1; border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .55rem; font-family: inherit; resize: vertical; }
.chatmsg { font-size: .8rem; color: var(--navy); margin: 0; align-self: center; }
.canvas { padding: 1rem 0; }
.tree { list-style: none; margin-top: 0; padding: 0; margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 2.5rem; justify-content: center; }
.tree > li { display: flex; flex-direction: column; align-items: center; }

.overlay { position: fixed; inset: 0; background: rgba(10,20,50,.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem; }
.dialog { background: #fff; border-radius: 18px; padding: 2rem 2.25rem; width: min(640px, 94vw); display: flex; flex-direction: column; gap: 1.15rem; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(10,20,50,.22); box-sizing: border-box; }
.dialog-lg { width: min(760px, 94vw); }
.dialog-sm { width: min(420px, 92vw); }
.dialog h2 { margin: 0 0 .2rem; font-size: 1.25rem; color: var(--navy); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
.dialog label { display: flex; flex-direction: column; gap: .4rem; font-size: .84rem; font-weight: 600; color: #374151; }
.lbl-line { display: flex; align-items: baseline; gap: .35rem; flex-wrap: wrap; }
.dialog input, .dialog select, .dialog textarea { padding: .68rem .85rem; border: 1.5px solid #d8dee9; border-radius: 10px; font-family: inherit; font-size: .9rem; }
.dialog input:focus, .dialog select:focus, .dialog textarea:focus { outline: none; border-color: var(--navy); }
.dialog-actions { display: flex; justify-content: flex-end; gap: .65rem; margin-top: .5rem; padding-top: .9rem; border-top: 1px solid #eef2f6; position: sticky; bottom: 0; background: #fff; }
@media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }
.hint { font-weight: 400; color: #9aa3b5; }
.tagfield label { font-size: .8rem; font-weight: 600; color: #374151; display: block; margin-bottom: .35rem; }
.ac-wrap { position: relative; }
.ac-list {
  position: absolute; left: 0; right: 0; top: 100%; margin: 2px 0 0; padding: .3rem;
  list-style: none; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 10px;
  box-shadow: 0 8px 22px rgba(15,30,80,.14); z-index: 70; max-height: 170px; overflow-y: auto;
}
.ac-list li {
  padding: .42rem .55rem; border-radius: 7px; font-size: .78rem; color: #1f2937; cursor: pointer;
}
.ac-list li:hover { background: #f1f5f9; }
.ac-list small { display: block; color: #64748b; font-size: .7rem; }
.linked-ok { margin: -.4rem 0 0; font-size: .74rem; font-weight: 700; color: #15803d; }
</style>
