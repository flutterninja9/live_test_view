export interface PreviewSite {
  /** Symbol to preview: function/getter name or class name. */
  name: string;
  /** Whether `name` is a class (needs `Name()` to construct) vs. a
   * function/getter reference. */
  kind: 'class' | 'function' | 'getter';
  /** Zero-based line of the declaration. */
  line: number;
}

// Anchored at column 0 (^ without allowing leading whitespace) so class
// members like `Widget build(BuildContext context)` — always indented —
// don't match; only top-level declarations do. A v1 limitation shared with
// the test-mode scanner: no AST, so a `Widget Function()`-typed top-level
// variable would also match TOP_LEVEL_FUNCTION_RE as a false positive.
const TOP_LEVEL_FUNCTION_RE = /^Widget\s+([A-Za-z_$][\w$]*)\s*\(/gm;
const TOP_LEVEL_GETTER_RE = /^Widget\s+get\s+([A-Za-z_$][\w$]*)\s*(?:=>|\{)/gm;
const WIDGET_CLASS_RE =
  /^class\s+([A-Za-z_$][\w$]*)\s+extends\s+(?:StatelessWidget|StatefulWidget)\b/gm;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length - 1;
}

/**
 * Finds top-level widget-returning functions/getters and
 * StatelessWidget/StatefulWidget subclasses. Regex-based, no AST dependency
 * — consistent with `scan.ts`'s existing test-mode scanner.
 */
export function findPreviewSites(source: string): PreviewSite[] {
  const sites: PreviewSite[] = [];
  for (const match of source.matchAll(TOP_LEVEL_GETTER_RE)) {
    sites.push({ name: match[1], kind: 'getter', line: lineOf(source, match.index!) });
  }
  for (const match of source.matchAll(TOP_LEVEL_FUNCTION_RE)) {
    sites.push({ name: match[1], kind: 'function', line: lineOf(source, match.index!) });
  }
  for (const match of source.matchAll(WIDGET_CLASS_RE)) {
    sites.push({ name: match[1], kind: 'class', line: lineOf(source, match.index!) });
  }
  return sites.sort((a, b) => a.line - b.line);
}
