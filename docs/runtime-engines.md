# Runtime engines

A runtime engine is a prebuilt engine release that the console mounts at boot without being rebuilt. This is Outcome A of decision D3 in the Extensions Registry plan (Workstream H). The spike that settled it ran Pallet 0.0.2 on console 0.7.69 with ember-ui 0.4.6.

## What a console build does for an engine

Copying `engines-dist/<name>/` into a console that was built without the engine does not mount it. The build also does seven things in the host, and a release has to carry the output of each:

| Build-time step | Where the build puts it | Release artifact | Runtime replacement (`utils/runtime-engines.js`) |
| --- | --- | --- | --- |
| Router mount | generated `app/router.js` | `runtime.mount` in `manifest.json` | wrap the generated router map's DSL callback and add `mount()` inside the existing `console` route (or before `catch` for root mounts). A second `Router.map()` that declares `console` again replaces that route's children, so it can't be used. |
| Engine route map (`<name>/routes`) | host `vendor.js` | `routes.js` | evaluated before boot |
| Engine `app/` tree re-exported as `@fleetbase/console/*` (models, adapters, components…) | host app bundle | `host-app.js` | evaluated before boot; a module is only defined when the host doesn't already define that name |
| Engine config | `<meta name="<name>/config/environment">` | `runtime.config` | meta tag appended before boot |
| Asset-manifest bundle | `<meta name="@fleetbase/console/config/asset-manifest">` | `runtime.bundle` (paths relative to the release) | `assetLoader.pushManifest()` after `load-asset-manifest` |
| `addon/extension.js` loader | `app/extensions/<route>.js` + `EXTENSION_LOADERS` | `extension.js` (standalone `<name>/extension`) | the extension manager falls back to a runtime loader |
| Translations | merged into host `ember-intl/translations` | `translations.json` | `intl.addTranslations()` at instance boot |

The engine's own copy of `ember-intl/translations` inside `engine-vendor.js` does nothing. loader.js ignores a `define()` of a module that has already been instantiated.

## Boot sequence

1. `load-runtime-config` (console initializer) loads `fleetbase.config.json` and exposes the promise as `application.runtimeConfigLoaded`.
2. `load-runtime-engines` (console initializer) defers readiness and calls `prepareRuntimeEngines(application)`, which:
   1. fetches `GET ~registry/v1/engines/runtime`. A missing endpoint counts as an empty list.
   2. skips engines that are built into this console (their config meta or `<name>/routes` already exists).
   3. checks each engine's required modules against loader.js. It refuses an engine with missing modules and logs the refusal (see the compatibility section below).
   4. appends the config meta, loads `routes.js` and `host-app.js` with script elements (no eval, so a strict CSP keeps working), and fetches `translations.json`.
   5. wraps the router map.
3. `register-runtime-engines` (console instance-initializer, after `load-asset-manifest` and before `load-extensions`) pushes the bundles, adds the translations and registers the extension loaders.
4. `loadInstalledExtensions(core, getRuntimeEngines())` lists runtime engines after the build-time ones. If the build already has an engine, its build-time entry wins. The localStorage extensions cache is keyed on the runtime list's signature (`name@version,…`), so an install, update or removal invalidates it.

## Runtime manifest (`GET ~registry/v1/engines/runtime`)

```json
{
  "engines": [
    {
      "name": "@fleetbase/pallet-engine",
      "version": "0.0.2",
      "baseUrl": "/engines-dist/@fleetbase/pallet-engine/",
      "mount": { "as": "pallet", "path": "pallet", "root": false },
      "bundle": { "assets": [{ "uri": "assets/engine.js", "type": "js" }], "dependencies": [] },
      "config": { "modulePrefix": "@fleetbase/pallet-engine" },
      "routes": "routes.js",
      "hostApp": "host-app.js",
      "translations": "translations.json",
      "extension": "extension.js",
      "manifest": "manifest.json"
    }
  ]
}
```

Each entry is the release's `manifest.json` `runtime` block plus `name`, `version`, `baseUrl` and `manifest`. Relative paths resolve against `baseUrl`. `extension` is either the standalone module's path, `true` (load the bundle and require `<name>/extension` from it), or `false` (the engine has no extension). An optional `requires` array inlines the module list, which saves the browser fetching `manifest.json`. The endpoint has to answer signed-out requests. The route map is built once at boot, before anyone signs in.

## Building a release

```sh
fleetbase-build-engine-release --console ../console --engine @fleetbase/pallet-engine --out ./releases
# or extract from a build you already have:
fleetbase-build-engine-release --console ../console --engine @fleetbase/pallet-engine --dist ../console/dist --out ./releases
```

The console checkout must have the engine installed. The tool writes `<out>/<name>/` with the `engines-dist` folder (source maps only with `--keep-maps`), the four artifacts above, and `manifest.json`:

- `name`, `version`, `builtWith` (console version and environment)
- `builtAgainst`: the versions of `@fleetbase/ember-ui` and `@fleetbase/ember-core`, plus ember-source, ember-engines, ember-data, ember-intl and ember-auto-import
- `runtime`: the entry the API serves (see the runtime manifest above)
- `requires.modules`: every host module the bundle imports or aliases. `requires.aliases` is the subset that comes from `define.alias()`. `requires.unresolved` lists names the build host didn't define either; Pallet has five such dangling references. Those can never be resolved and are never needed, so they are not checked.
- `files`: the sha256 of every file

The build refuses an engine that adds initializers to the host, because a runtime engine can't run them. It also leaves out an `app/` file that compiled to another addon's module of the same name. Pallet 0.0.2 has seven of these (copies of storefront and starter files in its `app/`); shipping them would replace storefront's modules in a host that has storefront.

## Compatibility and the version pin

ember-engines dedupes shared addons by their package.json cache key. As a result, an engine bundle contains no ember-ui or ember-core code. It holds `define.alias()` entries for every module of the ember-ui and ember-core versions it was built against (457 + 142 for Pallet), and component lookups inside the engine do not fall back to the host's registry. In the spike:

- An engine built against a newer ember-ui than the host's failed with `Could not find module '<name>/components/…'` the first time a page used one of the 16 modules the host lacked.
- An engine whose templates use components missing from the ember-ui it was built against failed with `Attempted to resolve '…', expected to be a component, but nothing was found`, even though the host had those components.
- With the same versions on both sides, everything resolved.

The check is therefore a set difference: `requires.modules` minus the modules the host defines. Run against the spike's builds, it reports exactly the modules that broke at runtime. It runs in three places:

- **Installer:** `fleetbase-check-engine-compat --manifest <release>/manifest.json --host <console dist or host-modules.json> [--policy minor|exact|modules]`. Exit code 1 means refuse. Production console builds write `dist/host-modules.json` (the module list plus the pinned versions) from `lib/fleetbase-extensions-generator`, and `fleetbase-host-modules --dist … --console …` writes it for any build. The PHP installer can do the same diff over those two JSON files without Node.
- **Policy:** the default `minor` refuses a different major.minor of ember-ui or ember-core even when every module exists, because modules with the same name can change their arguments and behaviour within a minor, and the module check can't see that. Other recorded packages are refused only on a different major. `modules` checks module names only.
- **Browser:** `prepareRuntimeEngines` repeats the module check against loader.js on every boot, so a console upgraded after the install refuses an engine it can no longer run instead of breaking on the first page that uses it. It does not repeat the version check, because the browser does not know the host's versions.

Releases therefore need a build per supported ember-ui/ember-core minor. `compat.console` in the registry should state that minor.

## Lazy loading

A built-in lazy engine's `extension.js` is compiled into the host, so the engine bundle (13.7 MB for Pallet in development) is only fetched when a route or widget needs the engine. A runtime engine has no host copy. Requiring `<name>/extension` from the bundle would mean fetching the whole bundle at boot for every runtime engine, even on the login page. That cost is the lost lazy-engine deferral.

The build keeps the deferral when it can by shipping `<name>/extension` on its own as `extension.js`. That is only possible when the module imports nothing from the engine itself. Every current `extension.js` meets this, because the generator already copies it into the host where engine-relative imports would not resolve. When it does import from the engine, `runtime.extension` is `true` and the bundle loads at boot.

At boot a runtime engine therefore costs `routes.js` (9 KB for Pallet), `host-app.js` (250 KB unminified, 490 modules), `extension.js` (14 KB) and `translations.json` (25 KB). The end-to-end test checks that the bundle is not fetched until the engine is used.

## Other constraints

- `baseUrl` defaults to `/engines-dist/<name>/`. Absolute URLs inside the engine's CSS still point there, so serve releases from that path. A CDN base works only for engines whose CSS uses relative URLs.
- Releases carry their own fingerprinted asset names; the host's fingerprint pass never sees them.
- `mount.as` should match the route the engine was built for. `config.mountedEngineRoutePrefix` comes from the build.
- Every release duplicates about 7.2 MB of `ember-intl/translations` in `engine-vendor.js`. This was already the case for every engine before runtime engines; removing it from engine builds is a separate fix.

## Tests

- `tests/unit/utils/runtime-engines-test.js` and the cache, installed-list and extension-manager tests run in the QUnit suite.
- `node-tests/*.test.js` (`pnpm run test:node`, run in CI) cover the scanner, the release extractor, the compat check and the CLIs, using a fixture console build.
- `node-tests/runtime-engines-mount.test.js` is the end-to-end proof. It boots a real console dist built without the engine in headless Chrome, serves the release next to it with a stub API, and checks the mount, routes, host modules, asset manifest, config meta, translations, extension setup, that the bundle stays lazy and that the engine boots. A second run checks that a release requiring a missing module is refused and not mounted. It needs two builds, so CI skips it:

  ```sh
  RUNTIME_ENGINES_HOST_DIST=<console dist built without the engine> \
  RUNTIME_ENGINES_RELEASE=<out>/@fleetbase/pallet-engine \
  RUNTIME_ENGINES_CONSOLE=<console checkout, to inject this checkout's sources into an older host build> \
  node --test node-tests/runtime-engines-mount.test.js
  ```
