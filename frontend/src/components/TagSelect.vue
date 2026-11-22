<script setup>
import { ref, computed, onMounted } from 'vue';
import { get, post } from '../api.js';

const props = defineProps({
  tipo: String,          // 'competencia' | 'habilidad'
  modelValue: Array,     // nombres seleccionados
});
const emit = defineEmits(['update:modelValue']);

const items = ref([]);   // catálogo completo de ese tipo
const nuevo = ref('');

async function cargar() {
  const data = await get('/api/catalogo');
  items.value = data.items.filter((i) => i.tipo === props.tipo);
}

const seleccionados = computed(() => props.modelValue || []);
const pendientes = computed(() => seleccionados.value.filter((n) => !items.value.some((i) => i.nombre === n)));

function toggle(nombre) {
  const sel = [...seleccionados.value];
  sel.includes(nombre) ? sel.splice(sel.indexOf(nombre), 1) : sel.push(nombre);
  emit('update:modelValue', sel);
}

async function agregar() {
  const n = nuevo.value.trim();
  if (!n) return;
  try {
    await post('/api/catalogo', { tipo: props.tipo, nombre: n });
    await cargar();
    if (!seleccionados.value.includes(n)) toggle(n);
    nuevo.value = '';
  } catch {}
}

onMounted(cargar);
defineExpose({ recargar: cargar });
</script>

<template>
  <div class="tagselect">
    <label v-for="i in items" :key="i.id" class="opt">
      <input type="checkbox" :checked="seleccionados.includes(i.nombre)" @change="toggle(i.nombre)" />
      {{ i.nombre }}
    </label>
    <label v-for="n in pendientes" :key="`p${n}`" class="opt pend">
      <input type="checkbox" :checked="true" @change="toggle(n)" /> {{ n }}
    </label>
    <div class="nuevo">
      <input v-model="nuevo" @keydown.enter.prevent="agregar" placeholder="Agregar nueva…" />
      <button type="button" @click="agregar">+</button>
    </div>
  </div>
</template>

<style scoped>
.tagselect { border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .5rem; max-height: 130px; overflow-y: auto; display: flex; flex-direction: column; gap: .3rem; }
.opt { display: flex; align-items: center; gap: .5rem; font-size: .82rem; color: #374151; font-weight: 500; cursor: pointer; }
.opt input { accent-color: var(--navy); }
.opt.pend { color: var(--orange); }
.nuevo { display: flex; gap: .3rem; margin-top: .3rem; }
.nuevo input { flex: 1; border: 1px solid #e2e6f0; border-radius: 6px; padding: .3rem .5rem; font-size: .8rem; font-family: inherit; }
.nuevo button { border: 0; background: var(--navy); color: #fff; border-radius: 6px; width: 26px; cursor: pointer; }
</style>
