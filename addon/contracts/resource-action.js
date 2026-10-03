import ResourceViewItem from './resource-view-item';

/**
 * A dropdown item an extension adds to a view: a table row's actions
 * (`row-actions`), the Bulk Actions menu (`bulk-actions`) or a details header's
 * "…" menu (`menu`).
 *
 * `fn(target, ctx)` receives the row, the selected rows or the resource
 * depending on the slot, then the view context. `isVisible(target, ctx)` hides
 * the item; `permission` disables it for users who lack the ability.
 *
 * @class ResourceAction
 * @extends ResourceViewItem
 *
 * @example
 * new ResourceAction({ id: 'acme-sync', label: 'Sync to Acme', icon: 'sync' })
 *     .withHandler((driver, ctx) => ctx.owner.lookup('service:acme').sync(driver))
 *     .before('delete')
 */
export default class ResourceAction extends ResourceViewItem {
    static contractType = 'action';

    withLabel(label) {
        return this.setOption('label', label);
    }

    withIcon(icon, iconPrefix = null) {
        this.setOption('icon', icon);
        return iconPrefix ? this.setOption('iconPrefix', iconPrefix) : this;
    }

    withHandler(fn) {
        return this.setOption('fn', fn);
    }

    visibleWhen(isVisible) {
        return this.setOption('isVisible', isVisible);
    }
}
