import { tracked } from '@glimmer/tracking';

/**
 * HookRegistry
 * 
 * Shared registry object for application hooks.
 * Registered as a singleton in the application container to ensure
 * all HookService instances (app and engines) share the same hooks.
 * 
 * @class HookRegistry
 */
export default class HookRegistry {
    /**
     * Map of hook names to arrays of hook objects
     * @type {Object}
     */
    @tracked hooks = {};
}
