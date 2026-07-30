export interface DaemonAppStartEvent {
  event: 'app.start';
  params: { appId: string; deviceId: string; directory: string; supportsRestart: boolean };
}
export interface DaemonAppDebugPortEvent {
  event: 'app.debugPort';
  params: { port: number; wsUri: string };
}
export interface DaemonAppStartedEvent {
  event: 'app.started';
  params: { appId: string };
}
export interface DaemonAppProgressEvent {
  event: 'app.progress';
  params: { appId: string; message?: string; finished?: boolean };
}
export interface DaemonAppStopEvent {
  event: 'app.stop';
  params: { appId: string; error?: string };
}
export type DaemonEvent =
  | DaemonAppStartEvent
  | DaemonAppDebugPortEvent
  | DaemonAppStartedEvent
  | DaemonAppProgressEvent
  | DaemonAppStopEvent;

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
export function parseDaemonLine(line: string): DaemonEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[')) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is DaemonEvent =>
      typeof entry === 'object' &&
      entry !== null &&
      DAEMON_EVENT_TYPES.has((entry as { event?: unknown }).event as string),
  );
}

/** Encodes the daemon's restart request for the given running app.
 * Pass fullRestart=true for a hot restart (re-runs main); false for a hot
 * reload (reassemble only). */
export function encodeRestartCommand(id: number, appId: string, fullRestart = false): string {
  return JSON.stringify([
    { id, method: 'app.restart', params: { appId, fullRestart, pause: false } },
  ]);
}
