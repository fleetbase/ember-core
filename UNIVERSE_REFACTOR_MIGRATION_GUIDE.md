# UniverseService Refactor Migration Guide

## Overview

The UniverseService has been completely refactored to improve performance, maintainability, and developer experience. This guide will help you migrate your extensions to the new architecture.

## What Changed?

### 1. Service Decomposition

The monolithic `UniverseService` has been split into specialized services:

- **ExtensionManager**: Manages lazy loading of engines
- **RegistryService**: Manages all registries using Ember's container
- **MenuService**: Manages menu items and panels
- **WidgetService**: Manages dashboard widgets
- **HookService**: Manages application hooks

The original `UniverseService` now acts as a facade, delegating to these services while maintaining backward compatibility.

### 2. Contract System

New contract classes provide a fluent, type-safe API:

- `ExtensionComponent`: Lazy-loadable component definitions
- `MenuItem`: Menu item definitions
- `MenuPanel`: Menu panel definitions
- `Hook`: Hook definitions
- `Widget`: Widget definitions
- `Registry`: Registry namespace definitions

### 3. Lazy Loading Architecture

The old `bootEngines` mechanism has been replaced with on-demand lazy loading:

- Engines are no longer loaded at boot time
- Components are loaded only when needed
- The `<LazyEngineComponent>` wrapper handles lazy loading automatically

## Migration Steps

### Step 1: Create `extension.js` File

Each engine should create a new `addon/extension.js` file to replace the `setupExtension` method in `engine.js`.

**Before (`addon/engine.js`):**

```javascript
import NavigatorAppComponent from './components/admin/navigator-app';

export default class FleetOpsEngine extends Engine {
    setupExtension = function (app, engine, universe) {
        universe.registerHeaderMenuItem('Fleet-Ops', 'console.fleet-ops', {
            icon: 'route',
            priority: 0
        });

        universe.registerAdminMenuPanel('Fleet-Ops Config', [
            {
                title: 'Navigator App',
                component: NavigatorAppComponent
            }
        ]);
    };
}
```

**After (`addon/extension.js`):**

```javascript
import { MenuItem, MenuPanel, ExtensionComponent } from '@fleetbase/ember-core/contracts';

export default function (app, universe) {
    // Register header menu item
    universe.registerHeaderMenuItem(
        new MenuItem('Fleet-Ops', 'console.fleet-ops')
            .withIcon('route')
            .withPriority(0)
    );

    // Register admin panel with lazy component
    universe.registerAdminMenuPanel(
        new MenuPanel('Fleet-Ops Config')
            .addItem(
                new MenuItem('Navigator App')
                    .withIcon('location-arrow')
                    .withComponent(
                        new ExtensionComponent('@fleetbase/fleetops-engine', 'components/admin/navigator-app')
                    )
            )
    );
}
```

**After (`addon/engine.js`):**

```javascript
// Remove the setupExtension method entirely
export default class FleetOpsEngine extends Engine {
    // ... other engine configuration
}
```

### Step 2: Use Contract Classes

Instead of plain objects, use the new contract classes for better type safety and developer experience.

**Before:**

```javascript
universe.registerWidget({
    widgetId: 'fleet-ops-metrics',
    name: 'Fleet-Ops Metrics',
    icon: 'truck',
    component: WidgetComponent,
    grid_options: { w: 12, h: 12 }
});
```

**After:**

```javascript
import { Widget, ExtensionComponent } from '@fleetbase/ember-core/contracts';

universe.registerDashboardWidgets([
    new Widget('fleet-ops-metrics')
        .withName('Fleet-Ops Metrics')
        .withIcon('truck')
        .withComponent(
            new ExtensionComponent('@fleetbase/fleetops-engine', 'components/widget/fleet-ops-key-metrics')
        )
        .withGridOptions({ w: 12, h: 12 })
]);
```

### Step 3: Update Component References

Replace direct component imports with lazy component definitions.

**Before:**

```javascript
import MyComponent from './components/my-component';

universe.registerMenuItem('my-registry', 'My Item', {
    component: MyComponent
});
```

**After:**

```javascript
import { MenuItem, ExtensionComponent } from '@fleetbase/ember-core/contracts';

universe.registerMenuItem(
    'my-registry',
    new MenuItem('My Item')
        .withComponent(
            new ExtensionComponent('@fleetbase/my-engine', 'components/my-component')
        )
);
```

### Step 4: Update Templates Using Registry Components

Templates that render components from registries need to use the `<LazyEngineComponent>` wrapper.

**Before:**

```handlebars
{{#each this.menuItems as |item|}}
    {{component item.component model=@model}}
{{/each}}
```

**After:**

```handlebars
{{#each this.menuItems as |item|}}
    <LazyEngineComponent @componentDef={{item.component}} @model={{@model}} />
{{/each}}
```

### Step 5: Update Hook Registrations

Use the new `Hook` contract for better hook management.

**Before:**

```javascript
universe.registerHook('application:before-model', (session, router) => {
    if (session.isCustomer) {
        router.transitionTo('customer-portal');
    }
});
```

**After:**

```javascript
import { Hook } from '@fleetbase/ember-core/contracts';

universe.registerHook(
    new Hook('application:before-model', (session, router) => {
        if (session.isCustomer) {
            router.transitionTo('customer-portal');
        }
    })
        .withPriority(10)
        .withId('customer-redirect')
);
```

## Backward Compatibility

The refactored `UniverseService` maintains backward compatibility with the old API. You can continue using the old syntax while migrating:

```javascript
// Old syntax still works
universe.registerHeaderMenuItem('My Item', 'my.route', { icon: 'star' });

// New syntax is preferred
universe.registerHeaderMenuItem(
    new MenuItem('My Item', 'my.route').withIcon('star')
);
```

## Benefits of Migration

1. **Performance**: Sub-second boot times with lazy loading
2. **Type Safety**: Contract classes provide validation and IDE support
3. **Maintainability**: Specialized services are easier to understand and modify
4. **Developer Experience**: Fluent API with method chaining
5. **Extensibility**: Easy to add new features without breaking changes

## Common Patterns

### Menu Item with Click Handler

```javascript
new MenuItem('Track Order')
    .withIcon('barcode')
    .withType('link')
    .withWrapperClass('btn-block py-1 border')
    .withComponent(
        new ExtensionComponent('@fleetbase/fleetops-engine', 'components/order-tracking-lookup')
    )
    .onClick((menuItem) => {
        universe.transitionMenuItem('virtual', menuItem);
    })
```

### Widget with Refresh Interval

```javascript
new Widget('live-metrics')
    .withName('Live Metrics')
    .withComponent(
        new ExtensionComponent('@fleetbase/my-engine', 'components/widget/live-metrics')
            .withLoadingComponent('skeletons/widget')
    )
    .withRefreshInterval(5000)
    .asDefault()
```

### Hook with Priority and Once

```javascript
new Hook('order:before-save')
    .withPriority(10)
    .once()
    .execute(async (order) => {
        await validateOrder(order);
    })
```

## Troubleshooting

### Component Not Found Error

If you see "Component not found in engine" errors:

1. Check that the component path is correct
2. Ensure the engine name matches exactly
3. Verify the component exists in the engine

### Loading Spinner Not Showing

If the loading spinner doesn't appear:

1. Check that you're using `<LazyEngineComponent>` in templates
2. Verify the `componentDef` is a lazy definition object
3. Ensure the loading component exists

### Hooks Not Executing

If hooks aren't running:

1. Check the hook name matches exactly
2. Verify the hook is registered before it's needed
3. Use `universe.hookService.getHooks(hookName)` to debug

## Support

For questions or issues with the migration, please:

1. Check the contract class documentation in `addon/contracts/`
2. Review the service documentation in `addon/services/universe/`
3. Open an issue on GitHub with details about your migration challenge

## Timeline

- **Phase 1**: Refactored services are available, old API still works
- **Phase 2**: Extensions migrate to new `extension.js` pattern
- **Phase 3**: Deprecation warnings for old patterns
- **Phase 4**: Old `setupExtension` pattern removed (future release)

You can migrate at your own pace. The new architecture is fully backward compatible.
