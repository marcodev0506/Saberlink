<script setup>
import { ref } from 'vue';

const props = defineProps({ node: Object });
const emit = defineEmits(['add', 'edit', 'delete']);
const open = ref(true);
</script>

<template>
  <li class="node">
    <div class="row">
      <button v-if="node.hijos?.length" class="toggle" @click="open = !open">{{ open ? '▾' : '▸' }}</button>
      <span v-else class="toggle spacer" />
      <span class="chip">{{ node.tipo }}</span>
      <span class="nombre">{{ node.nombre }}</span>
      <span class="actions">
        <button title="Agregar sub-unidad" @click="emit('add', node)">+</button>
        <button title="Renombrar / cambiar tipo" @click="emit('edit', node)">✎</button>
        <button title="Eliminar (con sus hijos)" @click="emit('delete', node)">🗑</button>
      </span>
    </div>
    <ul v-show="open">
      <OrgNode v-for="hijo in node.hijos" :key="hijo.id" :node="hijo"
               @add="(n) => emit('add', n)" @edit="(n) => emit('edit', n)" @delete="(n) => emit('delete', n)" />
    </ul>
  </li>
</template>

<style scoped>
.node { list-style: none; }
ul { margin: 0; padding-left: 1.4rem; border-left: 1px dashed #d4d9ea; }
.row { display: flex; align-items: center; gap: .5rem; padding: .35rem .4rem; border-radius: 8px; }
.row:hover { background: #f5f7fc; }
.row:hover .actions { opacity: 1; }
.toggle { border: 0; background: none; cursor: pointer; color: #6b7280; width: 1.2rem; }
.spacer { display: inline-block; }
.chip { background: #eef2ff; color: #1a56db; font-size: .7rem; font-weight: 700; padding: .1rem .55rem; border-radius: 999px; text-transform: uppercase; }
.nombre { font-size: .95rem; color: #14204a; font-weight: 600; }
.actions { margin-left: auto; display: flex; gap: .25rem; opacity: 0; transition: opacity .15s; }
.actions button { border: 0; background: #eef1f7; border-radius: 6px; cursor: pointer; padding: .15rem .45rem; font-size: .85rem; }
.actions button:hover { background: #dfe5f5; }
</style>
