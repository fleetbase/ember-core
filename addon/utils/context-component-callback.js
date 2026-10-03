export default function contextComponentCallback(component, name, ...params) {
    let callbackInvoked = false;

    if (typeof component.args[name] === 'function') {
        component.args[name](...params);
        callbackInvoked = true;
    }

    // now do for context options; `typeof null` is also 'object', so guard for it
    if (component.args.options && typeof component.args.options === 'object' && typeof component.args.options[name] === 'function') {
        component.args.options[name](...params);
        callbackInvoked = true;
    }

    return callbackInvoked;
}
