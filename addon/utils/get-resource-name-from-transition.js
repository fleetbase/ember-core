export default function getResourceNameFromTransition(transition) {
    const { to } = transition;

    if (typeof to.name === 'string') {
        let routePathSegments = to.name.split('.');
        let resourceName = routePathSegments[3];

        return resourceName;
    }

    return null;
}
