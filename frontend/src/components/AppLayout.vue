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
  l.push({ to: '/cursos', label: 'Cursos', hijos: [{ to: '/cursos', label: 'Todos los cursos' }, { to: '/catalogo', label: 'Catálogo' }] });
  if (user.value?.rol === 'rrhh' || user.value?.rol === 'gestor_curso') {
    l.push({ to: '/evaluaciones', label: 'Evaluaciones' });
  }
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
        <template v-for="l in links" :key="l.to">
          <div v-if="l.hijos" class="menu">
            <router-link :to="l.to" :class="{ active: route.path === l.to }">{{ l.label }} ▾</router-link>
            <div class="submenu">
              <router-link v-for="h in l.hijos" :key="h.to" :to="h.to" :class="{ active: route.path === h.to }">{{ h.label }}</router-link>
            </div>
          </div>
          <router-link v-else :to="l.to" :class="{ active: route.path === l.to }">
            {{ l.label }}
          </router-link>
        </template>
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
.shell { min-height: 100vh; background: var(--cream); font-family: 'Inter', system-ui, sans-serif; }
.topbar {
  display: flex; align-items: center; gap: 2rem;
  padding: 0 2rem; height: 60px;
  background: #fff; border-bottom: 1px solid #e6eaf3;
  position: sticky; top: 0; z-index: 10;
}
.brand { font-size: 1.25rem; font-weight: 800; color: var(--navy); text-decoration: none; }
.brand span { color: var(--orange); }
.nav-links { display: flex; gap: .25rem; flex: 1; }
.nav-links a {
  padding: .45rem .85rem; border-radius: 8px; font-size: .88rem; font-weight: 600;
  color: #4b5563; text-decoration: none;
}
.nav-links a:hover { background: var(--cream); }
.menu { position: relative; }
.submenu { display: none; position: absolute; top: 100%; left: 0; min-width: 160px; background: #fff; border: 1px solid #e2e6f0; border-radius: 10px; padding: .4rem; box-shadow: 0 8px 24px rgba(15,30,80,.14); z-index: 60; flex-direction: column; }
.menu:hover .submenu, .menu:focus-within .submenu { display: flex; }
.submenu a { padding: .45rem .8rem !important; font-size: .82rem !important; }
.nav-links a.active { background: #dde6f0; color: var(--navy); }
.user-box { display: flex; align-items: center; gap: .6rem; font-size: .85rem; }
.empresa { color: #6b7280; }
.chip { background: #dde6f0; color: var(--navy); font-size: .7rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; text-transform: uppercase; }
.name { color: var(--navy); font-weight: 600; }
.logout { border: 1px solid #d4d9ea; background: #fff; border-radius: 8px; padding: .35rem .8rem; cursor: pointer; font-size: .82rem; color: #4b5563; }
.logout:hover { background: var(--cream); }
.crumb { max-width: 860px; margin: 1.25rem auto 0; padding: 0 1rem; }
.back { color: var(--navy); font-size: .85rem; font-weight: 600; text-decoration: none; }
.back:hover { text-decoration: underline; }
.content { max-width: 860px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
</style>
