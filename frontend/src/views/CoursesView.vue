<script setup>
import { ref, onMounted } from 'vue';
import { get, post, del } from '../api.js';
import AppLayout from '../components/AppLayout.vue';

const cursos = ref([]);
const expertos = ref([]);
const error = ref('');
const modal = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const puedeCrear = user.rol === 'rrhh' || user.rol === 'experto';

const f = ref({ titulo: '', objetivo: '', facilitador_id: '' });
const pdfFile = ref(null);
const guardando = ref(false);

async function cargar() {
  const [c, u] = await Promise.all([
    get('/api/cursos'),
    get('/api/usuarios').catch(() => ({ usuarios: [] })),
  ]);
  cursos.value = c.cursos;
  expertos.value = (u.usuarios || []).filter((x) => x.rol === 'experto');
}

function onFile(e) { pdfFile.value = e.target.files[0] || null; }

async function guardar() {
  guardando.value = true;
  error.value = '';
  try {
    let pdf_base64 = null;
    if (pdfFile.value) {
      const buf = new Uint8Array(await pdfFile.value.arrayBuffer());
      pdf_base64 = '';
      for (let i = 0; i < buf.length; i += 32768)
        pdf_base64 += String.fromCharCode(...buf.subarray(i, i + 32768));
      pdf_base64 = btoa(pdf_base64);
    }
    await post('/api/cursos', { ...f.value, pdf_base64 });
    modal.value = false;
    f.value = { titulo: '', objetivo: '', facilitador_id: '' };
    pdfFile.value = null;
    await cargar();
  } catch (err) {
    error.value = err.message;
  } finally {
    guardando.value = false;
  }
}

const probando = ref(false);
const audioUrl = ref('');
async function probarVoz() {
  probando.value = true;
  error.value = '';
  try {
    const r = await fetch('http://localhost:3000/api/voz/test');
    if (!r.ok) throw new Error((await r.json()).error || `Error ${r.status}`);
    const blob = await r.blob();
    audioUrl.value = URL.createObjectURL(blob);
    new Audio(audioUrl.value).play();
  } catch (err) {
    error.value = err.message;
  } finally {
    probando.value = false;
  }
}

async function borrar(c) {
  modal.value = 'confirm-' + c.id;
}
async function confirmar(id) {
  await del(`/api/cursos/${id}`);
  modal.value = false;
  await cargar();
}

onMounted(cargar);
</script>

<template>
  <AppLayout>
    <header class="top">
      <div>
        <h1>Cursos</h1>
        <p class="sub">El experto sube el PDF; la IA genera el guion, las evaluaciones y el audio con ElevenLabs.</p>
      </div>
      <div class="actions">
        <button class="ghost" @click="probarVoz" :disabled="probando">{{ probando ? 'Generando…' : '🔊 Probar voz' }}</button>
        <button v-if="puedeCrear" class="primary" @click="modal = true">+ Curso</button>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="grid">
      <article v-for="c in cursos" :key="c.id" class="card">
        <div class="cover">IMAGEN REFERENCIAL DEL CURSO</div>
        <div class="body">
          <h3>TÍTULO DEL CURSO: {{ c.titulo }}</h3>
          <p>{{ c.objetivo || 'OBJETIVO GENERAL DEL CURSO' }}</p>
          <p class="fac">FACILITADOR: {{ c.facilitador || '—' }}</p>
          <span class="estado" :class="c.estado">{{ c.estado }}</span>
          <button v-if="puedeCrear" class="del" @click="borrar(c)">🗑</button>
        </div>
      </article>
      <p v-if="!cursos.length" class="empty">Aún no hay cursos. Crea uno con “+ Curso”.</p>
    </div>

    <div v-if="modal === true" class="overlay" @click.self="modal = false">
      <div class="dialog">
        <h2>Nuevo curso</h2>
        <label>Título <input v-model="f.titulo" placeholder="Inducción de seguridad" /></label>
        <label>Objetivo general <textarea v-model="f.objetivo" rows="2" /></label>
        <label>Facilitador (experto)
          <select v-model="f.facilitador_id">
            <option value="">—</option>
            <option v-for="e in expertos" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          </select>
        </label>
        <label>PDF del contenido <input type="file" accept="application/pdf" @change="onFile" /></label>
        <div class="dialog-actions">
          <button class="ghost" @click="modal = false">Cancelar</button>
          <button class="primary" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </div>
    </div>

    <div v-if="typeof modal === 'string'" class="overlay" @click.self="modal = false">
      <div class="dialog">
        <h2>Eliminar curso</h2>
        <p class="confirmtxt">Se eliminará el curso y sus materiales. Esta acción no se puede deshacer.</p>
        <div class="dialog-actions">
          <button class="ghost" @click="modal = false">Cancelar</button>
          <button class="primary danger" @click="confirmar(modal.slice(8))">Eliminar</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: flex-start; }
h1 { color: #14204a; margin: 0; }
.sub { color: #6b7280; font-size: .9rem; }
.primary { padding: .6rem 1.1rem; border: 0; border-radius: 9px; background: #1a56db; color: #fff; font-weight: 700; cursor: pointer; }
.ghost { padding: .6rem 1.1rem; border: 1px solid #d4d9ea; border-radius: 9px; background: #fff; cursor: pointer; }
.danger { background: #dc2626; }
.actions { display: flex; gap: .5rem; }
.error { color: #b42318; }
.empty { color: #9aa3b5; padding: 3rem 0; text-align: center; }
.confirmtxt { color: #6b7280; font-size: .85rem; margin: 0; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 1.1rem; margin-top: 1.5rem; }
.card { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(15,30,80,.1); }
.cover {
  height: 110px; display: flex; align-items: center; justify-content: center;
  font-size: .65rem; font-weight: 700; letter-spacing: .05em; color: #4b5563;
  background:
    radial-gradient(ellipse at 70% 120%, #a3c14a 0 30%, transparent 30%),
    radial-gradient(ellipse at 30% 120%, #7fb33a 0 40%, transparent 40%),
    radial-gradient(ellipse at 50% 140%, #c8e08a 0 45%, transparent 45%),
    linear-gradient(#bfe0f5, #e8f4fc);
}
.body { padding: .9rem; position: relative; }
.body h3 { margin: 0; font-size: .8rem; color: #14204a; }
.body p { margin: .25rem 0; font-size: .72rem; color: #4b5563; text-transform: uppercase; }
.fac { font-weight: 700; }
.estado { position: absolute; top: .9rem; right: .9rem; font-size: .65rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; background: #eef1f7; color: #4b5563; text-transform: uppercase; }
.estado.listo, .estado.publicado { background: #e8f7ee; color: #166534; }
.estado.procesando { background: #fdf3e3; color: #b45309; }
.del { margin-top: .4rem; border: 0; background: #eef1f7; border-radius: 6px; padding: .15rem .5rem; cursor: pointer; font-size: .8rem; }

.overlay { position: fixed; inset: 0; background: rgba(10,20,50,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: #fff; border-radius: 14px; padding: 1.75rem; width: 360px; display: flex; flex-direction: column; gap: 1rem; }
.dialog h2 { margin: 0; font-size: 1.05rem; color: #14204a; }
.dialog label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
.dialog input, .dialog select, .dialog textarea { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; font-family: inherit; }
.dialog-actions { display: flex; justify-content: flex-end; gap: .5rem; }
</style>
