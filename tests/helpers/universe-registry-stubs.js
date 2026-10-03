import Service from '@ember/service';
import { A } from '@ember/array';
import { getOwner } from '@ember/application';

/**
 * In-memory stand-ins for the universe registry and menu services.
 *
 * The real RegistryService imports `tracked-built-ins`, and its extension
 * manager imports `@fleetbase/console/extensions`; neither exists in this
 * addon's dummy app, so services built on them are tested against these.
 * They keep the real storage shape: section → list → items keyed by
 * `_registryKey`, `slug` or `id`.
 */
export class RegistryServiceStub extends Service {
    sections = new Map();

    getOrCreateList(section, list) {
        if (!this.sections.has(section)) {
            this.sections.set(section, {});
        }

        const lists = this.sections.get(section);
        lists[list] = lists[list] ?? A([]);
        return lists[list];
    }

    register(section, list, key, value) {
        const items = this.getOrCreateList(section, list);
        value._registryKey = key;
        const existing = this.lookup(section, list, key);

        if (existing) {
            items.replace(items.indexOf(existing), 1, [value]);
        } else {
            items.pushObject(value);
        }
    }

    getRegistry(section, list) {
        return this.sections.get(section)?.[list] ?? A([]);
    }

    lookup(section, list, key) {
        return this.getRegistry(section, list).find((item) => item._registryKey === key || item.slug === key || item.id === key) ?? null;
    }

    hasList(section, list) {
        return Boolean(this.sections.get(section)?.[list]);
    }

    clearAll() {
        this.sections.clear();
    }
}

export class MenuServiceStub extends Service {
    get registry() {
        return getOwner(this).lookup('service:universe/registry-service');
    }

    registerMenuItem(registryName, menuItem) {
        const item = typeof menuItem.toObject === 'function' ? menuItem.toObject() : menuItem;
        this.registry.register(registryName, 'menu-item', item.slug || item.title, item);
    }

    getMenuItems(registryName) {
        return this.registry.getRegistry(registryName, 'menu-item');
    }

    getMenuPanels(registryName) {
        return this.registry.getRegistry(registryName, 'menu-panel');
    }
}

export function setupUniverseRegistryStubs(hooks) {
    hooks.beforeEach(function () {
        this.owner.register('service:universe/extension-manager', class extends Service {});
        this.owner.register('service:universe/registry-service', RegistryServiceStub);
        this.owner.register('service:universe/menu-service', MenuServiceStub);
    });
}
