import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import RegistryService from '@fleetbase/ember-core/services/universe/registry-service';
import HookService from '@fleetbase/ember-core/services/universe/hook-service';
import TemplateHelper from '@fleetbase/ember-core/contracts/template-helper';

/**
 * The `if (!owner)` / `if (!application)` fallbacks these services carry.
 *
 * I had recorded these as unreachable on the grounds that Ember always supplies
 * an owner. It always supplies one to a service built through the CONTAINER —
 * but `Service.create()` builds one directly, with no owner at all, which is
 * exactly the shape those fallbacks were written for. Injections only throw if
 * the code path touches them, and none of these do.
 */
module('Unit | container-less services', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.originalWarn = console.warn;
        console.warn = () => {};
    });

    hooks.afterEach(function () {
        if (typeof this.originalWarn === 'function') {
            console.warn = this.originalWarn;
        }
    });

    module('registry-service', function () {
        test('with no owner it falls back to a private registry', function (assert) {
            const service = RegistryService.create();

            assert.ok(service.registry, 'a registry is still produced');
            assert.strictEqual(service.registries.size, 0, 'an empty one');
        });

        test('that fallback registry is NOT the shared one', function (assert) {
            const owned = this.owner.lookup('service:universe/registry-service');
            owned.register('shared-section', 'items', 'a', { slug: 'a' });

            const orphan = RegistryService.create();

            assert.strictEqual(orphan.registries.get('shared-section'), undefined, 'nothing is shared with the container-backed one');
        });

        test('registerHelper declines without an owner', async function (assert) {
            const service = RegistryService.create();

            assert.strictEqual(await service.registerHelper('my-helper', () => {}), undefined, 'it returns rather than throwing');
        });

        test('a helper loaded from an engine yields null without an owner', async function (assert) {
            const service = RegistryService.create();

            // A TemplateHelper naming a path routes through #loadHelperFromEngine,
            // which has the same no-owner guard and gives up first.
            await service.registerHelper('my-helper', new TemplateHelper('@fleetbase/fleetops-engine', 'helpers/my-helper'));

            assert.strictEqual(service.registries.size, 0, 'nothing was registered');
        });
    });

    module('hook-service', function () {
        test('with no owner the application search runs out of options', function (assert) {
            // #getApplication's last resort returns the owner itself, for an
            // EngineInstance that has no `.application`. With no owner at all it
            // returns undefined, and #initializeHookRegistry dereferences that
            // without a guard — so the failure surfaces here rather than being
            // handled. Not reachable in production, where a service always has
            // an owner; recorded so the shape is visible.
            const service = HookService.create({ universe: { applicationInstance: null } });

            assert.throws(() => service.hookRegistry, /undefined/);
        });
    });
});
