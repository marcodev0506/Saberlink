<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { get, post } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const route = useRoute();
const curso = ref(null);
const lecciones = ref([]);
const evaluaciones = ref([]);
const error = ref('');
const reproduciendo = ref(null);
const generando = ref(null);
let audioEl = null;

const token = localStorage.getItem('token');

async function cargar() {
  try {
    const data = await get(`/api/cursos/${route.params.id}`);
    curso.value = data.curso;
    lecciones.value = data.lecciones;
    evaluaciones.value = data.curso.evaluaciones || [];
  } catch (err) {
    error.value = err.message;
  }
}

async function play(leccion) {
  if (!leccion.audio_path) {
    generando.value = leccion.id;
    error.value = '';
    try {
      await post(`/api/cursos/${route.params.id}/audio/${leccion.id}`);
      leccion.audio_path = 'ok';
    } catch (err) {
      error.value = err.message;
      generando.value = null;
      return;
    }
    generando.value = null;
  }
  const r = await fetch(`http://localhost:3000/api/cursos/${route.params.id}/audio/${leccion.id}`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { error.value = 'No se pudo cargar el audio'; return; }
  const url = URL.createObjectURL(await r.blob());
  audioEl?.pause();
  audioEl = new Audio(url);
  reproduciendo.value = leccion.id;
  audioEl.onended = () => (reproduciendo.value = null);
  audioEl.play();
}
function stop() { audioEl?.pause(); reproduciendo.value = null; }

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <header class="top" v-if="curso">
      <div>
        <router-link to="/cursos" class="back">← Cursos</router-link>
        <h1>{{ curso.titulo }}</h1>
        <p class="sub">{{ curso.objetivo }}</p>
      </div>
      <span class="estado" :class="curso.estado">{{ curso.estado }}</span>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <button v-if="evaluaciones.length" class="evalbtn diag" @click="$router.push(`/cursos/${route.params.id}/evaluacion?tipo=diagnostico`)">
      ▸ Presentar evaluación diagnóstica
    </button>

    <section class="unidades">
      <article v-for="(l, i) in lecciones" :key="l.id" class="unidad">
        <div class="unidad-body">
          <div class="unidad-info">
            <header>
              <strong>Unidad {{ l.orden }} — {{ l.titulo }}</strong>
              <button class="play" :disabled="generando === l.id" @click="reproduciendo === l.id ? stop() : play(l)">
                {{ generando === l.id ? 'Generando…' : (reproduciendo === l.id ? '⏸' : '▶ Empezar') }}
              </button>
            </header>
            <p>{{ l.texto }}</p>
          </div>
          <img v-if="reproduciendo === l.id || generando === l.id" src="/robot.png" alt="Asistente" class="robot" :class="{ hablando: reproduciendo === l.id }" />
        </div>
      </article>
      <p v-if="curso && !lecciones.length" class="empty">
        {{ curso.estado === 'procesando' ? 'La IA está dividiendo el contenido en unidades…' : 'Este curso aún no tiene unidades (sube el PDF).' }}
      </p>
    </section>

    <button v-if="evaluaciones.length" class="evalbtn" @click="$router.push(`/cursos/${route.params.id}/evaluacion`)">
      ▸ Presentar evaluación
    </button>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; }
.back { color: var(--navy); font-size: .85rem; font-weight: 600; text-decoration: none; }
h1 { color: var(--navy); margin: .3rem 0 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .2rem 0 0; }
.error { color: var(--danger); }
.estado { font-size: .7rem; font-weight: 700; padding: .25rem .7rem; border-radius: 999px; background: var(--cream); color: #4b5563; text-transform: uppercase; }
.estado.listo, .estado.publicado { background: #dde6f0; color: var(--navy); }
.estado.procesando { background: #fdeee3; color: var(--orange); }
.empty { color: #9aa3b5; padding: 2rem 0; text-align: center; }

.unidades { margin-top: 1.4rem; display: flex; flex-direction: column; gap: .9rem; }
.unidad { background: #fff; border-radius: 14px; padding: 1.1rem 1.3rem; box-shadow: 0 4px 16px rgba(15,30,80,.1); }
.unidad-body { display: flex; gap: 1rem; align-items: flex-start; }
.unidad-info { flex: 1; min-width: 0; }
.unidad header { display: flex; justify-content: space-between; align-items: center; }
.robot { width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 3px solid var(--navy); flex-shrink: 0; }
.robot.hablando { border-color: var(--orange); animation: habla 0.9s ease-in-out infinite; }
@keyframes habla {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236,106,17,.5); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(236,106,17,0); }
}
.unidad strong { color: var(--navy); }
.unidad p { color: #4b5563; font-size: .85rem; line-height: 1.5; }
.play { border: 0; background: var(--navy); color: #fff; padding: .45rem 1.1rem; border-radius: 999px; font-weight: 700; font-size: .82rem; cursor: pointer; }

.evalbtn { margin-top: 1.6rem; border: 0; background: var(--navy); color: #fff; padding: .7rem 1.4rem; border-radius: 999px; font-weight: 700; font-size: .9rem; cursor: pointer; }
.evals { margin-top: 1.2rem; }
.evals h2 { color: var(--navy); font-size: 1.05rem; }
.eval { background: #fff; border-radius: 12px; padding: 1rem 1.2rem; margin-top: .7rem; box-shadow: 0 3px 12px rgba(15,30,80,.08); }
.eval p { margin: 0 0 .5rem; font-size: .9rem; }
.eval label { display: block; font-size: .85rem; color: #4b5563; padding: .2rem 0; }
</style>
