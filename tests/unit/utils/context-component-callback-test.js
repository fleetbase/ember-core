import contextComponentCallback from 'dummy/utils/context-component-callback';
import { module, test } from 'qunit';

module('Unit | Utility | context-component-callback', function () {
    test('it invokes a callback passed directly as an argument', function (assert) {
        const received = [];
        const component = { args: { onSelect: (...params) => received.push(params) } };

        const invoked = contextComponentCallback(component, 'onSelect', 'a', 2);

        assert.true(invoked);
        assert.deepEqual(received, [['a', 2]]);
    });

    test('it invokes a callback provided through the options argument', function (assert) {
        let called = 0;
        const component = { args: { options: { onSelect: () => called++ } } };

        assert.true(contextComponentCallback(component, 'onSelect'));
        assert.strictEqual(called, 1);
    });

    test('it invokes both the direct and options callbacks when both exist', function (assert) {
        let direct = 0;
        let viaOptions = 0;
        const component = {
            args: {
                onSelect: () => direct++,
                options: { onSelect: () => viaOptions++ },
            },
        };

        assert.true(contextComponentCallback(component, 'onSelect'));
        assert.strictEqual(direct, 1);
        assert.strictEqual(viaOptions, 1);
    });

    test('it reports that nothing was invoked when no callback matches', function (assert) {
        assert.false(contextComponentCallback({ args: {} }, 'onSelect'));
        assert.false(contextComponentCallback({ args: { onSelect: 'not a function' } }, 'onSelect'));
        assert.false(contextComponentCallback({ args: { options: {} } }, 'onSelect'));
        assert.false(contextComponentCallback({ args: { options: null } }, 'onSelect'));
    });
});
