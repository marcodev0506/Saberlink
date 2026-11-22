<script setup>
import { ref, computed, onMounted } from 'vue';
import { get, post } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const usuarios = ref([]);
const nombre = ref('');
const email = ref('');
const password = ref('');
const rol = ref('trabajador');
const error = ref('');
const ok = ref('');
const loading = ref(false);
const importMsg = ref('');
const importando = ref(false);
const tab = ref('registro');
const pagina = ref(0);
const POR_PAGINA = 10;
const totalPaginas = computed(() => Math.max(1, Math.ceil(usuarios.value.length / POR_PAGINA)));
const usuariosPagina = computed(() => usuarios.value.slice(pagina.value * POR_PAGINA, (pagina.value + 1) * POR_PAGINA));

async function importar(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  error.value = ''; importMsg.value = ''; importando.value = true;
  try {
    const r = await post('/api/usuarios/importar', { archivo_base64: b64, archivo_nombre: f.name });
    importMsg.value = `${r.creados} usuarios creados${r.omitidos ? `, ${r.omitidos} ya existían` : ''}${r.errores.length ? `, ${r.errores.length} errores` : ''} — contraseña inicial: ${r.password_default}`;
    if (r.errores.length) importMsg.value += ` (${r.errores.join('; ')})`;
    await cargar();
  } catch (err) { error.value = err.message; }
  finally { importando.value = false; }
  ev.target.value = '';
}

async function cargar() {
  const data = await get('/api/usuarios');
  usuarios.value = data.usuarios;
}

async function invitar() {
  error.value = '';
  ok.value = '';
  loading.value = true;
  try {
    await post('/api/usuarios', { nombre: nombre.value, email: email.value, password: password.value, rol: rol.value });
    ok.value = `Usuario ${nombre.value} creado`;
    nombre.value = email.value = password.value = '';
    rol.value = 'trabajador';
    await cargar();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <h1>Usuarios de la empresa</h1>

    <nav class="tabs">
      <button :class="{ active: tab === 'registro' }" @click="tab = 'registro'">Registrar usuario</button>
      <button :class="{ active: tab === 'plantilla' }" @click="tab = 'plantilla'">Usar plantilla</button>
      <button :class="{ active: tab === 'lista' }" @click="tab = 'lista'">Lista de usuarios</button>
    </nav>

    <section class="card" v-show="tab === 'registro'">
      <h2>Registrar usuario</h2>
      <form @submit.prevent="invitar" class="grid">
        <label>Nombre <input v-model="nombre" required /></label>
        <label>Correo <input v-model="email" type="email" required /></label>
        <label>Contraseña temporal <input v-model="password" type="password" required minlength="8" /></label>
        <label>Rol
          <select v-model="rol">
            <option value="trabajador">Trabajador</option>
            <option value="experto">Experto</option>
            <option value="rrhh">RRHH</option>
          </select>
        </label>
        <button :disabled="loading">{{ loading ? 'Creando…' : 'Crear usuario' }}</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="ok" class="ok">{{ ok }}</p>
    </section>

    <section class="card" v-show="tab === 'plantilla'">
      <h2>Importar desde Excel</h2>
      <p class="hint">Sube la <a href="/plantilla_usuarios.xlsx" download>📄 plantilla</a> con columnas <b>nombre</b>, <b>correo</b> y <b>rol</b> (trabajador / experto / rrhh). Todos entran con contraseña <b>Saberlink123</b> y la cambian al primer inicio de sesión.</p>
      <input type="file" accept=".xlsx,.xls,.csv" :disabled="importando" @change="importar" />
      <p v-if="importando" class="loading"><span class="spinner" /> Importando usuarios…</p>
      <p v-else-if="importMsg" class="ok">{{ importMsg }}</p>
    </section>

    <section class="card" v-show="tab === 'lista'">
      <table>
        <thead>
          <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Alta</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in usuariosPagina" :key="u.id">
            <td>{{ u.nombre }}</td>
            <td>{{ u.email }}</td>
            <td><span class="chip" :data-rol="u.rol">{{ u.rol }}</span></td>
            <td>{{ new Date(u.created_at).toLocaleDateString() }}</td>
          </tr>
        </tbody>
      </table>
      <nav class="pager" v-if="totalPaginas > 1">
        <button :disabled="pagina === 0" @click="pagina--">← Anterior</button>
        <span>Página {{ pagina + 1 }} de {{ totalPaginas }}</span>
        <button :disabled="pagina >= totalPaginas - 1" @click="pagina++">Siguiente →</button>
      </nav>
    </section>
  </AppLayout>
</template>

<style scoped>
h1 { color: var(--navy); }
.tabs { display: flex; gap: .4rem; margin-top: 1.5rem; }
.tabs button { padding: .55rem 1.1rem; border: 0; border-radius: 999px; background: #e8dcc4; color: var(--navy); font-weight: 700; cursor: pointer; font-size: .85rem; }
.tabs button.active { background: var(--navy); color: #fff; }
.pager { display: flex; align-items: center; justify-content: space-between; margin-top: 1rem; font-size: .85rem; color: var(--navy); font-weight: 600; }
.pager button { padding: .45rem 1rem; border: 0; border-radius: 8px; background: var(--navy); color: #fff; font-weight: 700; cursor: pointer; }
.pager button:disabled { opacity: .4; cursor: default; }
.loading { display: flex; align-items: center; gap: .5rem; color: var(--navy); font-weight: 600; font-size: .85rem; }
.spinner { width: 16px; height: 16px; border: 2px solid #e8dcc4; border-top-color: var(--navy); border-radius: 50%; animation: spin .8s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.card { background: #fff; border-radius: 14px; padding: 1.5rem; box-shadow: 0 6px 24px rgba(15,30,80,.08); margin-top: 1.5rem; }
h2 { font-size: 1rem; margin: 0 0 1rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
input, select { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; }
button { grid-column: 1 / -1; padding: .7rem; border: 0; border-radius: 8px; background: var(--navy); color: #fff; font-weight: 700; cursor: pointer; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th { text-align: left; color: #6b7280; font-size: .78rem; text-transform: uppercase; padding: .4rem .5rem; }
td { padding: .55rem .5rem; border-top: 1px solid var(--cream); }
.chip { padding: .15rem .6rem; border-radius: 999px; font-size: .75rem; font-weight: 700; background: #eef2ff; color: var(--navy); }
.chip[data-rol='experto'] { background: #fdeee3; color: var(--orange); }
.chip[data-rol='trabajador'] { background: #dde6f0; color: var(--navy); }
.error { color: var(--danger); } .ok { color: var(--navy); }
.hint { font-size: .85rem; color: #374151; }
</style>
