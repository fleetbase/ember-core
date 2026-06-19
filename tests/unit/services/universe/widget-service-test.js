import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

class RegistryStubService extends Service {
    registries = new Map();

    register(section, list, key, value) {
        const registryKey = `${section}:${list}`;
        const registry = this.registries.get(registryKey) ?? [];
        const record = { ...value, _registryKey: key };
        const existingIndex = registry.findIndex((item) => item._registryKey === key);

        if (existingIndex === -1) {
            registry.push(record);
        } else {
            registry[existingIndex] = record;
        }

        this.registries.set(registryKey, registry);
    }

    getRegistry(section, list) {
        return this.registries.get(`${section}:${list}`) ?? [];
    }

    lookup(section, list, key) {
        return this.getRegistry(section, list).find((item) => item._registryKey === key) ?? null;
    }
}

module('Unit | Service | universe/widget-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe/registry-service', RegistryStubService);
    });

    test('it registers multiple system dashboards for a dashboard slot', function (assert) {
        const service = this.owner.lookup('service:universe/widget-service');

        service.registerDashboardForSlot('console.home', 'dashboard', {
            name: 'Default Dashboard',
            priority: 0,
        });
        service.registerDashboardForSlot('console.home', 'alrashd', {
            name: 'Al-Rashed KPI Dashboard',
            priority: 10,
        });
        service.setConsoleDashboard('alrashd');

        const dashboards = service.getDashboardsForSlot('console.home');

        assert.deepEqual(
            dashboards.map((dashboard) => dashboard.id),
            ['alrashd', 'dashboard'],
            'slot dashboards are returned by priority'
        );
        assert.strictEqual(service.getDefaultDashboardForSlot('console.home'), 'alrashd', 'console shortcut sets the console home default');
        assert.strictEqual(service.getDashboard('alrashd').name, 'Al-Rashed KPI Dashboard', 'dashboard namespace metadata is registered');
    });
});
