<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const router = useRouter();
const password = ref('');
const confirmar = ref('');
const error = ref('');

async function cambiar() {
  error.value = '';
  if (password.value !== confirmar.value) { error.value = 'Las contraseñas no coinciden'; return; }
  try {
    await post('/api/auth/cambiar-password', { password: password.value });
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    u.debe_cambiar_password = false;
    localStorage.setItem('user', JSON.stringify(u));
    router.push('/inicio');
  } catch (err) { error.value = err.message; }
}
</script>

<template>
  <AppLayout>
    <section class="card">
      <h1>Cambia tu contraseña</h1>
      <p class="hint">Tu cuenta fue creada con una contraseña temporal. Elige una nueva para continuar.</p>
      <form @submit.prevent="cambiar">
        <label>Nueva contraseña <input v-model="password" type="password" required minlength="8" /></label>
        <label>Confirmar contraseña <input v-model="confirmar" type="password" required minlength="8" /></label>
        <button>Guardar y continuar</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </AppLayout>
</template>

<style scoped>
.card { background: #fff; border-radius: 14px; padding: 1.5rem; box-shadow: 0 6px 24px rgba(15,30,80,.08); margin-top: 1.5rem; max-width: 460px; }
h1 { color: var(--navy); font-size: 1.3rem; }
.hint { font-size: .85rem; color: #374151; }
form { display: flex; flex-direction: column; gap: .9rem; margin-top: 1rem; }
label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
input { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; }
button { padding: .7rem; border: 0; border-radius: 8px; background: var(--navy); color: #fff; font-weight: 700; cursor: pointer; }
.error { color: var(--danger); }
</style>
