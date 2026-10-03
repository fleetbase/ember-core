'use strict';

module.exports = function (environment) {
    const ENV = {
        modulePrefix: 'dummy',
        environment,
        rootURL: '/',
        locationType: 'history',
        EmberENV: {
            EXTEND_PROTOTYPES: false,
            FEATURES: {
                // Here you can enable experimental features on an ember canary build
                // e.g. EMBER_NATIVE_DECORATOR_SUPPORT: true
            },
        },

        APP: {
            // Here you can pass flags/options to your application instance
            // when it is created
        },

        // Mirrors the env var ember-cli-code-coverage instruments on, so the test
        // suite only pays the cost of collecting and shipping coverage when asked.
        coverageEnabled: process.env.COVERAGE === 'true',

        // Configuration a host application is expected to provide. Several addon
        // modules read these at import time (the fetch service touches
        // API.host as soon as it is evaluated), so the dummy app has to supply
        // them for those modules to be loadable at all.
        API: {
            host: 'https://api.fleetbase.test',
            namespace: 'v1',
        },

        socket: {
            hostname: 'socket.fleetbase.test',
            secure: false,
        },

        osrm: {
            host: 'https://routing.fleetbase.test',
            servers: {
                us: 'https://routing-us.fleetbase.test',
                ca: 'https://routing-ca.fleetbase.test',
            },
        },
    };

    if (environment === 'development') {
        // ENV.APP.LOG_RESOLVER = true;
        // ENV.APP.LOG_ACTIVE_GENERATION = true;
        // ENV.APP.LOG_TRANSITIONS = true;
        // ENV.APP.LOG_TRANSITIONS_INTERNAL = true;
        // ENV.APP.LOG_VIEW_LOOKUPS = true;
    }

    if (environment === 'test') {
        // Testem prefers this...
        ENV.locationType = 'none';

        // keep test console output quieter
        ENV.APP.LOG_ACTIVE_GENERATION = false;
        ENV.APP.LOG_VIEW_LOOKUPS = false;

        ENV.APP.rootElement = '#ember-testing';
        ENV.APP.autoboot = false;
    }

    if (environment === 'production') {
        // here you can enable a production-specific feature
    }

    return ENV;
};
