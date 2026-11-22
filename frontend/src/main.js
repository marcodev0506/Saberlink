import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './theme.css';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import HomeView from './views/HomeView.vue';
import UsersView from './views/UsersView.vue';
import OrgView from './views/OrgView.vue';
import CoursesView from './views/CoursesView.vue';
import CourseView from './views/CourseView.vue';
import EvalView from './views/EvalView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginView },
    { path: '/registro', component: RegisterView },
    { path: '/inicio', component: HomeView, meta: { auth: true } },
    { path: '/usuarios', component: UsersView, meta: { auth: true } },
    { path: '/estructura', component: OrgView, meta: { auth: true } },
    { path: '/cursos', component: CoursesView, meta: { auth: true } },
    { path: '/cursos/:id', component: CourseView, meta: { auth: true } },
    { path: '/cursos/:id/evaluacion', component: EvalView, meta: { auth: true } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.auth && !localStorage.getItem('token')) return '/login';
});

createApp(App).use(router).mount('#app');
