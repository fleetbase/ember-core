> v0.3.27 ~ "Registered table columns can be sorted, grouped and hidden by default"

---
## Highlights

- **`TableColumn.withSort(sortParam)`.** A column an extension registers into `<extension>:<resource>:table:columns` can opt into sorting and name the sort key the API is asked for (`?sort=key`). Without a key the column's `valuePath` is sent, as for built-in columns. The API must be able to order by that key; fleetbase/core-api v2.0.1 lets an extension register one with `Model::addSortHandler()`.
- **`TableColumn.inGroup(group)`.** Lists the column under a heading of its own in the column picker, after the view's own columns (needs fleetbase/ember-ui v0.4.7 to draw the headings; older versions list the column with the rest).
- **`TableColumn.hiddenByDefault()`.** Keeps a registered column out of the table until the user turns it on in the column picker, so an extension can offer many columns without widening every table.

---
## Upgrading
No changes needed. The new methods only set column options (`sortable`, `sortParam`, `group`, `hidden`) that a plain column object could already carry.

---
## Need help?
- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
---
