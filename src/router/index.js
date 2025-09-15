import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

// Layouts
import DefaultVue from '@/layouts/default/Default.vue';
import OneVue from '@/layouts/simple/One.vue';

// Components
import ItemsListVue from '@/components/ItemsList.vue';
import BottomNavVue from '@/layouts/default/BottomNav.vue';
import OraBarVue from '@/layouts/default/OraBar.vue';

const routes = [
  // --- ГЛАВНЫЙ LAYOUT ПРИЛОЖЕНИЯ ---
  {
    path: '/',
    component: DefaultVue,
    children: [
      // --- Публичные маршруты ---
      {
        path: '',
        name: 'Today',
        components: { default: ItemsListVue, bottomNav: BottomNavVue },
      },
      {
        path: 'day/:day',
        name: 'SelectedDay',
        components: { default: ItemsListVue, bottomNav: BottomNavVue },
        props: true,
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
      },
      {
        path: 'login',
        name: 'Login',
        component: () => import('@/views/Login.vue'),
      },

      // --- МАРШРУТЫ АДМИН-ПАНЕЛИ (ВСЕ В ОДНОМ МЕСТЕ) ---
      {
        path: 'admin',
        meta: { requiresAuth: true }, // Защищаем все дочерние маршруты
        children: [
          {
            path: '', // <-- /admin (пустой path относительно родителя)
            name: 'Admin',
            component: () => import('@/views/Admin.vue'),
          },
          {
        path: 'logic-tester', // <-- /admin/logic-tester
        name: 'AdminLogicTester',
        component: () => import('@/components/admin/LogicTester.vue'),
      },
          {
            path: 'table-days', // <-- /admin/table-days
            name: 'AdminTableDays',
            component: () => import('@/components/admin/TableList.vue'),
          },
          {
            path: 'edit-day/:id', // ✅ НАША НОВАЯ СТРАНИЦА РЕДАКТИРОВАНИЯ
            name: 'AdminEditDay',
            component: () => import('@/views/DayEdit.vue'),
            props: true, // Передаем :id как prop в компонент
          },
          {
            path: 'year-options', // ✅ ВАЖНАЯ СТРАНИЦА
            name: 'AdminYearOptions',
            component: () => import('@/components/admin/YearOptions.vue'),
          },
          // --- Временные, но рабочие маршруты ---
          { path: 'bridge', name: 'AdminBridge', component: () => import('@/components/admin/Bridge.vue') },
          { path: 'bridge-list', name: 'AdminBridgeList', component: () => import('@/components/admin/BridgeList.vue') },
          { path: 'db-day-list', name: 'AdminDbDayList', component: () => import('@/components/admin/DbDayList.vue') },
        ]
      },
    ],
  },

  
  // --- Маршруты для отображения часов молитв ---
  {
    // Этот родительский маршрут задает layout и общие параметры
    path: '/day/:day/ora/:id',
    component: OneVue,
    props: true, // Позволяет передавать day и id как props во все дочерние компоненты
    children: [
      {
        // Список часов (OrasListVue)
        path: '', // <-- Пустой path означает, что он сработает для /day/:day/ora/:id
        name: 'oras',
        components: {
          default: () => import('@/components/OrasList.vue'),
          topNav: OraBarVue,
        },
      },
      // Все конкретные часы теперь дочерние к нему
      { path: 'vesper', name: 'vesper', components: { default: () => import('@/components/oras/Vesper.vue'), topNav: OraBarVue } },
      { path: 'invitatorium', name: 'invitatorium', components: { default: () => import('@/components/oras/Invit.vue'), topNav: OraBarVue } },
      { path: 'laudes', name: 'laudes', components: { default: () => import('@/components/oras/Laudes.vue'), topNav: OraBarVue } },
      { path: 'sext', name: 'sext', components: { default: () => import('@/components/oras/Sext.vue'), topNav: OraBarVue } },
      { path: 'non', name: 'non', components: { default: () => import('@/components/oras/Non.vue'), topNav: OraBarVue } },
      { path: 'terz', name: 'terz', components: { default: () => import('@/components/oras/Terz.vue'), topNav: OraBarVue } },
      { path: 'completorium', name: 'completorium', components: { default: () => import('@/components/oras/Completorium.vue'), topNav: OraBarVue } },
      { path: 'lectionis', name: 'lectionis', components: { default: () => import('@/components/oras/Lectionis.vue'), topNav: OraBarVue } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

// Навигационный гард остается без изменений
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  if (requiresAuth && !authStore.isAdmin) {
    next({ name: 'Login' });
  } else {
    next();
  }
});

export default router;