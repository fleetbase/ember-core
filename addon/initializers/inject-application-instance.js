import Application from '@ember/application';
import { getOwner } from '@ember/application';

export function initialize(application) {
    // Inject the application instance into the Universe service
    application.inject('service:universe', 'applicationInstance', 'application:main');

    // After the application instance is injected, we can look up the service
    // and set the application instance on the RegistryService.
    // This ensures the RegistryService has access to the root application container
    // for cross-engine registration.
    application.instanceInitializer({
        name: 'set-application-instance-on-registry',
        initialize(appInstance) {
            const universeService = appInstance.lookup('service:universe');
            if (universeService && universeService.registryService) {
                universeService.registryService.setApplicationInstance(appInstance.application);
            }
        }
    });
}

export default {
    initialize
};
