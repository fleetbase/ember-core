'use strict';
const Funnel = require('broccoli-funnel');
const MergeTrees = require('broccoli-merge-trees');
const path = require('path');

/**
 * Istanbul instrumentation for this addon's own `addon/` tree, so coverage
 * reflects the addon source rather than only the dummy app.
 *
 * ember-cli-code-coverage is a devDependency and is only ever needed while
 * running this repository's own test suite, so it is resolved lazily behind the
 * same env var it keys off. Consumers of the published addon never load it.
 */
function coverageBabelPlugins() {
    if (process.env.COVERAGE !== 'true') {
        return [];
    }

    // eslint-disable-next-line n/no-unpublished-require -- dev-only, guarded above
    return require('ember-cli-code-coverage').buildBabelPlugin();
}

module.exports = {
    name: require('./package').name,

    options: {
        babel: {
            plugins: [...coverageBabelPlugins()],
        },
    },

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

        if (app.options['ember-cli-notifications'] !== undefined) {
            app.options['ember-cli-notifications'].autoClear = true;
            app.options['ember-cli-notifications'].clearDuration = 1000 * 3.5;
        } else {
            app.options['ember-cli-notifications'] = {
                autoClear: true,
                clearDuration: 1000 * 3.5,
            };
        }
    },

    treeForPublic: function () {
        const publicTree = this._super.treeForPublic.apply(this, arguments);
        const trees = [];

        trees.push(
            new Funnel(path.dirname(require.resolve('socketcluster-client')), {
                files: ['socketcluster-client.min.js'],
                destDir: 'assets',
                allowEmpty: true,
            })
        );

        // Merge the addon tree with the existing tree
        return publicTree ? new MergeTrees([publicTree, ...trees], { overwrite: true }) : new MergeTrees([...trees], { overwrite: true });
    },
};
