> v0.4.0 (in progress) ~ "Runtime engines for the Fleetbase Extensions Registry"

---
## Status
This release is assembled on `release/v0.4.0` and ships together with the Fleetbase Extensions Registry v2 (registry, registry-bridge, fleetbase-cli, registry-infra and the console). Nothing in it merges to `main` until the registry project is complete. Patch releases (`v0.3.x`) continue from `main` in the meantime; merge `main` into this branch to keep it current.

---
## Highlights (planned)
- **Runtime engines.** Mount prebuilt extension engine releases in a console that was built without them, so installing an extension no longer rebuilds the console. Adds `utils/runtime-engines`, the `build-engine-release` and `check-engine-compat` bins, and the host module list used by the installer's compatibility check. ([#99](https://github.com/fleetbase/ember-core/pull/99))

---
## Upgrading
To be written at release time. Consoles must ship this version together with the console's runtime-engine initializers (fleetbase/fleetbase#730); the initializers import `@fleetbase/ember-core/utils/runtime-engines`, which earlier versions do not have.

---
## Need help?
- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
---
