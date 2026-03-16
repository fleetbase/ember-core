export const externalRoutes = ['console', 'extensions'];
export const services = [
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
    'hostRouter',
    'fileQueue',
    'sidebar',
    'dashboard',
    'universe',
    // Universe sub-services must be listed here so that engine dependency
    // declarations (engine.js dependencies.services) include them.  This
    // ensures Ember forwards @service('universe/menu-service') etc. to the
    // host application container rather than creating a per-engine instance.
    'universe/menu-service',
    'universe/registry-service',
    'universe/hook-service',
    'universe/widget-service',
    'universe/extension-manager',
    'events',
    'intl',
    'abilities',
    'language',
];

export default services;
