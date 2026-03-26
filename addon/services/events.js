import Service, { inject as service } from '@ember/service';
import Evented from '@ember/object/evented';
import config from 'ember-get-config';

/**
 * EventsService
 *
 * Provides a centralized, standardized event tracking system for Fleetbase.
 *
 * This service is the single source of truth for all application lifecycle
 * events. It emits every event on two buses simultaneously:
 *
 *   1. Its own Evented bus — for direct service/component listeners:
 *        this.events.on('user.loaded', handler)
 *
 *   2. The universe service bus — for cross-engine listeners (recommended
 *      for use in Ember Engines / extensions):
 *        this.universe.on('user.loaded', handler)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Session Lifecycle Events
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   session.authenticated    Fired after a successful login or session restore.
 *                            Payload: (properties)
 *
 *   session.invalidated      Fired after the session is destroyed (logout).
 *                            Payload: (duration_seconds, properties)
 *
 *   session.terminated       Alias for session.invalidated — provided for
 *                            backward compatibility and semantic clarity.
 *                            Payload: (duration_seconds, properties)
 *
 *   user.loaded              Fired after the authenticated user record and
 *                            organization have been fully loaded into the
 *                            currentUser service. This is the canonical event
 *                            for integrations to boot (Intercom, PostHog, etc.)
 *                            Payload: (user, organization, properties)
 *
 *   user.updated             Fired when the user record is refreshed in-session
 *                            (e.g. after a profile edit).
 *                            Payload: (user, properties)
 *
 *   user.deauthenticated     Fired when the user identity is cleared on logout.
 *                            Semantic alias for session.invalidated — use this
 *                            to shut down integrations cleanly (Intercom, etc.)
 *                            Payload: (duration_seconds, properties)
 *
 *   user.organization_switched  Fired when the user switches their active org.
 *                            Payload: (organization, properties)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Resource Events
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   resource.created         Generic resource creation.
 *   resource.updated         Generic resource update.
 *   resource.deleted         Generic resource deletion.
 *   resource.imported        Bulk import.
 *   resource.exported        Export.
 *   resource.bulk_action     Bulk action (delete, archive, etc.)
 *   {modelName}.created      Model-specific creation (e.g. order.created)
 *   {modelName}.updated      Model-specific update.
 *   {modelName}.deleted      Model-specific deletion.
 *   {modelName}.exported     Model-specific export.
 *
 * @class EventsService
 * @extends Service
 */
export default class EventsService extends Service.extend(Evented) {
    @service universe;
    @service currentUser;

    // =========================================================================
    // Session Lifecycle Tracking
    // =========================================================================

    /**
     * Tracks a successful authentication (login or session restore).
     *
     * Called by SessionService.handleAuthentication().
     *
     * @param {Object} [props={}] - Additional properties to include
     */
    trackSessionAuthenticated(props = {}) {
        const properties = this.#enrichProperties(props);
        this.#trigger('session.authenticated', properties);
    }

    /**
     * Tracks when a user session is terminated (logout).
     *
     * Called by SessionService.handleInvalidation(). Also fires the semantic
     * `user.deauthenticated` event so integrations can react to the user
     * identity being cleared without needing to know about session internals.
     *
     * @param {Number|null} duration - Session duration in seconds (null if unknown)
     * @param {Object} [props={}] - Additional properties to include
     */
    trackSessionTerminated(duration, props = {}) {
        const properties = this.#enrichProperties({
            session_duration: duration,
            ...props,
        });

        // Fire session.invalidated (technical event)
        this.#trigger('session.invalidated', duration, properties);

        // Fire session.terminated (backward-compatible alias)
        this.#trigger('session.terminated', duration, properties);

        // Fire user.deauthenticated (semantic event for integrations)
        this.#trigger('user.deauthenticated', duration, properties);
    }

    /**
     * Tracks when the current user is loaded (session initialized).
     *
     * Called by CurrentUserService.setUser() after a successful login or
     * session restore. This is the canonical event for integrations to boot.
     *
     * @param {Object} user         - The authenticated user model
     * @param {Object} organization - The user's active organization model
     * @param {Object} [props={}]   - Additional properties to include
     */
    trackUserLoaded(user, organization, props = {}) {
        const properties = this.#enrichProperties({
            user_id: user?.id,
            organization_id: organization?.id,
            organization_name: organization?.name,
            ...props,
        });

        this.#trigger('user.loaded', user, organization, properties);
    }

    /**
     * Tracks when the user record is refreshed in-session (e.g. profile edit).
     *
     * Called by CurrentUserService.refreshUser().
     *
     * @param {Object} user       - The updated user model
     * @param {Object} [props={}] - Additional properties to include
     */
    trackUserUpdated(user, props = {}) {
        const properties = this.#enrichProperties({
            user_id: user?.id,
            ...props,
        });

        this.#trigger('user.updated', user, properties);
    }

    /**
     * Tracks when the user switches their active organization.
     *
     * Called by CurrentUserService.switchOrganization().
     *
     * @param {Object} organization - The new active organization model
     * @param {Object} [props={}]   - Additional properties to include
     */
    trackOrganizationSwitched(organization, props = {}) {
        const properties = this.#enrichProperties({
            organization_id: organization?.id,
            organization_name: organization?.name,
            ...props,
        });

        this.#trigger('user.organization_switched', organization, properties);
    }

    // =========================================================================
    // Resource Event Tracking
    // =========================================================================

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
            ...props,
        });

        events.forEach((eventName) => {
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
            ...props,
        });

        events.forEach((eventName) => {
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
            ...props,
        });

        events.forEach((eventName) => {
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
            ...props,
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
            ...props,
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
            ...props,
        });

        this.#trigger('resource.bulk_action', verb, resources, firstResource, properties);
    }

    // =========================================================================
    // Generic Event Tracking
    // =========================================================================

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
     * Checks if event tracking is enabled
     *
     * @returns {Boolean}
     */
    isEnabled() {
        const eventsConfig = config?.events || {};
        return eventsConfig.enabled !== false; // Enabled by default
    }

    // =========================================================================
    // Private Methods (using # syntax)
    // =========================================================================

    /**
     * Triggers an event on both the events service and universe service.
     *
     * This dual event system allows listeners to subscribe to events on either:
     *   - this.events.on('event.name', handler)  — local listeners
     *   - this.universe.on('event.name', handler) — cross-engine listeners
     *
     * @private
     * @param {String} eventName - The event name
     * @param {...*} args - Arguments to pass to event listeners
     */
    #trigger(eventName, ...args) {
        if (!this.isEnabled()) {
            return;
        }

        // Debug logging if enabled
        if (config?.events?.debug) {
            console.log(`[Events] ${eventName}`, args);
        }

        // Trigger on events service (local listeners)
        this.trigger(eventName, ...args);

        // Trigger on universe service (cross-engine listeners)
        if (this.universe) {
            this.universe.trigger(eventName, ...args);
        } else {
            console.warn('[Events] Universe service not available');
        }
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
        return [`resource.${action}`, `${modelName}.${action}`];
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
            model_name: this.#getModelName(resource),
        };

        // Add common properties if available
        const commonProps = ['name', 'status', 'type', 'slug', 'public_id'];
        commonProps.forEach((prop) => {
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
        const eventsConfig = config?.events || {};
        const enrichConfig = eventsConfig.enrich || {};
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
