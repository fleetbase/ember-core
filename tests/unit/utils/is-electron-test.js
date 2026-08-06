import isElectron from 'dummy/utils/is-electron';
import { module, test } from 'qunit';

module('Unit | Utility | is-electron', function () {
    test('it returns false in a normal browser test environment', function (assert) {
        assert.false(isElectron());
    });

    test('it detects the electron renderer process', function (assert) {
        const original = window.process;

        try {
            window.process = { type: 'renderer' };
            assert.true(isElectron());
        } finally {
            if (original === undefined) {
                delete window.process;
            } else {
                window.process = original;
            }
        }
    });

    test('it detects electron from the user agent', function (assert) {
        const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent') ?? Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');

        try {
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 Electron/28.0.0 Safari/537.36',
                configurable: true,
            });
            assert.true(isElectron());
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', descriptor);
        }
    });
});
