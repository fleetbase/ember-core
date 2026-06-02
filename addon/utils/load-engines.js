import { dasherize } from '@ember/string';
import hostServices from '../exports/host-services';
import isPluginExtension from './is-plugin-extension';

export default async function loadEngines(appInstance, withServices = []) {
    return new Promise((resolve, reject) => {
        return fetch('extensions.json', { cache: 'default' })
            .then((resp) => resp.json())
            .then((extensions) => {
                const engines = {};
                const externalRoutes = {
                    console: 'console.home',
                    extensions: 'console.extensions',
                };

                for (let i = 0; i < extensions.length; i++) {
                    const extension = extensions[i];
                    if (isPluginExtension(extension)) {
                        continue;
                    }
                    const path = dasherize(extension.extension);

                    externalRoutes[path] = `console.${path}`;
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

                resolve(engines);
            })
            .catch(reject);
    });
}
