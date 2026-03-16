export const hostServices = [
    'store',
    'session',
    'current-user',
    'fetch',
    'socket',
    'media',
    'app-cache',
    'url-search-params',
    'modals-manager',
    'resource-context-panel',
    'custom-fields-registry',
    'table-context',
    'loader',
    'filters',
    'crud',
    'notifications',
    'fileQueue',
    'sidebar',
    'dashboard',
    'universe',
    // Universe sub-services must be forwarded to the host application container
    // so that every engine shares the same singleton instance.  Without these
    // entries each engine instantiates its own private copy of the service,
    // which means registrations made by one engine are invisible to another
    // (e.g. @service('universe/menu-service') returns an empty registry while
    // universe.getService('menu') returns the fully-populated host instance).
    'universe/menu-service',
    'universe/registry-service',
    'universe/hook-service',
    'universe/widget-service',
    'universe/extension-manager',
    'events',
    'intl',
    'abilities',
    'language',
    { hostRouter: 'router' },
];

export default hostServices;
