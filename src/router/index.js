// Composables
import { createRouter, createWebHistory } from 'vue-router'
import Today from '@/views/Today.vue'
import BottomNavVue from '@/layouts/default/BottomNav.vue'
import DefaultVue from '@/layouts/default/Default.vue'
import OneVue from '@/layouts/simple/One.vue'
import BridgeVue from '@/components/Bridge.vue'
import TableListVue from '@/components/TableList.vue'
import testVue from '@/views/test.vue'
import TodayVue from '@/views/Today.vue'
import OrasListVue from '@/components/OrasList.vue'
import VesperVue from '@/components/Vesper.vue'

const routes = [
  {
    path: '/',
    components: {
      default: DefaultVue,
      // short for LeftSidebar: LeftSidebar
      BottomNav: BottomNavVue,
    },
    children: [
      {
        path: '/',
        name: 'Today',
        component: TodayVue,
      },]
  },

  {
    path: '/ora',
    components: {
      default: OneVue,
    },
    children: [
      {
        path: '/ora/:id',
        name: 'oras',
        component: OrasListVue,
      },
      {
        path: '/ora/:id/vesper',
        name: 'vesper',
        component: VesperVue,
      },
    ]
  },

  {
    path: '/simple',
    components: {
      default: OneVue,
    },
    children: [
      {
        path: '/bridge',
        name: 'bridge',
        component: BridgeVue,
      },
      {
        path: '/tables',
        name: 'tables',
        component: TableListVue,
      },
    
    ]
  },
  
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
})

export default router
