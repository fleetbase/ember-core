import getPodMethods from 'dummy/utils/get-pod-methods';
import { module, test } from 'qunit';

module('Unit | Utility | get-pod-methods', function () {
    test('it returns the supported proof-of-delivery methods', function (assert) {
        const methods = getPodMethods();

        assert.strictEqual(methods.length, 3);
        assert.deepEqual(
            methods.map((method) => method.value),
            [null, 'scan', 'signature']
        );
        assert.strictEqual(methods[0].name, 'None', 'the null option is offered first');
    });

    test('it returns a fresh array on every call', function (assert) {
        assert.notStrictEqual(getPodMethods(), getPodMethods());
    });
});
