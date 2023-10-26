import { getOwner } from '@ember/application';

export default function injectEngineService(target, engineName, serviceName, key = null) {
    const owner = getOwner(target);
    const universe = owner.lookup('service:universe');
    const service = universe.getServiceFromEngine(engineName, serviceName);
    const effectiveServiceName = key || serviceName;

    Object.defineProperty(target, effectiveServiceName, {
        value: service,
        writable: false,
        configurable: true,
        enumerable: true,
    });
}
