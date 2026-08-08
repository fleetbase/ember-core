# Defects found while building the test suite

Every item here was found by writing a test against existing behaviour, and every one is
**pinned by a test that asserts what the code does today** — not what it was meant to do.
Nothing has been fixed. Each pin fails the moment someone changes the behaviour, which is
the point at which the decision gets made.

Coverage at the time of writing (CI run 31245775305, commit `d6daf5d`):
**statements 3983/4025 (98.95%)**, branches 95.52%, functions 99.58%, lines 98.96%.
**2215 tests, 0 failing.** Every statement a test can reach is now covered — the 42
that remain are itemised below, and none of them can be reached by any input.

---

# ⛔ BLOCKING THE 100% COVERAGE GATE

**The gate cannot go green until the items in this section are fixed.** They are not
"hard to test" — they are **unreachable by any input**, so no test can execute them.
**Seven defects, ten statements.**

| # | file | lines | why no test can reach it |
|---|---|---|---|
| **B1** | `contracts/widget.js` | 239, 255 | `if (!this.options) { this.options = {}; }` — the constructor already assigns `this.options` on **both** of its paths, so the guard never fires |
| **B2** | `services/resource-action.js` | 209, 233 | `selected = [...spread]; if (!selected) return;` — a spread always produces an array and an array is always truthy |
| **B3** | `services/universe/menu-service.js` | 51 | `#wrapOnClickHandler` opens with `if (typeof onClick !== 'function') return onClick;` but its **only** caller already applies the same check |
| **B4** | `services/url-search-params.js` | 176 | `clear()`'s `return this;` is unreachable because the line above it assigns to a getter-only property and **throws every time** |
| **B5** | `utils/to-model.js` | 8, 10 | `ToModel.create()` has no owner, so `getOwner()` is `undefined` and `owner.lookup(...)` on the line above throws first |
| **B6** | `services/universe/hook-service.js` | 81 | `#getApplication`'s second priority is read only from a caller that runs **in the constructor** — before `setApplicationInstance` can have been called |
| **B7** | `services/filters.js` | 25 | `activeFilters` skips blank and managed params, but `getQueryParams()` has already dropped both — the `continue` can never run |

Full write-ups: B1 → #19, B2 → #16, B3 → #21, B4 → #1, B5 → #23, B6 → #18, B7 → #28.

### Fixing them is mechanical

Six of the seven are a deletion — guards and a duplicated filter that can never fire.
B6 is a reordering: move `#initializeHookRegistry()` out of the constructor, or drop the
second priority. B4 and B5 need a real decision, because the surrounding method is broken
anyway (see #1 and #23).

## ◻︎ Uncoverable, and *not* a defect — 32 statements

These also cannot be covered, need no fix, and are the only honest candidates for an
exclusion if the gate must be green without touching production code.

**`@tracked field = value` initialisers a constructor overwrites — 6 statements.**
`extension-manager:31`, `library/subject-custom-fields:15`, `contracts/base-contract:14`,
`abilities/dynamic:11`, `services/language:11-12`. A tracked field's initialiser only runs
if the property is **read before it is written**; each of these classes assigns the field
in its own constructor. An instrumentation artifact, not dead code.

**Fallbacks that need a container-less service — 12 statements.**
`extension-manager:94,95,99,100,101,105`, `registry-service:90,94,491,494,541`,
`hook-service:91`. All `if (!owner)` / `if (!application)` paths. Ember always supplies an
owner to a service built through the container, and the one substitute that would work —
replacing `owner.application` — breaks the test run, because Ember's own
`ApplicationInstance#willDestroy` reads `this.application._unwatchInstance` during teardown.

**Module-scope configuration — 2 statements.** `adapters/application:16` and
`services/fetch:23` both run at import time, long before a test can influence them.

**Browser routes that cannot be faked safely — 10 statements.** `utils/download.js:11,126,
160-173`. Reaching the no-URL/`btoa`/FileReader route means deleting `window.URL`, which
stalls QUnit's reporter and aborts the whole run; and line 126 assigns `location.href`,
which would navigate away from the test page. Every other path through that file is covered.

**A hook path the other one always wins — 2 statements.** `extension-manager:1096-1097`.
`#onEngineInstanceBuilt` schedules the engine-loaded hooks on `next()`, but the boot patch
runs first in every ordering a test can produce and clears them.

## Live defects

Reachable in production today, with user-visible consequences.

### 1. `url-search-params` cannot write anything — the whole mutation API is inert

```js
get urlParams() {
    return new URLSearchParams(window.location.search);
}
```

A **fresh** object on every access. Everything downstream follows:

| method | outcome |
|---|---|
| `setParam(k, v)` | mutates a throwaway, discarded on return — and still returns `this`, so it reads like a working chainable setter |
| `addParam` / `removeParam` | same |
| `clear()` | assigns to a getter-only property — **throws every time** *(blocker B4)* |
| `updateUrl()` | reads the same getter, so it writes the current URL back over itself and can never publish a change |

Only `getParam`, `all` and `has` work. Any caller doing `setParam(...)` then `updateUrl()`
is a no-op; any caller of `clear()` gets an exception.

*Pinned in* `tests/unit/services/url-search-params-branches-test.js`

### 2. `crud.bulkAction`'s success message prints the count twice

```js
`${count} ${pluralize(count, modelName)} were updated successfully.`
```

ember-inflector's two-argument `pluralize(count, word)` already returns `"<count> <word>"`,
so two selected orders produce **"2 2 Orders were updated successfully."** The
single-argument form is used correctly a few lines above.

*Pinned in* `tests/unit/services/crud-bulk-action-confirm-test.js`

### 3. The sandbox test key has never been sent — cross-package

`currentUser.setOption` dasherizes before storing, so `dev-engine`'s
`setOption('testKey', …)` lands under `<user>:test-key`. Both readers
(`adapters/application.js`, `services/fetch.js`) read `<user>:testKey`. They never matched,
so `Access-Console-Sandbox-Key` was never sent. `sandbox` dasherizes to itself, which is why
that half worked and masked it.

*Fixed earlier in this PR, before the flag-only directive.*

### 4. `filters.getQueryParams` breaks on Ember's mapped query-param form

A controller may rename a param — `queryParams: ['status', { category: 'cat' }]` — which is
the documented way to give a property a different name in the URL. `getQueryParams` hands
each entry straight to `get(controller, qp)`, which requires a string or number, so the
object entry fails Ember's assertion rather than being unwrapped. Any controller using the
mapped form cannot be filtered at all.

*Pinned in* `tests/unit/services/filters-actions-test.js`

### 5. `getMimeTypeFromResponse` needs a semicolon it usually will not get

```js
const results = /(.*)?;/.exec(contentType);
```

The regex requires a trailing semicolon, so `Content-Type: text/csv` — a header with no
parameters, the common case — matches nothing and the mime type stays null. `download()`
then falls through to `getMimeType(fileName)`, which returns the **extension** (see #24), so
the browser is handed `'csv'` where `'text/csv'` was meant.

*Pinned in* `tests/unit/services/fetch-upload-download-test.js`

### 6. A class registered as a renderable component loses its key

`registerRenderableComponent` computes the key correctly (`component.name` → `'OrderCard'`),
but `register` only stamps it when the value is an object:

```js
if (typeof value === 'object' && value !== null) {
    value._registryKey = key;
}
```

A class is a **function**, so the key is discarded, and `lookup` skips non-objects for the
same reason. The component is stored and nothing can retrieve it by name.

*Pinned in* `tests/unit/services/universe/registry-service-branches-test.js`

### 7. The universe facade calls six sub-service methods with the wrong arity

None throw — the sub-services return empty collections for unknown lists — so these APIs
silently never work:

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

### 8. `current-user.loadWhois` can never warn the user

`loadWhois` wraps `lookupUserIp` in a try/catch whose catch warns *"Unable to detect your
location"* and builds a fallback. But `lookupUserIp` absorbs every failure itself and
**returns** `getFallbackWhois()` rather than rejecting. On a network failure the catch never
runs and the warning never fires. The fallback is written twice and the outer copy is
unreachable by the path it was written for.

*(Reachable only if something after `lookupUserIp` throws — a storage write is the realistic
trigger, and that is what the pin uses.)*

*Pinned in* `tests/unit/services/current-user-whois-fallback-test.js`

### 9. `promiseCurrentUser` aborts and invalidates twice

The no-user branch aborts the transition, invalidates, then throws — but the throw is inside
the same `try`, so its own `catch` runs the identical abort-and-invalidate again before
rethrowing. Every failed authentication does both twice, and the second invalidation takes a
different code path.

*Pinned in* `tests/unit/services/session-flows-test.js`

### 10. `getSessionSecondsRemaining` has its operands reversed

`Math.round((now - date) / 1000)` — a session that has **not** expired reports a negative
number; an expired one reports positive.

*Pinned in* `tests/unit/services/session-behaviour-test.js`

### 11. `crud.import` cannot accept a file

The default `uploadQueue` is a plain `[]`, but `queueFile`, `removeFile` and `confirm` all
call `pushObject` / `removeObject` / `objectAt` on it. With prototype extensions off (the
Octane default) all three throw. `A([])` fixes all three; callers who pass their own Ember
array get through.

*Pinned in* `tests/unit/services/crud-import-queue-test.js`

### 12. Helper instantiation depends on how the helper was written

```js
typeof value !== 'function' || value.prototype
```

Never a boolean for a function. An arrow function has no prototype → `undefined` (not
instantiated). An equivalent `function` declaration has one → instantiated as if it were a
class. Two behaviourally identical helpers register differently based only on syntax.

*Pinned in* `tests/unit/services/universe/registry-service-helpers-test.js`

### 13. `chat.rememberOpenedChannel` discards the rest of the list

```js
if (isArray(openedChats) && !openedChats.includes(id)) { append }
else { openedChats = [id] }
```

The `else` serves two unrelated cases — a corrupted cache, and the id already being present.
In the second it replaces the whole list with that one id. Latent today only because
`openChannel` returns early for an already-open channel.

*Pinned in* `tests/unit/services/chat-recall-test.js`

### 14. `subject-custom-fields.writeFieldValue` checks its guard too late

```js
this.setFieldValue(value, customField);
const fieldId = typeof customField === 'string' ? customField : customField?.id;
if (!fieldId || !resource) return;
```

The optional chaining shows a null field was anticipated, but `setFieldValue` has already run
and reaches `customFieldOrId.id` unguarded — so the method throws one line before consulting
its own guard.

*Pinned in* `tests/unit/library/subject-custom-fields-edges-test.js`

### 15. The content-disposition header overrides a caller-supplied filename

`getFilenameFromResponse(response, defaultFilename)` applies the header over the top whenever
one is present, so a caller cannot force a name for a response that supplies its own. Named
as a default, behaves as an override.

*Pinned in* `tests/unit/services/fetch-upload-download-test.js`

### 28. `filters.activeFilters` filters a list that is already filtered — **⛔ BLOCKER B7**

```js
for (let queryParam in this.getQueryParams()) {
    const value = get(queryParams, queryParam);
    if (isBlank(value) || this.managedQueryParams.includes(queryParam)) {
        continue;
    }
```

`getQueryParams()` — called with no controller, so taking the route path — has already
dropped both: it skips managed params and only adds a value `if (value)`. The `continue`
can never run, and the filtering is duplicated one layer apart.

*Pinned in* `tests/unit/final-branches-test.js`

---

## Dead code

Cannot execute. **B1–B6 above are drawn from this section** — the rest were reachable with a
contrived-but-legitimate input and are now covered.

### 16. `resource-action`'s selection guards — **⛔ BLOCKER B2**

```js
selected = [...(isArray(selected) ? selected : []), ...tableRows];
if (!selected) return;
```

A spread always produces an array and an array is always truthy. `export` has the identical
pair. An empty selection is dispatched to `crud` as `[]` rather than skipped.

### 17. `is-equal`'s arity guard

`assert('… requires two property names …', params.length === 2)` can never fire:
`isEqual(propNameA, propNameB)` forwards both parameters unconditionally, so `params` is
always `['a', undefined]`, never `['a']`. A caller passing one name gets Ember's low-level
*"computed property key must be a string"* instead.

*(Covered — the pin applies the decorator by hand. The decorator is separately non-functional:
applying it manually yields a working ComputedProperty, so only the installation is broken.)*

### 18. `hook-service`'s second-priority application — **⛔ BLOCKER B6**

`#getApplication` lists `this.applicationInstance` second, but its only caller runs in the
**constructor** — before `setApplicationInstance` can have been called — so the field is
always still its `null` default.

### 19. `Widget`'s options guards — **⛔ BLOCKER B1**

`withTitle` and `withRefreshInterval` each open with `if (!this.options) { this.options = {}; }`,
but the constructor assigns `this.options` on both of its paths.

### 20. `auto-serialize`'s serializer dispatch reads the wrong property

```js
const invoke = (context, method, ...params) => {
    if (typeof context.method === 'function') {   // not context[method]
        return context.method(...params);
    }
    return null;
};
```

It reads a property named *literally* `method`. `toJSON`, `toJson` and `serialize` are never
called on a related record — every one falls through to the recursive walk, which produces a
reasonable result, which is why it went unnoticed. Worse: a model that happens to carry a
property called `method` gets **that** invoked.

*(Covered — the pin registers a model with a `method` property, which is the only way in.)*

### 21. `menu-service.#wrapOnClickHandler`'s own guard — **⛔ BLOCKER B3**

Opens with `if (typeof onClick !== 'function') return onClick;` but its only caller already
applies the same check before calling it.

### 22. `auto-serialize`'s fleet/zone patches read a removed private path

`get(model, '_internalModel.modelName')` is `undefined` in ember-data 4.12, so neither
`except.push('drivers')` nor `except.push('service_area')` can fire. They also push onto the
**caller's** array rather than a copy.

*(Covered — the pin supplies the removed path with `Object.defineProperty`.)*

### 23. `to-model.js` always throws — **⛔ BLOCKER B5**

`ToModel.create()` has no owner, so `getOwner()` returns `undefined` and `owner.lookup(...)`
throws on every call. There are no call sites in this addon.

---

## Latent and behavioural

### 24. `MenuItem`'s constructor shadows its own `onClick` method

`MenuItem` declares `onClick(handler)` as a chaining setter **and** its constructor assigns
`this.onClick = null`. Every instance shadows the method with a null field, so
`item.onClick(fn)` throws. Two live entry points hit it: `menu-service`'s `#normalizeMenuItem`
and `universe._createMenuItem`. Calling it off the prototype shows the method itself is
correct — only unreachable.

### 25. The two account-menu getters do not separate the two menus

`getOrganizationMenuItems` and `getUserMenuItems` are byte-identical and each return the whole
`console:account` registry unfiltered — so the organization menu lists user items and vice
versa. Registration deliberately namespaces the keys (`organization:<slug>` / `user:<slug>`),
and the registry already does prefix filtering, so the fix is available.

### 26. Smaller pinned behaviours

- `registerMenuItem` defaults `slug` to `'~'` rather than deriving it from the title, so an
  item registered into a custom registry cannot be looked up by its title slug.
- `virtualRouteRedirect` collects query params and passes them as a **third** argument to a
  two-parameter method, so they are silently dropped.
- `replace-table-row.js` — `if (rowIndex)` skips a match at index 0, and a missing row (`-1`)
  is truthy and splices at `-1`.
- `get-mime-type` returns the **extension**, not a mime type, and `'doc'` matches before
  `'docx'` due to key order. (This is what makes #5 user-visible.)
- `custom-fields-registry`'s `panel.create` merges `saveOptions` then spreads `...options`
  last, which restores the raw value and drops both the merge and the refresh callback.
- `sameIds` is called with a key string where an options object is expected; the defaults
  happen to match, so it is correct **by coincidence**.
- `loadSubjectCustomFields` swallows its own failure — a caller cannot distinguish a failed
  load from a subject with no custom fields.
- `crud.modelName` is a **fallback**, not an override: a real model's `constructor.modelName`
  always wins, so `crud.delete(record, { modelName: 'x' })` ignores the option.
- Always-true no-argument utils: `ison`, `reverse-point`, `is-function`, `hason-structure`,
  `leaflet-points-from-coordinates`.
- `decorators/legacy-from-store.js` is byte-identical to `from-store.js`.
- `legacy-fetch-from`'s `null` default is shadowed by a native class field, so the "not loaded
  yet" sentinel reads `undefined` rather than `null`.

---

## Fixed earlier in this PR

Corrected before the flag-only directive, each with a regression test: `is-waypoint-record`
(imported a nonexistent model and wedged the whole suite), `group-by`, `get-mime-type` and
`auto-serialize` array handling, `extract-coordinates` (set latitude where it meant longitude),
`context-component-callback` (crashed on `options: null`), the four host-coupled URL utils,
`app-cache.has()/doesntHave()` (always true/false), `notifications.serverError` (crashed on a
null error), `consoleUrl` (built `https:///path`), `get-model-name`'s list fallback,
`custom-fields-registry`'s dead `set`/`get` proxies and missing `initialize`, seven app-tree
re-exports that dropped every named export, and `fetch.normalizeModel` / `fetch.request`
reading `.firstObject` off plain arrays.
