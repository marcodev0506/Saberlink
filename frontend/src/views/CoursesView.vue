<script setup>
import { ref, onMounted } from 'vue';
import { get, post, put, del } from '../api.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import AppLayout from '../components/AppLayout.vue';
import TagSelect from '../components/TagSelect.vue';

const cursos = ref([]);
const gestoresDeCurso = ref([]);
const error = ref('');
const modal = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const puedeCrear = user.rol === 'rrhh' || user.rol === 'gestor_curso';

const f = ref({ titulo: '', objetivo: '', facilitador_id: '' });
const tags = ref({ competencias: [], habilidades: [] });
const pdfFile = ref(null);
const imgFile = ref(null);
const editando = ref(null);        // id del curso que se edita
const imagenes = ref({});          // curso_id -> objectURL
const guardando = ref(false);

async function cargar() {
  const [c, u] = await Promise.all([
    get('/api/cursos'),
    get('/api/usuarios').catch(() => ({ usuarios: [] })),
  ]);
  cursos.value = c.cursos;
  gestoresDeCurso.value = (u.usuarios || []).filter((x) => x.rol === 'gestor_curso');
  const token = localStorage.getItem('token');
  for (const cur of c.cursos) {
    if (!cur.imagen_path) continue;
    const r = await fetch(`${API}/api/cursos/${cur.id}/imagen`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) imagenes.value[cur.id] = URL.createObjectURL(await r.blob());
  }
}

function onFile(e) { pdfFile.value = e.target.files[0] || null; }
function onImg(e) { imgFile.value = e.target.files[0] || null; }

function fileToB64(file) {
  return new Promise(async (ok) => {
    if (!file) return ok(null);
    const buf = new Uint8Array(await file.arrayBuffer());
    let b64 = '';
    for (let i = 0; i < buf.length; i += 32768)
      b64 += String.fromCharCode(...buf.subarray(i, i + 32768));
    ok(btoa(b64));
  });
}

function editar(c) {
  editando.value = c.id;
  f.value = { titulo: c.titulo, objetivo: c.objetivo, facilitador_id: '' };
  tags.value = { competencias: [...(c.competencias || [])], habilidades: [...(c.habilidades || [])] };
  modal.value = true;
}

async function guardar() {
  guardando.value = true;
  error.value = '';
  try {
    const archivo_base64 = await fileToB64(pdfFile.value);
    const imagen_base64 = await fileToB64(imgFile.value);
    const body = { ...f.value, ...tags.value, archivo_base64, archivo_nombre: pdfFile.value?.name, imagen_base64, imagen_nombre: imgFile.value?.name };
    if (editando.value) {
      await put(`/api/cursos/${editando.value}`, body);
    } else {
      await post('/api/cursos', body);
    }
    modal.value = false;
    editando.value = null;
    f.value = { titulo: '', objetivo: '', facilitador_id: '' };
    tags.value = { competencias: [], habilidades: [] };
    pdfFile.value = null;
    imgFile.value = null;
    await cargar();
  } catch (err) {
    error.value = err.message;
  } finally {
    guardando.value = false;
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
        <p class="sub">El gestor de curso sube el PDF; la IA genera el guion, las evaluaciones y el audio con ElevenLabs.</p>
      </div>
      <div class="actions">
        <a v-if="puedeCrear" class="ghost link" href="/plantilla_unidad.docx" download>📄 Plantilla</a>
        <button v-if="puedeCrear" class="primary" @click="modal = true">+ Curso</button>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="grid">
      <article v-for="c in cursos" :key="c.id" class="card" @click="$router.push(`/cursos/${c.id}`)">
        <div class="cover" :style="imagenes[c.id] ? { backgroundImage: `url(${imagenes[c.id]})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}">
          <span v-if="!imagenes[c.id]">IMAGEN REFERENCIAL DEL CURSO</span>
        </div>
        <div class="body">
          <h3>TÍTULO DEL CURSO: {{ c.titulo }}</h3>
          <p>{{ c.objetivo || 'OBJETIVO GENERAL DEL CURSO' }}</p>
          <div v-if="c.competencias?.length" class="tags">
            <em v-for="t in c.competencias" :key="`c${t}`" class="tag comp">{{ t }}</em>
          </div>
          <div v-if="c.habilidades?.length" class="tags">
            <em v-for="t in c.habilidades" :key="`h${t}`" class="tag hab">{{ t }}</em>
          </div>

          <span class="estado" :class="c.estado">{{ c.estado }}</span>
          <button v-if="puedeCrear" class="del" @click.stop="editar(c)">✎</button>
          <button v-if="puedeCrear" class="del" @click.stop="borrar(c)">🗑</button>
        </div>
      </article>
      <p v-if="!cursos.length" class="empty">Aún no hay cursos. Crea uno con “+ Curso”.</p>
    </div>

    <div v-if="modal === true" class="overlay" @click.self="modal = false">
      <div class="dialog">
        <h2>{{ editando ? 'Editar curso' : 'Nuevo curso' }}</h2>
        <label>Título <input v-model="f.titulo" placeholder="Inducción de seguridad" /></label>
        <label>Objetivo general <textarea v-model="f.objetivo" rows="2" /></label>
        <label>Imagen del curso <input type="file" accept="image/*" @change="onImg" /></label>
        <div class="tagfield" v-for="campo in ['competencias','habilidades']" :key="campo">
          <label>{{ campo === 'competencias' ? 'Competencias' : 'Habilidades' }} <span class="hint">(del banco central)</span></label>
          <TagSelect :tipo="campo === 'competencias' ? 'competencia' : 'habilidad'" v-model="tags[campo]" />
        </div>
        <label v-if="!editando">Contenido (PDF o plantilla DOCX) <input type="file" accept=".pdf,.docx" @change="onFile" /></label>
        <div class="dialog-actions">
          <button class="ghost" @click="modal = false">Cancelar</button>
          <button class="primary" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Guardar') }}</button>
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
h1 { color: var(--navy); margin: 0; }
.sub { color: #6b7280; font-size: .9rem; }
.primary { padding: .6rem 1.1rem; border: 0; border-radius: 9px; background: var(--navy); color: #fff; font-weight: 700; cursor: pointer; }
.ghost { padding: .6rem 1.1rem; border: 1px solid #d4d9ea; border-radius: 9px; background: #fff; cursor: pointer; }
.danger { background: #dc2626; }
.actions { display: flex; gap: .5rem; }
.link { text-decoration: none; color: #4b5563; font-size: .82rem; display: inline-flex; align-items: center; }
.error { color: var(--danger); }
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
.body h3 { margin: 0; font-size: .8rem; color: var(--navy); }
.body p { margin: .25rem 0; font-size: .72rem; color: #4b5563; text-transform: uppercase; }
.fac { font-weight: 700; }
.estado { position: absolute; top: .9rem; right: .9rem; font-size: .65rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; background: var(--cream); color: #4b5563; text-transform: uppercase; }
.estado.listo, .estado.publicado { background: #dde6f0; color: var(--navy); }
.estado.procesando { background: #fdeee3; color: var(--orange); }
.tags { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; }
.tag { font-style: normal; font-size: .62rem; padding: .1rem .45rem; border-radius: 999px; font-weight: 700; }
.comp { background: #fdeee3; color: var(--orange); }
.hab { background: #dde6f0; color: var(--navy); }
.del { margin-top: .4rem; border: 0; background: var(--cream); border-radius: 6px; padding: .15rem .5rem; cursor: pointer; font-size: .8rem; }

.overlay { position: fixed; inset: 0; background: rgba(10,20,50,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: #fff; border-radius: 14px; padding: 1.75rem; width: 360px; display: flex; flex-direction: column; gap: 1rem; }
.dialog h2 { margin: 0; font-size: 1.05rem; color: var(--navy); }
.dialog label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; font-weight: 600; color: #374151; }
.dialog input, .dialog select, .dialog textarea { padding: .55rem; border: 1.5px solid #e2e6f0; border-radius: 8px; font-family: inherit; }
.dialog-actions { display: flex; justify-content: flex-end; gap: .5rem; }
.hint { font-weight: 400; color: #9aa3b5; }
.tagfield label { font-size: .8rem; font-weight: 600; color: #374151; display: block; margin-bottom: .35rem; }
</style>
