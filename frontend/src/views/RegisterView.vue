<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../api.js';
import collage from '../assets/login-collage.jpg';

const router = useRouter();
const rif = ref('');
const empresa = ref('');
const nombre = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const data = await post('/api/auth/register-empresa', {
      rif: rif.value,
      empresa: empresa.value,
      nombre: nombre.value,
      email: email.value,
      password: password.value,
    });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    router.push('/inicio');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="layout">
    <div class="panel-image" :style="{ backgroundImage: `url(${collage})` }" />
    <div class="panel-form">
      <h1>Registrar empresa</h1>
      <p class="subtitle">El primer usuario queda como RRHH administrador</p>
      <form @submit.prevent="submit">
        <label>RIF de la empresa
          <input v-model="rif" placeholder="J-12345678" required />
        </label>
        <label>Nombre de la empresa
          <input v-model="empresa" required />
        </label>
        <label>Tu nombre
          <input v-model="nombre" required />
        </label>
        <label>Correo
          <input v-model="email" type="email" required />
        </label>
        <label>Contraseña
          <input v-model="password" type="password" required minlength="8" />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button :disabled="loading">{{ loading ? 'Registrando…' : 'Registrar' }}</button>
      </form>
      <p class="link"><router-link to="/login">Ya tengo cuenta</router-link></p>
    </div>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.panel-image { flex: 1; background-size: cover; background-position: center; }
.panel-form { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 3rem; max-width: 480px; margin: 0 auto; }
h1 { margin: 0; font-size: 2rem; }
.subtitle { color: #666; margin-bottom: 2rem; }
form { display: flex; flex-direction: column; gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
input { padding: 0.6rem; border: 1px solid #ccc; border-radius: 6px; }
button { padding: 0.7rem; background: #1a56db; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
.error { color: #c0392b; margin: 0; }
.link { margin-top: 1.5rem; font-size: 0.85rem; }
@media (max-width: 720px) { .panel-image { display: none; } }
</style>
