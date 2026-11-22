<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { get } from '../api.js';

const router = useRouter();
const route = useRoute();
const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));
const empresa = ref('');

onMounted(async () => {
  try {
    const data = await get('/api/auth/me');
    user.value = data.user;
    empresa.value = data.user.empresa;
  } catch {
    localStorage.removeItem('token');
    router.push('/login');
  }
});

const links = computed(() => {
  const l = [{ to: '/inicio', label: 'Inicio' }];
  if (user.value?.rol === 'rrhh') {
    l.push({ to: '/usuarios', label: 'Usuarios' });
    l.push({ to: '/estructura', label: 'Estructura' });
  }
  l.push({ to: '/cursos', label: 'Cursos' });
  return l;
});

const esInicio = computed(() => route.path === '/inicio');

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  router.push('/login');
}
</script>

<template>
  <div class="shell">
    <nav class="topbar">
      <router-link to="/inicio" class="brand">Saber<span>link</span></router-link>
      <div class="nav-links">
        <router-link v-for="l in links" :key="l.to" :to="l.to" :class="{ active: route.path === l.to }">
          {{ l.label }}
        </router-link>
      </div>
      <div class="user-box" v-if="user">
        <span class="empresa">{{ empresa }}</span>
        <span class="chip">{{ user.rol }}</span>
        <span class="name">{{ user.nombre }}</span>
        <button class="logout" @click="logout">Salir</button>
      </div>
    </nav>

    <div class="crumb" v-if="!esInicio">
      <router-link to="/inicio" class="back">← Inicio</router-link>
    </div>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; background: #f4f6fb; font-family: 'Inter', system-ui, sans-serif; }
.topbar {
  display: flex; align-items: center; gap: 2rem;
  padding: 0 2rem; height: 60px;
  background: #fff; border-bottom: 1px solid #e6eaf3;
  position: sticky; top: 0; z-index: 10;
}
.brand { font-size: 1.25rem; font-weight: 800; color: #14204a; text-decoration: none; }
.brand span { color: #f5b942; }
.nav-links { display: flex; gap: .25rem; flex: 1; }
.nav-links a {
  padding: .45rem .85rem; border-radius: 8px; font-size: .88rem; font-weight: 600;
  color: #4b5563; text-decoration: none;
}
.nav-links a:hover { background: #eef1f7; }
.nav-links a.active { background: #eef2ff; color: #1a56db; }
.user-box { display: flex; align-items: center; gap: .6rem; font-size: .85rem; }
.empresa { color: #6b7280; }
.chip { background: #eef2ff; color: #1a56db; font-size: .7rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; text-transform: uppercase; }
.name { color: #14204a; font-weight: 600; }
.logout { border: 1px solid #d4d9ea; background: #fff; border-radius: 8px; padding: .35rem .8rem; cursor: pointer; font-size: .82rem; color: #4b5563; }
.logout:hover { background: #f5f7fc; }
.crumb { max-width: 860px; margin: 1.25rem auto 0; padding: 0 1rem; }
.back { color: #1a56db; font-size: .85rem; font-weight: 600; text-decoration: none; }
.back:hover { text-decoration: underline; }
.content { max-width: 860px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
</style>
