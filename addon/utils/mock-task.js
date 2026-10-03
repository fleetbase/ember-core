export default class MockTask {
    isRunning = false;
    isIdel = true;
    /* istanbul ignore next -- the constructor assigns `fn` unconditionally, so this declared default is overwritten before anything could call it */
    fn = function () {};
    perform = function () {
        this.isRunning = true;
        this.fn(...arguments);
        this.isRunning = false;
    };

    constructor(fn) {
        this.fn = fn;
    }
}
