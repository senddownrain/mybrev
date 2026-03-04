import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

import DefaultVue from '@/layouts/default/Default.vue';
import OneVue from '@/layouts/simple/One.vue';
import AdminVue from '@/layouts/admin/Admin.vue';
import ItemsListVue from '@/components/ItemsList.vue';
import BottomNavVue from '@/layouts/default/BottomNav.vue';
import ReadingsBottomNavVue from '@/layouts/default/ReadingsBottomNav.vue';
import OraBarVue from '@/layouts/default/OraBar.vue';

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
        path: 'picker',
        name: 'LiturgicalPicker',
        components: { default: () => import('@/views/LiturgicalPicker.vue'), bottomNav: BottomNavVue },
      },
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
          bottomNav: ReadingsBottomNavVue
        },
      },
      {
        path: 'readings/:date',
        name: 'ReadingsByDate',
        components: { 
          default: () => import('@/components/readings/ReadingsView.vue'),
          bottomNav: ReadingsBottomNavVue
        },
        props: { default: true },
      },
      {
        path: 'readings/picker',
        name: 'ReadingsPicker',
        components: { 
          default: () => import('@/views/ReadingsPicker.vue'),
          bottomNav: ReadingsBottomNavVue
        },
      },
      {
        path: 'prayer/:id',
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
      },

    ],
  },

  {
    path: '/admin',
    component: AdminVue,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'backup',
        name: 'AdminBackup',
        component: () => import('@/views/admin/Backup.vue'),
      },
      {
        path: '',
        name: 'Admin',
        component: () => import('@/views/Admin.vue'),
      },
      {
        path: 'logic-tester',
        name: 'AdminLogicTester',
        component: () => import('@/components/admin/LogicTester.vue'),
      },
      {
        path: 'day-editor/:id',
        name: 'AdminDayEditor',
        component: () => import('@/views/admin/DayEditor.vue'),
        props: true,
      },
      {
        path: 'year-options',
        name: 'AdminYearOptions',
        component: () => import('@/components/admin/YearOptions.vue'),
      },
      {
        path: 'db-day-list',
        name: 'AdminDbDayList',
        component: () => import('@/components/admin/DbDayList.vue')
      },
      {
        path: 'categories',
        name: 'AdminCategories',
        component: () => import('@/views/admin/CategoriesManagement.vue'),
      },
      {
        path: 'readings-test',
        name: 'ReadingsTest',
        component: () => import('@/views/admin/ReadingsTest.vue'),
      },
      {
        path: 'missing-data',
        name: 'AdminMissingData',
        component: () => import('@/views/admin/MissingDataAudit.vue'),
      },
      {
        path: 'normalize-hymns',
        name: 'AdminNormalizeHymns',
        component: () => import('@/views/admin/HymnsNormalization.vue'),
      },
      {
        path: 'normalize-completorium',
        name: 'AdminNormalizeCompletorium',
        component: () => import('@/views/admin/CompletoriumNormalization.vue'),
      },
      {
        path: 'normalize-psalms',
        name: 'AdminNormalizePsalms',
        component: () => import('@/views/admin/PsalmTemplatesNormalization.vue'),
      },

      {
        path: 'completorium-templates',
        name: 'AdminCompletoriumTemplates',
        component: () => import('@/views/admin/CompletoriumTemplatesList.vue'),
      },
      {
        path: 'completorium-templates/create',
        name: 'AdminCompletoriumTemplateCreate',
        component: () => import('@/views/admin/CompletoriumTemplateForm.vue'),
      },
      {
        path: 'completorium-templates/:id/edit',
        name: 'AdminCompletoriumTemplateEdit',
        component: () => import('@/views/admin/CompletoriumTemplateForm.vue'),
      },
      {
        path: 'day-templates',
        name: 'AdminDayTemplatesList',
        component: () => import('@/views/admin/DayTemplatesList.vue'),
      },
      {
        path: 'day-templates/:id',
        name: 'AdminDayTemplateEditor',
        component: () => import('@/views/admin/DayTemplateEditor.vue'),
        props: true,
      },
    ]
  },

  {
    path: '/day/:day/ora/:id',
    component: OneVue,
    props: true,
    children: [
      {
        path: '',
        name: 'oras',
        components: {
          default: () => import('@/components/OrasList.vue'),
          topNav: OraBarVue,
        },
      },

      // новый маршрут для чтений
    {
      path: 'reading/:readingId',
      name: 'reading',
      components: {
        default: () => import('@/components/readings/Reading.vue'),
        topNav: OraBarVue,
      },
      props: {
        default: true,
        topNav: false,
      },
    },
     {
      path: 'reading/:readingId/edit',
      name: 'ReadingEditor',
      components: {
        default: () => import('@/components/readings/ReadingForm.vue'),
        topNav: OraBarVue,
      },
      props: {
        default: true,
        topNav: false,
      },
    },
    
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
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0, behavior: 'smooth' };
  },
});

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
