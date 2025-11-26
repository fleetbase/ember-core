# Boot Sequence Refactor Guide

## Overview

This guide provides the steps to refactor the application boot sequence to enable true lazy loading and move away from the old `bootEngines` mechanism that loads all extensions at startup.

## Understanding the Extension Loading Flow

The Fleetbase application has a three-tier extension loading system:

1. **pnpm Installation**: All extensions are installed via pnpm, making them available to the application
2. **System Configuration**: Extensions defined in `fleetbase.config.js` or `EXTENSIONS` environment variable are loaded globally
3. **User Permissions**: Individual users can install/uninstall extensions, which affects what loads for them specifically

Only extensions that are both installed AND enabled (via config or user permissions) will be initialized.

## The Goal

Stop loading all extension code at boot time. Instead:
- Load only the `extension.js` files (metadata registration)
- Keep engine bundles lazy-loaded (loaded on-demand when routes are visited)
- Preserve the `engines` property required by ember-engines for lazy loading

## Key Changes

1. **Keep `app.engines` property**: Required by ember-engines for lazy loading
2. **Create new `initialize-universe` instance initializer**: Loads `extension.js` files and registers metadata
3. **Remove `bootEngines` calls**: No more manual engine booting at startup

## Step-by-Step Guide

### Step 1: Update `app.js` to Preserve Engines Property

The `engines` property is **required** by ember-engines to enable lazy loading. Keep the existing structure but remove any `bootEngines` calls.

**Current `app.js` (fleetbase/console/app/app.js):**

```javascript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from '@fleetbase/console/config/environment';
import loadExtensions from '@fleetbase/ember-core/utils/load-extensions';
import mapEngines from '@fleetbase/ember-core/utils/map-engines';
import loadRuntimeConfig from '@fleetbase/console/utils/runtime-config';
import applyRouterFix from './utils/router-refresh-patch';

export default class App extends Application {
    modulePrefix = config.modulePrefix;
    podModulePrefix = config.podModulePrefix;
    Resolver = Resolver;
    extensions = [];
    engines = {}; // ← KEEP THIS! Required by ember-engines

    async ready() {
        applyRouterFix(this);
        const extensions = await loadExtensions();

        this.extensions = extensions;
        this.engines = mapEngines(extensions); // ← KEEP THIS! Maps extensions to engines
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadRuntimeConfig();
    loadInitializers(App, config.modulePrefix);

    let fleetbase = App.create();
    fleetbase.deferReadiness();
    fleetbase.boot();
});
```

**What to Keep:**
- ✅ `extensions` property - tracks which extensions are enabled
- ✅ `engines` property - required by ember-engines for lazy loading
- ✅ `loadExtensions()` - determines which extensions to load based on config + user permissions
- ✅ `mapEngines()` - creates the engines object required by ember-engines

**What Changes:**
- ❌ Remove any `bootEngines()` calls (if present in instance initializers)
- ❌ Remove `initialize-widgets.js` instance initializer (logic moves to `extension.js`)

### Step 2: Remove Old Instance Initializers

Delete the following instance initializers that perform eager engine loading:

**Files to Delete:**
- `app/instance-initializers/load-extensions.js` (if it calls `bootEngines`)
- `app/instance-initializers/initialize-widgets.js` (widgets now registered via `extension.js`)

### Step 3: Create New `initialize-universe` Initializer

Create a new instance initializer at `app/instance-initializers/initialize-universe.js`:

```javascript
import { getOwner } from '@ember/application';
import { scheduleOnce } from '@ember/runloop';

/**
 * Initializes the Universe by loading and executing extension.js files
 * from all enabled extensions. This replaces the old bootEngines mechanism.
 * 
 * Key differences from old approach:
 * - Only loads extension.js files (small, metadata only)
 * - Does NOT load engine bundles (those lazy-load when routes are visited)
 * - Respects both system config and user permissions
 * 
 * @param {ApplicationInstance} appInstance The application instance
 */
export function initialize(appInstance) {
    const universe = appInstance.lookup('service:universe');
    const owner = getOwner(appInstance);
    const app = owner.application;

    // Set application instance on universe
    universe.applicationInstance = appInstance;

    // Get the list of enabled extensions from the app
    // This list already respects config + user permissions via loadExtensions()
    const extensions = app.extensions || [];

    // Load and execute extension.js from each enabled extension
    extensions.forEach(extensionName => {
        try {
            // Dynamically require the extension.js file
            // This is a small file with only metadata, not the full engine bundle
            const setupExtension = require(`${extensionName}/extension`).default;

            if (typeof setupExtension === 'function') {
                // Execute the extension setup function
                // This registers menus, widgets, hooks, etc. as metadata
                setupExtension(appInstance, universe);
            }
        } catch (error) {
            // Silently fail if extension.js doesn't exist
            // Extensions can migrate gradually to the new pattern
            // console.warn(`Could not load extension.js for ${extensionName}:`, error);
        }
    });

    // Execute any boot callbacks
    scheduleOnce('afterRender', universe, 'executeBootCallbacks');
}

export default {
    name: 'initialize-universe',
    initialize
};
```

### Step 4: Verify `router.js` Engine Mounting

Your `prebuild.js` script already handles mounting engines in `router.js`. Verify that engines are mounted like this:

```javascript
// This is generated by prebuild.js
this.mount('@fleetbase/fleetops-engine', { as: 'console.fleet-ops' });
this.mount('@fleetbase/customer-portal-engine', { as: 'console.customer-portal' });
```

**Important**: The `this.mount()` calls are what enable ember-engines lazy loading. When a user navigates to a route, ember-engines automatically loads the engine bundle on-demand.

### Step 5: Migrate Extensions to `extension.js` Pattern

For each extension, create an `addon/extension.js` file that registers metadata without importing components:

**Example: FleetOps `addon/extension.js`**

```javascript
import { MenuItem, MenuPanel, Widget, ExtensionComponent } from '@fleetbase/ember-core/contracts';

export default function (app, universe) {
    // Register admin menu panel
    universe.registerAdminMenuPanel(
        'Fleet-Ops',
        new MenuPanel({
            title: 'Fleet-Ops',
            icon: 'route',
            items: [
                new MenuItem({
                    title: 'Navigator App',
                    icon: 'location-arrow',
                    component: new ExtensionComponent('@fleetbase/fleetops-engine', 'components/admin/navigator-app')
                }),
                new MenuItem({
                    title: 'Avatar Management',
                    icon: 'images',
                    component: new ExtensionComponent('@fleetbase/fleetops-engine', 'components/admin/avatar-management')
                })
            ]
        })
    );

    // Register widgets
    universe.registerDefaultWidget(
        new Widget({
            widgetId: 'fleet-ops-metrics',
            name: 'Fleet-Ops Metrics',
            description: 'Key metrics from Fleet-Ops',
            icon: 'truck',
            component: new ExtensionComponent('@fleetbase/fleetops-engine', 'components/widget/metrics'),
            grid_options: { w: 12, h: 12, minW: 8, minH: 12 }
        })
    );

    // Register hooks
    universe.registerHook(
        new Hook({
            name: 'application:before-model',
            handler: (session, router) => {
                // Custom logic here
            },
            priority: 10
        })
    );
}
```

**Key Points:**
- ❌ NO `import MyComponent from './components/my-component'` - this would load the engine!
- ✅ Use `ExtensionComponent` with engine name + path for lazy loading
- ✅ Use contract classes (`MenuItem`, `Widget`, `Hook`) for type safety

See [UNIVERSE_REFACTOR_MIGRATION_GUIDE.md](./UNIVERSE_REFACTOR_MIGRATION_GUIDE.md) for detailed migration examples.

## How Lazy Loading Works with This Approach

1. **App Boot**: Application boots with `app.engines` property set
2. **`initialize-universe`**: Loads small `extension.js` files via `require()`
3. **Metadata Registration**: Extensions register menus, widgets, hooks (no component code loaded)
4. **User Navigation**: User navigates to `/console/fleet-ops`
5. **Ember-Engines**: Detects route is in a mounted engine, lazy-loads the engine bundle
6. **Component Resolution**: `<LazyEngineComponent>` resolves components from loaded engine

## Performance Impact

| Metric | Before (bootEngines) | After (Lazy Loading) |
|--------|---------------------|---------------------|
| Initial Load Time | 10-40 seconds | <1 second |
| Initial Bundle Size | Core + All Engines | Core + extension.js files |
| Engine Loading | All at boot | On-demand when route visited |
| Memory Usage | All engines in memory | Only visited engines in memory |

## Ember-Engines Requirements

According to [ember-engines documentation](https://github.com/ember-engines/ember-engines):

> **Lazy loading** - An engine can allow its parent to boot with only its routing map loaded. The rest of the engine can be loaded only as required (i.e. when a route in an engine is visited). This allows applications to boot faster and limit their memory consumption.

**Required for lazy loading:**
1. ✅ `app.engines` property must be set (maps extension names to engine modules)
2. ✅ Engines must be mounted in `router.js` via `this.mount()`
3. ✅ Engine's `index.js` must have `lazyLoading: true` (default)

**What breaks lazy loading:**
1. ❌ Calling `owner.lookup('engine:my-engine')` at boot time
2. ❌ Importing components from engines in `extension.js`
3. ❌ Manual `bootEngines()` calls

## Troubleshooting

### Extension not loading
- Check that extension is in `app.extensions` array
- Verify `extension.js` file exists and exports a function
- Check browser console for errors

### Components not rendering
- Ensure `ExtensionComponent` has correct engine name and path
- Verify engine is mounted in `router.js`
- Check that `<LazyEngineComponent>` is used in templates

### Engines loading at boot
- Remove any `owner.lookup('engine:...')` calls from initializers
- Remove component imports from `extension.js`
- Verify no `bootEngines()` calls remain

## Migration Checklist

- [ ] Update `app.js` to keep `engines` property
- [ ] Remove old instance initializers (`load-extensions.js`, `initialize-widgets.js`)
- [ ] Create new `initialize-universe.js` instance initializer
- [ ] Verify `router.js` has `this.mount()` calls for all engines
- [ ] Create `extension.js` for each extension
- [ ] Replace component imports with `ExtensionComponent` definitions
- [ ] Test lazy loading in browser dev tools (Network tab)
- [ ] Verify initial bundle size reduction
- [ ] Test all extension functionality still works

## References

- [Ember Engines Guide](https://guides.emberjs.com/v5.6.0/applications/ember-engines/)
- [ember-engines GitHub](https://github.com/ember-engines/ember-engines)
- [Ember Engines RFC](https://github.com/emberjs/rfcs/blob/master/text/0010-engines.md)
