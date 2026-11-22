<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../api.js';
import collage from '../assets/login-collage.jpg';

const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const data = await post('/api/auth/login', { email: email.value, password: password.value });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    router.push(data.user.debe_cambiar_password ? '/cambiar-password' : '/inicio');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-layout">
    <aside class="auth-brand" :style="{ backgroundImage: `url(${collage})` }">
      <div class="logo">Saber<span>link</span></div>
      <h2>Formación y acreditación para tu equipo</h2>
      <p class="lead">Gestiona cursos, mide el progreso y emite certificados con QR en una sola plataforma.</p>
      <ul>
        <li>Cursos y lecciones por roles</li>
        <li>Certificados PDF verificables</li>
        <li>Guiones y audio generados con IA</li>
      </ul>
    </aside>

    <div class="auth-side">
      <div class="auth-card">
        <div class="badge">SL</div>
        <h1>Iniciar sesión</h1>
        <p class="subtitle">Accede a tu espacio de acreditación</p>
        <form @submit.prevent="submit">
          <label>Correo
            <input v-model="email" type="email" required autocomplete="email" placeholder="nombre@empresa.com" />
          </label>
          <label>Contraseña
            <input v-model="password" type="password" required autocomplete="current-password" placeholder="••••••••" />
          </label>
          <p v-if="error" class="error">{{ error }}</p>
          <button :disabled="loading">{{ loading ? 'Entrando…' : 'Entrar' }}</button>
        </form>
        <p class="link">¿Tu empresa aún no está registrada? <router-link to="/registro">Registrar empresa</router-link></p>
      </div>
    </div>
  </div>
</template>

<style src="../auth.css"></style>
