import isElectron from 'dummy/utils/is-electron';
import { module, test } from 'qunit';

// Every branch is driven explicitly: the real answer depends on the browser the
// suite happens to run in (an Electron-based browser would report true), and a
// test that changes with the runner is worse than no test.
function withUserAgent(value, callback) {
    const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent') ?? Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');

    Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });

    try {
        return callback();
    } finally {
        Object.defineProperty(window.navigator, 'userAgent', descriptor);
    }
}

function withWindowProcess(value, callback) {
    const original = window.process;
    const had = 'process' in window;

    window.process = value;

    try {
        return callback();
    } finally {
        if (had) {
            window.process = original;
        } else {
            delete window.process;
        }
    }
}

const PLAIN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

module('Unit | Utility | is-electron', function () {
    test('it returns false for an ordinary browser', function (assert) {
        withUserAgent(PLAIN_UA, () => {
            withWindowProcess(undefined, () => {
                assert.false(isElectron());
            });
        });
    });

    test('it detects the electron renderer process', function (assert) {
        withUserAgent(PLAIN_UA, () => {
            withWindowProcess({ type: 'renderer' }, () => {
                assert.true(isElectron());
            });
        });
    });

    test('it ignores a process object that is not the renderer', function (assert) {
        withUserAgent(PLAIN_UA, () => {
            withWindowProcess({ type: 'browser' }, () => {
                assert.false(isElectron());
            });
        });
    });

    test('it detects the electron main process by its version list', function (assert) {
        withUserAgent(PLAIN_UA, () => {
            withWindowProcess({ versions: { electron: '28.0.0' } }, () => {
                assert.true(isElectron());
            });
        });
    });

    test('a process with versions but no electron entry is not electron', function (assert) {
        withUserAgent(PLAIN_UA, () => {
            withWindowProcess({ versions: { node: '20.0.0' } }, () => {
                assert.false(isElectron());
            });
        });
    });

    test('it detects electron from the user agent', function (assert) {
        withUserAgent('Mozilla/5.0 Electron/28.0.0 Safari/537.36', () => {
            assert.true(isElectron());
        });
    });
});
