<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { get, post } from '../api.js';

const props = defineProps({
  tipo: String,          // 'competencia' | 'habilidad'
  modelValue: Array,     // nombres seleccionados
});
const emit = defineEmits(['update:modelValue']);

const items = ref([]);
const texto = ref('');
const abierto = ref(false);
const root = ref(null);

async function cargar() {
  const data = await get('/api/catalogo');
  items.value = data.items.filter((i) => i.tipo === props.tipo);
}

const seleccionados = computed(() => props.modelValue || []);
const pendientes = computed(() => seleccionados.value.filter((n) => !items.value.some((i) => i.nombre === n)));
const filtrados = computed(() => {
  const q = texto.value.trim().toLowerCase();
  return items.value.filter((i) => !q || i.nombre.toLowerCase().includes(q));
});

function toggle(nombre) {
  const sel = [...seleccionados.value];
  sel.includes(nombre) ? sel.splice(sel.indexOf(nombre), 1) : sel.push(nombre);
  emit('update:modelValue', sel);
}

async function onEnter() {
  const n = texto.value.trim();
  if (!n) return;
  const existente = items.value.find((i) => i.nombre.toLowerCase() === n.toLowerCase());
  if (existente) {
    if (!seleccionados.value.includes(existente.nombre)) toggle(existente.nombre);
    texto.value = '';
    return;
  }
  try {
    await post('/api/catalogo', { tipo: props.tipo, nombre: n });
    await cargar();
    if (!seleccionados.value.includes(n)) toggle(n);
    texto.value = '';
  } catch { /* ignorar */ }
}

function fuera(e) { if (root.value && !root.value.contains(e.target)) abierto.value = false; }
onMounted(() => { cargar(); document.addEventListener('click', fuera); });
onBeforeUnmount(() => document.removeEventListener('click', fuera));
defineExpose({ recargar: cargar });
</script>

<template>
  <div class="tagselect" ref="root">
    <!-- Chips seleccionados -->
    <div v-if="seleccionados.length" class="chips">
      <span v-for="s in seleccionados" :key="s" :class="['chip', tipo]">
        {{ s }}
        <button type="button" class="chip-x" @click.stop="toggle(s)" title="Quitar">×</button>
      </span>
    </div>

    <!-- Input directo: busca y con Enter agrega nueva -->
    <div class="input-box">
      <input
        v-model="texto"
        class="entrada"
        @focus="abierto = true"
        @keydown.enter.prevent="onEnter"
        placeholder="Buscar o escribir y presionar Enter…"
      />
      <button type="button" class="toggle-btn" @click="abierto = !abierto" :title="abierto ? 'Ocultar lista' : 'Ver lista'">
        {{ abierto ? '▴' : '▾' }}
      </button>
    </div>

    <!-- Lista desplegable en flujo normal (no tapa el botón Guardar) -->
    <div v-if="abierto" class="dropdown">
      <div class="lista">
        <label v-for="i in filtrados" :key="i.id" class="opt">
          <input type="checkbox" :checked="seleccionados.includes(i.nombre)" @change="toggle(i.nombre)" />
          <span>{{ i.nombre }}</span>
        </label>
        <label v-for="n in pendientes" :key="`p${n}`" class="opt pend">
          <input type="checkbox" :checked="true" @change="toggle(n)" />
          <span>{{ n }}</span>
        </label>
        <p v-if="!filtrados.length && !pendientes.length" class="vacio">
          {{ texto.trim() ? `Presiona Enter para agregar "${texto.trim()}"` : 'Escribe un nombre y presiona Enter' }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tagselect { display: flex; flex-direction: column; gap: .45rem; }
.chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.chip {
  display: inline-flex; align-items: center; gap: .3rem;
  font-size: .76rem; font-weight: 700; padding: .2rem .55rem; border-radius: 999px;
  background: #e0f2fe; color: #0369a1;
}
.chip.competencia { background: #fdeee3; color: #c2410c; }
.chip-x {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: .95rem; line-height: 1; padding: 0; font-weight: 800;
}

.input-box {
  display: flex; align-items: center; border: 1.5px solid #d8dee9; border-radius: 10px;
  background: #fff; overflow: hidden;
}
.input-box:focus-within { border-color: var(--navy); }
.entrada {
  flex: 1; border: 0; outline: none; padding: .62rem .8rem; font-size: .88rem;
  font-family: inherit; color: #1f2937; min-width: 0; box-sizing: border-box;
}
.toggle-btn {
  border: 0; background: transparent; color: var(--navy); padding: .5rem .7rem;
  cursor: pointer; font-size: .82rem;
}

.dropdown {
  background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: .55rem .7rem;
}
.lista { max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: .35rem; }
.opt {
  display: flex; align-items: center; gap: .5rem; font-size: .84rem;
  color: #374151; font-weight: 500; cursor: pointer;
}
.opt input { accent-color: var(--navy); margin: 0; }
.opt.pend { color: var(--orange); }
.vacio { font-size: .8rem; color: #64748b; margin: .25rem 0; }
</style>
