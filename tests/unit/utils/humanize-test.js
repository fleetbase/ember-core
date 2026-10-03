import humanize from 'dummy/utils/humanize';
import { module, test } from 'qunit';

/**
 * humanize turns a machine-shaped key into a readable phrase, then restores
 * the casing of a fixed list of acronyms that the generic humanizer lowercases.
 */
module('Unit | Utility | humanize', function () {
    test('it turns an underscored key into a sentence', function (assert) {
        assert.strictEqual(humanize('first_name'), 'First name');
    });

    test('it leaves an already-readable word alone', function (assert) {
        assert.strictEqual(humanize('name'), 'Name');
    });

    test('a leading acronym is restored to upper case', function (assert) {
        assert.strictEqual(humanize('api_key'), 'API key');
    });

    test('an acronym anywhere in the phrase is restored', function (assert) {
        assert.strictEqual(humanize('customer_id'), 'Customer ID');
        assert.strictEqual(humanize('public_uuid'), 'Public UUID');
    });

    test('several acronyms are all restored', function (assert) {
        assert.strictEqual(humanize('api_uuid'), 'API UUID');
    });

    test('a word that merely contains an acronym is untouched', function (assert) {
        assert.strictEqual(humanize('identity'), 'Identity', 'matching is per whole word, not substring');
    });

    test('the shipping acronyms are covered', function (assert) {
        assert.strictEqual(humanize('eta_at'), 'ETA at');
        assert.strictEqual(humanize('pod_url'), 'POD url', 'only listed acronyms are raised');
    });

    test('an empty string humanizes to an empty string', function (assert) {
        assert.strictEqual(humanize(''), '');
    });
});
