import ResourceViewItem from './resource-view-item';

/**
 * A header button an extension adds to a view: the table toolbar
 * (`<extension>:table:<resource>:actions`) or the details header
 * (`<extension>:details:<resource>:actions`).
 *
 * Renders as a plain button calling `onClick(ctx)`, as a dropdown when it has
 * `items` (each an action receiving `(resource, ctx)`), or as `component`, which
 * may be an `ExtensionComponent`. `isVisible(ctx)` hides it.
 *
 * @class ActionButton
 * @extends ResourceViewItem
 *
 * @example
 * new ActionButton({ id: 'acme-import', text: 'Import from Acme', icon: 'download' })
 *     .withHandler((ctx) => ctx.owner.lookup('service:acme').import())
 */
export default class ActionButton extends ResourceViewItem {
    static contractType = 'action-button';

    withText(text) {
        return this.setOption('text', text);
    }

    withIcon(icon, iconPrefix = null) {
        this.setOption('icon', icon);
        return iconPrefix ? this.setOption('iconPrefix', iconPrefix) : this;
    }

    withHandler(onClick) {
        return this.setOption('onClick', onClick);
    }

    withItems(items = []) {
        return this.setOption(
            'items',
            items.map((item) => (typeof item?.toObject === 'function' ? item.toObject() : item))
        );
    }

    withComponent(component) {
        return this.setOption('component', component);
    }

    visibleWhen(isVisible) {
        return this.setOption('isVisible', isVisible);
    }
}
