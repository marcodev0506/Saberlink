<script setup>
import { ref, onMounted } from 'vue';
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

    <section class="card">
      <h2>Invitar usuario</h2>
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

    <section class="card">
      <table>
        <thead>
          <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Alta</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in usuarios" :key="u.id">
            <td>{{ u.nombre }}</td>
            <td>{{ u.email }}</td>
            <td><span class="chip" :data-rol="u.rol">{{ u.rol }}</span></td>
            <td>{{ new Date(u.created_at).toLocaleDateString() }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </AppLayout>
</template>

<style scoped>
h1 { color: var(--navy); }
.card { background: #fff; border-radius: 14px; padding: 1.5rem; box-shadow: 0 6px 24px rgba(15,30,80,.08); margin-top: 1.5rem; }
h2 { font-size: 1rem; margin: 0 0 1rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
input, select { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; }
button { grid-column: 1 / -1; padding: .7rem; border: 0; border-radius: 8px; background: var(--teal); color: #fff; font-weight: 700; cursor: pointer; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th { text-align: left; color: #6b7280; font-size: .78rem; text-transform: uppercase; padding: .4rem .5rem; }
td { padding: .55rem .5rem; border-top: 1px solid var(--cream); }
.chip { padding: .15rem .6rem; border-radius: 999px; font-size: .75rem; font-weight: 700; background: #eef2ff; color: var(--teal); }
.chip[data-rol='experto'] { background: #fdeee3; color: var(--orange); }
.chip[data-rol='trabajador'] { background: #e0f2f5; color: var(--teal-dark); }
.error { color: var(--danger); } .ok { color: var(--teal-dark); }
</style>
