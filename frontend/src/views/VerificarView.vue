<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const route = useRoute();
const cert = ref(null);
const error = ref('');

onMounted(async () => {
  try {
    const r = await fetch(`${API}/api/certificados/${route.params.codigo}`);
    if (!r.ok) throw new Error((await r.json()).error || 'Certificado no encontrado');
    cert.value = (await r.json()).certificado;
  } catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="page">
    <div class="card">
      <h1 class="brand">Saber<span>link</span></h1>
      <div v-if="cert" class="ok">
        <p class="badge">✓ Certificado válido</p>
        <h2>{{ cert.estudiante }}</h2>
        <p class="det">aprobó el curso</p>
        <h3>{{ cert.curso }}</h3>
        <p class="det">{{ cert.empresa }} · {{ new Date(cert.created_at).toLocaleDateString('es-VE') }}<span v-if="cert.duracion"> · Duración: {{ cert.duracion }}</span></p>
        <p class="cod">Código: {{ cert.codigo }}</p>
      </div>
      <div v-else-if="error" class="bad">
        <p class="badge">✗ No válido</p>
        <p class="det">{{ error }}</p>
      </div>
      <p v-else class="det">Verificando…</p>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--cream, #FBF0D3); font-family: Inter, system-ui, sans-serif; }
.card { background: #fff; border-radius: 16px; padding: 2.5rem; max-width: 420px; text-align: center; box-shadow: 0 10px 40px rgba(15,30,80,.15); }
.brand { color: var(--navy, #05284B); font-size: 1.5rem; margin: 0 0 1rem; }
.brand span { color: var(--orange, #EC6A11); }
.badge { font-weight: 700; padding: .4rem 1rem; border-radius: 999px; display: inline-block; }
.ok .badge { background: #e6f4ea; color: #1a7f37; }
.bad .badge { background: #fdecec; color: #b42318; }
h2 { color: var(--navy); margin: 1rem 0 .2rem; }
h3 { color: var(--orange); margin: .2rem 0 .6rem; }
.det { color: #6b7280; font-size: .85rem; margin: .2rem 0; }
.cod { font-size: .7rem; color: #9aa3b5; margin-top: 1rem; word-break: break-all; }
</style>
