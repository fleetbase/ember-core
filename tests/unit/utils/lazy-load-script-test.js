import lazyLoadScript from 'dummy/utils/lazy-load-script';
import { module, test } from 'qunit';
import { guidFor } from '@ember/object/internals';

// Scripts are loaded from data: URLs so nothing touches the network.
const EMPTY_SCRIPT = 'data:text/javascript,void 0';

module('Unit | Utility | lazy-load-script', function (hooks) {
    hooks.afterEach(function () {
        document.querySelectorAll('head script[data-lazy-test]').forEach((node) => node.remove());
        this.appended?.forEach((node) => node.remove());
    });

    test('it appends a script tag and resolves once it loads', async function (assert) {
        const path = `${EMPTY_SCRIPT}/*${Math.abs(1)}*/`;

        await lazyLoadScript(path);

        const element = document.getElementById(guidFor(path));
        assert.ok(element, 'the script element was appended');
        assert.strictEqual(element.tagName, 'SCRIPT');
        assert.strictEqual(element.src, path);
        this.appended = [element];
    });

    test('it resolves immediately when the script id is already present', async function (assert) {
        const path = 'already-present-script';
        const existing = document.createElement('script');
        existing.id = guidFor(path);
        existing.setAttribute('data-lazy-test', '1');
        document.head.appendChild(existing);

        await lazyLoadScript(path);

        assert.strictEqual(document.querySelectorAll(`#${CSS.escape(existing.id)}`).length, 1, 'no duplicate element is added');
    });

    test('it rejects when the script fails to load', async function (assert) {
        const path = 'http://localhost:4300/__definitely_missing_script__.js';

        try {
            await lazyLoadScript(path);
            assert.true(false, 'expected the promise to reject');
        } catch (error) {
            assert.strictEqual(error, `Failed to load script (${path})`);
        } finally {
            document.getElementById(guidFor(path))?.remove();
        }
    });
});
