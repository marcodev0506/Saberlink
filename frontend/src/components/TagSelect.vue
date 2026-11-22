<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { get, post } from '../api.js';

const props = defineProps({
  tipo: String,          // 'competencia' | 'habilidad'
  modelValue: Array,     // nombres seleccionados
});
const emit = defineEmits(['update:modelValue']);

const items = ref([]);
const nuevo = ref('');
const busqueda = ref('');
const abierto = ref(false);
const root = ref(null);

async function cargar() {
  const data = await get('/api/catalogo');
  items.value = data.items.filter((i) => i.tipo === props.tipo);
}

const seleccionados = computed(() => props.modelValue || []);
const pendientes = computed(() => seleccionados.value.filter((n) => !items.value.some((i) => i.nombre === n)));
const filtrados = computed(() => {
  const q = busqueda.value.toLowerCase();
  return items.value.filter((i) => !q || i.nombre.toLowerCase().includes(q));
});

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

function fuera(e) { if (root.value && !root.value.contains(e.target)) abierto.value = false; }
onMounted(() => { cargar(); document.addEventListener('click', fuera); });
onBeforeUnmount(() => document.removeEventListener('click', fuera));
defineExpose({ recargar: cargar });
</script>

<template>
  <div class="tagselect" ref="root">
    <button type="button" class="trigger" @click="abierto = !abierto">
      <span v-if="seleccionados.length" class="sel">{{ seleccionados.join(', ') }}</span>
      <span v-else class="placeholder">Seleccionar…</span>
      <span class="flecha">{{ abierto ? '▴' : '▾' }}</span>
    </button>
    <div v-if="abierto" class="dropdown">
      <input v-model="busqueda" class="buscar" placeholder="Buscar…" />
      <div class="lista">
        <label v-for="i in filtrados" :key="i.id" class="opt">
          <input type="checkbox" :checked="seleccionados.includes(i.nombre)" @change="toggle(i.nombre)" />
          {{ i.nombre }}
        </label>
        <label v-for="n in pendientes" :key="`p${n}`" class="opt pend">
          <input type="checkbox" :checked="true" @change="toggle(n)" /> {{ n }}
        </label>
        <p v-if="!filtrados.length && !pendientes.length" class="vacio">Sin resultados</p>
      </div>
      <div class="nuevo">
        <input v-model="nuevo" @keydown.enter.prevent="agregar" placeholder="Agregar nueva…" />
        <button type="button" @click="agregar">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tagselect { position: relative; }
.trigger { width: 100%; text-align: left; border: 1.5px solid #e2e6f0; border-radius: 8px; padding: .55rem .7rem; background: #fff; display: flex; align-items: center; gap: .5rem; cursor: pointer; font-family: inherit; }
.sel { flex: 1; font-size: .82rem; color: #374151; }
.placeholder { flex: 1; font-size: .82rem; color: #9aa3b5; }
.flecha { color: var(--navy); font-size: .8rem; }
.dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1.5px solid #e2e6f0; border-radius: 10px; box-shadow: 0 8px 24px rgba(15,30,80,.15); z-index: 60; padding: .5rem; }
.buscar { width: 100%; border: 1px solid #e2e6f0; border-radius: 6px; padding: .35rem .5rem; font-size: .82rem; font-family: inherit; margin-bottom: .35rem; }
.lista { max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: .3rem; }
.opt { display: flex; align-items: center; gap: .5rem; font-size: .82rem; color: #374151; font-weight: 500; cursor: pointer; }
.opt input { accent-color: var(--navy); }
.opt.pend { color: var(--orange); }
.vacio { font-size: .78rem; color: #9aa3b5; margin: .3rem 0; }
.nuevo { display: flex; gap: .3rem; margin-top: .4rem; }
.nuevo input { flex: 1; border: 1px solid #e2e6f0; border-radius: 6px; padding: .3rem .5rem; font-size: .8rem; font-family: inherit; }
.nuevo button { border: 0; background: var(--navy); color: #fff; border-radius: 6px; width: 26px; cursor: pointer; }
</style>
