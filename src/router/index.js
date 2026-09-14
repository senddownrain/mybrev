import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

import DefaultVue from '@/layouts/default/Default.vue';
import ItemsListVue from '@/components/ItemsList.vue';
import BottomNavVue from '@/layouts/default/BottomNav.vue';

const routes = [
  {
    path: '/',
    component: DefaultVue,
    children: [
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
        path: 'about',
        name: 'About',
        component: () => import('@/views/About.vue'),
      },
      {
        path: 'picker',
        name: 'LiturgicalPicker',
        components: { default: () => import('@/views/LiturgicalPicker.vue'), bottomNav: BottomNavVue },
      },
      { path: 'songs', name: 'Songs', component: () => import('@/views/Songs.vue') },
      { path: 'song/:id', name: 'SongView', component: () => import('@/views/Song.vue'), props: true },
      {
        path: 'prayers',
        name: 'Prayers',
        component: () => import('@/views/Prayers.vue'),
      },
      {
        path: 'prayers/favorites',
        name: 'FavoritePrayers',
        component: () => import('@/views/FavoritePrayers.vue'),
      },
      {
        path: 'prayers/list',
        name: 'PrayersList',
        component: () => import('@/components/prayers/PrayersList.vue'),
      },
      {
        path: 'readings',
        name: 'Readings',
        components: { 
          default: () => import('@/components/readings/ReadingsView.vue'),
          bottomNav: () => import('@/layouts/default/ReadingsBottomNav.vue')
        },
      },
      {
        path: 'readings/:date',
        name: 'ReadingsByDate',
        components: { 
          default: () => import('@/components/readings/ReadingsView.vue'),
          bottomNav: () => import('@/layouts/default/ReadingsBottomNav.vue')
        },
        props: { default: true },
      },
      {
        path: 'readings/picker',
        name: 'ReadingsPicker',
        redirect: { name: 'LiturgicalPicker', query: { mode: 'readings' } },
      },
      {
        path: 'bible/:language?/:bookId?/:chapter?',
        name: 'Bible',
        component: () => import('@/views/Bible.vue'),
      },
      {
        path: 'prayer/:id',
        alias: 'p/:id',
        name: 'PrayerView',
        components: { 
          default: () => import('@/components/prayers/PrayerView.vue')
        },
        props: { default: true },
      },
      {
        path: 'prayer/add',
        name: 'PrayerAdd',
        component: () => import('@/components/prayers/PrayerForm.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'prayer/edit/:id',
        name: 'PrayerEdit',
        component: () => import('@/components/prayers/PrayerForm.vue'),
        props: true,
        meta: { requiresAuth: true },
      },
      {
        path: 'login',
        name: 'Login',
        component: () => import('@/views/Login.vue'),
        meta: { hideLayoutAppBar: true },
      },

    ],
  },

  {
    path: '/admin',
    component: () => import('@/layouts/admin/Admin.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Admin',
        component: () => import('@/views/Admin.vue'),
      },
      {
        path: 'day-editor/:id',
        name: 'AdminDayEditor',
        component: () => import('@/views/admin/DayEditor.vue'),
        props: true,
        meta: { hideLayoutAppBar: true },
      },
      {
        path: 'reading-editor/:id',
        name: 'AdminParsedReadingEditor',
        component: () => import('@/views/admin/ParsedReadingEditor.vue'),
        props: true,
        meta: { hideLayoutAppBar: true },
      },
      {
        path: 'prayer-categories',
        name: 'AdminPrayerCategories',
        component: () => import('@/views/admin/PrayerCategories.vue'),
      },
      { path: 'songs/new', name: 'AdminSongAdd', component: () => import('@/views/admin/SongEditor.vue') },
      { path: 'songs/:id/edit', name: 'AdminSongEdit', component: () => import('@/views/admin/SongEditor.vue'), props: true },
    ]
  },

  {
    path: '/day/:day/ora/:id',
    component: () => import('@/layouts/simple/One.vue'),
    props: true,
    children: [
      {
        path: '',
        name: 'oras',
        components: {
          default: () => import('@/components/OrasList.vue'),
          topNav: () => import('@/layouts/default/OraBar.vue'),
        },
      },
      { path: 'vesper', name: 'vesper', components: { default: () => import('@/components/oras/Vesper.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'invitatorium', name: 'invitatorium', components: { default: () => import('@/components/oras/Invit.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'morning', name: 'morning', components: { default: () => import('@/components/oras/Morning.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'laudes', name: 'laudes', components: { default: () => import('@/components/oras/Laudes.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'sext', name: 'sext', components: { default: () => import('@/components/oras/Sext.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'non', name: 'non', components: { default: () => import('@/components/oras/Non.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'terz', name: 'terz', components: { default: () => import('@/components/oras/Terz.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'completorium', name: 'completorium', components: { default: () => import('@/components/oras/Completorium.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
      { path: 'lectionis', name: 'lectionis', components: { default: () => import('@/components/oras/Lectionis.vue'), topNav: () => import('@/layouts/default/OraBar.vue') } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    // Не оставляем активную scroll-анимацию после перехода: на мобильных
    // первый жест пользователя иначе может только остановить эту анимацию.
    return { top: 0, left: 0 };
  },
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);

  if (requiresAuth) {
    await authStore.init();

    if (!authStore.isAdmin) {
      next({ name: 'Login', query: { redirect: to.fullPath } });
    } else {
      next();
    }
  } else {
    next();
  }
});

export default router;
