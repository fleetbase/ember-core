import { dasherize } from '@ember/string';
import hostServices from '../exports/host-services';

function routeNameFromExtension(extension) {
    const mountName = extension.name.split('/')[1];
    const mountPath = mountName.replace('-engine', '');
    let route = mountPath;

    if (extension.fleetbase && extension.fleetbase.route) {
        route = extension.fleetbase.route;
    }

    return dasherize(route);
}

export default function mapEngines(extensions, withServices = []) {
    const engines = {};
    const externalRoutes = {
        console: 'console.home',
        extensions: 'console.extensions',
    };

    for (let i = 0; i < extensions.length; i++) {
        const extension = extensions[i];
        const route = routeNameFromExtension(extension);

        externalRoutes[route] = `console.${route}`;
    }

    for (let i = 0; i < extensions.length; i++) {
        const extension = extensions[i];

        engines[extension.name] = {
            dependencies: {
                services: [...hostServices, ...withServices],
                externalRoutes,
            },
        };
    }

    return engines;
}
