import 'dart:async';

import 'package:live_test_view/live_test_view.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    liveTestView(testMain);
