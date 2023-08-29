// Composables
import { createRouter, createWebHistory } from 'vue-router'
import DefaultVue from '@/layouts/default/Default.vue'
import OneVue from '@/layouts/simple/One.vue'
import BridgeVue from '@/components/Bridge.vue'
import TableListVue from '@/components/TableList.vue'
import TodayVue from '@/views/Today.vue'
import OrasListVue from '@/components/OrasList.vue'
import VesperVue from '@/components/oras/Vesper.vue'
import LaudesVue from '@/components/oras/Laudes.vue'
import SextVue from '@/components/oras/Sext.vue'
import NonVue from '@/components/oras/Non.vue'
import TerzVue from '@/components/oras/Terz.vue'
import CompletoriumVue from '@/components/oras/Completorium.vue'
import LectionisVue from '@/components/oras/Lectionis.vue'
import YearOptionsVue from '@/components/YearOptions.vue'
import first from '@/layouts/default/View.vue'
import BottomNavVue from '@/layouts/default/BottomNav.vue'
import ItemsListVue from '@/components/ItemsList.vue'

const routes = [
  {
    path: '/',
    components: {
      default: DefaultVue,
    },
    children: [
      {
        path: '/',
        name: 'Today',
        components:{
          default:ItemsListVue,
          bottomNav: BottomNavVue
        },
      },
      {
        path: '/day/:day',
        name: 'SelectedDay',
        components:{
          default:ItemsListVue,
          bottomNav: BottomNavVue
        },
        props: true 
      },
    ]
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
      {
        path: '/ora/:id/laudes',
        name: 'laudes',
        component: LaudesVue,
      },
      {
        path: '/ora/:id/sext',
        name: 'sext',
        component: SextVue,
      },
      {
        path: '/ora/:id/non',
        name: 'non',
        component: NonVue,
      },
      {
        path: '/ora/:id/terz',
        name: 'terz',
        component: TerzVue,
      },
      {
        path: '/ora/:id/completorium',
        name: 'completorium',
        component: CompletoriumVue,
      },
      {
        path: '/ora/:id/lectionis',
        name: 'lectionis',
        component: LectionisVue,
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
      {
        path: '/yearOptions',
        name: 'yearOptions',
        component: YearOptionsVue
        ,
      }


    ]
  },

]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
})

export default router
