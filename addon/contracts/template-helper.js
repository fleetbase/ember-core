/**
 * Represents a helper that can be lazy-loaded from an engine or registered directly.
 * Used by the RegistryService to share helpers across engines.
 *
 * @class TemplateHelper
 * @example
 * // Lazy loading from engine
 * new TemplateHelper('@fleetbase/storefront-engine', 'helpers/calculate-delivery-fee')
 *
 * // Direct class registration
 * new TemplateHelper(null, CalculateDeliveryFeeHelper)
 */
export default class TemplateHelper {
    /**
     * The name of the engine this helper belongs to
     * @type {string|null}
     */
    engineName = null;

    /**
     * The path to the helper within the engine (for lazy loading)
     * @type {string|null}
     */
    path = null;

    /**
     * The helper class or function (for direct registration)
     * @type {Function|null}
     */
    class = null;

    /**
     * Whether this is a direct class registration (true) or lazy loading (false)
     * @type {boolean}
     */
    isClass = false;

    /**
     * The resolved helper name (extracted from path or class name)
     * @type {string|null}
     */
    name = null;

    /**
     * Creates a new TemplateHelper instance
     *
     * @param {string|null} engineName - The engine name (e.g., '@fleetbase/storefront-engine') or null for direct class
     * @param {string|Function} pathOrClass - Either a path string for lazy loading or a helper class/function
     */
    constructor(engineName, pathOrClass) {
        this.engineName = engineName;

        if (typeof pathOrClass === 'string') {
            // Lazy loading case
            this.path = pathOrClass;
            this.isClass = false;
            this.name = this.#extractNameFromPath(pathOrClass);
        } else {
            // Direct class/function registration
            this.class = pathOrClass;
            this.isClass = true;
            this.name = this.#extractNameFromClass(pathOrClass);
        }
    }

    /**
     * Extracts helper name from path
     * @private
     * @param {string} path - The helper path (e.g., 'helpers/calculate-delivery-fee')
     * @returns {string} The helper name (e.g., 'calculate-delivery-fee')
     */
    #extractNameFromPath(path) {
        const parts = path.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Extracts helper name from class/function
     * @private
     * @param {Function} classOrFn - The helper class or function
     * @returns {string|null} The helper name or null if not available
     */
    #extractNameFromClass(classOrFn) {
        if (classOrFn.name) {
            // Convert PascalCase or camelCase to kebab-case
            return classOrFn.name
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
                .toLowerCase()
                .replace(/helper$/, ''); // Remove 'helper' suffix if present
        }
        return null;
    }
}
