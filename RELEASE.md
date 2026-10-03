> v0.3.25 ~ "Resource view registries: extensions can add columns, actions and buttons to any table or details view"

---
## Highlights

- **Resource view registries.** Extensions can add columns, row actions, bulk actions and toolbar buttons to any engine's table views, and header buttons and menu items to its details views. Names follow `<extension>:<surface>:<resource>:<slot>`, for example `fleet-ops:table:driver:columns` or `ledger:details:invoice:menu`.
  - New contracts: `TableColumn`, `ResourceAction` and `ActionButton`.
  - New service: `universe/resource-view-service`, reached as `universe.getService('resource-view')`.
  - New `ResourceActionService` helpers: `tableRegistry`, `detailsRegistry`, `mergeRegisteredColumns()` and `queryParamsFor()`.
  - Guide: `docs/resource-view-registries.md`.
  - Rendering ships in fleetbase/ember-ui v0.4.5.
- **Header shortcuts keep their permission.** `registerHeaderMenuItem` now carries `permission` onto each shortcut, or inherits the parent's, so the header can hide shortcuts a user cannot open.
- **Fix: a required file custom field rejected a file uploaded in the same session.** A freshly staged `file:<uuid>` value now counts as present.
- **Fix: the universe registry facade.** `getRegistry`, `registerInRegistry`, `lookupFromRegistry`, `getMenuItemsFromRegistry` and `getMenuPanelsFromRegistry` passed the wrong arguments and returned nothing.
  - Panels that read registered tabs through them now see those tabs.
  - `virtualRouteRedirect` (used by the console's login route) now redirects hidden `auth:login` pages on direct load.

---
## Need help?
- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
---
