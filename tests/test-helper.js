import Application from 'dummy/app';
import config from 'dummy/config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start } from 'ember-qunit';
import { forceModulesToBeLoaded, sendCoverage } from 'ember-cli-code-coverage/test-support';

const ADDON_MODULE_PREFIX = '@fleetbase/ember-core/';
const COVERAGE_UPLOAD_TIMEOUT_MS = 60000;

setApplication(Application.create(config.APP));

setup(QUnit.assert);

// Evaluate this addon's own modules once the suite has finished so that source
// files without tests still land in the coverage denominator rather than being
// silently dropped. The filter is scoped to the addon: forcing every module in
// the build would evaluate unrelated vendor code with side effects.
//
// A failed or stalled coverage upload is reported as a global failure rather
// than left to hang the run, so a broken coverage pipeline is always visible.
QUnit.done(async function () {
    forceModulesToBeLoaded((type, module) => type === 'require' && module.startsWith(ADDON_MODULE_PREFIX));

    const instrumentedFiles = Object.keys(window.__coverage__ ?? {}).length;

    let timeoutId;
    try {
        await Promise.race([
            sendCoverage(),
            new Promise((resolve, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`coverage upload timed out after ${COVERAGE_UPLOAD_TIMEOUT_MS}ms`)), COVERAGE_UPLOAD_TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        QUnit.onUncaughtException(new Error(`[coverage] ${error.message} (instrumented files: ${instrumentedFiles})`));
    } finally {
        clearTimeout(timeoutId);
    }
});

start();
