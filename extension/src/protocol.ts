export const LTV_MARKER = '##LTV##';

export interface FrameEvent {
  v: number;
  type: 'frame';
  seq: number;
  testTimeMs: number;
  w: number;
  h: number;
  png: string;
}

export interface WarningEvent {
  v: number;
  type: 'warning';
  message: string;
}

export type LtvEvent = FrameEvent | WarningEvent;

export type MachineEvent =
  | { type: 'testStart'; test: { id: number; name: string } }
  | {
      type: 'testDone';
      testID: number;
      result: 'success' | 'failure' | 'error';
      hidden: boolean;
      skipped: boolean;
    }
  | { type: 'error'; testID: number; error: string; stackTrace: string; isFailure: boolean }
  | { type: 'done'; success: boolean | null };

export type ParsedLine =
  | { kind: 'ltv'; event: LtvEvent }
  | { kind: 'machine'; event: MachineEvent }
  | { kind: 'other'; text: string };

const MACHINE_TYPES = new Set(['testStart', 'testDone', 'error', 'done']);
const LTV_TYPES = new Set(['frame', 'warning']);

/**
 * Looks for the marker anywhere in `text` (not just at index 0) — under
 * `--machine`, forwarded prints can arrive with a reporter-added prefix or
 * `\r`-mangling ahead of the marker. Falls back to `otherText` when the
 * marker is absent or what follows it isn't a recognized LTV event.
 */
function parseEmbeddedLtv(text: string, otherText: string): ParsedLine {
  const idx = text.indexOf(LTV_MARKER);
  if (idx !== -1) {
    try {
      const event = JSON.parse(text.slice(idx + LTV_MARKER.length));
      if (LTV_TYPES.has(event.type)) return { kind: 'ltv', event };
    } catch {
      // fall through to 'other'
    }
  }
  return { kind: 'other', text: otherText };
}

export function parseLine(line: string): ParsedLine {
  // Under `flutter test --machine`, our ##LTV## prints don't arrive as raw
  // stdout — the JSON reporter wraps them in `{"type":"print",...}` events.
  // Check that shape first: the marker also shows up (escaped) inside the
  // print envelope's raw text, so scanning the raw line for it before
  // unwrapping the envelope would find a mis-escaped remainder and fail.
  const trimmed = line.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type === 'print' && typeof parsed.message === 'string') {
        return parseEmbeddedLtv(parsed.message, parsed.message);
      }
      if (MACHINE_TYPES.has(parsed.type)) return { kind: 'machine', event: parsed };
    } catch {
      // not valid JSON; fall through to the raw marker scan below
    }
  }
  if (line.indexOf(LTV_MARKER) !== -1) {
    return parseEmbeddedLtv(line, line);
  }
  return { kind: 'other', text: line };
}
