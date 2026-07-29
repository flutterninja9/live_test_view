import { describe, expect, it } from 'vitest';
import { LTV_MARKER, parseLine } from './protocol';

describe('parseLine', () => {
  it('parses frame lines', () => {
    const line =
      '##LTV##{"v":1,"type":"frame","seq":0,"testTimeMs":0,"w":800,"h":600,"png":"iVBO"}';
    expect(parseLine(line)).toEqual({
      kind: 'ltv',
      event: { v: 1, type: 'frame', seq: 0, testTimeMs: 0, w: 800, h: 600, png: 'iVBO' },
    });
  });

  it('parses warning lines', () => {
    const line = '##LTV##{"v":1,"type":"warning","message":"frame cap reached"}';
    expect(parseLine(line)).toEqual({
      kind: 'ltv',
      event: { v: 1, type: 'warning', message: 'frame cap reached' },
    });
  });

  it('parses machine reporter events', () => {
    const line =
      '{"type":"testStart","test":{"id":3,"name":"increments the counter"},"time":12}';
    const parsed = parseLine(line);
    expect(parsed.kind).toBe('machine');
    if (parsed.kind === 'machine' && parsed.event.type === 'testStart') {
      expect(parsed.event.test.name).toBe('increments the counter');
    }
  });

  it('passes through arbitrary output and malformed JSON', () => {
    expect(parseLine('00:01 +1: All tests passed!')).toEqual({
      kind: 'other',
      text: '00:01 +1: All tests passed!',
    });
    expect(parseLine('{"type":"unknownThing"}')).toEqual({
      kind: 'other',
      text: '{"type":"unknownThing"}',
    });
    expect(parseLine('##LTV##{not json')).toEqual({
      kind: 'other',
      text: '##LTV##{not json',
    });
  });

  it('unwraps a frame event from a machine-reporter print event', () => {
    const inner =
      LTV_MARKER +
      JSON.stringify({ v: 1, type: 'frame', seq: 2, testTimeMs: 100, w: 400, h: 300, png: 'abc' });
    const line = JSON.stringify({
      type: 'print',
      testID: 3,
      message: inner,
      messageType: 'print',
      time: 12,
    });
    expect(parseLine(line)).toEqual({
      kind: 'ltv',
      event: { v: 1, type: 'frame', seq: 2, testTimeMs: 100, w: 400, h: 300, png: 'abc' },
    });
  });

  it('unwraps a warning event from a machine-reporter print event', () => {
    const inner = LTV_MARKER + JSON.stringify({ v: 1, type: 'warning', message: 'frame cap reached' });
    const line = JSON.stringify({
      type: 'print',
      testID: 3,
      message: inner,
      messageType: 'print',
      time: 12,
    });
    expect(parseLine(line)).toEqual({
      kind: 'ltv',
      event: { v: 1, type: 'warning', message: 'frame cap reached' },
    });
  });

  it('surfaces a markerless print message as other, using the message not the envelope', () => {
    const line = JSON.stringify({
      type: 'print',
      testID: 1,
      message: 'regular test output',
      messageType: 'print',
      time: 5,
    });
    expect(parseLine(line)).toEqual({ kind: 'other', text: 'regular test output' });
  });

  it('finds the marker anywhere in a raw line, not just at the start', () => {
    const line = `junk-prefix\r${LTV_MARKER}{"v":1,"type":"warning","message":"frame cap reached"}`;
    expect(parseLine(line)).toEqual({
      kind: 'ltv',
      event: { v: 1, type: 'warning', message: 'frame cap reached' },
    });
  });

  it('treats a mid-line marker followed by malformed JSON as other, keeping the full raw line', () => {
    const line = `garbage${LTV_MARKER}{not json`;
    expect(parseLine(line)).toEqual({ kind: 'other', text: line });
  });
});
