<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();
if (localStorage.getItem('token')) router.replace('/inicio');
</script>

<template>
  <div class="landing">
    <nav class="nav">
      <span class="logo">Saber<span class="o">link</span></span>
      <div class="links">
        <a href="#hero">Inicio</a>
        <a href="#beneficios">Beneficios</a>
        <a href="#confia">Nosotros</a>
        <router-link to="/login" class="entrar">Entrar</router-link>
      </div>
    </nav>

    <section id="hero" class="hero">
      <div class="hero-txt">
        <p class="kicker">Plataforma de acreditación corporativa</p>
        <h1>Fortalecer a tu<br />personal ya no<br />será difícil</h1>
        <p class="lede">Cursos con IA, evaluaciones medibles y certificados con QR verificable — todo conectado a la estructura de tu empresa.</p>
        <div class="ctas">
          <router-link to="/login" class="cta">Comenzar →</router-link>
          <router-link to="/registro" class="cta2">Registrar empresa</router-link>
        </div>
      </div>
      <div class="hexs" aria-hidden="true">
        <div class="hex h1 navy"></div>
        <div class="hex h2 orange"></div>
        <div class="hex h3 cream"></div>
        <div class="hex h4 cream"></div>
        <div class="hex h5 orange"></div>
        <div class="hex h6 navy"></div>
        <div class="hex h7 navy"></div>
      </div>
    </section>

    <section id="beneficios" class="beneficios">
      <div class="b"><b>📚</b><h3>Catálogo de cursos</h3><p>Banco de habilidades y competencias centralizado; la IA genera guion, unidades, evaluaciones y audio.</p></div>
      <div class="b"><b>🗂️</b><h3>Estructura organizacional</h3><p>Organigrama con cargos y perfiles — cada cargo define las competencias que el curso debe cubrir.</p></div>
      <div class="b"><b>✅</b><h3>Evaluaciones</h3><p>Pruebas diagnósticas, teóricas y prácticas con resultados por estudiante y por curso.</p></div>
      <div class="b"><b>📜</b><h3>Certificados con QR</h3><p>Al aprobar se emite un PDF con código QR único anclado al trabajador, verificable públicamente.</p></div>
    </section>

    <section id="confia" class="confia">
      <div class="dots">
        <div class="ticker">
          <span v-for="t in ['Impulso','Escalabilidad','Articulación','Agilidad','Acreditación','Evolución','Proyección','Cierre de brechas','Impulso','Escalabilidad','Articulación','Agilidad','Acreditación','Evolución','Proyección','Cierre de brechas']" :key="t"><i></i>{{ t }}</span>
        </div>
      </div>
      <div class="confia-body">
        <h2>CONFÍA EN<br /><span class="o">SABERLINK</span></h2>
        <p>Impulsar el crecimiento real del talento humano conectando de forma simple y medible la estructura organizacional de cada empresa con el desarrollo de competencias, la formación continua y la acreditación profesional de cada colaborador.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing { font-family: Inter, system-ui, sans-serif; background: #fff; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 4rem; background: var(--cream); position: sticky; top: 0; z-index: 10; }
.logo { font-size: 1.4rem; font-weight: 800; color: var(--navy); }
.o { color: var(--orange); }
.links { display: flex; gap: 1.8rem; align-items: center; }
.links a { color: var(--navy); text-decoration: none; font-size: .95rem; font-weight: 600; }
.entrar { background: var(--navy); color: #fff !important; padding: .55rem 1.4rem; border-radius: 8px; }

.hero {
  display: grid; grid-template-columns: 1.1fr .9fr; align-items: center; gap: 2rem;
  padding: 4rem 4rem 5rem; background: linear-gradient(120deg, #fdf7ea, #fff);
}
.kicker { color: var(--orange); font-weight: 700; font-size: .95rem; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 .8rem; }
.hero h1 { color: var(--navy); font-size: clamp(2.4rem, 5vw, 4rem); line-height: 1.08; margin: 0 0 1.2rem; }
.lede { color: #4b5563; font-size: 1.15rem; line-height: 1.6; max-width: 480px; margin: 0 0 2rem; }
.ctas { display: flex; gap: .8rem; }
.cta { background: var(--orange); color: #fff; padding: .85rem 2rem; border-radius: 999px; font-weight: 700; font-size: 1rem; text-decoration: none; }
.cta:hover { filter: brightness(1.06); }
.cta2 { border: 2px solid var(--navy); color: var(--navy); padding: .85rem 1.8rem; border-radius: 999px; font-weight: 700; text-decoration: none; }

.hexs { position: relative; height: 480px; }
.hex { position: absolute; width: 150px; height: 170px; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
.hex.navy { background: var(--navy); }
.hex.orange { background: var(--orange); }
.hex.cream { background: var(--cream); border: 2px solid var(--orange); }
.h1 { top: 0;   right: 170px; }
.h2 { top: 110px; right: 40px; }
.h3 { top: 120px; right: 290px; }
.h4 { top: 230px; right: 160px; }
.h5 { top: 250px; right: 30px; }
.h6 { top: 360px; right: 150px; }
.h7 { top: 370px; right: 300px; width: 110px; height: 125px; }

.beneficios { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.2rem; padding: 3rem 4rem; background: var(--navy); }
.b { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 1.4rem; }
.b b { font-size: 1.8rem; }
.b h3 { color: #fff; font-size: 1rem; margin: .6rem 0 .3rem; }
.b p { color: rgba(255,255,255,.75); font-size: .83rem; line-height: 1.5; margin: 0; }

.confia { padding-bottom: 0; }
.dots { background: var(--cream); padding: 1.1rem 0; overflow: hidden; }
.ticker { display: flex; gap: 2.4rem; white-space: nowrap; width: max-content; font-size: .88rem; color: var(--navy); font-weight: 700; animation: cintillo 28s linear infinite; }
@keyframes cintillo { to { transform: translateX(-50%); } }
.dots i { width: 15px; height: 15px; border-radius: 50%; background: var(--orange); display: inline-block; margin-right: .45rem; vertical-align: middle; }
.confia-body { display: grid; grid-template-columns: 1fr 1.4fr; gap: 3rem; padding: 3.5rem 4rem; align-items: center; }
.confia-body h2 { color: var(--navy); font-size: clamp(2rem, 3.5vw, 3rem); margin: 0; line-height: 1.15; }
.confia-body p { color: #374151; font-size: 1.25rem; line-height: 1.7; margin: 0; }

@media (max-width: 900px) {
  .hero, .confia-body { grid-template-columns: 1fr; }
  .hexs { height: 300px; }
  .beneficios { grid-template-columns: repeat(2, 1fr); padding: 2rem; }
  .nav { padding: 1rem 1.5rem; }
}
</style>
