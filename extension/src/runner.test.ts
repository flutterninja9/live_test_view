import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findProjectRoot } from './runner';

describe('findProjectRoot', () => {
  let tmp: string;

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('walks up to the nearest pubspec.yaml', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltv-'));
    const project = path.join(tmp, 'app');
    const testDir = path.join(project, 'test', 'presentation');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(project, 'pubspec.yaml'), 'name: app');
    expect(findProjectRoot(path.join(testDir, 'a_test.dart'))).toBe(project);
  });

  it('returns undefined when no pubspec exists above the file', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltv-'));
    const file = path.join(tmp, 'orphan_test.dart');
    fs.writeFileSync(file, '');
    expect(findProjectRoot(file)).toBeUndefined();
  });
});
