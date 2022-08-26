'use strict';

module.exports = {
  name: require('./package').name,
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
  },
};
