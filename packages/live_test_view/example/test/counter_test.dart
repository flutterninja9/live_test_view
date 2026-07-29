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
