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
      <div class="info">
        <span class="nombre">{{ node.nombre }}</span>
        <span v-if="node.descripcion" class="desc">{{ node.descripcion }}</span>
        <span class="tags">
          <em v-for="c in node.competencias || []" :key="`c-${c}`" class="tag comp">{{ c }}</em>
          <em v-for="h in node.habilidades || []" :key="`h-${h}`" class="tag hab">{{ h }}</em>
        </span>
      </div>
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
.chip { background: #eef2ff; color: var(--navy); font-size: .7rem; font-weight: 700; padding: .1rem .55rem; border-radius: 999px; text-transform: uppercase; }
.info { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
.nombre { font-size: .95rem; color: var(--navy); font-weight: 600; }
.desc { font-size: .78rem; color: #6b7280; }
.tags { display: inline-flex; gap: .3rem; flex-wrap: wrap; }
.tag { font-style: normal; font-size: .7rem; padding: .1rem .5rem; border-radius: 999px; font-weight: 600; }
.comp { background: #fdeee3; color: var(--orange); }
.hab { background: #dde6f0; color: var(--navy); }
.actions { margin-left: auto; display: flex; gap: .25rem; opacity: 0; transition: opacity .15s; }
.actions button { border: 0; background: var(--cream); border-radius: 6px; cursor: pointer; padding: .15rem .45rem; font-size: .85rem; }
.actions button:hover { background: #dfe5f5; }
</style>
