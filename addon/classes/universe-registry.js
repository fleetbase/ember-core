import { tracked } from '@glimmer/tracking';
import { TrackedMap } from 'tracked-built-ins';

/**
 * UniverseRegistry
 * 
 * A singleton registry class that stores all universe registrations.
 * This class is registered to the application container to ensure
 * the same registry instance is shared across the app and all engines.
 * 
 * Pattern inspired by RouteOptimizationRegistry - ensures registrations
 * persist across engine boundaries by storing data in the application
 * container rather than in service instances.
 * 
 * @class UniverseRegistry
 */
export default class UniverseRegistry {
    /**
     * TrackedMap of section name → TrackedObject with dynamic lists
     * Fully reactive - templates update when registries change
     * @type {TrackedMap<string, TrackedObject>}
     */
    @tracked registries = new TrackedMap();
}
