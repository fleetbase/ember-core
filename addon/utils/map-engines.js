import { dasherize } from '@ember/string';
import hostServices from '../exports/host-services';
import isPluginExtension from './is-plugin-extension';

export function getExtensionMountPath(extensionName) {
    let extensionNameSegments = extensionName.split('/');
    let mountName = extensionNameSegments[1];

    if (typeof mountName !== 'string') {
        mountName = extensionNameSegments[0];
    }

    return mountName.replace('-engine', '');
}

export function routeNameFromExtension(extension) {
    const mountPath = getExtensionMountPath(extension.name);
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
        notifications: 'console.notifications',
    };

    extensions = extensions || [];

    for (let i = 0; i < extensions.length; i++) {
        const extension = extensions[i];
        if (isPluginExtension(extension)) {
            continue;
        }
        const route = routeNameFromExtension(extension);

        externalRoutes[route] = `console.${route}`;
    }

    for (let i = 0; i < extensions.length; i++) {
        const extension = extensions[i];
        if (isPluginExtension(extension)) {
            continue;
        }

        engines[extension.name] = {
            dependencies: {
                services: [...hostServices, ...withServices],
                externalRoutes,
            },
        };
    }

    return engines;
}
