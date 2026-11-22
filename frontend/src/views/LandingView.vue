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
        <a href="#confia">Nosotros</a>
        <router-link to="/login" class="entrar">Entrar</router-link>
      </div>
    </nav>

    <section id="hero" class="hero">
      <div class="hero-txt">
        <h1><span class="navy">Saber</span><span class="o">link</span></h1>
        <h2>Fortalecer a tu personal<br />ya no será difícil</h2>
        <router-link to="/login" class="cta">Comenzar →</router-link>
      </div>
      <div class="hexs">
        <div class="hex navy"></div>
        <div class="hex orange"></div>
        <div class="hex cream"></div>
        <div class="hex cream"></div>
        <div class="hex orange"></div>
        <div class="hex navy"></div>
      </div>
    </section>

    <section id="confia" class="confia">
      <div class="dots">
        <span v-for="t in ['Impulso','Escalabilidad','Articulación','Agilidad','Acreditación','Evolución','Proyección','Cierre de brechas']" :key="t">
          <i></i>{{ t }}
        </span>
      </div>
      <div class="confia-body">
        <h2>CONFÍA EN<br />SABERLINK</h2>
        <p>Impulsar el crecimiento real del talento humano conectando de forma simple y medible la estructura organizacional de cada empresa con el desarrollo de competencias, la formación continua y la acreditación profesional de cada colaborador.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing { font-family: Inter, system-ui, sans-serif; background: #fff; min-height: 100vh; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 3rem; background: var(--cream); }
.logo { font-size: 1.3rem; font-weight: 800; color: var(--navy); }
.o { color: var(--orange); }
.links { display: flex; gap: 1.6rem; align-items: center; }
.links a { color: var(--navy); text-decoration: none; font-size: .9rem; font-weight: 600; }
.entrar { background: var(--navy); color: #fff !important; padding: .5rem 1.3rem; border-radius: 8px; }

.hero { display: grid; grid-template-columns: 1fr 1fr; align-items: center; padding: 3.5rem 3rem 4.5rem; background: #fff; gap: 2rem; }
.hero h1 { font-size: 2.6rem; margin: 0; }
.navy { color: var(--navy); }
.hero h2 { color: var(--navy); font-size: 2rem; margin: .8rem 0 1.5rem; line-height: 1.25; }
.cta { display: inline-block; background: var(--orange); color: #fff; padding: .7rem 1.6rem; border-radius: 999px; font-weight: 700; text-decoration: none; }
.cta:hover { filter: brightness(1.05); }

.hexs { display: flex; flex-direction: column; align-items: center; }
.hex { width: 150px; height: 170px; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); margin: -30px; }
.hex.navy { background: var(--navy); }
.hex.orange { background: var(--orange); }
.hex.cream { background: var(--cream); }
.hexs .hex:nth-child(1) { margin-left: 140px; }
.hexs .hex:nth-child(2) { margin-right: 100px; }
.hexs .hex:nth-child(3) { margin-left: 120px; }
.hexs .hex:nth-child(4) { margin-right: 80px; }
.hexs .hex:nth-child(5) { margin-left: 140px; }
.hexs .hex:nth-child(6) { margin-right: 60px; }

.confia { background: #fff; padding-bottom: 4rem; }
.dots { display: flex; flex-wrap: wrap; gap: 1.4rem; justify-content: center; background: var(--cream); padding: 1rem 2rem; font-size: .82rem; color: var(--navy); font-weight: 600; }
.dots i { width: 16px; height: 16px; border-radius: 50%; background: var(--orange); display: inline-block; margin-right: .4rem; vertical-align: middle; }
.confia-body { display: grid; grid-template-columns: 1fr 1.4fr; gap: 2rem; padding: 3rem 3rem 0; align-items: start; }
.confia-body h2 { color: var(--navy); font-size: 2.2rem; margin: 0; line-height: 1.2; }
.confia-body p { color: #374151; font-size: 1.05rem; line-height: 1.65; margin: 0; }

@media (max-width: 800px) {
  .hero, .confia-body { grid-template-columns: 1fr; }
  .hexs { display: none; }
}
</style>
