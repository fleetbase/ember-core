'use strict';

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

        // import socketcluster for use in all fleetbase engines
        // this will become globally available as socketClusterClient
        app.import('node_modules/socketcluster-client/socketcluster-client.min.js');
    },
};
