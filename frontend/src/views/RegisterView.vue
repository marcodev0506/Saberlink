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
  <div class="auth-layout">
    <aside class="auth-brand" :style="{ backgroundImage: `url(${collage})`, cursor: 'pointer' }" title="Ir a la página principal" @click="router.push('/')">
      <div class="logo">Saber<span>link</span></div>
      <h2>Lleva la acreditación de tu empresa al siguiente nivel</h2>
      <p class="lead">Registra tu empresa con su RIF y crea tu espacio en minutos.</p>
      <ul>
        <li>Roles: RRHH, Gestor de curso y Trabajador</li>
        <li>Banco de preguntas y exámenes</li>
        <li>Certificados PDF con código QR</li>
      </ul>
    </aside>

    <div class="auth-side">
      <div class="auth-card">
        <div class="badge">SL</div>
        <h1>Registrar empresa</h1>
        <p class="subtitle">El primer usuario queda como administrador RRHH</p>
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
            <input v-model="email" type="email" required placeholder="nombre@empresa.com" />
          </label>
          <label>Contraseña
            <input v-model="password" type="password" required minlength="8" placeholder="Mínimo 8 caracteres" />
          </label>
          <p v-if="error" class="error">{{ error }}</p>
          <button :disabled="loading">{{ loading ? 'Registrando…' : 'Registrar' }}</button>
        </form>
        <p class="link"><router-link to="/login">Ya tengo cuenta</router-link></p>
      </div>
    </div>
  </div>
</template>

<style src="../auth.css"></style>
