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
        <router-link v-if="user.rol === 'rrhh'" to="/estructura" class="card" style="animation-delay: .05s">
          <h3>Estructura organizacional</h3>
          <p>Define gerencias, departamentos y unidades de tu empresa en un árbol editable.</p>
        </router-link>
        <router-link v-if="user.rol === 'rrhh'" to="/usuarios" class="card" style="animation-delay: .15s">
          <h3>Usuarios</h3>
          <p>Invita trabajadores y gestores de curso, asígnales roles dentro de tu empresa.</p>
        </router-link>
        <router-link to="/cursos" class="card" style="animation-delay: .25s">
          <h3>Cursos</h3>
          <p>Catálogo de cursos — el gestor de curso sube el PDF y la IA genera guion, evaluaciones y audio.</p>
        </router-link>
        <router-link to="/certificados" class="card" style="animation-delay: .35s">
          <h3>Certificados</h3>
          <p>Acreditaciones PDF con código QR — descargables y verificables.</p>
        </router-link>
      </div>
    </template>
  </AppLayout>
</template>

<style scoped>
.title { color: var(--navy); margin: 0 0 .25rem; }
.sub { color: #6b7280; margin: 0 0 1.75rem; font-size: .9rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.card {
  background: #fff; border-radius: 14px; padding: 1.4rem;
  box-shadow: 0 6px 24px rgba(15,30,80,.08); text-decoration: none;
  transition: transform .18s cubic-bezier(.34,1.4,.64,1), box-shadow .15s;
  animation: card-pop .5s cubic-bezier(.34,1.35,.64,1) both;
}
@keyframes card-pop {
  0% { opacity: 0; transform: translateY(14px) scale(.96); }
  60% { opacity: 1; transform: translateY(-3px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.card:hover:not(.disabled) { transform: translateY(-4px) scale(1.02); box-shadow: 0 12px 32px rgba(15,30,80,.16); }
.card:not(.disabled):active { transform: translateY(0) scale(.99); }
.card h3 { margin: 0 0 .4rem; color: var(--navy); font-size: 1rem; }
.card p { margin: 0; color: #6b7280; font-size: .85rem; line-height: 1.4; }
.disabled { opacity: .55; cursor: default; }
</style>
