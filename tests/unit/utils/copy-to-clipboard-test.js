import copyToClipboard from 'dummy/utils/copy-to-clipboard';
import { module, test } from 'qunit';

// The real Clipboard API rejects unless the document is focused, which is not
// guaranteed for a headless or backgrounded test runner, so the navigator
// boundary is stubbed and both paths are driven explicitly.
function withClipboard(clipboard, callback) {
    const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard') ?? Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');

    Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });

    return (async () => {
        try {
            return await callback();
        } finally {
            if (descriptor) {
                Object.defineProperty(window.navigator, 'clipboard', descriptor);
            } else {
                delete window.navigator.clipboard;
            }
        }
    })();
}

module('Unit | Utility | copy-to-clipboard', function () {
    test('it writes through the clipboard api when available', async function (assert) {
        const written = [];

        await withClipboard(
            {
                writeText(value) {
                    written.push(value);
                    return Promise.resolve();
                },
            },
            () => copyToClipboard('copied text')
        );

        assert.deepEqual(written, ['copied text']);
    });

    test('it propagates a clipboard api rejection', async function (assert) {
        await withClipboard({ writeText: () => Promise.reject(new Error('denied')) }, async () => {
            await assert.rejects(copyToClipboard('nope'), /denied/);
        });
    });

    test('it falls back to a temporary textarea when the clipboard api is missing', async function (assert) {
        const originalExecCommand = document.execCommand;
        const commands = [];
        document.execCommand = (command) => {
            commands.push(command);
            return true;
        };

        try {
            const result = await withClipboard(undefined, () => copyToClipboard('fallback text'));

            assert.strictEqual(result, 'fallback text', 'resolves with the copied value');
            assert.deepEqual(commands, ['copy']);
            assert.strictEqual(document.querySelectorAll('textarea[style*="fixed"]').length, 0, 'the temporary textarea is removed');
        } finally {
            document.execCommand = originalExecCommand;
        }
    });

    test('it rejects when the fallback copy command throws', async function (assert) {
        const originalExecCommand = document.execCommand;
        document.execCommand = () => {
            throw new Error('execCommand unavailable');
        };

        try {
            await withClipboard(undefined, async () => {
                await assert.rejects(copyToClipboard('fails'), /execCommand unavailable/);
            });
        } finally {
            document.execCommand = originalExecCommand;
        }
    });
});
