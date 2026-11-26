import { nextRouteDiocese, routeDiocese, setRouteDiocese } from '@/utils/ordoDiocese';
import { createRouter, createWebHistory } from 'vue-router';
const ItemsListVue = () => import('@/components/ItemsList.vue');
const BottomNavVue = () => import('@/layouts/default/BottomNav.vue');

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/default/Default.vue'),
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
        path: 'feedback',
        name: 'Feedback',
        component: () => import('@/views/Feedback.vue'),
      },
      {
        path: 'about',
        name: 'About',
        component: () => import('@/views/About.vue'),
      },
      {
        path: 'sources',
        name: 'Sources',
        component: () => import('@/views/Sources.vue'),
      },
      {
        path: 'documents/liturgy-hours-decrees',
        name: 'LiturgyHoursDecrees',
        component: () => import('@/views/LiturgyHoursDecrees.vue'),
      },
      {
        path: 'documents/liturgy-hours-introduction',
        name: 'LiturgyHoursIntroduction',
        component: () => import('@/views/LiturgyHoursIntroduction.vue'),
      },
      {
        path: 'documents/proper-calendar',
        name: 'ProperCalendar',
        component: () => import('@/views/ProperCalendar.vue'),
      },
      {
        path: 'picker',
        name: 'LiturgicalPicker',
        components: { default: () => import('@/views/LiturgicalPicker.vue'), bottomNav: BottomNavVue },
      },
      {
        // One shell for every Compendium level: it owns the persistent search dock
        // and the global search results layer (see docs/compendium.md).
        path: 'compendium',
        component: () => import('@/views/CompendiumShell.vue'),
        children: [
          { path: '', name: 'Compendium', component: () => import('@/views/Compendium.vue') },
          { path: 'part/:partId', name: 'CompendiumPart', component: () => import('@/views/CompendiumNode.vue'), props: true },
          { path: 'node/:nodeId', name: 'CompendiumNode', component: () => import('@/views/CompendiumLegacy.vue'), props: (route) => ({ id: String(route.params.nodeId), kind: 'node' }) },
          { path: 'topic/:topicId', name: 'CompendiumTopic', component: () => import('@/views/CompendiumLegacy.vue'), props: (route) => ({ id: String(route.params.topicId), kind: 'topic' }) },
          { path: 'question/:number', name: 'CompendiumQuestion', component: () => import('@/views/CompendiumQuestion.vue'), props: true },
        ],
      },
      { path: 'songs', name: 'Songs', component: () => import('@/views/Songs.vue'), meta: { requiresAuth: true } },
      { path: 'song/:id', name: 'SongView', component: () => import('@/views/Song.vue'), props: true, meta: { requiresAuth: true } },
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
        path: 'ordo',
        name: 'Ordo',
        components: {
          default: () => import('@/views/Ordo.vue'),
          bottomNav: () => import('@/layouts/default/OrdoBottomNav.vue'),
        },
      },
      {
        path: 'ordo/:date',
        name: 'OrdoByDate',
        components: {
          default: () => import('@/views/Ordo.vue'),
          bottomNav: () => import('@/layouts/default/OrdoBottomNav.vue'),
        },
        props: { default: true },
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
        // Raw Latin/English Mass variants are addressable prayers, but they
        // open inside the single Holy Mass reader with that language selected.
        async beforeEnter(to) {
          const { getMassVariantByPrayerId, MASS_ORDER_PRAYER_ID } = await import('@/utils/massRitual');
          const variant = getMassVariantByPrayerId(to.params.id);
          if (!variant || to.params.id === MASS_ORDER_PRAYER_ID) return true;
          return {
            name: 'PrayerView',
            params: { id: MASS_ORDER_PRAYER_ID },
            query: { ...to.query, lang: variant.language },
            hash: to.hash,
            replace: true,
          };
        },
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
        path: 'feedback', name: 'AdminFeedback',
        component: () => import('@/views/admin/Feedback.vue'),
      },
      {
        path: 'analytics', name: 'AdminAnalytics',
        component: () => import('@/views/admin/Analytics.vue'),
        meta: { requiresSuperAdmin: true },
      },
      {
        path: 'priest-access', name: 'AdminPriestAccess',
        component: () => import('@/views/admin/PriestAccess.vue'),
        meta: { requiresPriestAdmin: true },
      },
      {
        path: 'access-sets', name: 'AdminAccessSets',
        component: () => import('@/views/admin/AccessSets.vue'),
        meta: { requiresAccessSetsV2: true },
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
        path: 'prayers', name: 'AdminPrayers',
        component: () => import('@/components/prayers/PrayersList.vue'),
        props: { editorial: true },
      },
      {
        path: 'prayer-categories',
        name: 'AdminPrayerCategories',
        component: () => import('@/views/admin/PrayerCategories.vue'),
      },
      {
        path: 'prayer-drafts',
        name: 'AdminPrayerDrafts',
        component: () => import('@/views/admin/PrayerDrafts.vue'),
      },
      {
        path: 'prayer-drafts/:id',
        name: 'AdminPrayerDraftEdit',
        component: () => import('@/views/admin/PrayerDraftEditor.vue'),
      },
      {
        path: 'ordo/year-overrides',
        name: 'AdminYearOverrides',
        component: () => import('@/views/admin/YearOverrides.vue'),
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
    if (['Sources', 'LiturgyHoursDecrees', 'LiturgyHoursIntroduction', 'ProperCalendar'].includes(to.name) && to.hash) {
      return { el: to.hash, top: 80 };
    }
    // Switching the Mass language only rewrites `?lang`; the reader restores
    // the semantic section itself instead of jumping to the top.
    if (to.name === 'PrayerView' && from.name === 'PrayerView'
      && to.params.id === from.params.id && to.hash === from.hash) {
      return false;
    }
    // Compendium: opening/closing search only rewrites `?q` on the same page;
    // the shell keeps the page scroll itself.
    if (to.path.startsWith('/compendium') && to.path === from.path && to.hash === from.hash) {
      return false;
    }
    // Не оставляем активную scroll-анимацию после перехода: на мобильных
    // первый жест пользователя иначе может только остановить эту анимацию.
    return { top: 0, left: 0 };
  },
});

router.beforeEach(async (to) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  if (!requiresAuth) return true;

  const [{ useAuthStore }, { adminRouteDecision }] = await Promise.all([
    import('@/stores/auth'), import('@/utils/adminAccess'),
  ]);
  const authStore = useAuthStore();
  await authStore.init();
  const metas = to.matched.reduce((acc, record) => ({ ...acc, ...record.meta }), {});
  return adminRouteDecision(metas, authStore, to.fullPath);
});

// Diocesan context of Hours / Readings opened from the Ordo (`?diocese=`).
router.afterEach((to, from) => {
  setRouteDiocese(nextRouteDiocese(to, from, routeDiocese.value));
});

export default router;
