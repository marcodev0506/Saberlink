<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { get, put, post } from '../api.js';

const router = useRouter();
const route = useRoute();
const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));
const empresa = ref('');
const notifs = ref([]);
const noLeidas = ref(0);
const notifOpen = ref(false);
let notifTimer = null;

async function cargarNotifs() {
  try {
    const data = await get('/api/notificaciones');
    notifs.value = data.notificaciones || [];
    noLeidas.value = data.no_leidas || 0;
  } catch { /* ignorar */ }
}

async function abrirNotif(n) {
  notifOpen.value = false;
  if (!n.leida) {
    n.leida = true;
    noLeidas.value = Math.max(0, noLeidas.value - 1);
    put(`/api/notificaciones/${n.id}/leer`, {}).catch(() => {});
  }
  router.push(`/cursos/${n.curso_id}`);
}

async function marcarTodas() {
  await post('/api/notificaciones/leer-todas', {}).catch(() => {});
  notifs.value = notifs.value.map((n) => ({ ...n, leida: true }));
  noLeidas.value = 0;
}

onMounted(async () => {
  try {
    const data = await get('/api/auth/me');
    user.value = data.user;
    empresa.value = data.user.empresa;
    await cargarNotifs();
    notifTimer = setInterval(cargarNotifs, 60_000);
  } catch {
    localStorage.removeItem('token');
    router.push('/login');
  }
});

onUnmounted(() => {
  if (notifTimer) clearInterval(notifTimer);
});

const links = computed(() => {
  const l = [{ to: '/inicio', label: 'Inicio' }];
  if (user.value?.rol === 'rrhh') {
    l.push({ to: '/usuarios', label: 'Usuarios' });
    l.push({ to: '/estructura', label: 'Estructura' });
  }
  l.push({ to: '/cursos', label: 'Cursos', hijos: [{ to: '/cursos', label: 'Todos los cursos' }, { to: '/catalogo', label: 'Catálogo' }] });
  if (user.value?.rol === 'rrhh' || user.value?.rol === 'gestor_curso') {
    l.push({
      to: '/evaluaciones',
      label: 'Evaluaciones',
      hijos: [
        { to: '/evaluaciones', label: 'Resultados' },
        { to: '/evaluaciones/reportes', label: 'Reportes' },
      ],
    });
  }
  l.push({ to: '/certificados', label: user.value?.rol === 'trabajador' ? 'Mis certificados' : 'Certificados' });
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
            <router-link :to="l.to" :class="{ active: route.path === l.to || l.hijos.some(h => route.path === h.to) }">{{ l.label }} ▾</router-link>
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
        <div class="notif-wrap">
          <button class="bell-btn" @click="notifOpen = !notifOpen" title="Notificaciones de cursos">
            🔔
            <span v-if="noLeidas > 0" class="bell-badge">{{ noLeidas > 9 ? '9+' : noLeidas }}</span>
          </button>
          <div v-if="notifOpen" class="notif-drop">
            <div class="notif-head">
              <b>Cursos para tu perfil</b>
              <button v-if="noLeidas > 0" class="mark-all" @click="marcarTodas">Marcar leídas</button>
            </div>
            <div v-if="notifs.length" class="notif-list">
              <button v-for="n in notifs" :key="n.id" :class="['notif-item', { unread: !n.leida }]" @click="abrirNotif(n)">
                <span class="n-dot" v-if="!n.leida"></span>
                <div class="n-body">
                  <strong>{{ n.titulo }}</strong>
                  <small>{{ n.mensaje }}</small>
                </div>
              </button>
            </div>
            <p v-else class="notif-empty">Sin cursos nuevos por notificar.</p>
          </div>
        </div>
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
.shell { min-height: 100vh; background: #fff; font-family: 'Inter', system-ui, sans-serif; }
.topbar {
  display: flex; align-items: center; gap: 2rem;
  padding: 0 2rem; height: 60px;
  background: var(--orange); border-bottom: none;
  position: sticky; top: 0; z-index: 10;
}
.brand { font-size: 1.25rem; font-weight: 800; color: #fff; text-decoration: none; }
.brand span { color: var(--navy); }
.nav-links { display: flex; gap: .25rem; flex: 1; }
.nav-links a {
  padding: .45rem .85rem; border-radius: 8px; font-size: .88rem; font-weight: 600;
  color: #fff; text-decoration: none;
}
.nav-links a:hover { background: rgba(255,255,255,.16); }
.menu { position: relative; }
.submenu { display: none; position: absolute; top: 100%; left: 0; min-width: 160px; background: #fff; border: 1px solid #e2e6f0; border-radius: 10px; padding: .4rem; box-shadow: 0 8px 24px rgba(15,30,80,.14); z-index: 60; flex-direction: column; }
.menu:hover .submenu, .menu:focus-within .submenu { display: flex; }
.submenu a { padding: .45rem .8rem !important; font-size: .82rem !important; color: #4b5563; }
.submenu a:hover { background: var(--cream); }
.nav-links a.active { background: rgba(255,255,255,.22); color: #fff; }
.user-box { display: flex; align-items: center; gap: .6rem; font-size: .85rem; }
.empresa { color: rgba(255,255,255,.85); }
.chip { background: var(--navy); color: #fff; font-size: .7rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; text-transform: uppercase; }
.name { color: #fff; font-weight: 600; }
.logout { border: 1px solid #d4d9ea; background: #fff; border-radius: 8px; padding: .35rem .8rem; cursor: pointer; font-size: .82rem; color: #4b5563; }
.logout:hover { background: #fff; }
.notif-wrap { position: relative; }
.bell-btn {
  position: relative; border: 0; background: rgba(255,255,255,.18); color: #fff;
  width: 34px; height: 34px; border-radius: 999px; cursor: pointer; font-size: .95rem;
  display: inline-flex; align-items: center; justify-content: center;
}
.bell-btn:hover { background: rgba(255,255,255,.28); }
.bell-badge {
  position: absolute; top: -3px; right: -3px; background: var(--navy); color: #fff;
  font-size: .65rem; font-weight: 800; min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 999px; display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--orange);
}
.notif-drop {
  position: absolute; right: 0; top: calc(100% + 8px); width: 320px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
  box-shadow: 0 14px 36px rgba(15,30,80,.18); z-index: 80; overflow: hidden;
}
.notif-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: .75rem .9rem; border-bottom: 1px solid #eef2f6; color: var(--navy); font-size: .84rem;
}
.mark-all {
  border: 0; background: transparent; color: var(--orange); font-size: .74rem; font-weight: 700; cursor: pointer;
}
.notif-list { display: flex; flex-direction: column; }
.notif-item {
  border: 0; background: #fff; text-align: left; padding: .7rem .9rem; cursor: pointer;
  display: flex; align-items: flex-start; gap: .55rem; border-bottom: 1px solid #f1f5f9;
  font-family: inherit;
}
.notif-item:hover { background: #f8fafc; }
.notif-item.unread { background: #fff8f3; }
.n-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); margin-top: 5px; flex-shrink: 0; }
.n-body { min-width: 0; }
.n-body strong { display: block; font-size: .8rem; color: var(--navy); line-height: 1.25; }
.n-body small { display: block; font-size: .72rem; color: #64748b; margin-top: .15rem; }
.notif-empty { margin: 0; padding: 1.25rem; text-align: center; font-size: .8rem; color: #94a3b8; }
.crumb { max-width: 1240px; margin: 1.25rem auto 0; padding: 0 1rem; }
.back { color: var(--navy); font-size: .85rem; font-weight: 600; text-decoration: none; }
.back:hover { text-decoration: underline; }
.content { max-width: 1240px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
</style>
