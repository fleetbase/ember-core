import frontendUrl from 'dummy/utils/frontend-url';
import { module, test } from 'qunit';
import config from 'dummy/config/environment';

/**
 * Builds a URL onto the public Fleetbase site, choosing the host from the build
 * environment: the .dev domain locally, a subdomain for qa and staging, and the
 * .io domain everywhere else.
 *
 * `config` is shared across the whole run, so the environment is restored after
 * every test.
 */
module('Unit | Utility | frontend-url', function (hooks) {
    hooks.beforeEach(function () {
        this.originalEnvironment = config.environment;
    });

    hooks.afterEach(function () {
        config.environment = this.originalEnvironment;
    });

    module('host selection', function () {
        test('local and development use the dev domain', function (assert) {
            config.environment = 'local';
            assert.strictEqual(frontendUrl(), 'https://fleetbase.dev/');

            config.environment = 'development';
            assert.strictEqual(frontendUrl(), 'https://fleetbase.dev/');
        });

        test('production uses the io domain', function (assert) {
            config.environment = 'production';

            assert.strictEqual(frontendUrl(), 'https://fleetbase.io/');
        });

        test('qa and staging get their own subdomain', function (assert) {
            config.environment = 'qa';
            assert.strictEqual(frontendUrl(), 'https://qa.fleetbase.io/');

            config.environment = 'staging';
            assert.strictEqual(frontendUrl(), 'https://staging.fleetbase.io/');
        });

        test('an unrecognised environment falls through to the io domain', function (assert) {
            config.environment = 'something-else';

            assert.strictEqual(frontendUrl(), 'https://fleetbase.io/');
        });
    });

    module('paths and query params', function () {
        test('the path is appended', function (assert) {
            config.environment = 'production';

            assert.strictEqual(frontendUrl('pricing'), 'https://fleetbase.io/pricing');
        });

        test('query params are serialized', function (assert) {
            config.environment = 'production';

            assert.strictEqual(frontendUrl('pricing', { plan: 'pro', ref: 'console' }), 'https://fleetbase.io/pricing?plan=pro&ref=console');
        });

        test('an empty query object adds nothing', function (assert) {
            config.environment = 'production';

            assert.strictEqual(frontendUrl('pricing', {}), 'https://fleetbase.io/pricing');
        });

        test('a path is optional', function (assert) {
            config.environment = 'production';

            assert.strictEqual(frontendUrl(), 'https://fleetbase.io/', 'the trailing slash is always present');
        });

        test('params combine with the environment subdomain', function (assert) {
            config.environment = 'staging';

            assert.strictEqual(frontendUrl('signup', { plan: 'pro' }), 'https://staging.fleetbase.io/signup?plan=pro');
        });
    });

    test('a blank query params argument produces no query string', function (assert) {
        // isBlank({}) is false — an empty object is not blank — so the empty arm
        // is only reached by handing it null or undefined outright.
        assert.strictEqual(frontendUrl('signup', null), frontendUrl('signup'));
        assert.false(frontendUrl('signup', null).includes('?'));
    });
});
