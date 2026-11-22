<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import AppLayout from '../components/AppLayout.vue';
import TagSelect from '../components/TagSelect.vue';
import { get, post, put, del } from '../api';
import { useAuth } from '../auth';

const { user } = useAuth();
const esRrhh = user.rol === 'rrhh';

const arbol = ref([]);
const error = ref('');
const chatTxt = ref('');
const chatLoading = ref(false);
const chatMsg = ref('');

const NODE_W = 230, NODE_H = 100, GAP_X = 40, GAP_Y = 150;

// viewport: pan + zoom
const vp = reactive({ x: 60, y: 40, zoom: 0.85 });
function zoomBy(d) { vp.zoom = Math.min(1.6, Math.max(0.3, vp.zoom + d)); }
function centrar() { vp.x = 60; vp.y = 40; vp.zoom = 0.85; }

const viewport = ref(null);
let pan = null;
function panStart(e) {
  if (dragNodo) return;
  pan = { sx: e.clientX, sy: e.clientY, x: vp.x, y: vp.y };
}
function panMove(e) {
  nodoMove(e);
  if (!pan) return;
  vp.x = pan.x + e.clientX - pan.sx;
  vp.y = pan.y + e.clientY - pan.sy;
}
function panEnd() { nodoUp(); pan = null; }

// nodos planos con posición (metadata.x/y o layout automático)
const nodos = ref([]);      // [{id, nombre, tipo, cargo, ..., hijos:[id], padre, x, y}]
const sel = ref(null);      // nodo seleccionado

function aplanar(lista, padre = null, out = []) {
  for (const n of lista) {
    const flat = { ...n, padre, hijos: (n.hijos ?? []).map((h) => h.id) };
    out.push(flat);
    aplanar(n.hijos ?? [], n.id, out);
  }
  return out;
}

function autoLayout(lista) {
  // anchura de cada subárbol = hojas * (NODE_W + GAP_X)
  let cursor = 0;
  function ancho(n) {
    const hijos = lista.filter((x) => x.padre === n.id);
    n._w = hijos.length ? hijos.reduce((s, h) => s + ancho(h), 0) : NODE_W + GAP_X;
    return n._w;
  }
  function colocar(n, x, y) {
    const hijos = lista.filter((x) => x.padre === n.id);
    n.x = x + (n._w - NODE_W - GAP_X) / 2;
    n.y = y;
    let hx = x;
    for (const h of hijos) { colocar(h, hx, y + NODE_H + GAP_Y); hx += h._w; }
  }
  const raices = lista.filter((n) => !n.padre);
  for (const r of raices) { ancho(r); colocar(r, cursor, 0); cursor += r._w; }
}

async function cargar() {
  const data = await get('/api/unidades');
  const flat = aplanar(data.unidades);
  // nodos sin posición guardada -> layout automático solo para ellos
  const sinPos = flat.filter((n) => n.metadata?.x == null);
  if (sinPos.length) autoLayout(sinPos);
  for (const n of flat) {
    n.x = n.metadata?.x ?? n.x ?? 0;
    n.y = n.metadata?.y ?? n.y ?? 0;
  }
  nodos.value = flat;
  if (sel.value) sel.value = flat.find((n) => n.id === sel.value.id) ?? null;
}

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

// arrastrar un nodo (guarda posición en metadata)
let dragNodo = null;
function nodoDown(e, n) {
  if (!esRrhh) return;
  dragNodo = { n, ox: n.x, oy: n.y, sx: e.clientX, sy: e.clientY, mov: false };
  e.stopPropagation();
}
function nodoMove(e) {
  if (!dragNodo) return;
  const dx = (e.clientX - dragNodo.sx) / vp.zoom;
  const dy = (e.clientY - dragNodo.sy) / vp.zoom;
  if (Math.abs(dx) + Math.abs(dy) > 4) dragNodo.mov = true;
  dragNodo.n.x = dragNodo.ox + dx;
  dragNodo.n.y = dragNodo.oy + dy;
}
function nodoUp() {
  if (!dragNodo) return;
  if (dragNodo.mov) {
    const n = dragNodo.n;
    put(`/api/unidades/${n.id}`, { metadata: { ...(n.metadata ?? {}), x: Math.round(n.x), y: Math.round(n.y) } })
      .catch((e) => (error.value = e.message));
  } else {
    seleccionar(dragNodo.n);
  }
  dragNodo = null;
}

const insp = reactive({ cargo: '', nombre_apellido: '', ci: '', correo: '', tipo: 'unidad', descripcion: '', competencias: [], habilidades: [] });
function seleccionar(n) {
  sel.value = n;
  insp.cargo = n.cargo || n.nombre;
  insp.nombre_apellido = n.nombre_apellido ?? '';
  insp.ci = n.ci ?? '';
  insp.correo = n.correo ?? '';
  insp.tipo = n.tipo ?? 'unidad';
  insp.descripcion = n.descripcion ?? '';
  insp.competencias = [...(n.competencias ?? [])];
  insp.habilidades = [...(n.habilidades ?? [])];
}
const seleccionado = computed(() => sel.value);
function fmtCi(e) { insp.ci = 'V-' + e.target.value.replace(/[^0-9]/g, ''); }

async function guardarInsp() {
  if (!sel.value) return;
  error.value = '';
  try {
    await put(`/api/unidades/${sel.value.id}`, {
      nombre: insp.cargo.trim(), cargo: insp.cargo.trim(), tipo: insp.tipo,
      nombre_apellido: insp.nombre_apellido, ci: insp.ci, correo: insp.correo,
      descripcion: insp.descripcion, competencias: insp.competencias, habilidades: insp.habilidades,
    });
    await cargar();
  } catch (e) { error.value = e.message; }
}

async function nuevoHijo() {
  if (!sel.value) return;
  try {
    await post('/api/unidades', { nombre: 'Nuevo cargo', cargo: 'Nuevo cargo', tipo: 'unidad', parent_id: sel.value.id });
    await cargar();
  } catch (e) { error.value = e.message; }
}

async function nuevoRaiz() {
  try {
    await post('/api/unidades', { nombre: 'Nueva gerencia', cargo: 'Nueva gerencia', tipo: 'gerencia' });
    await cargar();
  } catch (e) { error.value = e.message; }
}

async function borrarSel() {
  if (!sel.value) return;
  try {
    await del(`/api/unidades/${sel.value.id}`);
    sel.value = null;
    await cargar();
  } catch (e) { error.value = e.message; }
}

const edges = computed(() =>
  nodos.value.filter((n) => n.padre).map((n) => {
    const p = nodos.value.find((x) => x.id === n.padre);
    return p ? { x1: p.x + NODE_W / 2, y1: p.y + NODE_H, x2: n.x + NODE_W / 2, y2: n.y } : null;
  }).filter(Boolean)
);

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>Estructura organizacional</h1>
        <p class="sub">Arrastra el fondo para moverte, arrastra tarjetas para posicionarlas, click en una tarjeta para editarla.</p>
      </div>
      <button v-if="esRrhh" class="primary" @click="nuevoRaiz">Agregar</button>
    </header>

    <section v-if="esRrhh" class="chat">
      <textarea v-model="chatTxt" rows="2" @keydown.ctrl.enter.prevent="enviarChat"
        placeholder="Describe la estructura en lenguaje natural, ej: una gerencia con 2 líderes y cada líder 3 analistas" />
      <button class="primary" :disabled="chatLoading" @click="enviarChat">{{ chatLoading ? 'Generando…' : '➤ Crear' }}</button>
      <p v-if="chatMsg" class="chatmsg">{{ chatMsg }}</p>
    </section>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="workspace">
      <div ref="viewport" class="viewport" @mousedown="panStart" @mousemove="panMove" @mouseup="panEnd" @mouseleave="panEnd">
        <div class="zoom">
          <button @click="zoomBy(-0.1)">−</button>
          <span>{{ Math.round(vp.zoom * 100) }}%</span>
          <button @click="zoomBy(0.1)">+</button>
          <button @click="centrar">Centrar</button>
        </div>
        <div class="stage" :style="{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }">
          <svg class="edges">
            <line v-for="(e, i) in edges" :key="i" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" stroke="#05284B" stroke-width="2" />
          </svg>
          <div v-for="n in nodos" :key="n.id" class="node" :class="{ sel: seleccionado?.id === n.id }"
               :style="{ left: n.x + 'px', top: n.y + 'px', width: NODE_W + 'px' }"
               @mousedown="nodoDown($event, n)">
            <strong>{{ n.cargo || n.nombre }}</strong>
            <span class="tipo">{{ n.tipo }}</span>
            <span v-if="n.nombre_apellido" class="persona">{{ n.nombre_apellido }}</span>
          </div>
        </div>
      </div>

      <aside class="inspector">
        <template v-if="sel">
          <h3>{{ sel.cargo || sel.nombre }}</h3>
          <div class="campo"><label>Tipo</label>
            <select v-model="insp.tipo">
              <option value="gerencia">Gerencia</option>
              <option value="unidad">Unidad</option>
              <option value="cargo">Cargo</option>
            </select>
          </div>
          <div class="campo"><label>Cargo</label><input v-model="insp.cargo" placeholder="Ej. Gerente de RRHH" /></div>
          <div class="campo"><label>Nombre y apellido</label><input v-model="insp.nombre_apellido" /></div>
          <div class="campo"><label>Cédula</label><input :value="insp.ci" @input="fmtCi" placeholder="V-12345678" /></div>
          <div class="campo"><label>Correo</label><input v-model="insp.correo" type="email" /></div>
          <div class="campo"><label>Descripción</label><textarea v-model="insp.descripcion" rows="2" /></div>
          <div class="campo"><label>Habilidades</label><TagSelect v-model="insp.habilidades" tipo="habilidad" /></div>
          <div class="campo"><label>Competencias</label><TagSelect v-model="insp.competencias" tipo="competencia" /></div>
          <div class="acciones">
            <button class="primary" @click="guardarInsp">Guardar</button>
            <button @click="nuevoHijo">+ Subordinado</button>
            <button class="danger" @click="borrarSel">Eliminar</button>
          </div>
        </template>
        <p v-else class="vacio">Selecciona una tarjeta para editar su perfil.</p>
      </aside>
    </div>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
h1 { color: var(--navy); }
.sub { font-size: .9rem; color: #6b7280; }
.chat { display: flex; gap: .5rem; align-items: flex-start; margin-top: 1.2rem; background: #fff; border-radius: 14px; padding: .9rem; box-shadow: 0 4px 16px rgba(15,30,80,.1); }
.chat textarea { flex: 1; border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .55rem; font-family: inherit; resize: vertical; }
.chatmsg { font-size: .8rem; color: var(--navy); margin: 0; align-self: center; }
.error { color: var(--danger); }

.workspace { display: flex; gap: 1rem; margin-top: 1.2rem; height: 70vh; }
.viewport { flex: 1; position: relative; overflow: hidden; border-radius: 14px; border: 1.5px solid #e2e6f0; cursor: grab;
  background-image: radial-gradient(#c8cede 1px, transparent 1px); background-size: 20px 20px; background-color: #fff; }
.viewport:active { cursor: grabbing; }
.zoom { position: absolute; top: .8rem; left: .8rem; z-index: 5; display: flex; align-items: center; background: #fff; border: 1px solid #e2e6f0; border-radius: 8px; overflow: hidden; }
.zoom button { padding: .35rem .7rem; background: none; border: none; cursor: pointer; font-family: inherit; }
.zoom span { padding: 0 .5rem; font-size: .8rem; }
.stage { position: absolute; top: 0; left: 0; transform-origin: top left; width: 4000px; height: 3000px; }
.edges { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
.node { position: absolute; padding: .8rem; background: #fff; border: 2px solid var(--navy); border-radius: 10px;
  display: flex; flex-direction: column; gap: .15rem; cursor: pointer; user-select: none; box-shadow: 0 3px 10px rgba(15,30,80,.12); }
.node.sel { border-color: var(--orange); }
.node strong { color: var(--navy); font-size: .9rem; }
.node .tipo { font-size: .72rem; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }
.node .persona { font-size: .78rem; color: var(--navy); }

.inspector { width: 320px; background: #fff; border: 1.5px solid #e2e6f0; border-radius: 14px; padding: 1rem; overflow-y: auto; }
.inspector h3 { color: var(--navy); margin: 0 0 .8rem; }
.campo { margin-bottom: .7rem; display: flex; flex-direction: column; gap: .25rem; }
.campo label { font-size: .75rem; font-weight: 600; color: var(--navy); }
.campo input, .campo select, .campo textarea { border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .45rem; font-family: inherit; }
.acciones { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .8rem; }
.danger { color: var(--danger); }
.vacio { color: #6b7280; font-size: .85rem; }
</style>
