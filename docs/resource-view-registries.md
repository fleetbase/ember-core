# Resource view registries

Extensions can add **columns, row actions, bulk actions and toolbar buttons** to any engine's table views, and **header buttons and menu items** to its details views, without touching that engine's code.

## Naming

Every registry name follows one rule:

```
<extension>:<surface>:<resource>:<slot>
```

| Segment     | Meaning                                                                                       | Examples                                                 |
| ----------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `extension` | The engine that **owns the view**. Always its console mount segment, as in `console.<extension>`. | `fleet-ops`, `storefront`, `ledger`, `iam`, `developers` |
| `surface`   | `table` (an index or list view) or `details` (a details panel, page or dialog)                | `table`, `details`                                       |
| `resource`  | The resource, singular and dasherized, with no engine prefix                                  | `driver`, `work-order`, `invoice`, `api-key`             |
| `slot`      | What is being added (see below)                                                               | `columns`, `menu`                                        |

| Surface   | Slot           | Adds                                     | Contract         |
| --------- | -------------- | ---------------------------------------- | ---------------- |
| `table`   | `columns`      | Table columns                            | `TableColumn`    |
| `table`   | `row-actions`  | Items in each row's "…" menu             | `ResourceAction` |
| `table`   | `bulk-actions` | Items in the Bulk Actions menu           | `ResourceAction` |
| `table`   | `actions`      | Toolbar buttons                          | `ActionButton`   |
| `details` | `actions`      | Header buttons                           | `ActionButton`   |
| `details` | `menu`         | Items in the header's "…" menu           | `ResourceAction` |

**`actions` are always header buttons.** Dropdown items are `row-actions`, `bulk-actions` or `menu`.

Examples: `fleet-ops:table:driver:columns`, `ledger:details:invoice:menu`, `iam:table:user:row-actions`, `developers:details:webhook:actions`.

Details **tabs** keep their original registry, `<extension>:component:<resource>:details`, registered with `menuService.registerMenuItem` or `resourceView.registerDetailsTab(extension, resource, menuItem)`.

Names are validated. A name that breaks the rule, an item without an `id`, or a contract in the wrong slot is rejected with a warning.

## Registering

Register in your extension's `setupExtension`:

```js
import { TableColumn, ResourceAction, ActionButton, ExtensionComponent } from '@fleetbase/ember-core/contracts';

export default {
    setupExtension(app, universe) {
        const views = universe.getService('resource-view');

        views.register(
            'fleet-ops:table:driver:columns',
            new TableColumn({ id: 'safety-score', label: 'Safety Score', valuePath: 'meta.safety_score' })
                .after('status')
                .withCellComponent(new ExtensionComponent('@acme/engine', 'cell/safety-score'))
                .withFilter('safety_score', 'filter/string')
        );

        views.register(
            'fleet-ops:table:driver:row-actions',
            new ResourceAction({ id: 'acme-sync', label: 'Sync to Acme', icon: 'sync', permission: 'acme sync driver' })
                .withHandler((driver, ctx) => ctx.owner.lookup('service:acme').sync(driver))
                .before('delete')
        );

        views.register('ledger:table:invoice:bulk-actions', new ResourceAction({ id: 'acme-export', label: 'Export to Acme', fn: (invoices) => {} }));
        views.register('iam:table:user:actions', new ActionButton({ id: 'acme-import', text: 'Import from Acme', icon: 'download', onClick: (ctx) => {} }));
        views.register('storefront:details:order:menu', new ResourceAction({ id: 'acme-print', label: 'Print label', fn: (order) => {} }));

        // The same, with the name built for you:
        views.registerRowAction('fleet-ops', 'vehicle', new ResourceAction({ id: 'acme-ping', label: 'Ping tracker', fn: (vehicle) => {} }));
    },
};
```

The `universe` facade offers the same calls: `universe.registerInResourceView(name, items)`, plus `registerTableColumn`, `registerRowAction`, `registerBulkAction`, `registerTableAction`, `registerDetailsAction` and `registerDetailsMenuItem`, each taking `(extension, resource, item)`.

### Handlers

| Slot           | Called as                                                 |
| -------------- | --------------------------------------------------------- |
| `row-actions`  | `fn(row, ctx)`, `isVisible(row, ctx)`                      |
| `bulk-actions` | `fn(selectedRows, ctx)`: the selection at click time      |
| `menu`         | `fn(resource, ctx)`, `isVisible(resource, ctx)`           |
| `actions`      | `onClick(ctx)`, `isVisible(ctx)`; dropdown `items` get `fn(resource, ctx)` |

`ctx` holds `registry`, `extension`, `surface`, `resourceName`, `slot` and `owner`, plus what the view provides: `controller`, `table`, `getSelectedRows()` on tables, and `resource` on details views.

`permission` disables an action for users without the ability. On a column, it hides the column.

### Placement

Registered items go in `priority` order, lowest first; the default is 10. Each is placed at its `before`/`after` anchor (the `id` of a built-in or registered sibling), else at `index`, else at the slot's default position:

- **Columns:** just before the row-actions column.
- **Row actions and menu items:** before `delete`, together with its separator.
- **Everything else:** appended.

A registered item whose `id` matches a built-in is dropped, because built-ins win. Built-in columns, actions and buttons carry stable ids (a column's `valuePath` dasherized, an action's handler name), so they can be used as anchors.

### Filterable columns

A column with `filterable`, `filterComponent` and `filterParam` appears in the filters picker like a built-in one.

The owning index controller includes registered filter params in its query params through `queryParamsFor`. Because query params are read when that controller is created, **register filter columns in `setupExtension`, not later**. A late registration logs a warning.

The API must also understand the param. Add it to the resource's filter from your extension's service provider:

```php
DriverFilter::expand('safety_score', function ($value) {
    $this->builder->where('meta->safety_score', '>=', $value);
});
```

A column's `valuePath` only works if the API resource returns that field. For extension data, prefer a cell component that loads what it needs, or read `meta.*` or custom field values.

## Rendering (for engine authors)

**Built into the layout components.** Pass `@registry` with the surface prefix. Registered items are then merged automatically:

- `<Layout::Resource::Tabular @registry="ledger:table:invoice">`: columns, row actions, bulk actions and toolbar buttons.
- `<Layout::Resource::TabularActions @registry=…>`: toolbar buttons and bulk actions.
- `<Layout::Resource::Panel @registry="ledger:details:invoice">`: header buttons and menu items.
- `resourceContextPanel.open({ registry: 'storefront:details:order', … })`: header buttons and menu items.

**In views that render their own markup:**

- `ResourceActionService`, through `this.initialize(modelName, { registryResource })`, gives you `tableRegistry` and `detailsRegistry`, plus:
  - `mergeRegisteredColumns(columns, ctx)`, for a `<Table>` you render yourself;
  - `mergeRegistered(surface, slot, items, ctx)`;
  - `queryParamsFor(queryParams)`.
- `mergeHeaderButtons` from `@fleetbase/ember-ui/utils/resource-view` merges header buttons and menu items. Render the result with `<Layout::Resource::ActionButtons @buttons=…>`.

**Declaring your registries:** do this in `setupExtension`, so they exist before anything registers into them:

```js
universe.getService('universe/resource-view-service')?.declare('ledger', ['invoice', 'wallet']);
```

`resourceRegistryNames(extension, resource)` lists every name for a resource.

## Registered views

| Engine       | Table and details resources                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger`     | `account`, `gateway` (table only), `invoice`, `invoice-template` (table only), `journal`, `transaction`, `wallet`                              |
| `iam`        | `group`, `policy`, `role`, `user`. Details render in the edit dialogs' footers.                                                              |
| `developers` | `api-key` (table only), `event`, `log`, `socket`, `webhook`                                                                                   |
| `storefront` | `order`, `customer`, `promotion`, `campaign`, `customer-segment`, `network-order`, `network-store`, `network-customer`                        |
