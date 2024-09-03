// Composables
import { createRouter, createWebHistory } from 'vue-router'
import DefaultVue from '@/layouts/default/Default.vue'
import OneVue from '@/layouts/simple/One.vue'
import BridgeVue from '@/components/admin/Bridge.vue'
import BridgeListVue from '@/components/admin/BridgeList.vue'
import TableListVue from '@/components/admin/TableList.vue'
import TodayVue from '@/views/Today.vue'
import OrasListVue from '@/components/OrasList.vue'
import VesperVue from '@/components/oras/Vesper.vue'
import LaudesVue from '@/components/oras/Laudes.vue'
import InvitVue from '@/components/oras/Invit.vue'
import SextVue from '@/components/oras/Sext.vue'
import NonVue from '@/components/oras/Non.vue'
import TerzVue from '@/components/oras/Terz.vue'
import CompletoriumVue from '@/components/oras/Completorium.vue'
import LectionisVue from '@/components/oras/Lectionis.vue'
import YearOptionsVue from '@/components/admin/YearOptions.vue'
import BottomNavVue from '@/layouts/default/BottomNav.vue'
import ItemsListVue from '@/components/ItemsList.vue'
import OraBarVue from '@/layouts/default/OraBar.vue'
import DbDayListVue from '@/components/admin/DbDayList.vue'

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
    path: '/day/:day/ora',
    components: {
      default: OneVue,
      topNav: OraBarVue
    },
    children: [
      {
        path: '/day/:day/ora/:id',
        name: 'oras',
        components: {
          default: OrasListVue,
          topNav: OraBarVue
        },
      },
      {
        path: '/day/:day/ora/:id/vesper',
        name: 'vesper',
        components: {
          default:VesperVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/invitatorium',
        name: 'invitatorium',
        components: {
          default:InvitVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/laudes',
        name: 'laudes',
        components: {
          default:LaudesVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/sext',
        name: 'sext',
        components: {
          default:SextVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/non',
        name: 'non',
        components: {
          default:NonVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/terz',
        name: 'terz',
        components: {
          default:TerzVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/completorium',
        name: 'completorium',
        components: {
          default:CompletoriumVue,
          topNav: OraBarVue
        }
      },
      {
        path: '/day/:day/ora/:id/lectionis',
        name: 'lectionis',
        components: {
          default:LectionisVue,
          topNav: OraBarVue
        }
      },
    ]
  },

  {
    path: '/admin',
    components: {
      default: DefaultVue,
    },
    children: [
      {
        path: '/bridge',
        name: 'bridge',
        component: BridgeVue,
      },
      {
        path: '/bridgeList',
        name: 'bridgeList',
        component: BridgeListVue,
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
      },
      {
        path: '/dayList',
        name: 'dayList',
        component: DbDayListVue
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
