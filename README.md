<p align="center">
  <img src="https://raw.githubusercontent.com/fleetbase/ember-ui/main/docs/brand/fleetbase-icon.png" alt="Fleetbase" width="76" height="76">
</p>

<h1 align="center">Fleetbase Ember Core</h1>

<p align="center">
  The services, contracts, decorators and utilities behind the Fleetbase console — and the
  foundation every Fleetbase extension is built on.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fleetbase/ember-core"><img alt="npm" src="https://img.shields.io/npm/v/@fleetbase/ember-core.svg?color=1c6cc7"></a>
  <a href="https://github.com/fleetbase/ember-core/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fleetbase/ember-core/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://codecov.io/gh/fleetbase/ember-core"><img alt="Coverage" src="https://codecov.io/gh/fleetbase/ember-core/graph/badge.svg?flag=ember-core"></a>
  <a href="https://www.npmjs.com/package/@fleetbase/ember-core"><img alt="Downloads" src="https://img.shields.io/npm/dm/@fleetbase/ember-core.svg?color=1c6cc7"></a>
  <a href="LICENSE.md"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg"></a>
</p>

<p align="center">
  <a href="https://fleetbase.io/docs/extension-development"><strong>Documentation</strong></a> ·
  <a href="https://fleetbase.io/docs/extension-development/getting-started/quickstart">Quickstart</a> ·
  <a href="https://github.com/fleetbase/ember-ui">Ember UI</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Overview

`@fleetbase/ember-core` is the Ember addon that the Fleetbase console and every Fleetbase extension
share. It provides:

- **The Universe** — the extensibility layer an extension uses to plug into the console: menus,
  registries, dashboard widgets, lifecycle hooks, engine loading and resource views.
- **Contracts** — small, chainable classes that describe what an extension contributes
  (`MenuItem`, `Widget`, `Hook`, `TableColumn`, `ResourceAction` and more).
- **Application services** — authentication, the API client, the current user, CRUD workflows,
  filters, notifications, sockets, theming and more.
- **Decorators and utilities** — store- and API-backed properties, engine service injection, and the
  helpers the console relies on throughout.

Components live in the companion addon, **[@fleetbase/ember-ui](https://github.com/fleetbase/ember-ui)**.

## Documentation

The documentation lives at **[fleetbase.io/docs/extension-development](https://fleetbase.io/docs/extension-development)**.

| Topic | Guide |
| --- | --- |
| Building your first extension | [Quickstart](https://fleetbase.io/docs/extension-development/getting-started/quickstart) · [Extension anatomy](https://fleetbase.io/docs/extension-development/getting-started/extension-anatomy) |
| How an extension is loaded | [Architecture](https://fleetbase.io/docs/extension-development/architecture/overview) · [Extension registration](https://fleetbase.io/docs/extension-development/architecture/extension-registration) |
| The Universe and its sub-services | [Universe overview](https://fleetbase.io/docs/extension-development/universe/overview) · [Menus](https://fleetbase.io/docs/extension-development/universe/menu-service) · [Registries](https://fleetbase.io/docs/extension-development/universe/registry-service) · [Widgets](https://fleetbase.io/docs/extension-development/universe/widget-service) · [Hooks](https://fleetbase.io/docs/extension-development/universe/hook-service) · [Extension manager](https://fleetbase.io/docs/extension-development/universe/extension-manager) |
| Extending another engine's tables and details views | [Resource views](https://fleetbase.io/docs/extension-development/resource-views) |
| API reference | [Contracts](https://fleetbase.io/docs/extension-development/reference/contracts) · [Ember services](https://fleetbase.io/docs/extension-development/reference/ember-services) · [Decorators](https://fleetbase.io/docs/extension-development/reference/decorators) |

## Installation

```bash
pnpm add @fleetbase/ember-core
```

Or, with Ember CLI:

```bash
ember install @fleetbase/ember-core
```

Requires Node 18 or newer. The addon is built and tested against Ember 5.4.

## Usage

### Registering an extension

An extension contributes to the console from the `setupExtension` hook in its `addon/extension.js`.
The `universe` it receives is the entry point to everything else:

```js
// addon/extension.js
import { ResourceAction, TableColumn } from '@fleetbase/ember-core/contracts';

export default {
    setupExtension(app, universe) {
        // Add an item to the console header
        universe.getService('menu').registerHeaderMenuItem('Acme', 'console.acme', {
            icon: 'rocket',
            priority: 5,
        });

        // Add a column and a row action to Fleet-Ops' drivers table
        const views = universe.getService('resource-view');

        views.register(
            'fleet-ops:driver:table:columns',
            new TableColumn({ id: 'safety-score', label: 'Safety Score', valuePath: 'meta.safety_score' }).after('status')
        );

        views.register(
            'fleet-ops:driver:table:row-actions',
            new ResourceAction({ id: 'acme-sync', label: 'Sync to Acme', icon: 'sync', permission: 'acme sync driver' })
                .withHandler((driver, ctx) => ctx.owner.lookup('service:acme').sync(driver))
        );
    },
};
```

### Canvas shell: dock metadata, context bar and search

The canvas shell reads three extension points. All are optional; extensions that use none of them keep working.

**Dock metadata.** `registerHeaderMenuItem` takes five more options. Each is also a `MenuItem` builder
(`withColor`, `withStatus`, `withBadge`, `withShortcut`, `inGroup`) and is returned by `universe.headerMenuItems`:

```js
universe.registerHeaderMenuItem('Acme', 'console.acme', {
    icon: 'rocket',
    color: '#7c3aed', // dock tile colour
    status: { tone: 'warn', text: '2 jobs failing' }, // tone: 'warn' | 'error' | 'info'; a plain string means info
    badge: 3, // count or short text
    shortcut: 'g a', // keyboard shortcut (not the `shortcuts` sub-links)
    group: 'operations', // dock group
});
```

The `dock` service turns header items into the user's dock: `items`, `hiddenItems`, `reorder(ids)`, `hide(id)`,
`show(id)` and `lockedIds`. Admins set per-role defaults with `roleDefaults(roleId)` and
`setRoleDefaults(roleId, { order, locked })` (`canManageRoles` says whether the user may); locked items cannot be hidden.

**Context bar.** Routes and controllers set the crumbs and chips shown above the page. They reset on the next route
change unless the new route sets them; with no crumbs set, they are built from the route tree and menu-item titles.

```js
export default class OrderDetailsRoute extends Route {
    @service contextBar;

    setupController(controller, order) {
        super.setupController(...arguments);
        this.contextBar.setCrumbs([{ label: 'Orders', route: 'console.fleet-ops.operations.orders' }, { label: order.public_id }]);
        this.contextBar.setChips([{ label: order.status, tone: 'info' }]); // tone: 'info' | 'warn' | 'ok' | 'menu'
    }
}
```

Crumbs are `{ label, route?, models?, query?, menu?, split? }`. `contextBar.clear()` drops both.

**Search providers.** Add results to the command palette (⌘K). `search(query)` returns, or resolves to, an array of
`{ id, title, subtitle?, group?, route?, models?, action? }`; results without a `group` are grouped under the provider's
label, and registering an id again replaces that provider.

```js
universe.registerSearchProvider({
    id: 'acme:jobs',
    label: 'Acme jobs',
    icon: 'rocket',
    async search(query) {
        const jobs = await fetch.get('acme/jobs', { query, limit: 5 });
        return jobs.map((job) => ({ id: job.id, title: job.name, subtitle: job.status, route: 'console.acme.jobs.details', models: [job.id] }));
    },
});

universe.getSearchProviders(); // [{ id, label, icon, search(query) }]
```

### Canvas shell: backdrops

A backdrop is a component rendered once under all console content, such as a live map. It stays mounted across routes,
so routes put their layers on it instead of mounting their own map. Routes with no backdrop show the dot-grid canvas.

```js
universe.registerBackdrop('fleet-ops:live-map', LiveMapBackdrop, {
    routes: ['console.fleet-ops'], // route-name prefixes; children match too
    priority: 0, // higher wins when several match; ties go to the longest prefix, then the first registered
    keepAlive: true, // stay mounted (hidden) after leaving its routes
});

universe.getBackdrops(); // [{ name, component, routes, priority, keepAlive }]
```

The `backdrop` service tells the shell what to render and holds each owner's layers:

- `active` is the registration for the current route, or `null` for the dot-grid canvas. `isActive(name)` checks one.
- `mounted` lists the backdrops to render: the active one plus every `keepAlive` backdrop activated this session, in
  registration order. Render all of them and hide the inactive ones; never destroy them.
- `request(owner, { layers, fitBounds, focus, mode })` puts an owner's layers on the backdrop and returns a handle
  `{ owner, layers, isReleased, update(options), release() }`. Requesting again for the same owner replaces its entry.
- `release(owner)` takes that owner's layers off. Owners never touch each other's entries. An entry is also released
  when the route it was requested from is left (a route owner's own route, the route being entered during a
  transition, else the current route; pass `route` to choose), and when the owner is destroyed.
- `state` is what the backdrop component renders: `{ layers: [{ owner, layers }], fitBounds, focus, mode }`. Each of
  `fitBounds`, `focus` and `mode` comes from the newest request that set it.
- The backdrop component calls `setInstance(map)` once its map loads (and `setInstance(null)` on teardown). `instance`
  and `isReady` describe the active backdrop. `onReady((instance, state) => …)` runs at once if ready, else when it
  becomes ready, and returns a cancel function.

```js
export default class OrdersIndexRoute extends Route {
    @service backdrop;

    setupController(controller, orders) {
        super.setupController(...arguments);
        // Released automatically when this route is left.
        this.backdrop.request(this, { layers: [{ type: 'orders', records: orders }], fitBounds: 'layers', mode: 'live' });
    }
}
```

Layer objects are opaque to the service; the backdrop component decides what they mean for the map provider in use.

### Using the services

Every service is injected the usual way:

```js
import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class OrdersController extends Controller {
    @service fetch;
    @service currentUser;
    @service notifications;

    @action async dispatch(order) {
        await this.fetch.post(`orders/${order.id}/dispatch`);
        this.notifications.success(`Dispatched by ${this.currentUser.name}`);
    }
}
```

## What's included

<details>
<summary><strong>Universe</strong> — the extensibility layer</summary>

`universe` is a facade over six sub-services, each reached with `universe.getService(name)`:

| Name | Responsible for |
| --- | --- |
| `menu` | Header items, admin and settings menus, account dropdowns and custom menu registries |
| `registry` | Named registries, and registering components, services and helpers across engines |
| `widget` | Dashboard widgets and dashboards |
| `hook` | Application lifecycle and custom hooks |
| `resource-view` | Columns, actions and menu items on other engines' tables and details views |
| `extension-manager` | Loading engines and sharing services between them |

</details>

<details>
<summary><strong>Contracts</strong> — imported from <code>@fleetbase/ember-core/contracts</code></summary>

| Contract | Describes |
| --- | --- |
| `MenuItem`, `MenuPanel` | Menu entries and the admin panels that group them |
| `ExtensionComponent` | A component that lives in an engine and is loaded on demand |
| `Widget` | A dashboard widget |
| `Hook` | A lifecycle or custom hook handler |
| `Registry` | A named registry |
| `TableColumn` | A column added to a resource table |
| `ResourceAction` | A row, bulk or details-menu action |
| `ActionButton` | A toolbar or details-header button |

</details>

<details>
<summary><strong>Services</strong></summary>

| Service | Responsible for |
| --- | --- |
| `session` | Authentication and session lifecycle |
| `current-user` | The signed-in user, their organization, permissions and preferences |
| `fetch` | The Fleetbase API client: requests, uploads, downloads and caching |
| `crud` | Delete, bulk-action, export and import workflows |
| `resource-action` | The base for model-specific action services |
| `filters` | Query-param filters for resource tables |
| `table-context` | Selection state for the active table |
| `abilities` | Permission checks |
| `notifications` | Toast notifications |
| `socket` | Real-time channels, authenticated with session socket tokens |
| `chat` | Chat channels and messages |
| `events` | Application event tracking |
| `theme` | Light and dark themes and route body classes |
| `language` | Locale selection |
| `loader` | Loading overlays |
| `app-cache` | Persistent client-side cache |
| `url-search-params` | Reading and writing the URL's query string |
| `custom-fields-registry` | Custom fields attached to any model |
| `dock` | The canvas shell's dock: order, hidden and locked items, per-role defaults |
| `context-bar` | The canvas shell's breadcrumbs and status chips |

</details>

<details>
<summary><strong>Decorators</strong></summary>

| Decorator | Does |
| --- | --- |
| `@engineService` | Injects a service from another engine |
| `@fromStore` | Backs a property with a store query |
| `@fetchFrom` | Backs a property with an API request |

</details>

## Development

```bash
pnpm install --frozen-lockfile

pnpm start                # serve the dummy app
pnpm test                 # lint + the full suite
pnpm run test:ember       # the suite on its own
pnpm run lint             # eslint, ember-template-lint, stylelint
pnpm run build            # production build
```

Run a subset while working on one area:

```bash
pnpm exec ember test --filter="Unit | Service | fetch"
```

## Testing and coverage

The suite runs in headless Chrome through Testem. Coverage is gated at **100% of the `addon/`
source** — statements, branches, functions and lines, checked per file — and enforced in CI, with
results reported to [Codecov](https://codecov.io/gh/fleetbase/ember-core).

```bash
pnpm run coverage            # run the suite with coverage
pnpm run coverage:check      # enforce the gate
```

## Contributing

See the [Contributing](CONTRIBUTING.md) guide. Questions and ideas are welcome in
[GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions) and on
[Discord](https://discord.gg/HnTqQ6zAVn).

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE.md).
