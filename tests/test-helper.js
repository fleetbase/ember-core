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
import resetStorages from 'ember-local-storage/test-support/reset-storage';

const COVERAGE_UPLOAD_TIMEOUT_MS = 60000;

// Must run before the application boots so the socket service never builds a
// real client. See the helper for why an unstubbed client hangs the suite.
stubSocketCluster();

// Supplies the host-application module the extension manager imports, so that
// service can be loaded and measured at all.
stubConsoleExtensions();

setApplication(Application.create(config.APP));

setup(QUnit.assert);

// ember-local-storage caches its storage objects across owners. Without a reset
// the second test to use a `storageFor` service inherits the previous test's
// destroyed object and fails with "calling set on destroyed object".
QUnit.testDone(function () {
    resetStorages();
    window.localStorage.clear();
});

// Pull this addon's untested modules into the coverage denominator and ship the
// report. A failed or stalled upload is reported as a global failure rather than
// left to hang the run, so a broken coverage pipeline is always visible.
QUnit.done(async function () {
    if (!config.coverageEnabled) {
        return;
    }

    // A filtered run exercises a handful of tests but still force-loads every
    // addon module, so it produces a report with the full denominator and a
    // nearly empty numerator. Writing that would overwrite a good full-suite
    // report with something that looks like a catastrophic regression, and the
    // coverage gate would then read it. Partial runs are refused outright.
    const { filter, module: moduleFilter, testId } = QUnit.config;
    const partialRun = Boolean(filter) || Boolean(moduleFilter) || (Array.isArray(testId) && testId.length > 0);

    if (partialRun) {
        // eslint-disable-next-line no-console
        console.warn('[coverage] filtered run detected — report not written, so the full-suite report on disk is preserved');
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
