"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasLiveTestViewDependency = hasLiveTestViewDependency;
exports.hasLiveTestViewConfig = hasLiveTestViewConfig;
exports.inspectSetup = inspectSetup;
const fs = require("node:fs");
const path = require("node:path");
const runner_1 = require("./runner");
/** Checks whether live_test_view is declared in pubspec dev_dependencies. */
function hasLiveTestViewDependency(projectRoot) {
    const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath))
        return false;
    const text = fs.readFileSync(pubspecPath, 'utf8');
    const devDeps = extractYamlSection(text, 'dev_dependencies');
    if (!devDeps)
        return false;
    return /^\s*live_test_view\s*:/m.test(devDeps);
}
/** Reads test/flutter_test_config.dart and checks for the liveTestView hook. */
function hasLiveTestViewConfig(projectRoot) {
    const configPath = path.join(projectRoot, 'test', 'flutter_test_config.dart');
    if (!fs.existsSync(configPath))
        return false;
    const text = fs.readFileSync(configPath, 'utf8');
    return text.includes('liveTestView');
}
function inspectSetup(testFilePath) {
    const root = (0, runner_1.findProjectRoot)(testFilePath);
    if (!root)
        return { kind: 'missingPackage' };
    if (!hasLiveTestViewDependency(root))
        return { kind: 'missingPackage' };
    if (!fs.existsSync(path.join(root, 'test', 'flutter_test_config.dart'))) {
        return { kind: 'missingConfig' };
    }
    if (!hasLiveTestViewConfig(root))
        return { kind: 'configNotWired' };
    return { kind: 'ready' };
}
/** Pulls a top-level YAML section body (indented lines only). */
function extractYamlSection(text, section) {
    const re = new RegExp(`^${section}:\\s*$`, 'm');
    const match = re.exec(text);
    if (!match)
        return undefined;
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const lines = [];
    for (const line of rest.split('\n')) {
        if (line.match(/^[a-zA-Z_][\w-]*:/) && !line.startsWith(' '))
            break;
        lines.push(line);
    }
    return lines.join('\n');
}
//# sourceMappingURL=setupStatus.js.map