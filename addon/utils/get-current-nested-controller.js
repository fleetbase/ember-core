import Controller from '@ember/controller';

export default function getCurrentNestedController(owner, fullRouteName) {
    if (!owner || !fullRouteName) return null;

    // strip engine mount prefix once
    const mount = owner.mountPoint; // e.g. "console.fleet-ops"
    let local = fullRouteName;
    if (mount && local.startsWith(mount + '.')) {
        local = local.slice(mount.length + 1);
    }

    // remove the last ".segment"
    const cut = local.lastIndexOf('.');
    const key = cut === -1 ? local : local.slice(0, cut);

    // look up the instance (controllers are singletons)
    const controller = owner.lookup(`controller:${key}`);
    return controller instanceof Controller ? controller : null;
}
