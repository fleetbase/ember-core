export default function isPluginExtension(extension) {
    return extension?.type === 'plugin' || extension?.fleetbase?.type === 'plugin' || extension?.fleetbase?.plugin === true;
}
