<script setup>
import { ref, onMounted } from 'vue';
import { get, post, put, del } from '../api.js';
import OrgNode from '../components/OrgNode.vue';

const arbol = ref([]);
const error = ref('');
const modal = ref(null);   // { mode: 'add'|'edit', parent?, node? }
const nombre = ref('');
const tipo = ref('gerencia');
const tipos = ['gerencia', 'departamento', 'dirección', 'coordinación', 'unidad'];
const user = JSON.parse(localStorage.getItem('user') || '{}');
const esRrhh = user.rol === 'rrhh';

async function cargar() {
  const data = await get('/api/unidades');
  arbol.value = data.unidades;
}

function abrirAdd(parent = null) {
  modal.value = { mode: 'add', parent };
  nombre.value = '';
  tipo.value = 'gerencia';
}

function abrirEdit(node) {
  modal.value = { mode: 'edit', node };
  nombre.value = node.nombre;
  tipo.value = node.tipo;
}

async function guardar() {
  error.value = '';
  try {
    if (modal.value.mode === 'add') {
      await post('/api/unidades', { nombre: nombre.value, tipo: tipo.value, parent_id: modal.value.parent?.id ?? null });
    } else {
      await put(`/api/unidades/${modal.value.node.id}`, { nombre: nombre.value, tipo: tipo.value });
    }
    modal.value = null;
    await cargar();
  } catch (err) {
    error.value = err.message;
  }
}

async function borrar(node) {
  if (!confirm(`Eliminar "${node.nombre}" y todas sus sub-unidades?`)) return;
  try {
    await del(`/api/unidades/${node.id}`);
    await cargar();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(cargar);
</script>

<template>
  <main class="page">
    <header class="top">
      <div>
        <h1>Estructura organizacional</h1>
        <p class="sub">Define las unidades de tu empresa: gerencias, departamentos, coordinaciones… como tú las llames.</p>
      </div>
      <button v-if="esRrhh" class="primary" @click="abrirAdd(null)">+ Unidad raíz</button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <section class="card">
      <ul v-if="arbol.length" class="tree">
        <OrgNode v-for="n in arbol" :key="n.id" :node="n" @add="abrirAdd" @edit="abrirEdit" @delete="borrar" />
      </ul>
      <p v-else class="empty">Aún no hay unidades. Crea la primera con “+ Unidad raíz”{{ esRrhh ? '' : ' (solo RRHH)' }}.</p>
    </section>

    <div v-if="modal" class="overlay" @click.self="modal = null">
      <div class="dialog">
        <h2>{{ modal.mode === 'add' ? `Nueva unidad${modal.parent ? ` en "${modal.parent.nombre}"` : ''}` : `Editar "${modal.node.nombre}"` }}</h2>
        <label>Nombre <input v-model="nombre" required /></label>
        <label>Tipo
          <select v-model="tipo">
            <option v-for="t in tipos" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button class="ghost" @click="modal = null">Cancelar</button>
          <button class="primary" @click="guardar">Guardar</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.page { max-width: 860px; margin: 3rem auto; padding: 0 1rem; font-family: 'Inter', system-ui, sans-serif; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
h1 { color: #14204a; margin: 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .3rem 0 0; }
.primary { padding: .6rem 1.1rem; border: 0; border-radius: 9px; background: #1a56db; color: #fff; font-weight: 700; cursor: pointer; }
.ghost { padding: .6rem 1.1rem; border: 1px solid #d4d9ea; border-radius: 9px; background: #fff; cursor: pointer; }
.card { background: #fff; border-radius: 14px; padding: 1.5rem; box-shadow: 0 6px 24px rgba(15,30,80,.08); margin-top: 1.5rem; }
.tree { margin: 0; padding: 0; }
.empty { color: #6b7280; text-align: center; padding: 2rem 0; }
.error { color: #b42318; }
.overlay { position: fixed; inset: 0; background: rgba(10,20,50,.4); display: flex; align-items: center; justify-content: center; }
.dialog { background: #fff; border-radius: 14px; padding: 1.75rem; width: 340px; display: flex; flex-direction: column; gap: 1rem; }
.dialog h2 { margin: 0; font-size: 1.05rem; color: #14204a; }
.dialog label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
.dialog input, .dialog select { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: .5rem; }
</style>
