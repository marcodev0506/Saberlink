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
        <p class="sub">{{ curso.objetivo }} · Facilitador: {{ curso.facilitador || '—' }}</p>
      </div>
      <span class="estado" :class="curso.estado">{{ curso.estado }}</span>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <section class="unidades">
      <article v-for="(l, i) in lecciones" :key="l.id" class="unidad">
        <header>
          <strong>Unidad {{ l.orden }} — {{ l.titulo }}</strong>
          <button class="play" :disabled="generando === l.id" @click="reproduciendo === l.id ? stop() : play(l)">
            {{ generando === l.id ? 'Generando…' : (reproduciendo === l.id ? '⏸' : '▶ Empezar') }}
          </button>
        </header>
        <p>{{ l.texto }}</p>
      </article>
      <p v-if="curso && !lecciones.length" class="empty">
        {{ curso.estado === 'procesando' ? 'La IA está dividiendo el contenido en unidades…' : 'Este curso aún no tiene unidades (sube el PDF).' }}
      </p>
    </section>

    <section v-if="evaluaciones.length" class="evals">
      <h2>Evaluación</h2>
      <div v-for="(e, i) in evaluaciones" :key="i" class="eval">
        <p><b>{{ i + 1 }}. {{ e.pregunta }}</b></p>
        <label v-for="(op, j) in e.opciones" :key="j"><input type="radio" :name="`q${i}`" disabled /> {{ op }}</label>
      </div>
    </section>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; }
.back { color: #1a56db; font-size: .85rem; font-weight: 600; text-decoration: none; }
h1 { color: #14204a; margin: .3rem 0 0; }
.sub { color: #6b7280; font-size: .9rem; margin: .2rem 0 0; }
.error { color: #b42318; }
.estado { font-size: .7rem; font-weight: 700; padding: .25rem .7rem; border-radius: 999px; background: #eef1f7; color: #4b5563; text-transform: uppercase; }
.estado.listo, .estado.publicado { background: #e8f7ee; color: #166534; }
.estado.procesando { background: #fdf3e3; color: #b45309; }
.empty { color: #9aa3b5; padding: 2rem 0; text-align: center; }

.unidades { margin-top: 1.4rem; display: flex; flex-direction: column; gap: .9rem; }
.unidad { background: #fff; border-radius: 14px; padding: 1.1rem 1.3rem; box-shadow: 0 4px 16px rgba(15,30,80,.1); }
.unidad header { display: flex; justify-content: space-between; align-items: center; }
.unidad strong { color: #14204a; }
.unidad p { color: #4b5563; font-size: .85rem; line-height: 1.5; }
.play { border: 0; background: #3d5bf0; color: #fff; padding: .45rem 1.1rem; border-radius: 999px; font-weight: 700; font-size: .82rem; cursor: pointer; }

.evals { margin-top: 2rem; }
.evals h2 { color: #14204a; font-size: 1.05rem; }
.eval { background: #fff; border-radius: 12px; padding: 1rem 1.2rem; margin-top: .7rem; box-shadow: 0 3px 12px rgba(15,30,80,.08); }
.eval p { margin: 0 0 .5rem; font-size: .9rem; }
.eval label { display: block; font-size: .85rem; color: #4b5563; padding: .2rem 0; }
</style>
