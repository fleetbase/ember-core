import refreshRoute from 'dummy/utils/refresh-route';
import { module, test } from 'qunit';

module('Unit | Utility | refresh-route', function () {
    test('it refreshes the router reached through the controller target chain', function (assert) {
        let refreshed = 0;
        const controller = {
            target: {
                targetState: {
                    router: {
                        refresh() {
                            refreshed++;
                            return 'refreshed';
                        },
                    },
                },
            },
        };

        assert.strictEqual(refreshRoute(controller), 'refreshed');
        assert.strictEqual(refreshed, 1);
    });

    test('it throws when the controller has no router target', function (assert) {
        assert.throws(() => refreshRoute({}), /target/);
    });
});
