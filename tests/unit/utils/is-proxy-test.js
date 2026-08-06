import isProxy from 'dummy/utils/is-proxy';
import { module, test } from 'qunit';
import ObjectProxy from '@ember/object/proxy';
import EmberObject from '@ember/object';

module('Unit | Utility | is-proxy', function () {
    test('it returns true for object proxies', function (assert) {
        assert.true(isProxy(ObjectProxy.create({ content: {} })));
        assert.true(isProxy(ObjectProxy.extend().create({ content: { a: 1 } })));
    });

    test('it returns false for non-proxies', function (assert) {
        assert.false(isProxy(EmberObject.create()));
        assert.false(isProxy({}));
        assert.false(isProxy(null));
        assert.false(isProxy(undefined));
        assert.false(isProxy('proxy'));
    });
});
