# Live Test View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watch Flutter widget tests render live: a `▶ Live View` CodeLens above every `testWidgets(...)` streams every pumped frame into a docked VS Code webview panel, with a scrubbable timeline.

**Architecture:** Two artifacts in one repo. A Dart package (`live_test_view`, pub.dev) hooks every test via `flutter_test_config.dart`, captures the root render layer on each pumped frame, and emits base64 PNGs as `##LTV##`-prefixed JSON lines on stdout — only when an env flag set by the extension is present. A VS Code extension (`live-test-view`, Marketplace) provides the CodeLens, spawns `flutter test --machine`, parses its own child's stdout, and renders frames in a webview.

**Tech Stack:** Dart/Flutter (package), TypeScript + vanilla JS webview (extension), vitest (extension unit tests).

**Spec:** `docs/superpowers/specs/2026-07-29-live-test-view-design.md`

## Global Constraints

- **NEVER run `git commit` or `git init`.** The user reviews and commits all changes manually. End each task by reporting what changed; do not stage or commit.
- Dart SDK `^3.2.0`, Flutter `>=3.16.0` (needed for `binding.renderViews`). VS Code engine `^1.85.0`.
- **Zero-touch invariant:** no task may ever require editing a user's test file. Only `test/flutter_test_config.dart` is added to consumer projects.
- **Silence invariant:** without `LIVE_TEST_VIEW=1` in the environment, the package must produce zero output and zero behavioral change. Every capture-related task must preserve this.
- Protocol version is `v: 1`, marker is `##LTV##`. Exact wire format defined in Task 3; do not deviate.
- Frame cap: 500 frames per test file run, then a single warning event.
- Repo root: `/Users/anirudh/apps/live_test_view/`. All paths below are relative to it.
- Where a step says "Expected: PASS/FAIL", actually run the command and confirm before moving on.

---

### Task 1: Monorepo scaffold + example fixture app

**Files:**
- Create: `packages/live_test_view/pubspec.yaml`
- Create: `packages/live_test_view/analysis_options.yaml`
- Create: `packages/live_test_view/lib/live_test_view.dart`
- Create: `packages/live_test_view/lib/src/config.dart`
- Create: `packages/live_test_view/example/pubspec.yaml`
- Create: `packages/live_test_view/example/lib/main.dart`
- Create: `packages/live_test_view/example/test/counter_test.dart`

**Interfaces:**
- Produces: `liveTestView(FutureOr<void> Function() testMain)` — public API, passthrough-only for now (Task 2 adds capture). Example app `CounterApp` with a counter that increments via FAB and animates opacity over 400 ms (gives `pumpAndSettle` multiple frames).

- [ ] **Step 1: Package pubspec + lints**

```yaml
# packages/live_test_view/pubspec.yaml
name: live_test_view
description: >-
  Watch Flutter widget tests render live in your editor. Companion package
  for the Live Test View VS Code extension.
version: 0.1.0
environment:
  sdk: ^3.2.0
  flutter: ">=3.16.0"
dependencies:
  flutter:
    sdk: flutter
  flutter_test:
    sdk: flutter
dev_dependencies:
  flutter_lints: ^4.0.0
```

```yaml
# packages/live_test_view/analysis_options.yaml
include: package:flutter_lints/flutter.yaml
```

- [ ] **Step 2: Public API surface (passthrough only)**

```dart
// packages/live_test_view/lib/live_test_view.dart
export 'src/config.dart' show liveTestView;
```

```dart
// packages/live_test_view/lib/src/config.dart
import 'dart:async';
import 'dart:io';

/// Wraps a suite's `testExecutable`. Streams rendered frames to stdout when
/// the Live Test View editor extension sets LIVE_TEST_VIEW=1 in the test
/// process's environment. A strict no-op otherwise.
Future<void> liveTestView(FutureOr<void> Function() testMain) async {
  if (Platform.environment['LIVE_TEST_VIEW'] != '1') {
    await testMain();
    return;
  }
  // Capture wiring lands in a later task.
  await testMain();
}
```

- [ ] **Step 3: Example app**

```yaml
# packages/live_test_view/example/pubspec.yaml
name: live_test_view_example
description: Fixture app for live_test_view's end-to-end tests.
publish_to: none
environment:
  sdk: ^3.2.0
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_test:
    sdk: flutter
  live_test_view:
    path: ../
```

```dart
// packages/live_test_view/example/lib/main.dart
import 'package:flutter/material.dart';

void main() => runApp(const CounterApp());

class CounterApp extends StatelessWidget {
  const CounterApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: CounterPage());
}

class CounterPage extends StatefulWidget {
  const CounterPage({super.key});

  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int _count = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live Test View example')),
      body: Center(
        child: AnimatedOpacity(
          opacity: _count.isEven ? 1 : 0.3,
          duration: const Duration(milliseconds: 400),
          child: Text('$_count', style: const TextStyle(fontSize: 64)),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _count++),
        child: const Icon(Icons.add),
      ),
    );
  }
}
```

```dart
// packages/live_test_view/example/test/counter_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view_example/main.dart';

void main() {
  testWidgets('increments the counter', (tester) async {
    await tester.pumpWidget(const CounterApp());
    expect(find.text('0'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('fades the counter on odd values', (tester) async {
    await tester.pumpWidget(const CounterApp());
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget);
  });
}
```

- [ ] **Step 4: Verify everything resolves and tests are green**

Run:
```bash
cd packages/live_test_view && flutter pub get && cd example && flutter pub get && flutter test
```
Expected: `All tests passed!` (2 tests). Also run `dart analyze packages/live_test_view` from repo root — expected: no issues.

- [ ] **Step 5: Report done** — list files created; user commits manually.

---

### Task 2: SPIKE — prove frame capture under FakeAsync (the spec's mandated de-risk)

This task intentionally writes throwaway-quality capture code inline in `config.dart`. Tasks 3–5 replace it with the real modules. **Do not skip or reorder this task** — if capture doesn't work, the project design changes.

**Files:**
- Modify: `packages/live_test_view/lib/src/config.dart`
- Create: `packages/live_test_view/example/test/flutter_test_config.dart`

**Interfaces:**
- Consumes: `liveTestView` from Task 1.
- Produces: a written **spike verdict** (see Step 4) that Task 10 consumes to decide whether the webview needs paced playback.

- [ ] **Step 1: Wire the example suite through the hook**

```dart
// packages/live_test_view/example/test/flutter_test_config.dart
import 'dart:async';

import 'package:live_test_view/live_test_view.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    liveTestView(testMain);
```

- [ ] **Step 2: Crude capture implementation**

Replace `config.dart` with:

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// SPIKE VERSION — replaced by Tasks 3-5.
Future<void> liveTestView(FutureOr<void> Function() testMain) async {
  if (Platform.environment['LIVE_TEST_VIEW'] != '1') {
    await testMain();
    return;
  }
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  var seq = 0;
  final pending = <Future<void>>[];
  // Registered AFTER binding init, so this runs after RendererBinding's own
  // drawFrame persistent callback — layout and paint are complete here.
  binding.addPersistentFrameCallback((_) {
    final renderView = binding.renderViews.first;
    final layer = renderView.debugLayer;
    if (layer is! OffsetLayer) return;
    // Scene is snapshotted synchronously by toImage(); only rasterization
    // and encoding are async.
    final imageFuture = layer.toImage(renderView.paintBounds);
    final frameSeq = seq++;
    // Zone.root escapes FakeAsync so encoding is never trapped behind
    // fake timers.
    pending.add(Zone.root.run(() async {
      final image = await imageFuture;
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (bytes == null) return;
      stdout.writeln('##LTV##${jsonEncode({
            'v': 1,
            'type': 'frame',
            'seq': frameSeq,
            'wallMs': DateTime.now().millisecondsSinceEpoch,
            'png': base64Encode(bytes.buffer.asUint8List()),
          })}');
    }));
  });
  try {
    await testMain();
  } finally {
    await Future.wait(pending);
    await stdout.flush();
  }
}
```

- [ ] **Step 3: Verify frames are emitted and are real PNGs**

Run (from `packages/live_test_view/example`):
```bash
LIVE_TEST_VIEW=1 flutter test test/counter_test.dart | grep -c '##LTV##'
```
Expected: a count ≥ 6 (initial frame + tap frame for test 1; initial + ~5 animation frames for test 2).

Then:
```bash
LIVE_TEST_VIEW=1 flutter test test/counter_test.dart | grep '##LTV##' | head -1 | sed 's/^##LTV##//' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('/tmp/ltv_spike.png','wb').write(base64.b64decode(d['png']))"
file /tmp/ltv_spike.png
```
Expected: `PNG image data, 800 x 600` (the default test surface size). Open the PNG and confirm it shows the counter app.

Also verify silence:
```bash
flutter test test/counter_test.dart | grep -c '##LTV##' || echo SILENT
```
Expected: `SILENT` (grep finds nothing) and `All tests passed!`.

- [ ] **Step 4: Measure liveness and record the spike verdict**

Extract `wallMs` from all frames of the `pumpAndSettle` test run and compare the spread of first→last frame against the run duration. Question to answer: **do frames stream out while the test executes, or burst at test end?** (FakeAsync may prevent the real event loop from delivering `toImage` completions mid-test.)

Run:
```bash
LIVE_TEST_VIEW=1 flutter test test/counter_test.dart | grep '##LTV##' | sed 's/^##LTV##//' \
  | python3 -c "
import sys, json
ts = [json.loads(l)['wallMs'] for l in sys.stdin]
print('frames:', len(ts), 'spread_ms:', ts[-1]-ts[0] if ts else 0)"
```

Write the verdict into the plan file itself, replacing this sentence — either:
- **STREAMING** (spread is a meaningful fraction of the run): frames arrive live; Task 10 renders frames on arrival, no pacing needed.
- **BURST** (spread ≈ 0): frames arrive at test end; Task 10 MUST implement paced playback (render frames spaced by `testTimeMs` deltas, capped at 300 ms per gap) so the panel still *shows* the test unfolding.

Either verdict is acceptable — the timeline scrubber preserves full value regardless. Only if PNG decoding itself failed in Step 3 is the spike a failure; stop and revisit the design with the user.

- [ ] **Step 5: Report done** — include frame count, PNG verification result, and the spike verdict.

---

### Task 3: Wire protocol module (TDD)

**Files:**
- Create: `packages/live_test_view/lib/src/protocol.dart`
- Create: `packages/live_test_view/test/protocol_test.dart`

**Interfaces:**
- Produces: `const ltvMarker = '##LTV##'`; `String encodeFrameLine({required int seq, required int testTimeMs, required int width, required int height, required Uint8List png})`; `String encodeWarningLine(String message)`. Consumed by Tasks 5 and the e2e test.

- [ ] **Step 1: Write the failing tests**

```dart
// packages/live_test_view/test/protocol_test.dart
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/protocol.dart';

void main() {
  test('encodeFrameLine produces a single marked line with all fields', () {
    final png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47]);
    final line = encodeFrameLine(
        seq: 3, testTimeMs: 450, width: 800, height: 600, png: png);
    expect(line, startsWith(ltvMarker));
    expect(line.contains('\n'), isFalse);
    final decoded =
        jsonDecode(line.substring(ltvMarker.length)) as Map<String, dynamic>;
    expect(decoded, {
      'v': 1,
      'type': 'frame',
      'seq': 3,
      'testTimeMs': 450,
      'w': 800,
      'h': 600,
      'png': base64Encode(png),
    });
  });

  test('encodeWarningLine emits versioned warning', () {
    final line = encodeWarningLine('frame cap reached');
    final decoded = jsonDecode(line.substring(ltvMarker.length));
    expect(decoded, {'v': 1, 'type': 'warning', 'message': 'frame cap reached'});
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/live_test_view && flutter test test/protocol_test.dart`
Expected: FAIL — `protocol.dart` does not exist.

- [ ] **Step 3: Implement**

```dart
// packages/live_test_view/lib/src/protocol.dart
import 'dart:convert';
import 'dart:typed_data';

/// Prefix for every Live Test View line on stdout. The extension routes
/// lines by this marker; everything else passes through untouched.
const ltvMarker = '##LTV##';

String encodeFrameLine({
  required int seq,
  required int testTimeMs,
  required int width,
  required int height,
  required Uint8List png,
}) =>
    '$ltvMarker${jsonEncode(<String, Object>{
      'v': 1,
      'type': 'frame',
      'seq': seq,
      'testTimeMs': testTimeMs,
      'w': width,
      'h': height,
      'png': base64Encode(png),
    })}';

String encodeWarningLine(String message) =>
    '$ltvMarker${jsonEncode(<String, Object>{
      'v': 1,
      'type': 'warning',
      'message': message,
    })}';
```

- [ ] **Step 4: Run to verify pass**

Run: `flutter test test/protocol_test.dart` — Expected: PASS (2 tests).

- [ ] **Step 5: Report done.**

---

### Task 4: CoalescingGate (TDD)

Serializes capture work: at most one PNG encode in flight; bursts (e.g. `pumpAndSettle`) collapse so the final frame of a burst is always captured, and emissions can never reorder.

**Files:**
- Create: `packages/live_test_view/lib/src/coalescing_gate.dart`
- Create: `packages/live_test_view/test/coalescing_gate_test.dart`

**Interfaces:**
- Produces: `class CoalescingGate { void request(Future<void> Function() action); Future<void> drain(); }`. `request` returns immediately; the **latest** requested action is the one a coalesced follow-up runs. `drain()` completes when nothing is running or queued. Consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

```dart
// packages/live_test_view/test/coalescing_gate_test.dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/coalescing_gate.dart';

void main() {
  test('runs immediately when idle', () async {
    final gate = CoalescingGate();
    var runs = 0;
    gate.request(() async => runs++);
    await gate.drain();
    expect(runs, 1);
    gate.request(() async => runs++);
    await gate.drain();
    expect(runs, 2);
  });

  test('coalesces a burst into exactly one follow-up run', () async {
    final gate = CoalescingGate();
    var runs = 0;
    final blocker = Completer<void>();
    Future<void> action() async {
      runs++;
      if (runs == 1) await blocker.future;
    }

    gate.request(action);
    gate.request(action);
    gate.request(action);
    gate.request(action);
    expect(runs, 1, reason: 'burst must not queue while one is in flight');
    blocker.complete();
    await gate.drain();
    expect(runs, 2, reason: 'exactly one follow-up for the whole burst');
  });

  test('follow-up runs the latest requested action', () async {
    final gate = CoalescingGate();
    final ran = <String>[];
    final blocker = Completer<void>();
    gate.request(() async {
      ran.add('first');
      await blocker.future;
    });
    gate.request(() async => ran.add('stale'));
    gate.request(() async => ran.add('latest'));
    blocker.complete();
    await gate.drain();
    expect(ran, ['first', 'latest']);
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `flutter test test/coalescing_gate_test.dart` — Expected: FAIL, file not found.

- [ ] **Step 3: Implement**

```dart
// packages/live_test_view/lib/src/coalescing_gate.dart
import 'dart:async';

/// Serializes async work triggered by a synchronous, possibly bursty signal.
///
/// At most one action runs at a time. Requests arriving while one is running
/// collapse into a single follow-up (of the latest action), so the last
/// request is always honored but bursts never queue unboundedly.
class CoalescingGate {
  bool _inFlight = false;
  bool _dirty = false;
  Future<void> Function()? _latest;
  Future<void> _pending = Future.value();

  void request(Future<void> Function() action) {
    _latest = action;
    if (_inFlight) {
      _dirty = true;
      return;
    }
    _run();
  }

  void _run() {
    _inFlight = true;
    _pending = _latest!().whenComplete(() {
      _inFlight = false;
      if (_dirty) {
        _dirty = false;
        _run();
      }
    });
  }

  /// Completes when no work is running or queued.
  Future<void> drain() async {
    while (_inFlight) {
      await _pending;
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `flutter test test/coalescing_gate_test.dart` — Expected: PASS (3 tests).

- [ ] **Step 5: Report done.**

---

### Task 5: Production FrameCapture + automated e2e test

Replaces the Task 2 spike with the real capture engine: gate-serialized, frame-capped, fake-clock timestamped.

**Files:**
- Create: `packages/live_test_view/lib/src/capture.dart`
- Modify: `packages/live_test_view/lib/src/config.dart` (replace spike entirely)
- Create: `packages/live_test_view/test/e2e_test.dart`

**Interfaces:**
- Consumes: `CoalescingGate` (Task 4), `encodeFrameLine`/`encodeWarningLine`/`ltvMarker` (Task 3).
- Produces: `class FrameCapture { FrameCapture(TestWidgetsFlutterBinding binding, {IOSink? sink, int maxFrames = 500}); void onFrame(); Future<void> flush(); }` and the final `liveTestView`. This is the package's finished behavior; the extension (Tasks 7+) relies on the wire format exactly as emitted here.

- [ ] **Step 1: Implement FrameCapture**

```dart
// packages/live_test_view/lib/src/capture.dart
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'coalescing_gate.dart';
import 'protocol.dart';

/// Captures the test's root render layer after each pumped frame and emits
/// it as a protocol line on [_sink].
class FrameCapture {
  FrameCapture(this._binding, {IOSink? sink, this.maxFrames = 500})
      : _sink = sink ?? stdout;

  final TestWidgetsFlutterBinding _binding;
  final IOSink _sink;
  final int maxFrames;
  final _gate = CoalescingGate();

  int _seq = 0;
  bool _capWarned = false;
  DateTime? _firstFrameAt;

  /// Called synchronously from a persistent frame callback, after paint.
  void onFrame() {
    _firstFrameAt ??= _binding.clock.now();
    if (_seq >= maxFrames) {
      if (!_capWarned) {
        _capWarned = true;
        _sink.writeln(encodeWarningLine(
            'frame cap ($maxFrames) reached; dropping further frames'));
      }
      return;
    }
    // Fake-clock timestamp read now; capture runs entirely in the root zone
    // so no part of the async pipeline is trapped behind FakeAsync.
    final testTimeMs =
        _binding.clock.now().difference(_firstFrameAt!).inMilliseconds;
    Zone.root.run(() => _gate.request(() => _capture(testTimeMs)));
  }

  Future<void> _capture(int testTimeMs) async {
    final renderView = _binding.renderViews.first;
    final layer = renderView.debugLayer;
    if (layer is! OffsetLayer) return;
    final image = await layer.toImage(renderView.paintBounds);
    final width = image.width;
    final height = image.height;
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    if (bytes == null) return;
    _sink.writeln(encodeFrameLine(
      seq: _seq++,
      testTimeMs: testTimeMs,
      width: width,
      height: height,
      png: bytes.buffer.asUint8List(),
    ));
  }

  /// Awaits all in-flight captures and flushes the sink. Call after
  /// [testMain] completes — real async is legal there.
  Future<void> flush() async {
    await _gate.drain();
    await _sink.flush();
  }
}
```

- [ ] **Step 2: Final `liveTestView`**

Replace `config.dart` with:

```dart
// packages/live_test_view/lib/src/config.dart
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'capture.dart';

/// Wraps a suite's `testExecutable`. Streams rendered frames to stdout when
/// the Live Test View editor extension sets LIVE_TEST_VIEW=1 in the test
/// process's environment. A strict no-op otherwise.
Future<void> liveTestView(FutureOr<void> Function() testMain) async {
  if (Platform.environment['LIVE_TEST_VIEW'] != '1') {
    await testMain();
    return;
  }
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  final capture = FrameCapture(binding);
  // Registered after binding init → runs after RendererBinding.drawFrame,
  // i.e. after layout and paint for the frame are complete.
  binding.addPersistentFrameCallback((_) => capture.onFrame());
  try {
    await testMain();
  } finally {
    await capture.flush();
  }
}
```

- [ ] **Step 3: Write the automated e2e test**

```dart
// packages/live_test_view/test/e2e_test.dart
@Timeout(Duration(minutes: 5))
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/protocol.dart';

Future<ProcessResult> _runExampleTests({required bool live}) => Process.run(
      'flutter',
      ['test', 'test/counter_test.dart'],
      workingDirectory: 'example',
      environment: {
        ...Platform.environment,
        if (live) 'LIVE_TEST_VIEW': '1',
      },
    );

void main() {
  test('emits ordered, decodable PNG frames when activated', () async {
    final result = await _runExampleTests(live: true);
    expect(result.exitCode, 0, reason: '${result.stderr}');
    final frames = const LineSplitter()
        .convert(result.stdout.toString())
        .where((l) => l.startsWith(ltvMarker))
        .map((l) =>
            jsonDecode(l.substring(ltvMarker.length)) as Map<String, dynamic>)
        .where((e) => e['type'] == 'frame')
        .toList();
    expect(frames.length, greaterThanOrEqualTo(6),
        reason: '2 frames from test 1 + ≥4 animation frames from test 2');
    final seqs = frames.map((f) => f['seq'] as int).toList();
    expect(seqs, List<int>.generate(seqs.length, (i) => i),
        reason: 'gate serialization must guarantee ordered, gapless seq');
    for (final f in frames) {
      expect(f['v'], 1);
      expect(f['w'], 800);
      expect(f['h'], 600);
      expect(f['testTimeMs'], isA<int>());
      final png = base64Decode(f['png'] as String);
      expect(png.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47],
          reason: 'PNG magic bytes');
    }
  });

  test('is byte-for-byte silent without the activation flag', () async {
    final result = await _runExampleTests(live: false);
    expect(result.exitCode, 0);
    expect(result.stdout.toString().contains(ltvMarker), isFalse);
  });
}
```

- [ ] **Step 4: Run everything**

Run: `cd packages/live_test_view && flutter test`
Expected: PASS — protocol, gate, and both e2e tests (e2e takes ~1–2 min; it spawns `flutter test` twice). Then `dart analyze .` — no issues.

- [ ] **Step 5: Report done** — confirm the spike code is fully gone from `config.dart`.

---

### Task 6: Installer (TDD)

**Files:**
- Create: `packages/live_test_view/lib/src/installer.dart`
- Create: `packages/live_test_view/bin/install.dart`
- Create: `packages/live_test_view/test/installer_test.dart`

**Interfaces:**
- Produces: `InstallResult install(Directory projectRoot)` with sealed results `Installed`, `NoTestDirectory`, `ConfigAlreadyExists`; CLI `dart run live_test_view:install`. The extension's one-click setup (Task 11) runs this CLI.

- [ ] **Step 1: Write the failing tests**

```dart
// packages/live_test_view/test/installer_test.dart
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/installer.dart';

void main() {
  late Directory root;

  setUp(() {
    root = Directory.systemTemp.createTempSync('ltv_install');
  });

  tearDown(() => root.deleteSync(recursive: true));

  test('writes config into an existing test/ directory', () {
    Directory('${root.path}/test').createSync();
    expect(install(root), isA<Installed>());
    final content =
        File('${root.path}/test/flutter_test_config.dart').readAsStringSync();
    expect(content, contains('liveTestView(testMain)'));
    expect(content, contains("import 'package:live_test_view/live_test_view.dart'"));
  });

  test('refuses when there is no test/ directory', () {
    expect(install(root), isA<NoTestDirectory>());
  });

  test('never overwrites an existing config', () {
    Directory('${root.path}/test').createSync();
    final existing = File('${root.path}/test/flutter_test_config.dart')
      ..writeAsStringSync('// user content');
    expect(install(root), isA<ConfigAlreadyExists>());
    expect(existing.readAsStringSync(), '// user content');
  });
}
```

- [ ] **Step 2: Run to verify failure** — `flutter test test/installer_test.dart` → FAIL, file not found.

- [ ] **Step 3: Implement**

```dart
// packages/live_test_view/lib/src/installer.dart
import 'dart:io';

const configTemplate = '''
// Generated by live_test_view (https://pub.dev/packages/live_test_view).
// Streams rendered frames to the Live Test View editor extension when the
// extension runs a test. A strict no-op under plain `flutter test`.
import 'dart:async';

import 'package:live_test_view/live_test_view.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    liveTestView(testMain);
''';

sealed class InstallResult {
  const InstallResult();
}

class Installed extends InstallResult {
  const Installed();
}

class NoTestDirectory extends InstallResult {
  const NoTestDirectory();
}

class ConfigAlreadyExists extends InstallResult {
  const ConfigAlreadyExists();
}

InstallResult install(Directory projectRoot) {
  final testDir = Directory('${projectRoot.path}/test');
  if (!testDir.existsSync()) return const NoTestDirectory();
  final config = File('${testDir.path}/flutter_test_config.dart');
  if (config.existsSync()) return const ConfigAlreadyExists();
  config.writeAsStringSync(configTemplate);
  return const Installed();
}
```

```dart
// packages/live_test_view/bin/install.dart
import 'dart:io';

import 'package:live_test_view/src/installer.dart';

void main() {
  switch (install(Directory.current)) {
    case Installed():
      stdout.writeln('✓ Wrote test/flutter_test_config.dart');
    case NoTestDirectory():
      stderr.writeln(
          'No test/ directory here. Run from your Flutter project root.');
      exitCode = 1;
    case ConfigAlreadyExists():
      stdout.writeln('test/flutter_test_config.dart already exists.');
      stdout.writeln(
          'Wire live_test_view in manually by wrapping your existing body:');
      stdout.writeln('');
      stdout.writeln(
          '  Future<void> testExecutable(FutureOr<void> Function() testMain) =>');
      stdout.writeln('      liveTestView(() => yourExistingSetup(testMain));');
  }
}
```

- [ ] **Step 4: Run to verify pass** — `flutter test test/installer_test.dart` → PASS (3 tests). Sanity-check the CLI in a temp dir:

```bash
mkdir -p /tmp/ltv_cli_check/test && cd /tmp/ltv_cli_check && dart run /Users/anirudh/apps/live_test_view/packages/live_test_view/bin/install.dart && cat test/flutter_test_config.dart
```
Expected: `✓ Wrote test/flutter_test_config.dart` and the template content.

- [ ] **Step 5: Report done.**

---

### Task 7: Extension scaffold + test scanner + CodeLens (TDD)

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/.vscodeignore`
- Create: `extension/src/scan.ts`
- Create: `extension/src/scan.test.ts`
- Create: `extension/src/codelens.ts`
- Create: `extension/src/extension.ts`

**Interfaces:**
- Produces: `findTestSites(source: string): TestSite[]` with `TestSite { name: string; line: number }` (zero-based line); command id `liveTestView.runTest` invoked with `[filePath: string, testName: string]`; `activate()` registering the CodeLens provider. Task 11 replaces the command's stub body.

- [ ] **Step 1: Scaffold**

```json
// extension/package.json
{
  "name": "live-test-view",
  "displayName": "Live Test View",
  "description": "Watch Flutter widget tests render live as they run.",
  "version": "0.1.0",
  "publisher": "anirudh-singh",
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Testing"],
  "activationEvents": ["onLanguage:dart"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "liveTestView.runTest", "title": "Live Test View: Run Test" }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Note: `publisher` must match the Marketplace publisher id created in Task 12; adjust there if needed.

```json
// extension/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "out",
    "lib": ["ES2022"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

```
# extension/.vscodeignore
src/**
out/**/*.map
tsconfig.json
node_modules/**
```

- [ ] **Step 2: Write the failing scanner tests**

```ts
// extension/src/scan.test.ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `cd extension && npm install && npx vitest run`
Expected: FAIL — `./scan` not found.

- [ ] **Step 4: Implement the scanner**

```ts
// extension/src/scan.ts
export interface TestSite {
  /** Literal first argument of testWidgets(). */
  name: string;
  /** Zero-based line of the testWidgets token. */
  line: number;
}

const TEST_WIDGETS_RE =
  /testWidgets\s*\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\s*,/g;

/**
 * Finds testWidgets() calls with a literal, non-interpolated string name.
 * Interpolated and raw-string names get no CodeLens (v1 limitation): their
 * runtime name cannot be known statically for --plain-name matching.
 */
export function findTestSites(source: string): TestSite[] {
  const sites: TestSite[] = [];
  for (const match of source.matchAll(TEST_WIDGETS_RE)) {
    const raw = match[1] ?? match[2];
    if (raw.includes('$')) continue;
    const name = raw.replace(/\\(.)/g, '$1');
    const line = source.slice(0, match.index).split('\n').length - 1;
    sites.push({ name, line });
  }
  return sites;
}
```

- [ ] **Step 5: Run to verify pass** — `npx vitest run` → PASS (4 tests).

- [ ] **Step 6: CodeLens provider + activation (stub command)**

```ts
// extension/src/codelens.ts
import * as vscode from 'vscode';
import { findTestSites } from './scan';

export class LiveTestCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findTestSites(document.getText()).map(
      (site) =>
        new vscode.CodeLens(new vscode.Range(site.line, 0, site.line, 0), {
          command: 'liveTestView.runTest',
          title: '▶ Live View',
          arguments: [document.uri.fsPath, site.name],
        }),
    );
  }
}
```

```ts
// extension/src/extension.ts
import * as vscode from 'vscode';
import { LiveTestCodeLensProvider } from './codelens';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'dart', pattern: '**/*_test.dart' },
      new LiveTestCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      'liveTestView.runTest',
      (filePath: string, testName: string) => {
        // Replaced in Task 11 with the real runner + panel orchestration.
        void vscode.window.showInformationMessage(
          `Live View: ${testName} (${filePath})`,
        );
      },
    ),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 7: Compile and smoke-test**

Run: `npx tsc -p ./` — Expected: no errors.
Manual: open `extension/` in VS Code, press F5 (Extension Development Host), open `packages/live_test_view/example/test/counter_test.dart` in the dev host. Expected: `▶ Live View` lens above both `testWidgets`, clicking shows the info message with the correct name.

- [ ] **Step 8: Report done** — include whether the manual lens check passed.

---

### Task 8: Extension-side protocol parser (TDD)

**Files:**
- Create: `extension/src/protocol.ts`
- Create: `extension/src/protocol.test.ts`

**Interfaces:**
- Consumes: the wire format from Tasks 3/5 (`##LTV##` + JSON) and `flutter test --machine` JSON-reporter lines.
- Produces:
  ```ts
  const LTV_MARKER = '##LTV##';
  type FrameEvent = { v: number; type: 'frame'; seq: number; testTimeMs: number; w: number; h: number; png: string };
  type WarningEvent = { v: number; type: 'warning'; message: string };
  type LtvEvent = FrameEvent | WarningEvent;
  type MachineEvent =
    | { type: 'testStart'; test: { id: number; name: string } }
    | { type: 'testDone'; testID: number; result: 'success' | 'failure' | 'error'; hidden: boolean; skipped: boolean }
    | { type: 'error'; testID: number; error: string; stackTrace: string; isFailure: boolean }
    | { type: 'done'; success: boolean | null };
  type ParsedLine =
    | { kind: 'ltv'; event: LtvEvent }
    | { kind: 'machine'; event: MachineEvent }
    | { kind: 'other'; text: string };
  function parseLine(line: string): ParsedLine;
  ```
  Consumed by Tasks 9 and 11.

- [ ] **Step 1: Write the failing tests**

```ts
// extension/src/protocol.test.ts
import { describe, expect, it } from 'vitest';
import { parseLine } from './protocol';

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
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run` → new suite FAILS.

- [ ] **Step 3: Implement**

```ts
// extension/src/protocol.ts
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

export function parseLine(line: string): ParsedLine {
  if (line.startsWith(LTV_MARKER)) {
    try {
      const event = JSON.parse(line.slice(LTV_MARKER.length));
      if (LTV_TYPES.has(event.type)) return { kind: 'ltv', event };
    } catch {
      // fall through to 'other'
    }
    return { kind: 'other', text: line };
  }
  const trimmed = line.trim();
  if (trimmed.startsWith('{')) {
    try {
      const event = JSON.parse(trimmed);
      if (MACHINE_TYPES.has(event.type)) return { kind: 'machine', event };
    } catch {
      // fall through to 'other'
    }
  }
  return { kind: 'other', text: line };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run` → PASS (scan + protocol suites). `npx tsc -p ./` → no errors.

- [ ] **Step 5: Report done.**

---

### Task 9: Test runner — process spawn + project-root discovery (TDD for pure parts)

**Files:**
- Create: `extension/src/runner.ts`
- Create: `extension/src/runner.test.ts`

**Interfaces:**
- Consumes: `parseLine`, `ParsedLine` (Task 8).
- Produces:
  ```ts
  function findProjectRoot(testFilePath: string): string | undefined; // nearest ancestor dir containing pubspec.yaml
  class TestRun {
    start(testFilePath: string, testName: string,
          onLine: (l: ParsedLine) => void,
          onExit: (code: number | null) => void): void; // kills any previous run first
    kill(): void;
  }
  ```
  Consumed by Task 11.

- [ ] **Step 1: Write the failing test for root discovery**

```ts
// extension/src/runner.test.ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run` → FAIL.

- [ ] **Step 3: Implement**

```ts
// extension/src/runner.ts
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { ParsedLine, parseLine } from './protocol';

export function findProjectRoot(testFilePath: string): string | undefined {
  let dir = path.dirname(testFilePath);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Owns at most one live `flutter test` child process. */
export class TestRun {
  private child: cp.ChildProcess | undefined;

  start(
    testFilePath: string,
    testName: string,
    onLine: (l: ParsedLine) => void,
    onExit: (code: number | null) => void,
  ): void {
    this.kill();
    const root = findProjectRoot(testFilePath);
    if (!root) throw new Error(`No pubspec.yaml found above ${testFilePath}`);
    const rel = path.relative(root, testFilePath);
    const child = cp.spawn(
      'flutter',
      ['test', rel, '--plain-name', testName, '--machine'],
      {
        cwd: root,
        env: { ...process.env, LIVE_TEST_VIEW: '1' },
        // flutter is flutter.bat on Windows; spawn needs a shell there.
        shell: process.platform === 'win32',
      },
    );
    this.child = child;
    readline
      .createInterface({ input: child.stdout! })
      .on('line', (l) => onLine(parseLine(l)));
    readline
      .createInterface({ input: child.stderr! })
      .on('line', (l) => onLine({ kind: 'other', text: l }));
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      onExit(code);
    });
  }

  kill(): void {
    this.child?.kill();
    this.child = undefined;
  }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run` → PASS; `npx tsc -p ./` → no errors.

- [ ] **Step 5: Report done.** (Process spawning is exercised end-to-end in Task 11's manual checklist; `--plain-name` substring matching may run multiple tests when names overlap — known v1 limitation, panel shows the last-started test's name.)

---

### Task 10: Webview panel

No unit tests here (webview + DOM); correctness is covered by Task 11's manual checklist. Keep all logic dumb: the panel renders exactly what it is told.

**Files:**
- Create: `extension/src/panel.ts`
- Create: `extension/media/panel.js`
- Create: `extension/media/panel.css`

**Interfaces:**
- Produces: `class LiveViewPanel` with:
  ```ts
  static show(extensionUri: vscode.Uri, onDispose: () => void): LiveViewPanel; // singleton; reveals if open
  post(msg: PanelMessage): void;
  onSetupRequested(handler: () => void): void;
  ```
  Extension→webview messages (`PanelMessage`):
  - `{ type: 'reset', testLabel: string }` — clear frames, show spinner
  - `{ type: 'frame', seq: number, testTimeMs: number, png: string }`
  - `{ type: 'status', state: 'passed' | 'failed', error?: string, stack?: string }`
  - `{ type: 'testName', name: string }` — label from machine testStart
  - `{ type: 'setupNeeded' }`
  Webview→extension: `{ type: 'setup' }`. Consumed by Task 11.

- [ ] **Step 1: Panel host**

```ts
// extension/src/panel.ts
import * as vscode from 'vscode';

export type PanelMessage =
  | { type: 'reset'; testLabel: string }
  | { type: 'frame'; seq: number; testTimeMs: number; png: string }
  | { type: 'status'; state: 'passed' | 'failed'; error?: string; stack?: string }
  | { type: 'testName'; name: string }
  | { type: 'setupNeeded' };

export class LiveViewPanel {
  private static current: LiveViewPanel | undefined;
  private setupHandler: (() => void) | undefined;

  private constructor(private readonly panel: vscode.WebviewPanel) {}

  static show(extensionUri: vscode.Uri, onDispose: () => void): LiveViewPanel {
    if (LiveViewPanel.current) {
      LiveViewPanel.current.panel.reveal(undefined, true);
      return LiveViewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'liveTestView',
      'Live Test View',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    const instance = new LiveViewPanel(panel);
    panel.webview.html = render(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'setup') instance.setupHandler?.();
    });
    panel.onDidDispose(() => {
      LiveViewPanel.current = undefined;
      onDispose();
    });
    LiveViewPanel.current = instance;
    return instance;
  }

  post(msg: PanelMessage): void {
    void this.panel.webview.postMessage(msg);
  }

  onSetupRequested(handler: () => void): void {
    this.setupHandler = handler;
  }
}

function render(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const js = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'panel.js'),
  );
  const css = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'panel.css'),
  );
  const nonce = Math.random().toString(36).slice(2);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <div id="status-bar">
    <span id="test-label">No test running</span>
    <span id="state"></span>
  </div>
  <div id="frame-area"><img id="frame" alt=""></div>
  <div id="timeline">
    <input id="slider" type="range" min="0" max="0" value="0" disabled>
    <span id="frame-info"></span>
  </div>
  <details id="error-box" hidden><summary>Failure details</summary><pre id="error-text"></pre></details>
  <div id="setup-box" hidden>
    <p>No frames received — the <code>live_test_view</code> package doesn't seem to be set up in this project.</p>
    <button id="setup-btn">Set up Live Test View</button>
  </div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}
```

- [ ] **Step 2: Webview script**

```js
// extension/media/panel.js
// Renders exactly what the extension posts. No protocol knowledge here.
(function () {
  const vscode = acquireVsCodeApi();
  const frames = [];
  let follow = true;

  const el = (id) => document.getElementById(id);
  const img = el('frame');
  const slider = el('slider');
  const frameInfo = el('frame-info');
  const testLabel = el('test-label');
  const state = el('state');
  const errorBox = el('error-box');
  const errorText = el('error-text');
  const setupBox = el('setup-box');

  function renderFrame() {
    const f = frames[Number(slider.value)];
    if (!f) return;
    img.src = 'data:image/png;base64,' + f.png;
    frameInfo.textContent =
      'frame ' + (Number(slider.value) + 1) + '/' + frames.length +
      ' · ' + f.testTimeMs + ' ms';
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    switch (m.type) {
      case 'reset':
        frames.length = 0;
        follow = true;
        img.removeAttribute('src');
        slider.max = 0;
        slider.value = 0;
        slider.disabled = true;
        frameInfo.textContent = '';
        testLabel.textContent = m.testLabel;
        state.textContent = '● running';
        state.className = 'running';
        errorBox.hidden = true;
        setupBox.hidden = true;
        break;
      case 'testName':
        testLabel.textContent = m.name;
        break;
      case 'frame':
        frames.push(m);
        slider.max = String(frames.length - 1);
        slider.disabled = false;
        if (follow) {
          slider.value = slider.max;
          renderFrame();
        } else {
          renderFrame(); // refresh count label
        }
        break;
      case 'status':
        state.textContent = m.state === 'passed' ? '✓ passed' : '✗ failed';
        state.className = m.state;
        if (m.error) {
          errorText.textContent = m.error + '\n\n' + (m.stack || '');
          errorBox.hidden = false;
          errorBox.open = true;
        }
        break;
      case 'setupNeeded':
        state.textContent = '';
        setupBox.hidden = false;
        break;
    }
  });

  slider.addEventListener('input', () => {
    follow = Number(slider.value) === frames.length - 1;
    renderFrame();
  });

  el('setup-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'setup' });
  });
})();
```

**Conditional (spike verdict from Task 2):** if the verdict recorded in Task 2 Step 4 was **BURST**, add pacing: instead of rendering immediately in `case 'frame'` when `follow` is true, push into a play queue drained by `setTimeout` using consecutive `testTimeMs` deltas capped at 300 ms. If the verdict was STREAMING, skip this.

- [ ] **Step 3: Styles**

```css
/* extension/media/panel.css */
body {
  margin: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}
#status-bar {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 12px;
}
#state.running { color: var(--vscode-charts-yellow); }
#state.passed { color: var(--vscode-testing-iconPassed); }
#state.failed { color: var(--vscode-testing-iconFailed); }
#frame-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* checkerboard behind transparency */
  background: repeating-conic-gradient(#8883 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
}
#frame { max-width: 100%; max-height: 100%; }
#timeline { display: flex; gap: 8px; align-items: center; padding: 6px 10px; }
#slider { flex: 1; }
#frame-info { font-size: 11px; white-space: nowrap; }
#error-box { padding: 6px 10px; }
#error-text { white-space: pre-wrap; font-size: 11px; max-height: 30vh; overflow: auto; }
#setup-box { padding: 10px; }
```

- [ ] **Step 4: Compile** — `npx tsc -p ./` → no errors. (Behavior verified in Task 11.)

- [ ] **Step 5: Report done.**

---

### Task 11: Orchestration — command wiring, lifecycle, setup detection

**Files:**
- Modify: `extension/src/extension.ts` (replace the stub command)

**Interfaces:**
- Consumes: `TestRun`/`findProjectRoot` (Task 9), `LiveViewPanel`/`PanelMessage` (Task 10), `ParsedLine` (Task 8).
- Produces: the complete working extension.

- [ ] **Step 1: Implement the orchestrator**

Replace `extension/src/extension.ts` with:

```ts
import * as vscode from 'vscode';
import { LiveTestCodeLensProvider } from './codelens';
import { LiveViewPanel } from './panel';
import { TestRun } from './runner';

const run = new TestRun();
let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('Live Test View');
  context.subscriptions.push(
    output,
    vscode.languages.registerCodeLensProvider(
      { language: 'dart', pattern: '**/*_test.dart' },
      new LiveTestCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      'liveTestView.runTest',
      (filePath: string, testName: string) =>
        runLiveTest(context.extensionUri, filePath, testName),
    ),
  );
}

export function deactivate(): void {
  run.kill();
}

function runLiveTest(
  extensionUri: vscode.Uri,
  filePath: string,
  testName: string,
): void {
  const panel = LiveViewPanel.show(extensionUri, () => run.kill());
  panel.onSetupRequested(() => runSetup(filePath));
  panel.post({ type: 'reset', testLabel: testName });

  let frameCount = 0;
  let sawRealTest = false;
  let failure: { error: string; stack: string } | undefined;

  try {
    run.start(
      filePath,
      testName,
      (line) => {
        switch (line.kind) {
          case 'ltv':
            if (line.event.type === 'frame') {
              frameCount++;
              panel.post({
                type: 'frame',
                seq: line.event.seq,
                testTimeMs: line.event.testTimeMs,
                png: line.event.png,
              });
            } else {
              output.appendLine(`[live_test_view] ${line.event.message}`);
            }
            break;
          case 'machine': {
            const e = line.event;
            if (e.type === 'testStart' && !e.test.name.startsWith('loading ')) {
              sawRealTest = true;
              panel.post({ type: 'testName', name: e.test.name });
            } else if (e.type === 'error') {
              failure = { error: e.error, stack: e.stackTrace };
            }
            break;
          }
          case 'other':
            output.appendLine(line.text);
            break;
        }
      },
      (code) => {
        if (code === 0 && sawRealTest && frameCount === 0) {
          panel.post({ type: 'setupNeeded' });
          return;
        }
        panel.post({
          type: 'status',
          state: code === 0 ? 'passed' : 'failed',
          error: failure?.error,
          stack: failure?.stack,
        });
      },
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`Live Test View: ${String(err)}`);
  }
}

function runSetup(testFilePath: string): void {
  const terminal = vscode.window.createTerminal('Live Test View setup');
  terminal.show();
  terminal.sendText(
    'flutter pub add --dev live_test_view && dart run live_test_view:install',
  );
}
```

Note: `runSetup` runs in the terminal's cwd — the workspace root. For single-project workspaces (the common case) that equals the project root. Multi-root/monorepo consumers can run the two commands manually; the panel text names the package, which is enough of a pointer. Do not build cwd plumbing for v1 (YAGNI), but pass `testFilePath` through as done above so a later version can.

- [ ] **Step 2: Compile and run all extension tests**

Run: `npx tsc -p ./ && npx vitest run` — Expected: clean compile, all suites PASS.

- [ ] **Step 3: Manual end-to-end checklist (Extension Development Host)**

Open `extension/` in VS Code, F5, then in the dev host open `packages/live_test_view/example`:

1. Open `test/counter_test.dart` → both lenses visible.
2. Click `▶ Live View` on "fades the counter on odd values" → panel opens beside the editor; frames appear (live or paced per spike verdict); status ends `✓ passed`; slider scrubs through frames with ms labels.
3. Click the other lens mid-idle → panel resets and reruns.
4. Temporarily change `expect(find.text('1'), findsOneWidget)` to `findsNothing` → rerun → `✗ failed`, error + stack visible in the details box, frames up to the failure still scrubbable. **Revert the edit.**
5. Close the panel while a run is active → process is killed (check no stray `flutter test` in `ps`).
6. In a scratch Flutter project WITHOUT the package (`flutter create /tmp/ltv_bare` and add a trivial `testWidgets` test), click the lens → run passes with zero frames → setup prompt appears; clicking it opens the terminal with the two setup commands.

Expected: all six pass. Record any deviation in the report.

- [ ] **Step 4: Report done** — full checklist results.

---

### Task 12: Docs, licensing, publish readiness, real-world validation

**Files:**
- Create: `README.md` (repo root)
- Create: `LICENSE` (repo root, MIT, "Copyright (c) 2026 Anirudh Singh")
- Create: `packages/live_test_view/README.md`
- Create: `packages/live_test_view/CHANGELOG.md`
- Create: `packages/live_test_view/LICENSE` (copy of root)
- Create: `extension/README.md`
- Create: `extension/CHANGELOG.md`
- Create: `extension/LICENSE` (copy of root)

- [ ] **Step 1: Root README** — cover: what it is (one paragraph + placeholder line `<!-- TODO(user): record demo GIF -->` is NOT allowed; instead write "Demo GIF: record with the example app before publishing" as an unchecked task list item in a "Before publishing" section), the 2-step setup (install extension; click the setup prompt OR run `flutter pub add --dev live_test_view && dart run live_test_view:install`), how it works (3 sentences: config hook → frame capture → stdout → webview), v1 limitations (literal test names only, `--plain-name` substring collisions, widget tests only), troubleshooting ("no frames appear" → package not wired / custom `flutter_test_config.dart` needs manual wrap; "frames arrive all at once" → known FakeAsync behavior, timeline scrubber still works).

- [ ] **Step 2: Package README + CHANGELOG** — README: install, what the config file does, the silence invariant, link to the extension. CHANGELOG: `## 0.1.0` with initial feature list.

- [ ] **Step 3: Extension README + CHANGELOG** — README: GIF section (same rule as Step 1), CodeLens usage, setup prompt, requirements (Flutter ≥ 3.16, package ≥ 0.1.0). CHANGELOG: `## 0.1.0`.

- [ ] **Step 4: Publish dry-runs**

```bash
cd packages/live_test_view && dart pub publish --dry-run
cd ../../extension && npx @vscode/vsce package
```
Expected: pub dry-run reports no errors (warnings about uncommitted changes are fine pre-commit); vsce produces a `.vsix`. Fix any packaging complaints (missing fields, oversized files — ensure `example/` build artifacts are excluded via `.pubignore` if flagged).

- [ ] **Step 5: Real-world validation against mypos_mobile**

With the `.vsix` installed (or dev host): in `/Users/anirudh/apps/mypos_mobile`, add the package via a **path dependency** (`live_test_view: { path: /Users/anirudh/apps/live_test_view/packages/live_test_view }` under dev_dependencies) and run `dart run live_test_view:install` — note mypos_mobile may already have a `flutter_test_config.dart`; if so, follow the printed manual-wrap instructions. Then click `▶ Live View` on a real widget test under `test/presentation/ui/` and confirm frames render. **Afterwards revert all mypos_mobile changes** (`git checkout -- .` in that repo is NOT allowed — list the changed files and let the user revert/keep them).

- [ ] **Step 6: Report done** — publish readiness summary + anything the user must do by hand (create pub.dev uploader, Marketplace publisher id matching `package.json`'s `publisher`, record GIFs, `git init` + first commit of this repo).

---

## Self-Review Notes

- **Spec coverage:** activation flag (T2/T5), frame-callback capture (T2/T5), coalescing + 500 cap (T4/T5), protocol v1 (T3/T8), installer + no-overwrite (T6), CodeLens literal-names-only (T7), `--machine` lifecycle (T8/T11), kill-previous / panel-close kill (T9/T10/T11), setup detection ≤2-step onboarding (T11), timeline scrubber + failure display (T10/T11), silence invariant e2e (T5), publish prep + mypos_mobile validation (T12), spike-first mandate (T2). Version-skew notice (spec error table) is intentionally deferred: with both artifacts at 0.1.0 there is nothing to skew against; the `v` field exists so the extension can add the notice when a v2 ever ships.
- **Type consistency:** `TestSite {name, line}` (T7) ↔ codelens args `[fsPath, name]` ↔ command signature (T7/T11); `ParsedLine` union (T8) ↔ runner callback (T9) ↔ orchestrator switch (T11); `PanelMessage` (T10) ↔ every `panel.post` in T11; wire fields `v/seq/testTimeMs/w/h/png` identical in T3 (Dart) and T8 (TS).
