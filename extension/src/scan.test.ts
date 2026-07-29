import { describe, expect, it } from 'vitest';
import { findTestSites } from './scan';

describe('findTestSites', () => {
  it('finds single- and double-quoted test names with zero-based lines', () => {
    const src = `void main() {
  testWidgets('increments the counter', (tester) async {});
  testWidgets("second test", (tester) async {});
}
`;
    expect(findTestSites(src)).toEqual([
      { name: 'increments the counter', line: 1 },
      { name: 'second test', line: 2 },
    ]);
  });

  it('skips interpolated names (cannot be matched with --plain-name)', () => {
    const src = "testWidgets('case $i works', (tester) async {});";
    expect(findTestSites(src)).toEqual([]);
  });

  it('unescapes escaped quotes in names', () => {
    const src = String.raw`testWidgets('it\'s alive', (t) async {});`;
    expect(findTestSites(src)).toEqual([{ name: "it's alive", line: 0 }]);
  });

  it('ignores plain test() and group() calls', () => {
    const src = `test('unit', () {});\ngroup('g', () {});`;
    expect(findTestSites(src)).toEqual([]);
  });
});
