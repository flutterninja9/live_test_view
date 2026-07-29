"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findTestSites = findTestSites;
const TEST_WIDGETS_RE = /testWidgets\s*\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\s*,/g;
/**
 * Finds testWidgets() calls with a literal, non-interpolated string name.
 * Interpolated and raw-string names get no CodeLens (v1 limitation): their
 * runtime name cannot be known statically for --plain-name matching.
 */
function findTestSites(source) {
    const sites = [];
    for (const match of source.matchAll(TEST_WIDGETS_RE)) {
        const raw = match[1] ?? match[2];
        if (raw.includes('$'))
            continue;
        const name = raw.replace(/\\(.)/g, '$1');
        const line = source.slice(0, match.index).split('\n').length - 1;
        sites.push({ name, line });
    }
    return sites;
}
//# sourceMappingURL=scan.js.map