import { later } from '@ember/runloop';

export default function timeout(ms = 300, options = {}) {
    const response = options.response ? options.response : true;

    return new Promise((resolve) => {
        later(
            this,
            () => {
                resolve(response);
            },
            ms
        );
    });
}
