import Service, { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import config from 'ember-get-config';

/**
 * Analytics Service
 * 
 * Provides a centralized, analytics-agnostic event tracking system for Fleetbase.
 * This service emits standardized events via the universe service's event bus,
 * allowing engines (like internals) to subscribe and implement their own analytics.
 * 
 * @class AnalyticsService
 * @extends Service
 */
export default class AnalyticsService extends Service {
    @service universe;
    @service currentUser;

    /**
     * Tracks the creation of a resource
     * 
     * @param {Object} resource - The created resource/model
     * @param {Object} [props={}] - Additional properties to include
     */
    trackResourceCreated(resource, props = {}) {
        const events = this.#getResourceEvents(resource, 'created');
        const properties = this.#enrichProperties({
            ...this.#getSafeProperties(resource),
            ...props
        });

        events.forEach(eventName => {
            this.#trigger(eventName, resource, properties);
        });
    }

    /**
     * Tracks the update of a resource
     * 
     * @param {Object} resource - The updated resource/model
     * @param {Object} [props={}] - Additional properties to include
     */
    trackResourceUpdated(resource, props = {}) {
        const events = this.#getResourceEvents(resource, 'updated');
        const properties = this.#enrichProperties({
            ...this.#getSafeProperties(resource),
            ...props
        });

        events.forEach(eventName => {
            this.#trigger(eventName, resource, properties);
        });
    }

    /**
     * Tracks the deletion of a resource
     * 
     * @param {Object} resource - The deleted resource/model
     * @param {Object} [props={}] - Additional properties to include
     */
    trackResourceDeleted(resource, props = {}) {
        const events = this.#getResourceEvents(resource, 'deleted');
        const properties = this.#enrichProperties({
            ...this.#getSafeProperties(resource),
            ...props
        });

        events.forEach(eventName => {
            this.#trigger(eventName, resource, properties);
        });
    }

    /**
     * Tracks a bulk import of resources
     * 
     * @param {String} modelName - The name of the model being imported
     * @param {Number} count - Number of resources imported
     * @param {Object} [props={}] - Additional properties to include
     */
    trackResourceImported(modelName, count, props = {}) {
        const properties = this.#enrichProperties({
            model_name: modelName,
            count: count,
            ...props
        });

        this.#trigger('resource.imported', modelName, count, properties);
    }

    /**
     * Tracks a resource export
     * 
     * @param {String} modelName - The name of the model being exported
     * @param {String} format - Export format (csv, xlsx, etc.)
     * @param {Object} [params={}] - Export parameters/filters
     * @param {Object} [props={}] - Additional properties to include
     */
    trackResourceExported(modelName, format, params = {}, props = {}) {
        const properties = this.#enrichProperties({
            model_name: modelName,
            export_format: format,
            has_filters: !!(params && Object.keys(params).length > 0),
            ...props
        });

        this.#trigger('resource.exported', modelName, format, params, properties);

        // Also trigger model-specific export event
        const specificEvent = `${modelName}.exported`;
        this.#trigger(specificEvent, modelName, format, params, properties);
    }

    /**
     * Tracks a bulk action on multiple resources
     * 
     * @param {String} verb - The action verb (delete, archive, etc.)
     * @param {Array} resources - Array of selected resources
     * @param {Object} [props={}] - Additional properties to include
     */
    trackBulkAction(verb, resources, props = {}) {
        const firstResource = resources && resources.length > 0 ? resources[0] : null;
        const modelName = this.#getModelName(firstResource);

        const properties = this.#enrichProperties({
            action: verb,
            count: resources?.length || 0,
            model_name: modelName,
            ...props
        });

        this.#trigger('resource.bulk_action', verb, resources, firstResource, properties);
    }

    /**
     * Tracks when the current user is loaded (session initialized)
     * 
     * @param {Object} user - The user object
     * @param {Object} organization - The organization object
     * @param {Object} [props={}] - Additional properties to include
     */
    trackUserLoaded(user, organization, props = {}) {
        const properties = this.#enrichProperties({
            user_id: user?.id,
            organization_id: organization?.id,
            organization_name: organization?.name,
            ...props
        });

        this.#trigger('user.loaded', user, organization, properties);
    }

    /**
     * Tracks when a user session is terminated
     * 
     * @param {Number} duration - Session duration in seconds
     * @param {Object} [props={}] - Additional properties to include
     */
    trackSessionTerminated(duration, props = {}) {
        const properties = this.#enrichProperties({
            session_duration: duration,
            ...props
        });

        this.#trigger('session.terminated', duration, properties);
    }

    /**
     * Tracks a generic custom event
     * 
     * @param {String} eventName - The event name (dot notation)
     * @param {Object} [props={}] - Event properties
     */
    trackEvent(eventName, props = {}) {
        const properties = this.#enrichProperties(props);
        this.#trigger(eventName, properties);
    }

    /**
     * Checks if analytics tracking is enabled
     * 
     * @returns {Boolean}
     */
    isEnabled() {
        const analyticsConfig = config?.analytics || {};
        return analyticsConfig.enabled !== false; // Enabled by default
    }

    // =========================================================================
    // Private Methods (using # syntax)
    // =========================================================================

    /**
     * Triggers an event on the universe service
     * 
     * @private
     * @param {String} eventName - The event name
     * @param {...*} args - Arguments to pass to event listeners
     */
    #trigger(eventName, ...args) {
        if (!this.isEnabled()) {
            return;
        }

        if (!this.universe) {
            console.warn('[Analytics] Universe service not available');
            return;
        }

        // Debug logging if enabled
        if (config?.analytics?.debug) {
            console.log(`[Analytics] ${eventName}`, args);
        }

        this.universe.trigger(eventName, ...args);
    }

    /**
     * Generates both generic and specific event names for a resource action
     * 
     * @private
     * @param {Object} resource - The resource/model
     * @param {String} action - The action (created, updated, deleted)
     * @returns {Array<String>} Array of event names
     */
    #getResourceEvents(resource, action) {
        const modelName = this.#getModelName(resource);
        return [
            `resource.${action}`,
            `${modelName}.${action}`
        ];
    }

    /**
     * Extracts safe, serializable properties from a resource
     * 
     * @private
     * @param {Object} resource - The resource/model
     * @returns {Object} Safe properties object
     */
    #getSafeProperties(resource) {
        if (!resource) {
            return {};
        }

        const props = {
            id: resource.id,
            model_name: this.#getModelName(resource)
        };

        // Add common properties if available
        const commonProps = ['name', 'status', 'type', 'slug', 'public_id'];
        commonProps.forEach(prop => {
            if (resource[prop] !== undefined && resource[prop] !== null) {
                props[prop] = resource[prop];
            }
        });

        return props;
    }

    /**
     * Enriches properties with user, organization, and timestamp context
     * 
     * @private
     * @param {Object} props - Base properties
     * @returns {Object} Enriched properties
     */
    #enrichProperties(props = {}) {
        const analyticsConfig = config?.analytics || {};
        const enrichConfig = analyticsConfig.enrich || {};
        const enriched = { ...props };

        // Add user context if enabled
        if (enrichConfig.user !== false && this.currentUser?.user) {
            enriched.user_id = this.currentUser.user.id;
        }

        // Add organization context if enabled
        if (enrichConfig.organization !== false && this.currentUser?.organization) {
            enriched.organization_id = this.currentUser.organization.id;
        }

        // Add timestamp if enabled
        if (enrichConfig.timestamp !== false) {
            enriched.timestamp = new Date().toISOString();
        }

        return enriched;
    }

    /**
     * Safely extracts the model name from a resource
     * 
     * @private
     * @param {Object} resource - The resource/model
     * @returns {String} Model name or 'unknown'
     */
    #getModelName(resource) {
        if (!resource) {
            return 'unknown';
        }

        // Try multiple ways to get model name
        if (resource.constructor?.modelName) {
            return resource.constructor.modelName;
        }

        if (resource._internalModel?.modelName) {
            return resource._internalModel.modelName;
        }

        if (resource.modelName) {
            return resource.modelName;
        }

        return 'unknown';
    }
}
