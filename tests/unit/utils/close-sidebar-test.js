import closeSidebar from 'dummy/utils/close-sidebar';
import { module, test } from 'qunit';

module('Unit | Utility | close-sidebar', function (hooks) {
    hooks.afterEach(function () {
        document.querySelectorAll('nav.next-sidebar').forEach((node) => node.remove());
    });

    function addSidebar(className) {
        const nav = document.createElement('nav');
        nav.className = className;
        document.body.appendChild(nav);
        return nav;
    }

    test('it removes the is-open class from an open sidebar', function (assert) {
        const nav = addSidebar('next-sidebar is-open');

        closeSidebar();

        assert.false(nav.classList.contains('is-open'));
        assert.true(nav.classList.contains('next-sidebar'), 'other classes are left alone');
    });

    test('it leaves an already closed sidebar untouched', function (assert) {
        const nav = addSidebar('next-sidebar');

        closeSidebar();

        assert.false(nav.classList.contains('is-open'));
    });

    test('it does nothing when no sidebar is present', function (assert) {
        closeSidebar();

        assert.strictEqual(document.querySelectorAll('nav.next-sidebar').length, 0);
    });
});
