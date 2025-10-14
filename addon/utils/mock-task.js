export default class MockTask {
    isRunning = false;
    isIdel = true;
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
