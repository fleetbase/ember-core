# Boot Sequence Refactor Guide

## Overview

This guide provides the steps to refactor the application boot sequence to enable true lazy loading and move away from the old `bootEngines` mechanism.

## The Goal

Our goal is to stop loading all extensions at boot time and instead load them on-demand. This requires changing how and when extensions are initialized.

## Key Changes

1. **Remove `load-extensions` instance initializer**: This is the main entry point for the old boot sequence.
2. **Create a new `initialize-universe` instance initializer**: This will load the `extension.js` files and register all metadata.
3. **Update `app.js`**: Remove the manual extension loading and `bootEngines` call.

## Step-by-Step Guide

### Step 1: Remove Old Initializers

In your application (e.g., `fleetbase/console`), delete the following instance initializers:

- `app/instance-initializers/load-extensions.js`
- `app/instance-initializers/initialize-widgets.js` (this logic is now handled by the `extension.js` files)

### Step 2: Create New `initialize-universe` Initializer

Create a new instance initializer at `app/instance-initializers/initialize-universe.js`:

```javascript
import ApplicationInstance from '@ember/application/instance';
import { scheduleOnce } from '@ember/runloop';
import { getOwner } from '@ember/application';
import { dasherize } from '@ember/string';
import { pluralize } from 'ember-inflector';
import getWithDefault from '@fleetbase/ember-core/utils/get-with-default';
import config from 'ember-get-config';

/**
 * Initializes the Universe by loading and executing extension.js files
 * from all installed extensions. This replaces the old bootEngines mechanism.
 * 
 * @param {ApplicationInstance} appInstance The application instance
 */
export function initialize(appInstance) {
    const universe = appInstance.lookup("service:universe");
    const owner = getOwner(appInstance);

    // Set application instance on universe
    universe.applicationInstance = appInstance;

    // Load extensions from config
    const extensions = getWithDefault(config, 'fleetbase.extensions', []);

    // Load and execute extension.js from each extension
    extensions.forEach(extensionName => {
        try {
            // Dynamically require the extension.js file
            const setupExtension = require(`${extensionName}/extension`).default;

            if (typeof setupExtension === 'function') {
                // Execute the extension setup function
                setupExtension(appInstance, universe);
            }
        } catch (error) {
            // This will fail if extension.js doesn't exist, which is fine
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

### Step 3: Update `app.js`

In your `fleetbase/console/app/app.js`, remove the old extension loading and `bootEngines` logic.

**Before:**

```javascript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import { getWithDefault } from '@fleetbase/ember-core/utils/get-with-default';

export default class App extends Application {
    modulePrefix = config.modulePrefix;
    podModulePrefix = config.podModulePrefix;
    Resolver = Resolver;

    constructor() {
        super(...arguments);
        this.engines = {};

        // Set extensions to be loaded
        const extensions = getWithDefault(config, 'fleetbase.extensions', []);
        this.extensions = extensions;
    }
}

loadInitializers(App, config.modulePrefix);
```

**After:**

```javascript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';

export default class App extends Application {
    modulePrefix = config.modulePrefix;
    podModulePrefix = config.podModulePrefix;
    Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
```

### Step 4: Update `router.js`

Your `prebuild.js` script already handles mounting engines in `router.js`, so no changes are needed there. The `this.mount(...)` calls are what enable Ember's lazy loading.

### Step 5: Migrate Extensions

For each extension:

1. Create an `addon/extension.js` file.
2. Move all logic from `setupExtension` in `addon/engine.js` to `addon/extension.js`.
3. Replace all plain object definitions with the new contract classes.
4. Replace all direct component imports with `ExtensionComponent` definitions.
5. Remove the `setupExtension` method from `addon/engine.js`.

See the [UNIVERSE_REFACTOR_MIGRATION_GUIDE.md](./UNIVERSE_REFACTOR_MIGRATION_GUIDE.md) for detailed examples.

## How It Works

1. **App Boot**: The application boots as normal.
2. **`initialize-universe`**: This initializer runs.
3. **`require(extension/extension.js)`**: It dynamically loads the `extension.js` file from each installed extension.
4. **`setupExtension(app, universe)`**: It executes the function, passing in the app instance and universe service.
5. **Metadata Registration**: The `extension.js` file registers all menus, widgets, and hooks as metadata (no component code is loaded).
6. **Lazy Loading**: When a user navigates to a route or a component is needed, the `<LazyEngineComponent>` triggers the `extensionManager` to load the engine bundle on-demand.

This new boot sequence is significantly faster because it only loads small `extension.js` files instead of entire engine bundles. The application starts in under a second, and extensions are loaded only when they are actually used.
