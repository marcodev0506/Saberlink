<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { get, post } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const route = useRoute();
const curso = ref(null);
const evaluaciones = ref([]);
const respuestas = ref({});
const error = ref('');
const enviado = ref(false);
const puntaje = ref(null);
const aprobado = ref(false);
const tipo = ['diagnostico', 'teorica', 'practica'].includes(route.query.tipo) ? route.query.tipo : 'teorica';
const tipoTitulo = { diagnostico: 'Evaluación diagnóstica', teorica: 'Evaluación teórica', practica: 'Evaluación práctica' }[tipo];
const certificado = ref(null);
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function cargar() {
  try {
    const data = await get(`/api/cursos/${route.params.id}`);
    curso.value = data.curso;
    evaluaciones.value = data.curso.evaluaciones || [];
  } catch (err) {
    error.value = err.message;
  }
}

async function enviar() {
  try {
    const r = await post(`/api/cursos/${route.params.id}/evaluacion`, { respuestas: respuestas.value, tipo });
    puntaje.value = `${r.puntaje} / ${r.total}`;
    aprobado.value = r.aprobado;
    certificado.value = r.certificado;
    enviado.value = true;
  } catch (err) {
    error.value = err.message;
  }
}

async function descargarCert() {
  const r = await fetch(`${API}/api/certificados/${certificado.value}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!r.ok) { error.value = 'No se pudo descargar el certificado'; return; }
  const url = URL.createObjectURL(await r.blob());
  window.open(url, '_blank');
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <router-link :to="`/cursos/${route.params.id}`" class="back">← Volver al curso</router-link>
    <header class="top" v-if="curso">
      <h1>{{ tipoTitulo }} — {{ curso.titulo }}</h1>
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
        Resultado: <b>{{ puntaje }}</b> — <b :style="{color: aprobado ? 'var(--navy)' : 'var(--danger)'}">{{ aprobado ? 'APROBADO' : 'NO APROBADO' }}</b>
      </div>
      <button v-if="certificado" class="primary cert" @click="descargarCert">
        📜 Descargar certificado (PDF con QR)
      </button>
      <button v-if="!enviado" class="primary" :disabled="Object.keys(respuestas).length < evaluaciones.length" @click="enviar">
        Enviar evaluación
      </button>
    </section>
  </AppLayout>
</template>

<style scoped>
.back {
  display: inline-flex; align-items: center; gap: .45rem;
  padding: .52rem 1.15rem; border-radius: 999px;
  background: #f3f6fb; border: 1.5px solid #dce3ee;
  color: var(--navy); font-size: .92rem; font-weight: 700; text-decoration: none;
  box-shadow: 0 2px 6px rgba(5,40,75,.06);
  transition: all .16s ease;
}
.back:hover {
  background: var(--navy); color: #fff; border-color: var(--navy);
  transform: translateY(-1px); box-shadow: 0 6px 14px rgba(5,40,75,.16);
}
.top { margin-top: .8rem; }
h1 { color: var(--navy); margin: .3rem 0 0; }
.sub { color: #6b7280; font-size: .9rem; }
.error { color: var(--danger); }
.evals { margin-top: 1.2rem; }
.eval { background: #fff; border-radius: 12px; padding: 1rem 1.2rem; margin-top: .7rem; box-shadow: 0 3px 12px rgba(15,30,80,.08); }
.eval p { margin: 0 0 .5rem; font-size: .9rem; }
.eval label { display: block; font-size: .85rem; color: #4b5563; padding: .35rem .5rem; border-radius: 8px; cursor: pointer; }
.eval label.sel { background: #dde6f0; }
.eval label.ok { background: #dde6f0; color: var(--navy); font-weight: 600; }
.eval label.bad { background: #fdeaea; color: var(--danger); }
.resultado { margin-top: 1.2rem; font-size: 1.1rem; color: var(--navy); }
.primary { margin-top: 1.4rem; padding: .7rem 1.5rem; border: 0; border-radius: 9px; background: var(--navy); color: #fff; font-weight: 700; cursor: pointer; }
.primary:disabled { opacity: .5; cursor: default; }
.cert { display: block; background: var(--orange); }
</style>
