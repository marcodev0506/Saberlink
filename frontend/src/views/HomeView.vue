<script setup>
import { ref, onMounted } from 'vue';
import { get } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));

onMounted(async () => {
  try {
    const data = await get('/api/auth/me');
    user.value = data.user;
  } catch { /* AppLayout ya redirige */ }
});
</script>

<template>
  <AppLayout>
    <template v-if="user">
      <h1 class="title">Hola, {{ user.nombre }}</h1>
      <p class="sub">{{ user.empresa }} · {{ user.rif }} · rol {{ user.rol }}</p>

      <div class="cards">
        <router-link v-if="user.rol === 'rrhh'" to="/estructura" class="card">
          <h3>Estructura organizacional</h3>
          <p>Define gerencias, departamentos y unidades de tu empresa en un árbol editable.</p>
        </router-link>
        <router-link v-if="user.rol === 'rrhh'" to="/usuarios" class="card">
          <h3>Usuarios</h3>
          <p>Invita trabajadores y expertos, asígnales roles dentro de tu empresa.</p>
        </router-link>
        <div class="card disabled">
          <h3>Cursos</h3>
          <p>Catálogo de cursos y lecciones — próximamente.</p>
        </div>
        <div class="card disabled">
          <h3>Certificados</h3>
          <p>Acreditaciones PDF con código QR — próximamente.</p>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

<style scoped>
.title { color: #14204a; margin: 0 0 .25rem; }
.sub { color: #6b7280; margin: 0 0 1.75rem; font-size: .9rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.card {
  background: #fff; border-radius: 14px; padding: 1.4rem;
  box-shadow: 0 6px 24px rgba(15,30,80,.08); text-decoration: none;
  transition: transform .1s, box-shadow .15s;
}
.card:hover:not(.disabled) { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(15,30,80,.14); }
.card h3 { margin: 0 0 .4rem; color: #14204a; font-size: 1rem; }
.card p { margin: 0; color: #6b7280; font-size: .85rem; line-height: 1.4; }
.disabled { opacity: .55; cursor: default; }
</style>
