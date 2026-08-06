import words from 'dummy/utils/words';
import { module, test } from 'qunit';

module('Unit | Utility | words', function () {
    test('it converts camelCase and underscores to space-separated words', function (assert) {
        assert.strictEqual(words('helloWorld'), 'hello world');
        assert.strictEqual(words('hello_world'), 'hello world');
        assert.strictEqual(words('hello-world'), 'hello world');
    });

    test('it lowercases dasherized output', function (assert) {
        assert.strictEqual(words('HelloBigWorld'), 'hello big world');
    });

    test('it defaults to an empty string', function (assert) {
        assert.strictEqual(words(), '');
        assert.strictEqual(words(''), '');
    });
});
