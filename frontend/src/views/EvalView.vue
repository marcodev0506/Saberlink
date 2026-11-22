<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const route = useRoute();
const curso = ref(null);
const evaluaciones = ref([]);
const respuestas = ref({});
const error = ref('');
const enviado = ref(false);
const puntaje = ref(null);

async function cargar() {
  try {
    const data = await get(`/api/cursos/${route.params.id}`);
    curso.value = data.curso;
    evaluaciones.value = data.curso.evaluaciones || [];
  } catch (err) {
    error.value = err.message;
  }
}

function enviar() {
  const total = evaluaciones.value.length;
  const ok = evaluaciones.value.filter((e, i) => respuestas.value[i] === e.correcta).length;
  puntaje.value = `${ok} / ${total}`;
  enviado.value = true;
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <router-link :to="`/cursos/${route.params.id}`" class="back">← Volver al curso</router-link>
    <header class="top" v-if="curso">
      <h1>Evaluación — {{ curso.titulo }}</h1>
      <p class="sub">{{ evaluaciones.length }} preguntas</p>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <section class="evals">
      <div v-for="(e, i) in evaluaciones" :key="i" class="eval">
        <p><b>{{ i + 1 }}. {{ e.pregunta }}</b></p>
        <label v-for="(op, j) in e.opciones" :key="j" :class="{ sel: respuestas[i] === j, ok: enviado && j === e.correcta, bad: enviado && respuestas[i] === j && j !== e.correcta }">
          <input type="radio" :name="`q${i}`" :value="j" v-model.number="respuestas[i]" :disabled="enviado" />
          {{ op }}
        </label>
      </div>
      <div v-if="enviado" class="resultado">
        Resultado: <b>{{ puntaje }}</b>
      </div>
      <button v-if="!enviado" class="primary" :disabled="Object.keys(respuestas).length < evaluaciones.length" @click="enviar">
        Enviar evaluación
      </button>
    </section>
  </AppLayout>
</template>

<style scoped>
.back { color: var(--teal); font-size: .85rem; font-weight: 600; text-decoration: none; }
.top { margin-top: .8rem; }
h1 { color: var(--navy); margin: .3rem 0 0; }
.sub { color: #6b7280; font-size: .9rem; }
.error { color: var(--danger); }
.evals { margin-top: 1.2rem; }
.eval { background: #fff; border-radius: 12px; padding: 1rem 1.2rem; margin-top: .7rem; box-shadow: 0 3px 12px rgba(15,30,80,.08); }
.eval p { margin: 0 0 .5rem; font-size: .9rem; }
.eval label { display: block; font-size: .85rem; color: #4b5563; padding: .35rem .5rem; border-radius: 8px; cursor: pointer; }
.eval label.sel { background: #e0f2f5; }
.eval label.ok { background: #e0f2f5; color: var(--teal-dark); font-weight: 600; }
.eval label.bad { background: #fdeaea; color: var(--danger); }
.resultado { margin-top: 1.2rem; font-size: 1.1rem; color: var(--navy); }
.primary { margin-top: 1.4rem; padding: .7rem 1.5rem; border: 0; border-radius: 9px; background: var(--teal); color: #fff; font-weight: 700; cursor: pointer; }
.primary:disabled { opacity: .5; cursor: default; }
</style>
