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

      <div class="bento">
        <div class="left">
          <img class="avatar" src="/home.jpg" alt="Saberlink" />
        </div>

        <div class="bloques">
          <router-link v-if="user.rol === 'rrhh'" to="/estructura" class="bloque" style="animation-delay:.05s">
            <img class="ico" src="/icons/estructura.png" alt="" />
            <b>Estructura</b>
            <span>organizacional</span>
            <p>Árbol de gerencias, departamentos y cargos editable.</p>
          </router-link>
          <router-link to="/cursos" class="bloque" style="animation-delay:.15s">
            <img class="ico" src="/icons/cursos.png" alt="" />
            <b>Cursos</b>
            <span>catálogo y estudio</span>
            <p>La IA genera guion, unidades, evaluaciones y audio.</p>
          </router-link>
          <router-link v-if="user.rol === 'rrhh'" to="/usuarios" class="bloque" style="animation-delay:.25s">
            <img class="ico" src="/icons/usuarios.png" alt="" />
            <b>Usuarios</b>
            <span>equipo</span>
            <p>Invita trabajadores y gestores con sus roles.</p>
          </router-link>
          <router-link to="/certificados" class="bloque" style="animation-delay:.35s">
            <img class="ico" src="/icons/certificados.png" alt="" />
            <b>Certificados</b>
            <span>acreditación</span>
            <p>PDF con QR único, verificable públicamente.</p>
          </router-link>
          <router-link v-if="user.rol !== 'trabajador'" to="/evaluaciones/reportes" class="bloque" style="animation-delay:.45s">
            <img class="ico" src="/icons/usuarios.png" alt="" />
            <b>Reportes</b>
            <span>evaluaciones</span>
            <p>Resultados diagnósticos, teóricos y prácticos por estudiante y por curso.</p>
          </router-link>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

<style scoped>
.title { color: var(--navy); margin: 0 0 .25rem; font-size: 1.9rem; }
.sub { color: #6b7280; margin: 0 0 1.75rem; font-size: .9rem; }

.bento { display: grid; grid-template-columns: 340px 1fr; gap: 1.2rem; }
.left {
  border-radius: 20px; overflow: hidden; min-height: 420px;
  background: var(--navy); position: relative;
}
.left .avatar { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }

.bloques { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.2rem; align-content: start; }
.bloque {
  background: var(--orange); color: #fff; border-radius: 20px; padding: 1.8rem 1.6rem;
  min-height: 190px; display: flex; flex-direction: column; justify-content: flex-end;
  text-decoration: none; box-shadow: 0 10px 26px rgba(15,30,80,.12);
  transition: transform .18s cubic-bezier(.34,1.4,.64,1), box-shadow .15s;
  animation: card-pop .5s cubic-bezier(.34,1.35,.64,1) both;
}
.ico { width: 56px; height: 56px; object-fit: contain; margin-bottom: auto; opacity: .95; }
.bloque b { font-size: 1.8rem; line-height: 1.05; }
.bloque span { font-size: .95rem; font-weight: 600; opacity: .9; }
.bloque p { margin: .7rem 0 0; font-size: .82rem; line-height: 1.45; opacity: .92; }
@keyframes card-pop {
  0% { opacity: 0; transform: translateY(14px) scale(.96); }
  60% { opacity: 1; transform: translateY(-3px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.bloque:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 16px 36px rgba(15,30,80,.2); }
.bloque:active { transform: scale(.99); }

@media (max-width: 1100px) {
  .bento { grid-template-columns: 1fr; }
  .left { min-height: 300px; }
  .bloques { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) { .bloques { grid-template-columns: 1fr; } }
</style>
