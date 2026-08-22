import getUserOptions from 'dummy/utils/get-user-options';
import { module, test } from 'qunit';

const STORAGE_KEY = '@fleetbase/storage:user-options';

module('Unit | Utility | get-user-options', function (hooks) {
    hooks.afterEach(function () {
        window.localStorage.removeItem(STORAGE_KEY);
    });

    test('it parses stored user options', function (assert) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', pageSize: 25 }));

        assert.deepEqual(getUserOptions(), { theme: 'dark', pageSize: 25 });
    });

    test('it returns an empty object when nothing is stored', function (assert) {
        window.localStorage.removeItem(STORAGE_KEY);

        assert.deepEqual(getUserOptions(), {});
    });

    test('it returns an empty object for an empty stored string', function (assert) {
        window.localStorage.setItem(STORAGE_KEY, '');

        assert.deepEqual(getUserOptions(), {});
    });

    test('it swallows malformed json and returns an empty object', function (assert) {
        window.localStorage.setItem(STORAGE_KEY, '{not valid json');

        assert.deepEqual(getUserOptions(), {});
    });
});
