'use strict';
const path = require('path');
const resolve = require('resolve');

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
        let socketClusterMainPath = resolve.sync('socketcluster-client', { basedir: app.project.root });
        let socketClusterDir = path.dirname(socketClusterMainPath);
        let socketClusterMinPath = path.join(socketClusterDir, 'socketcluster-client.min.js');

        app.import(socketClusterMinPath);
    },
};
