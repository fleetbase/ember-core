export default function isThenable(subject) {
    return subject && typeof subject.then === 'function';
}
