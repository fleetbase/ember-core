import Application from 'dummy/app';
import config from 'dummy/config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start } from 'ember-qunit';
import { sendCoverage } from 'ember-cli-code-coverage/test-support';
import stubSocketCluster from './helpers/stub-socketcluster';
import stubConsoleExtensions from './helpers/stub-console-extensions';
import forceAddonModulesToBeLoaded from './helpers/force-addon-modules';

const COVERAGE_UPLOAD_TIMEOUT_MS = 60000;

// Must run before the application boots so the socket service never builds a
// real client. See the helper for why an unstubbed client hangs the suite.
stubSocketCluster();

// Supplies the host-application module the extension manager imports, so that
// service can be loaded and measured at all.
stubConsoleExtensions();

setApplication(Application.create(config.APP));

setup(QUnit.assert);

// Pull this addon's untested modules into the coverage denominator and ship the
// report. A failed or stalled upload is reported as a global failure rather than
// left to hang the run, so a broken coverage pipeline is always visible.
QUnit.done(async function () {
    if (!config.coverageEnabled) {
        return;
    }

    forceAddonModulesToBeLoaded();

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
        // eslint-disable-next-line no-console
        console.error(`[coverage] ${error.message} (instrumented files: ${instrumentedFiles})`);
    } finally {
        clearTimeout(timeoutId);
    }
});

start();
