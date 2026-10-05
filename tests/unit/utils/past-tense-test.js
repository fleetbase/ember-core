import pastTense from 'dummy/utils/past-tense';
import { module, test } from 'qunit';

module('Unit | Utility | past-tense', function () {
    test('it uses the irregular verb exceptions table', function (assert) {
        assert.strictEqual(pastTense('go'), 'went');
        assert.strictEqual(pastTense('is'), 'was');
        assert.strictEqual(pastTense('are'), 'were');
        assert.strictEqual(pastTense('eat'), 'ate');
        assert.strictEqual(pastTense('run'), 'ran');
        assert.strictEqual(pastTense('visit'), 'visited');
    });

    test('it appends d to verbs ending in e', function (assert) {
        assert.strictEqual(pastTense('move'), 'moved');
        assert.strictEqual(pastTense('create'), 'created');
    });

    test('it appends ked to verbs with a vowel before c', function (assert) {
        assert.strictEqual(pastTense('panic'), 'panicked');
    });

    test('it appends ed to verbs ending in el', function (assert) {
        assert.strictEqual(pastTense('travel'), 'traveled');
    });

    test('it appends ed after a double vowel followed by a soft consonant', function (assert) {
        assert.strictEqual(pastTense('rain'), 'rained');
        assert.strictEqual(pastTense('seem'), 'seemed');
    });

    test('it doubles the final consonant after a single vowel', function (assert) {
        assert.strictEqual(pastTense('stop'), 'stopped');
        assert.strictEqual(pastTense('plan'), 'planned');
    });

    test('it falls back to appending ed', function (assert) {
        assert.strictEqual(pastTense('walk'), 'walked');
        assert.strictEqual(pastTense('jump'), 'jumped');
    });
});
