import ResourceViewItem from './resource-view-item';

/**
 * A column an extension adds to a table view, registered into
 * `<extension>:<resource>:table:columns`.
 *
 * Accepts every key a built-in column does (`label`, `valuePath`,
 * `cellComponent`, `width`, `sticky`, `sortable`, `resizable`, `hidden`, and the
 * filter keys `filterable`, `filterComponent`, `filterParam`, `filterLabel`,
 * `filterOptions`, `filterFetchOptions`, `model`, `modelNamePath`).
 * `cellComponent` and `filterComponent` may be an `ExtensionComponent`, so the
 * component can live in the extension's own engine.
 *
 * A registered column is not sortable unless it says so: the API only sorts
 * on what it knows about. `withSort()` opts in and names the sort key the API
 * is asked for, which the extension's server side must be able to order by.
 * `inGroup()` lists the column under a heading of its own in the column picker,
 * and `hiddenByDefault()` keeps it out of the table until the user picks it.
 *
 * @class TableColumn
 * @extends ResourceViewItem
 *
 * @example
 * new TableColumn({ id: 'safety-score', label: 'Safety Score', valuePath: 'meta.safety_score' })
 *     .after('status')
 *     .withCellComponent(new ExtensionComponent('@acme/engine', 'cell/safety-score'))
 *     .withSort('safety_score')
 *     .inGroup('Safety')
 *     .hiddenByDefault()
 */
export default class TableColumn extends ResourceViewItem {
    static contractType = 'table-column';

    constructor(definition = {}) {
        super({ sortable: false, resizable: true, ...definition });
    }

    withLabel(label) {
        return this.setOption('label', label);
    }

    withValuePath(valuePath) {
        return this.setOption('valuePath', valuePath);
    }

    withCellComponent(cellComponent) {
        return this.setOption('cellComponent', cellComponent);
    }

    /**
     * Make the column filterable. `filterParam` must also be a query param on
     * the owning index controller; see `ResourceViewService.queryParamsFor`.
     *
     * @param {String} filterParam
     * @param {String|ExtensionComponent} filterComponent
     * @param {Object} options Any other filter keys
     * @returns {TableColumn}
     */
    withFilter(filterParam, filterComponent = 'filter/string', options = {}) {
        this.setOption('filterable', true).setOption('filterParam', filterParam).setOption('filterComponent', filterComponent);
        Object.entries(options).forEach(([key, value]) => this.setOption(key, value));
        return this;
    }

    /**
     * Make the column sortable. The table sends `sortParam` as the sort key
     * (`?sort=key`, `?sort=-key`); without one it sends the column's `valuePath`.
     * @param {String} [sortParam]
     * @returns {TableColumn}
     */
    withSort(sortParam) {
        this.setOption('sortable', true);
        return sortParam ? this.setOption('sortParam', sortParam) : this;
    }

    /**
     * List the column under this heading in the column picker, after the
     * view's own columns.
     * @param {String} group
     * @returns {TableColumn}
     */
    inGroup(group) {
        return this.setOption('group', group);
    }

    /**
     * Leave the column out of the table until the user turns it on in the
     * column picker.
     * @returns {TableColumn}
     */
    hiddenByDefault() {
        return this.setOption('hidden', true);
    }

    get filterParam() {
        return this.getOption('filterable') ? this.getOption('filterParam') : null;
    }
}
