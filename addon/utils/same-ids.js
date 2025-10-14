import { isArray } from '@ember/array';

export default function sameIds(a, b, { key = 'id', orderMatters = false } = {}) {
    if (a === b) return true;
    if (!isArray(a) || !isArray(b)) return false;
    if (a.length !== b.length) return false;

    if (orderMatters) {
        for (let i = 0; i < a.length; i++) {
            if ((a[i] && a[i][key]) !== (b[i] && b[i][key])) return false;
        }
        return true;
    }

    // order-insensitive: compare sets
    const setA = new Set(a.map((x) => (x ? x[key] : undefined)));
    for (let i = 0; i < b.length; i++) {
        if (!setA.has(b[i] ? b[i][key] : undefined)) return false;
    }
    return true;
}
