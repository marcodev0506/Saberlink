<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '../api.js';

const router = useRouter();
const user = ref(null);
const error = ref('');

onMounted(async () => {
  try {
    const data = await get('/api/auth/me');
    user.value = data.user;
  } catch (err) {
    error.value = err.message;
    localStorage.removeItem('token');
    router.push('/login');
  }
});

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  router.push('/login');
}
</script>

<template>
  <main class="home">
    <h1>Saberlink</h1>
    <template v-if="user">
      <p>Bienvenido, <strong>{{ user.nombre }}</strong> ({{ user.rol }}) — {{ user.empresa }} ({{ user.rif }})</p>
      <button @click="logout">Cerrar sesión</button>
    </template>
    <p v-else>{{ error || 'Cargando…' }}</p>
  </main>
</template>

<style scoped>
.home { max-width: 640px; margin: 4rem auto; padding: 0 1rem; }
button { padding: 0.5rem 1rem; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; }
</style>
