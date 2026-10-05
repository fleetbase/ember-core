> v0.3.25 ~ "Resource view registries, 100% test coverage, and the fixes it turned up"

---
## Highlights

- **Resource view registries.** Extensions can add columns, row actions, bulk actions and toolbar buttons to any engine's table views, and header buttons and menu items to its details views. Names follow `<extension>:<resource>:<surface>:<slot>`, for example `fleet-ops:driver:table:columns` or `ledger:invoice:details:menu`.
  - New contracts: `TableColumn`, `ResourceAction` and `ActionButton`.
  - New service: `universe/resource-view-service`, reached as `universe.getService('resource-view')`.
  - New `ResourceActionService` helpers: `tableRegistry`, `detailsRegistry`, `mergeRegisteredColumns()` and `queryParamsFor()`.
  - Guide: [Resource views](https://fleetbase.io/docs/extension-development/resource-views).
  - Rendering ships in fleetbase/ember-ui v0.4.5.
- **Verified 100% test coverage.** Statements, branches, functions and lines are all at 100%, checked per file by a CI gate, with results on Codecov. Writing the tests turned up a number of defects; the fixes are listed below.
- **Fixes found while writing the tests:**
  - `crud`:
    - bulk-action messages no longer print the count twice;
    - the import dialog accepts files;
    - a `modelName` option now overrides the model's own name.
  - `fetch`:
    - a bare `Content-Type` such as `text/csv` is read correctly;
    - a filename the caller passes wins over the `content-disposition` header;
    - `cachedGet` expires a month-old cache.
  - `filters` understand Ember's mapped query params.
  - The organization and user account menus no longer show each other's items.
  - Sign-in failures abort and invalidate once, and the session's seconds remaining is positive until it expires.
  - The user is warned when their location cannot be detected.
  - Reopening a chat keeps the other open chats.
  - Menu items registered by title no longer replace each other.
  - `MenuItem`'s chaining click setter is now `withOnClick()`.
  - `loadSubjectCustomFields` rejects when loading fails, so callers can tell a failure from a subject with no custom fields.
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
