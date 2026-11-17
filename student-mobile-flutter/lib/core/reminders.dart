import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

/// Local "study reminder" notifications (Android), same as the Expo app's planner button.
class Reminders {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static bool get supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> _init() async {
    if (_ready) return;
    await _plugin.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    _ready = true;
  }

  /// Returns false when notification permission was not granted.
  static Future<bool> scheduleInOneHour(String body) async {
    await _init();
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final granted = await android?.requestNotificationsPermission() ?? true;
    if (!granted) return false;
    await _plugin.zonedSchedule(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000 % 100000,
      title: 'ArivuVazhi study plan',
      body: body,
      scheduledDate: tz.TZDateTime.now(tz.UTC).add(const Duration(hours: 1)),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails('study-reminders', 'Study reminders', importance: Importance.defaultImportance),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    );
    return true;
  }
}
