<script setup>
import { ref, onMounted } from 'vue';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const health = ref('cargando...');

onMounted(async () => {
  try {
    const res = await fetch(`${apiUrl}/health`);
    health.value = JSON.stringify(await res.json());
  } catch (err) {
    health.value = `error: ${err.message}`;
  }
});
</script>

<template>
  <main>
    <h1>Saberlink</h1>
    <p>API health: {{ health }}</p>
  </main>
</template>
