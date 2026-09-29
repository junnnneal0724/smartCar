import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

/**
 * 路由即"车内终端的一屏"。
 * 全部懒加载：车机开机只需要渲染当前那一屏，没必要把 18 个页面一起解析。
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/boot' },

  // 生命周期
  { path: '/boot', name: 'boot', component: () => import('@/pages/BootPage.vue'), meta: { bare: true } },
  { path: '/idle', name: 'idle', component: () => import('@/pages/IdlePage.vue'), meta: { aside: 'none' } },
  { path: '/waiting', name: 'waiting', component: () => import('@/pages/WaitingPage.vue') },
  { path: '/welcome', name: 'welcome', component: () => import('@/pages/WelcomePage.vue'), meta: { aside: 'none', bar: 'none' } },
  { path: '/verify', name: 'verify', component: () => import('@/pages/VerifyPage.vue'), meta: { aside: 'none', bar: 'none' } },
  { path: '/ready', name: 'ready', component: () => import('@/pages/ReadyPage.vue'), meta: { bar: 'none' } },

  // 行程中
  { path: '/trip', name: 'trip', component: () => import('@/pages/TripPage.vue') },
  { path: '/trip/explain', name: 'explain', component: () => import('@/pages/ExplainPage.vue') },
  { path: '/cabin', name: 'cabin', component: () => import('@/pages/CabinPage.vue') },
  { path: '/stop', name: 'stop', component: () => import('@/pages/StopPage.vue') },
  { path: '/destination', name: 'destination', component: () => import('@/pages/DestinationPage.vue') },
  { path: '/help', name: 'help', component: () => import('@/pages/HelpPage.vue') },
  { path: '/preferences', name: 'preferences', component: () => import('@/pages/PreferencesPage.vue') },

  // 到达与收尾
  { path: '/arriving', name: 'arriving', component: () => import('@/pages/ArrivingPage.vue') },
  { path: '/alight', name: 'alight', component: () => import('@/pages/AlightPage.vue') },
  { path: '/summary', name: 'summary', component: () => import('@/pages/SummaryPage.vue'), meta: { aside: 'none', bar: 'none' } },
  { path: '/rate', name: 'rate', component: () => import('@/pages/RatePage.vue'), meta: { aside: 'none', bar: 'none' } },
  { path: '/farewell', name: 'farewell', component: () => import('@/pages/FarewellPage.vue'), meta: { aside: 'none', bar: 'none' } },
  { path: '/share', name: 'share', component: () => import('@/pages/SharePage.vue'), meta: { aside: 'none', bar: 'none' } },

  // 演示控制台（工具页，不属于乘客动线）
  { path: '/ops', name: 'ops', component: () => import('@/pages/OpsPage.vue'), meta: { bare: true } },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0, left: 0 }),
});

export default router;
