import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { getOwner } from '@ember/application';
import Hook from '../../contracts/hook';
import HookRegistry from '../../contracts/hook-registry';

/**
 * HookService
 * 
 * Manages application lifecycle hooks and custom event hooks.
 * Allows extensions to inject logic at specific points in the application.
 * 
 * @class HookService
 * @extends Service
 */
export default class HookService extends Service {
    @tracked applicationInstance = null;

    constructor() {
        super(...arguments);
        // Initialize shared hook registry
        this.hookRegistry = this.#initializeHookRegistry();
    }

    /**
     * Set the application instance
     * 
     * @method setApplicationInstance
     * @param {Application} application The root application instance
     */
    setApplicationInstance(application) {
        this.applicationInstance = application;
    }

    /**
     * Initialize shared hook registry singleton
     * Ensures all HookService instances share the same hooks
     * 
     * @private
     * @returns {HookRegistry}
     */
    #initializeHookRegistry() {
        const registryKey = 'registry:hooks';
        const application = this.#getApplication();
        
        if (!application.hasRegistration(registryKey)) {
            application.register(registryKey, new HookRegistry(), { 
                instantiate: false 
            });
        }
        
        return application.resolveRegistration(registryKey);
    }

    /**
     * Get the application instance
     * Tries multiple fallback methods to find the root application
     * 
     * @private
     * @returns {Application}
     */
    #getApplication() {
        // First priority: use applicationInstance if set
        if (this.applicationInstance) {
            return this.applicationInstance;
        }

        // Second priority: window.Fleetbase
        if (typeof window !== 'undefined' && window.Fleetbase) {
            return window.Fleetbase;
        }
        
        // Third priority: try to get application from owner
        const owner = getOwner(this);
        if (owner && owner.application) {
            return owner.application;
        }
        
        // Last resort: return owner itself (might be EngineInstance)
        return owner;
    }

    /**
     * Getter and setter for hooks property
     * Delegates to the shared hookRegistry object
     */
    get hooks() {
        return this.hookRegistry.hooks;
    }

    set hooks(value) {
        this.hookRegistry.hooks = value;
    }

    /**
     * Find a specific hook
     * 
     * @private
     * @method #findHook
     * @param {String} hookName Hook name
     * @param {String} hookId Hook ID
     * @returns {Object|null} Hook or null
     */
    #findHook(hookName, hookId) {
        const hookList = this.hooks[hookName] || [];
        return hookList.find(h => h.id === hookId) || null;
    }

    /**
     * Normalize a hook input to a plain object
     * 
     * @private
     * @method #normalizeHook
     * @param {Hook|String} input Hook instance or hook name
     * @param {Function} handler Optional handler
     * @param {Object} options Optional options
     * @returns {Object} Normalized hook object
     */
    #normalizeHook(input, handler = null, options = {}) {
        if (input instanceof Hook) {
            return input.toObject();
        }

        if (typeof input === 'string') {
            const hook = new Hook(input, handler);
            
            if (options.priority !== undefined) hook.withPriority(options.priority);
            if (options.once) hook.once();
            if (options.id) hook.withId(options.id);
            if (options.enabled !== undefined) hook.setEnabled(options.enabled);

            return hook.toObject();
        }

        return input;
    }

    /**
     * Register a hook
     * 
     * @method registerHook
     * @param {Hook|String} hookOrName Hook instance or hook name
     * @param {Function} handler Optional handler (if first param is string)
     * @param {Object} options Optional options
     */
    registerHook(hookOrName, handler = null, options = {}) {
        const hook = this.#normalizeHook(hookOrName, handler, options);

        if (!this.hooks[hook.name]) {
            this.hooks[hook.name] = [];
        }

        this.hooks[hook.name].push(hook);
        
        // Sort by priority (lower numbers first)
        this.hooks[hook.name].sort((a, b) => a.priority - b.priority);
    }

    /**
     * Execute all hooks for a given name
     * 
     * @method execute
     * @param {String} hookName Hook name
     * @param {...*} args Arguments to pass to hook handlers
     * @returns {Promise<Array>} Array of hook results
     */
    async execute(hookName, ...args) {
        const hookList = this.hooks[hookName] || [];
        const results = [];

        for (const hook of hookList) {
            if (!hook.enabled) {
                continue;
            }

            if (typeof hook.handler === 'function') {
                try {
                    const result = await hook.handler(...args);
                    results.push(result);

                    // Remove hook if it should only run once
                    if (hook.once) {
                        this.removeHook(hookName, hook.id);
                    }
                } catch (error) {
                    console.error(`Error executing hook '${hookName}' (${hook.id}):`, error);
                }
            }
        }

        return results;
    }

    /**
     * Execute hooks synchronously
     * 
     * @method executeSync
     * @param {String} hookName Hook name
     * @param {...*} args Arguments to pass to hook handlers
     * @returns {Array} Array of hook results
     */
    executeSync(hookName, ...args) {
        const hookList = this.hooks[hookName] || [];
        const results = [];

        for (const hook of hookList) {
            if (!hook.enabled) {
                continue;
            }

            if (typeof hook.handler === 'function') {
                try {
                    const result = hook.handler(...args);
                    results.push(result);

                    if (hook.once) {
                        this.removeHook(hookName, hook.id);
                    }
                } catch (error) {
                    console.error(`Error executing hook '${hookName}' (${hook.id}):`, error);
                }
            }
        }

        return results;
    }

    /**
     * Remove a specific hook
     * 
     * @method removeHook
     * @param {String} hookName Hook name
     * @param {String} hookId Hook ID
     */
    removeHook(hookName, hookId) {
        if (this.hooks[hookName]) {
            this.hooks[hookName] = this.hooks[hookName].filter(h => h.id !== hookId);
        }
    }

    /**
     * Remove all hooks for a given name
     * 
     * @method removeAllHooks
     * @param {String} hookName Hook name
     */
    removeAllHooks(hookName) {
        if (this.hooks[hookName]) {
            this.hooks[hookName] = [];
        }
    }

    /**
     * Get all hooks for a given name
     * 
     * @method getHooks
     * @param {String} hookName Hook name
     * @returns {Array} Array of hooks
     */
    getHooks(hookName) {
        return this.hooks[hookName] || [];
    }

    /**
     * Check if a hook exists
     * 
     * @method hasHook
     * @param {String} hookName Hook name
     * @returns {Boolean} True if hook exists
     */
    hasHook(hookName) {
        return this.hooks[hookName] && this.hooks[hookName].length > 0;
    }

    /**
     * Enable a hook
     * 
     * @method enableHook
     * @param {String} hookName Hook name
     * @param {String} hookId Hook ID
     */
    enableHook(hookName, hookId) {
        const hook = this.#findHook(hookName, hookId);
        if (hook) {
            hook.enabled = true;
        }
    }

    /**
     * Disable a hook
     * 
     * @method disableHook
     * @param {String} hookName Hook name
     * @param {String} hookId Hook ID
     */
    disableHook(hookName, hookId) {
        const hook = this.#findHook(hookName, hookId);
        if (hook) {
            hook.enabled = false;
        }
    }


}
