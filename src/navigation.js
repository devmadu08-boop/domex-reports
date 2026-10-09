export const TAB_PATHS = {
  riderPerformance: '/rider-delivery-performance/',
  dashboard: '/dashboard/', courier: '/courier/', operation: '/operations/', exports: '/reports/',
  allReports: '/all-reports/', deliveredConverter: '/delivered-report/', reschedule: '/reschedule-report/',
  receipt: '/receipt/', pettyCash: '/petty-cash/', audit: '/audit/', autoDispatch: '/dispatch/',
  meterChats: '/meter-chats/', settings: '/settings/', users: '/users/', whatsappQueue: '/whatsapp-queue/',
};
export function getTabFromPath(pathname) {
  const path = '/' + String(pathname || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '') + '/';
  return Object.entries(TAB_PATHS).find(([, route]) => route === path)?.[0] || 'dashboard';
}
export function getTabPath(tab) { return TAB_PATHS[tab] || TAB_PATHS.dashboard; }
