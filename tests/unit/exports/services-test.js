import { module, test } from 'qunit';
import { services } from '@fleetbase/ember-core/exports/services';
import { hostServices } from '@fleetbase/ember-core/exports/host-services';

module('Unit | Exports | services', function () {
    test('it exposes docs-panel to engines', function (assert) {
        assert.ok(services.includes('docs-panel'), 'docs-panel is included in engine services');
        assert.ok(hostServices.includes('docs-panel'), 'docs-panel is included in host services');
    });

    test('it exposes the shell services to engines', function (assert) {
        for (const name of ['dock', 'context-bar', 'backdrop', 'shell', 'sheet-stack']) {
            assert.ok(services.includes(name), `${name} is included in engine services`);
            assert.ok(hostServices.includes(name), `${name} is included in host services`);
        }
    });
});
