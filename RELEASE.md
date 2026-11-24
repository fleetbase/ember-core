> v0.4.0 ~ "Runtime engines for the Fleetbase Extensions Registry"

---
## Highlights

- **Runtime engines.** A console can mount a prebuilt extension engine at boot without being rebuilt. Installing an extension from the Extensions Registry no longer rebuilds the console: the installer fetches the release's prebuilt engine and the console picks it up on the next load. `utils/runtime-engines` reads `GET ~registry/v1/engines/runtime` (served by registry-bridge 0.3.0). It then:
  - loads each engine's routes, host modules, config, asset bundle, extension loader and translations;
  - mounts it inside the existing `console` route.

  An engine that needs modules the console doesn't have is refused and logged, never half-mounted. See `docs/runtime-engines.md`. ([#99](https://github.com/fleetbase/ember-core/pull/99))
- **Engine release tooling** for publishers and the installer:
  - `fleetbase-build-engine-release` turns a built engine into a runtime release (`manifest.json`, `routes.js`, `host-app.js`, `extension.js`, `translations.json`);
  - `fleetbase-check-engine-compat` checks a release against a console's module list;
  - `fleetbase-host-modules` writes the console's module list (`host-modules.json`), which the installer uses for that check.

  Integration engines with no routes release too.
- **Installed-extension loading** (`loadInstalledExtensions`, the extension manager) lists runtime engines after the built-in ones, so a built-in engine always wins. The cached extension list is keyed on the runtime engines' names and versions, so an install, update or removal refreshes it.

---
## Upgrading

Ship this version together with the console's runtime-engine initializers (`load-runtime-engines`, `register-runtime-engines`) in fleetbase v0.9.0. Consoles without those initializers behave exactly as on 0.3.x: nothing calls the new code.

Extensions that ship prebuilt engine releases need nothing from this package at runtime. The bins are for building and checking releases (the Fleetbase CLI 2.0 calls them).

---
## Need help?
- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
---
