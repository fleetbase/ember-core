# Defects found while building the test suite

Every item below was found by writing a test against existing behaviour, and every
one is **pinned by a test that asserts what the code does today** — not what it was
meant to do. Nothing here has been fixed. The tests will fail the moment someone
changes the behaviour, which is the point at which each decision gets made.

Seven of these are **dead code**: no input can reach them. Those are marked
**BLOCKS COVERAGE** — the statements cannot be covered by any test until the defect
is fixed, so the 100% gate depends on them.

Severity is a judgement call, not a process artefact:

- **live** — reachable in production today, with user-visible consequences
- **latent** — a real defect, but nothing in the codebase currently reaches it
- **dead** — the code cannot execute at all

---

## Live

### 1. `url-search-params` cannot write anything — the whole mutation API is inert

```js
get urlParams() {
    return new URLSearchParams(window.location.search);
}
```

A **fresh** object on every access. Consequences:

| method | outcome |
|---|---|
| `setParam(k, v)` | mutates a throwaway, discarded on return — but still returns `this`, so it reads like a working chainable setter |
| `addParam` / `removeParam` | same |
| `clear()` | assigns to a getter-only property — **throws every time** |
| `updateUrl()` | reads the same getter, so it writes the current URL back over itself and can never publish a change |

Only `getParam`, `all` and `has` work. Any caller doing `setParam(...)` then
`updateUrl()` is a no-op; any caller of `clear()` gets an exception.

*Pinned in* `tests/unit/services/url-search-params-branches-test.js`

### 2. `crud.bulkAction`'s success message prints the count twice

```js
const successMessage = options?.successNotification ?? `${count} ${pluralize(count, modelName)} were updated successfully.`;
```

ember-inflector's two-argument `pluralize(count, word)` already returns
`"<count> <word>"`. Two selected orders produce **"2 2 Orders were updated
successfully."** The single-argument form is used correctly a few lines above.

*Pinned in* `tests/unit/services/crud-bulk-action-confirm-test.js`

### 3. The sandbox test key was never sent — cross-package

`currentUser.setOption` dasherizes before storing, so `dev-engine`'s
`setOption('testKey', …)` lands under `<user>:test-key`. Both readers
(`adapters/application.js`, `services/fetch.js`) read `<user>:testKey`. They never
matched, so `Access-Console-Sandbox-Key` has never been sent. `sandbox` dasherizes
to itself, which is why that half worked and masked it.

*(Fixed earlier in this PR, before the flag-only directive was given.)*

### 4. `filters.getQueryParams` breaks on Ember's mapped query-param form

A controller may rename a param — `queryParams: ['status', { category: 'cat' }]` —
which is the documented way to give a property a different name in the URL.
`getQueryParams` hands each entry straight to `get(controller, qp)`, which requires
a string or number, so the object entry fails Ember's assertion rather than being
unwrapped. Any controller using the mapped form cannot be filtered at all.

*Pinned in* `tests/unit/services/filters-actions-test.js`

### 5. A class registered as a renderable component loses its key

`registerRenderableComponent` computes the key correctly (`component.name` →
`'OrderCard'`), but `register` only stamps it onto the value when the value is an
object:

```js
if (typeof value === 'object' && value !== null) {
    value._registryKey = key;
}
```

A class is a **function**, so the key is discarded, and `lookup` skips non-objects
for the same reason. The component is stored and nothing can retrieve it by name.
An equivalent plain object works.

*Pinned in* `tests/unit/services/universe/registry-service-branches-test.js`

### 6. The universe facade calls six sub-service methods with the wrong arity

None throw — the sub-services return empty collections for unknown lists — so these
APIs silently never work:

| facade method | forwards as | effect |
|---|---|---|
| `registerInRegistry(name, key, value)` | `register(section, list, key, value)` | **value lost** |
| `getRegistry(name)` | `getRegistry(section, list)` | always empty |
| `lookupFromRegistry(name, key)` | `lookup(section, list, key)` | never matches |
| `getMenuItemsFromRegistry(name)` | as above | always empty |
| `getMenuPanelsFromRegistry(name)` | folds list into section as `name:panels` | always empty |
| `dashboardWidgets` getter | `getWidgets()` with no dashboard | always empty |

`lookupMenuItemFromRegistry` is affected transitively.

*Pinned in* `tests/unit/services/universe-delegation-test.js`

### 7. `current-user.loadWhois` can never warn the user

`loadWhois` wraps `lookupUserIp` in a try/catch whose catch warns *"Unable to detect
your location"* and builds a fallback. But `lookupUserIp` absorbs every failure
itself and **returns** `getFallbackWhois()` rather than rejecting. On a network
failure the catch never runs and the warning never fires. The fallback is written
twice, and the outer copy is unreachable by the path it was written for.

*Pinned in* `tests/unit/services/current-user-whois-fallback-test.js`

### 8. `promiseCurrentUser` aborts and invalidates twice

The no-user branch aborts the transition, invalidates, then throws — but the throw is
inside the same `try`, so its own `catch` runs the identical abort-and-invalidate
again before rethrowing. Every failed authentication does both twice, and the second
invalidation takes a different code path.

*Pinned in* `tests/unit/services/session-flows-test.js`

### 9. `getSessionSecondsRemaining` has its operands reversed

`Math.round((now - date) / 1000)` — a session that has **not** expired reports a
negative number, an expired one reports positive.

*Pinned in* `tests/unit/services/session-behaviour-test.js`

### 10. `crud.import` cannot accept a file

The default `uploadQueue` is a plain `[]`, but `queueFile`, `removeFile` and
`confirm` all call `pushObject` / `removeObject` / `objectAt` on it. With prototype
extensions off (the Octane default) all three throw. `A([])` fixes all three;
callers who pass their own Ember array get through.

*Pinned in* `tests/unit/services/crud-import-queue-test.js`

### 11. Helper instantiation depends on how the helper was written

```js
typeof value !== 'function' || value.prototype
```

Never a boolean for a function. An arrow function has no prototype → `undefined`
(not instantiated). An equivalent `function` declaration has one → instantiated as
if it were a class. Two behaviourally identical helpers register differently based
only on syntax.

*Pinned in* `tests/unit/services/universe/registry-service-helpers-test.js`

### 12. `chat.rememberOpenedChannel` discards the rest of the list

```js
if (isArray(openedChats) && !openedChats.includes(id)) { append }
else { openedChats = [id] }
```

The `else` serves two unrelated cases — a corrupted cache, and the id already being
present. In the second it replaces the whole list with that one id. Latent today
only because `openChannel` returns early for an already-open channel.

*Pinned in* `tests/unit/services/chat-recall-test.js`

### 13. `subject-custom-fields.writeFieldValue` checks its guard too late

```js
this.setFieldValue(value, customField);
const fieldId = typeof customField === 'string' ? customField : customField?.id;
if (!fieldId || !resource) return;
```

The optional chaining shows a null field was anticipated, but `setFieldValue` has
already run and reaches `customFieldOrId.id` unguarded — so the method throws one
line before consulting its own guard.

*Pinned in* `tests/unit/library/subject-custom-fields-edges-test.js`

---

## Dead code — BLOCKS COVERAGE

These cannot be reached by any input. Their statements are uncoverable until fixed.

### 14. `auto-serialize`'s serializer dispatch reads the wrong property

```js
const invoke = (context, method, ...params) => {
    if (typeof context.method === 'function') {   // not context[method]
        return context.method(...params);
    }
    return null;
};
```

It reads a property named *literally* `method`. `toJSON`, `toJson` and `serialize`
are never called on a related record — every one falls through to the recursive
walk, which produces a reasonable result, which is why it went unnoticed. Worse: a
model that happens to carry a property called `method` gets **that** invoked.

### 15. `auto-serialize`'s fleet/zone patches read a removed private path

`get(model, '_internalModel.modelName')` is `undefined` in ember-data 4.12, so
neither `except.push('drivers')` nor `except.push('service_area')` can fire. They
also push onto the **caller's** array rather than a copy.

### 16. `resource-action`'s selection guards

```js
selected = [...(isArray(selected) ? selected : []), ...tableRows];
if (!selected) return;
```

A spread always produces an array and an array is always truthy. `export` has the
identical pair. An empty selection is dispatched to `crud` as `[]` rather than
skipped.

### 17. `is-equal`'s arity guard

`assert('… requires two property names …', params.length === 2)` can never fire:
`isEqual(propNameA, propNameB)` forwards both parameters unconditionally, so
`params` is always `['a', undefined]`, never `['a']`. A caller passing one name gets
Ember's low-level *"computed property key must be a string"* instead.

*(The decorator is separately non-functional — applying it by hand yields a working
ComputedProperty, so only the installation is broken.)*

### 18. `hook-service`'s second-priority application

`#getApplication` lists `this.applicationInstance` second, but its only caller runs
in the **constructor** — before `setApplicationInstance` can have been called — so
the field is always still its `null` default.

### 19. `Widget`'s options guards

`withTitle` and `withRefreshInterval` each open with `if (!this.options) {
this.options = {}; }`, but the constructor assigns `this.options` on both paths.

### 20. `menu-service.#wrapOnClickHandler`'s own guard

Opens with `if (typeof onClick !== 'function') return onClick;` but its only caller
already applies the same check before calling it.

---

## Latent and behavioural

### 21. `MenuItem`'s constructor shadows its own `onClick` method

`MenuItem` declares `onClick(handler)` as a chaining setter **and** its constructor
assigns `this.onClick = null`. Every instance shadows the method with a null field,
so `item.onClick(fn)` throws. Two live entry points hit it: `menu-service`'s
`#normalizeMenuItem` and `universe._createMenuItem`. Calling it off the prototype
shows the method itself is correct — only unreachable.

### 22. The two account-menu getters do not separate the two menus

`getOrganizationMenuItems` and `getUserMenuItems` are byte-identical and each return
the whole `console:account` registry unfiltered — so the organization menu lists user
items and vice versa. Registration deliberately namespaces the keys
(`organization:<slug>` / `user:<slug>`), and the registry already does prefix
filtering, so the fix is available.

### 23. Smaller pinned behaviours

- `registerMenuItem` defaults `slug` to `'~'` rather than deriving it from the title,
  so an item registered into a custom registry cannot be looked up by its title slug.
- `virtualRouteRedirect` collects query params and passes them as a **third**
  argument to a two-parameter method, so they are silently dropped.
- `to-model.js` — `ToModel.create()` has no owner, so `getOwner()` is undefined and
  it always throws. No call sites in this addon.
- `replace-table-row.js` — `if (rowIndex)` skips a match at index 0, and a missing
  row (`-1`) is truthy and splices at `-1`.
- `get-mime-type` returns the **extension**, not a mime type, and `'doc'` matches
  before `'docx'` due to key order.
- `custom-fields-registry`'s `panel.create` merges `saveOptions` and then spreads
  `...options` last, which restores the raw value and drops both the merge and the
  refresh callback.
- `sameIds` is called with a key string where an options object is expected; the
  defaults happen to match, so it is correct **by coincidence**.
- `loadSubjectCustomFields` swallows its own failure — a caller cannot distinguish a
  failed load from a subject with no custom fields.
- Always-true no-argument utils: `ison`, `reverse-point`, `is-function`,
  `hason-structure`, `leaflet-points-from-coordinates`.
- `addon/decorators/legacy-from-store.js` is byte-identical to `from-store.js`.
- `legacy-fetch-from`'s `null` default is shadowed by a native class field, so the
  "not loaded yet" sentinel reads `undefined` rather than `null`.

---

## Fixed earlier in this PR

These were corrected before the flag-only directive, and each has a regression test:
`is-waypoint-record` (imported a nonexistent model and wedged the whole suite),
`group-by`, `get-mime-type` and `auto-serialize`'s array handling, `extract-coordinates`
(set latitude where it meant longitude), `context-component-callback` (crashed on
`options: null`), the four host-coupled URL utils, `app-cache.has()/doesntHave()`
(always true/false), `notifications.serverError` (crashed on a null error),
`consoleUrl` (built `https:///path`), `get-model-name`'s list fallback,
`custom-fields-registry`'s dead `set`/`get` proxies and missing `initialize`, seven
app-tree re-exports that dropped every named export, and `fetch.normalizeModel` /
`fetch.request` reading `.firstObject` off plain arrays.
