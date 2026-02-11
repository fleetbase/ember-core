# Analytics Service

The `analytics` service provides a centralized, analytics-agnostic event tracking system for Fleetbase. It emits standardized events via the `universe` service's event bus, allowing engines (like `internals`) to subscribe and implement their own analytics integrations.

## Overview

The analytics service is designed to:

- **Centralize event emission** - Single source of truth for all analytics events
- **Remain analytics-agnostic** - No vendor-specific code (PostHog, Google Analytics, etc.)
- **Use the universe event bus** - Events are published via `universe.trigger()`
- **Be opt-in** - Services and components must explicitly call tracking methods
- **Enrich events automatically** - Adds user, organization, and timestamp context

## Architecture

```
Service/Component
      ↓
analytics.trackResourceCreated(order)
      ↓
Analytics Service
  - Enriches with metadata
  - Formats payload
      ↓
universe.trigger('resource.created', ...)
universe.trigger('order.created', ...)
      ↓
Internals (or other engines)
  - Listens via universe.on()
  - Translates to PostHog/etc
```

## Installation

The analytics service is automatically available in all engines and the console application. It's exported globally via `host-services` and `services`.

### Injection

```javascript
import { inject as service } from '@ember/service';

export default class MyService extends Service {
    @service analytics;
    
    async createOrder(orderData) {
        const order = await this.store.createRecord('order', orderData).save();
        this.analytics.trackResourceCreated(order);
        return order;
    }
}
```

## API Reference

### Resource Tracking

#### `trackResourceCreated(resource, props = {})`

Tracks the creation of a new resource.

**Parameters:**
- `resource` (Object) - The created Ember Data model
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `resource.created` (generic)
- `{modelName}.created` (specific, e.g., `order.created`)

**Example:**
```javascript
this.analytics.trackResourceCreated(order);
// Emits: resource.created, order.created
```

#### `trackResourceUpdated(resource, props = {})`

Tracks the update of an existing resource.

**Parameters:**
- `resource` (Object) - The updated Ember Data model
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `resource.updated` (generic)
- `{modelName}.updated` (specific, e.g., `driver.updated`)

**Example:**
```javascript
this.analytics.trackResourceUpdated(driver);
// Emits: resource.updated, driver.updated
```

#### `trackResourceDeleted(resource, props = {})`

Tracks the deletion of a resource.

**Parameters:**
- `resource` (Object) - The deleted Ember Data model
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `resource.deleted` (generic)
- `{modelName}.deleted` (specific, e.g., `vehicle.deleted`)

**Example:**
```javascript
this.analytics.trackResourceDeleted(vehicle);
// Emits: resource.deleted, vehicle.deleted
```

#### `trackResourceImported(modelName, count, props = {})`

Tracks a bulk import of resources.

**Parameters:**
- `modelName` (String) - The name of the model being imported
- `count` (Number) - Number of resources imported
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `resource.imported`

**Example:**
```javascript
this.analytics.trackResourceImported('contact', 50);
// Emits: resource.imported with count: 50
```

#### `trackResourceExported(modelName, format, params = {}, props = {})`

Tracks a resource export.

**Parameters:**
- `modelName` (String) - The name of the model being exported
- `format` (String) - Export format (csv, xlsx, pdf, etc.)
- `params` (Object, optional) - Export parameters/filters
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `resource.exported` (generic)
- `{modelName}.exported` (specific, e.g., `order.exported`)

**Example:**
```javascript
this.analytics.trackResourceExported('order', 'csv', { status: 'completed' });
// Emits: resource.exported, order.exported
```

#### `trackBulkAction(verb, resources, props = {})`

Tracks a bulk action on multiple resources.

**Parameters:**
- `verb` (String) - The action verb (delete, archive, etc.)
- `resources` (Array) - Array of selected resources
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `resource.bulk_action`

**Example:**
```javascript
this.analytics.trackBulkAction('delete', selectedOrders);
// Emits: resource.bulk_action with count and action
```

### Session Tracking

#### `trackUserLoaded(user, organization, props = {})`

Tracks when the current user is loaded (session initialized).

**Parameters:**
- `user` (Object) - The user object
- `organization` (Object) - The organization object
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `user.loaded`

**Example:**
```javascript
this.analytics.trackUserLoaded(user, organization);
// Emits: user.loaded
```

#### `trackSessionTerminated(duration, props = {})`

Tracks when a user session ends.

**Parameters:**
- `duration` (Number) - Session duration in seconds
- `props` (Object, optional) - Additional properties to include

**Events Emitted:**
- `session.terminated`

**Example:**
```javascript
this.analytics.trackSessionTerminated(3600);
// Emits: session.terminated with duration
```

### Custom Events

#### `trackEvent(eventName, props = {})`

Tracks a generic custom event.

**Parameters:**
- `eventName` (String) - The event name (dot notation recommended)
- `props` (Object, optional) - Event properties

**Events Emitted:**
- `{eventName}` (as specified)

**Example:**
```javascript
this.analytics.trackEvent('chat.message.sent', { length: 140 });
// Emits: chat.message.sent
```

### Utility Methods

#### `isEnabled()`

Checks if analytics tracking is enabled.

**Returns:** `Boolean`

**Example:**
```javascript
if (this.analytics.isEnabled()) {
    // Tracking is enabled
}
```

## Configuration

The analytics service can be configured via `config/environment.js`:

```javascript
// config/environment.js
ENV.analytics = {
    enabled: true, // Master switch (default: true)
    debug: false, // Log events to console (default: false)
    enrich: {
        user: true, // Add user_id to events (default: true)
        organization: true, // Add organization_id to events (default: true)
        timestamp: true // Add timestamp to events (default: true)
    }
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | Boolean | `true` | Master switch to enable/disable all tracking |
| `debug` | Boolean | `false` | Log events to console for debugging |
| `enrich.user` | Boolean | `true` | Add `user_id` to all events |
| `enrich.organization` | Boolean | `true` | Add `organization_id` to all events |
| `enrich.timestamp` | Boolean | `true` | Add `timestamp` to all events |

## Event Naming Convention

All events use **dot notation** with the following patterns:

- **Generic resource events:** `resource.{action}` (e.g., `resource.created`)
- **Specific resource events:** `{modelName}.{action}` (e.g., `order.created`)
- **Session events:** `user.loaded`, `session.terminated`
- **Custom events:** Use dot notation (e.g., `chat.message.sent`)

## Event Properties

All events are automatically enriched with the following properties (if enabled):

- `user_id` - Current user's ID
- `organization_id` - Current organization's ID
- `timestamp` - ISO 8601 timestamp

Resource events also include:

- `id` - Resource ID
- `model_name` - Model name
- `name` - Resource name (if available)
- `status` - Resource status (if available)
- `type` - Resource type (if available)

## Usage Examples

### In a Service

```javascript
import Service, { inject as service } from '@ember/service';

export default class OrderService extends Service {
    @service store;
    @service analytics;
    
    async createOrder(orderData) {
        const order = this.store.createRecord('order', orderData);
        await order.save();
        
        // Track the creation
        this.analytics.trackResourceCreated(order);
        
        return order;
    }
    
    async updateOrder(order, updates) {
        order.setProperties(updates);
        await order.save();
        
        // Track the update
        this.analytics.trackResourceUpdated(order);
        
        return order;
    }
}
```

### In a Component

```javascript
import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class OrderFormComponent extends Component {
    @service analytics;
    
    @action
    async saveOrder() {
        await this.args.order.save();
        
        // Track the save
        if (this.args.order.isNew) {
            this.analytics.trackResourceCreated(this.args.order);
        } else {
            this.analytics.trackResourceUpdated(this.args.order);
        }
    }
}
```

### Listening to Events (in Engines)

```javascript
// In an engine's instance-initializer
export function initialize(owner) {
    const universe = owner.lookup('service:universe');
    const posthog = owner.lookup('service:posthog');
    
    // Listen to order creation events
    universe.on('order.created', (order, properties) => {
        posthog.trackEvent('order_created', {
            order_id: order.id,
            ...properties
        });
    });
    
    // Listen to all resource creation events
    universe.on('resource.created', (resource, properties) => {
        posthog.trackEvent('resource_created', properties);
    });
}
```

## Best Practices

1. **Use specific tracking methods** - Prefer `trackResourceCreated()` over `trackEvent()`
2. **Track after success** - Only track events after the operation succeeds
3. **Keep properties minimal** - Only include necessary data
4. **Use dot notation** - For custom event names (e.g., `chat.message.sent`)
5. **Don't track sensitive data** - Avoid passwords, tokens, payment info
6. **Test with debug mode** - Set `analytics.debug: true` in development

## Testing

To stub the analytics service in tests:

```javascript
import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import sinon from 'sinon';

module('Unit | Service | order', function(hooks) {
    setupTest(hooks);
    
    test('it tracks order creation', async function(assert) {
        const service = this.owner.lookup('service:order');
        const analytics = this.owner.lookup('service:analytics');
        
        // Stub the tracking method
        const trackStub = sinon.stub(analytics, 'trackResourceCreated');
        
        await service.createOrder({ name: 'Test Order' });
        
        // Assert tracking was called
        assert.ok(trackStub.calledOnce);
    });
});
```

## Migration from Direct universe.trigger()

If you previously used `universe.trigger()` directly:

**Before:**
```javascript
this.universe.trigger('resource.created', model);
this.universe.trigger('order.created', model);
```

**After:**
```javascript
this.analytics.trackResourceCreated(model);
// Automatically emits both events
```

## Support

For questions or issues with the analytics service, please refer to the Fleetbase documentation or contact the development team.
