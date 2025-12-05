/**
 * Extension Contract System
 *
 * This module exports all contract classes used for defining extension integrations.
 * These classes provide a fluent, type-safe API for registering menus, widgets, hooks,
 * and other extension points.
 *
 * @module @fleetbase/ember-core/contracts
 */

export { default as BaseContract } from './base-contract';
export { default as ExtensionComponent } from './extension-component';
export { default as MenuItem } from './menu-item';
export { default as MenuPanel } from './menu-panel';
export { default as Hook } from './hook';
export { default as Widget } from './widget';
export { default as Registry } from './registry';
