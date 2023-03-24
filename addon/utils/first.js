import { isArray } from '@ember/array';

export default function first(arr, n = 1) {
    if (!isArray(arr) || arr === null || arr.length === 0 || n > arr.length) {
        return null;
    }

    return n > 1 ? arr.slice(0, n) : arr[0];
}
