export function initialize(appInstance) {
    // Set window.Fleetbase to the application instance for global access
    // This is used by services and engines to access the root application instance
    if (typeof window !== 'undefined') {
        window.Fleetbase = appInstance.application;
    }

    // Look up UniverseService and set the application instance
    // This cascades to RegistryService automatically
    const universeService = appInstance.lookup('service:universe');
    if (universeService) {
        universeService.setApplicationInstance(appInstance.application);
    }
}

export default {
    initialize
};
