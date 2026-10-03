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
 * on what it knows about.
 *
 * @class TableColumn
 * @extends ResourceViewItem
 *
 * @example
 * new TableColumn({ id: 'safety-score', label: 'Safety Score', valuePath: 'meta.safety_score' })
 *     .after('status')
 *     .withCellComponent(new ExtensionComponent('@acme/engine', 'cell/safety-score'))
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

    get filterParam() {
        return this.getOption('filterable') ? this.getOption('filterParam') : null;
    }
}
