import sameIds from './same-ids';

export function stableByIds(prev, next, { key = 'id', orderMatters = false } = {}) {
    return sameIds(prev, next, { key, orderMatters }) ? prev || next : next;
}
