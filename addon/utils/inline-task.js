export class InlineTask {
    /**
     * @param {Function} fn               The function to run (can be async)
     * @param {Object}   [opts]
     * @param {Object}   [opts.context]   `this` for fn; if omitted, fn is called unbound
     * @param {'standard'|'drop'|'restartable'} [opts.strategy='standard']
     * @param {Function} [opts.onError]   (error) => void
     */
    constructor(fn, opts = {}) {
        if (typeof fn !== 'function') throw new TypeError('InlineTask requires a function');
        this._fn = fn;
        this._ctx = opts.context ?? null;
        this._strategy = opts.strategy ?? 'standard';
        this._onError = opts.onError ?? null;

        this.isRunning = false;
        this._active = null; // { id: Symbol(), canceled: boolean }
        this.last = null; // Promise of last run
        this.lastValue = undefined; // last resolved value (any)
        this.lastSuccessful = null; // Promise of last successful run
        this.lastError = null; // Error | null
        this.performCount = 0;
    }

    get isIdle() {
        return !this.isRunning;
    }

    cancel() {
        if (this._active) this._active.canceled = true;
    }

    /**
     * Start the task. Returns a promise that resolves/rejects with fn’s result.
     */
    async perform(...args) {
        // Strategy handling
        if (this._strategy === 'drop' && this.isRunning) {
            return this.last; // ignore this call; hand back the running promise
        }
        if (this._strategy === 'restartable' && this.isRunning) {
            // mark previous run as canceled; keep its promise around for consumers
            this.cancel();
        }

        const run = { id: Symbol('run'), canceled: false };
        this._active = run;
        this.isRunning = true;
        this.performCount++;

        const callFn = () => (this._ctx ? this._fn.call(this._ctx, ...args) : this._fn(...args));
        const p = (async () => {
            try {
                const value = await callFn();
                // If a newer run started or this run was canceled, do not commit results
                if (this._active !== run || run.canceled) return value;

                this.lastValue = value;
                this.lastSuccessful = Promise.resolve(value);
                this.lastError = null;
                return value;
            } catch (e) {
                if (this._active === run && !run.canceled) {
                    this.lastError = e;
                    if (this._onError) {
                        try {
                            this._onError(e);
                        } catch {
                            // eslint-disable-next-line no-console
                        }
                    }
                }
                throw e;
            } finally {
                if (this._active === run) {
                    this.isRunning = false;
                    this._active = null;
                }
            }
        })();

        this.last = p;
        return p;
    }
}

/** Small factory for convenience */
export default function inlineTask(fn, opts) {
    return new InlineTask(fn, opts);
}
