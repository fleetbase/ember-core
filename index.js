'use strict';
const path = require('path');

module.exports = {
    name: require('./package').name,

    isDevelopingAddon: function () {
        return true;
    },

    included: function (app) {
        this._super.included.apply(this, arguments);
        app.options = app.options || {};

        if (app.options['ember-simple-auth'] !== undefined) {
            app.options['ember-simple-auth'].useSessionSetupMethod = true;
        } else {
            app.options['ember-simple-auth'] = {
                useSessionSetupMethod: true,
            };
        }

        const importJs = (module, file, options) => {
            const modulePath = path.dirname(require.resolve(module));
            this.import(`${modulePath}/${file}`, options);
        };

        // import socketcluster for use in all fleetbase engines
        // this will become globally available as socketClusterClient
        importJs('socketcluster-client', 'socketcluster-client.min.js');
        // app.import('node_modules/socketcluster-client/socketcluster-client.min.js');
    },
};
