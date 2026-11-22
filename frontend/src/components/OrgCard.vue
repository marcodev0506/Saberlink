<script setup>
defineProps({
  u: Object,
  esRrhh: Boolean,
  colapsados: Set,
});
const emit = defineEmits(['toggle', 'drop', 'perfil', 'editar', 'hijo', 'borrar', 'dragstart']);
</script>

<template>
  <li>
    <article class="post" :draggable="esRrhh" @dragstart="emit('dragstart', u.id, $event)"
             @dragover.prevent @drop.stop="emit('drop', u)">
      <header>
        <button v-if="u.hijos?.length" class="caret" @click="emit('toggle', u.id)">{{ colapsados.has(u.id) ? '▸' : '▾' }}</button>
        <strong>{{ u.cargo || u.nombre }}</strong>
        <span class="tipo">{{ u.tipo }}</span>
        <button v-if="esRrhh" class="plus" title="Descripción, competencias y habilidades" @click="emit('perfil', u)">+</button>
        <button v-if="esRrhh" class="plus add" title="Agregar sub-unidad" @click="emit('hijo', u)">⊕</button>
      </header>
      <p v-if="u.nombre_apellido"><b>Nombre:</b> {{ u.nombre_apellido }}</p>
      <p v-if="u.ci"><b>CI:</b> {{ u.ci }}</p>
      <p v-if="u.correo"><b>Correo:</b> {{ u.correo }}</p>
      <p v-if="u.descripcion" class="desc"><b>Descripción:</b> {{ u.descripcion }}</p>
      <div class="group" v-if="u.competencias?.length">
        <b class="lbl comp-l">Competencias</b>
        <div class="tags"><em v-for="c in u.competencias" :key="`c${c}`" class="tag comp">{{ c }}</em></div>
      </div>
      <div class="group" v-if="u.habilidades?.length">
        <b class="lbl hab-l">Habilidades</b>
        <div class="tags"><em v-for="h in u.habilidades" :key="`h${h}`" class="tag hab">{{ h }}</em></div>
      </div>
      <footer v-if="esRrhh">
        <button @click="emit('editar', u)">✎</button>
        <button @click="emit('borrar', u)">🗑</button>
      </footer>
    </article>
    <ul v-if="u.hijos?.length && !colapsados.has(u.id)" class="children">
      <OrgCard v-for="h in u.hijos" :key="h.id" :u="h" :es-rrhh="esRrhh" :colapsados="colapsados"
               @toggle="emit('toggle', $event)" @drop="emit('drop', $event)" @perfil="emit('perfil', $event)"
               @editar="emit('editar', $event)" @hijo="emit('hijo', $event)" @borrar="emit('borrar', $event)"
               @dragstart="(id, e) => emit('dragstart', id, e)" />
    </ul>
  </li>
</template>

<style scoped>
/* Organigrama: hijos en fila horizontal, conectados por líneas de rama */
.children { list-style: none; padding: 0; margin: 2rem 0 0; display: flex; gap: 1.2rem; position: relative; }
.children::before { /* tallo vertical desde el padre hasta la barra horizontal */
  content: ''; position: absolute; top: -2rem; left: 50%; width: 2px; height: 2rem; background: #c9d2e8;
}
.children > li { position: relative; padding-top: 1.2rem; display: flex; flex-direction: column; align-items: center; }
.children > li::before { /* línea vertical desde la barra horizontal al hijo */
  content: ''; position: absolute; top: 0; left: 50%; width: 2px; height: 1.2rem; background: #c9d2e8;
}
.children > li::after { /* línea horizontal que une hermanos */
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: #c9d2e8;
}
.children > li:first-child::after { left: 50%; }
.children > li:last-child::after { right: 50%; }
.children > li:only-child::after { left: 50%; right: 50%; }
.post {
  background: #fff; border-radius: 14px; padding: 1rem 1.1rem; min-width: 200px; max-width: 280px;
  box-shadow: 0 4px 16px rgba(15,30,80,.1); cursor: grab; display: flex; flex-direction: column; gap: .25rem;
}
.post:active { cursor: grabbing; }
.post header { display: flex; align-items: center; gap: .4rem; }
.caret { border: 0; background: none; color: var(--navy); cursor: pointer; font-size: 1rem; padding: 0; }
.post strong { color: var(--navy); font-size: .95rem; flex: 1; }
.tipo { font-size: .65rem; text-transform: uppercase; color: #9aa3b5; }
.plus { border: 0; background: var(--navy); color: #fff; width: 24px; height: 24px; border-radius: 50%; font-size: .95rem; cursor: pointer; line-height: 1; }
.plus.add { background: var(--orange); }
.post p { margin: 0; font-size: .8rem; color: #4b5563; }
.post p b { color: #374151; }
.post .desc { color: #6b7280; font-size: .78rem; }
.group { margin-top: .35rem; }
.lbl { font-size: .68rem; text-transform: uppercase; letter-spacing: .03em; }
.comp-l { color: var(--orange); }
.hab-l { color: var(--navy); }
.tags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .2rem; }
.tag { font-style: normal; font-size: .68rem; padding: .1rem .5rem; border-radius: 999px; font-weight: 600; }
.comp { background: #fdeee3; color: var(--orange); }
.hab { background: #dde6f0; color: var(--navy); }
.post footer { display: flex; gap: .3rem; margin-top: .5rem; }
.post footer button { border: 0; background: var(--cream); border-radius: 6px; padding: .15rem .5rem; cursor: pointer; font-size: .8rem; }
</style>
