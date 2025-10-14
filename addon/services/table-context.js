import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class TableContextService extends Service {
    @tracked node;
    @tracked table;

    @action getSelectedIds() {
        return this.table.selectedRows.map((_) => _.id);
    }

    @action getSelectedRows() {
        return this.table.selectedRows;
    }

    @action untoggleSelectAll() {
        return this.table.untoggleSelectAll();
    }
}
