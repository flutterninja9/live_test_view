"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDaemonLine = parseDaemonLine;
exports.encodeRestartCommand = encodeRestartCommand;
const DAEMON_EVENT_TYPES = new Set([
    'app.start',
    'app.debugPort',
    'app.started',
    'app.progress',
    'app.stop',
]);
/**
 * Parses one line of `flutter run --machine` daemon output. Each daemon
 * message is a single-element JSON array, distinct from `flutter test
 * --machine`'s bare-object-per-line shape (see protocol.ts) — the two must
 * never be fed into each other's parser. Lines that aren't a recognized
 * daemon array (including the app's own ##LTV## / print output, which
 * passes through unwrapped) return [].
 */
function parseDaemonLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('['))
        return [];
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        return [];
    }
    if (!Array.isArray(parsed))
        return [];
    return parsed.filter((entry) => typeof entry === 'object' &&
        entry !== null &&
        DAEMON_EVENT_TYPES.has(entry.event));
}
/** Encodes the daemon's restart request for the given running app.
 * Pass fullRestart=true for a hot restart (re-runs main); false for a hot
 * reload (reassemble only). */
function encodeRestartCommand(id, appId, fullRestart = false) {
    return JSON.stringify([
        { id, method: 'app.restart', params: { appId, fullRestart, pause: false } },
    ]);
}
//# sourceMappingURL=previewProtocol.js.map