import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import HomeView from './views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginView },
    { path: '/registro', component: RegisterView },
    { path: '/inicio', component: HomeView, meta: { auth: true } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.auth && !localStorage.getItem('token')) return '/login';
});

createApp(App).use(router).mount('#app');
