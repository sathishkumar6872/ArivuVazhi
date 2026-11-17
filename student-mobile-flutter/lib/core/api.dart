import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Backend base URL. Override for local dev:
/// `flutter run --dart-define=API_URL=http://10.0.2.2:4000/api/v1`
const String apiBase = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://arivu-backend-wzjh.onrender.com/api/v1',
);

const _accessKey = 'av_m_access';
const _refreshKey = 'av_m_refresh';
const _offlineQueueKey = 'av_m_offline_queue';

// ---------------------------------------------------------------- storage

const _secure = FlutterSecureStorage();
final Map<String, String> _memory = {};

/// Secure storage on Android/iOS, SharedPreferences on web, memory as last fallback.
Future<String?> storageGet(String key) async {
  try {
    if (kIsWeb) return (await SharedPreferences.getInstance()).getString(key);
    return await _secure.read(key: key);
  } catch (_) {
    return _memory[key];
  }
}

Future<void> storageSet(String key, String value) async {
  try {
    if (kIsWeb) {
      await (await SharedPreferences.getInstance()).setString(key, value);
    } else {
      await _secure.write(key: key, value: value);
    }
  } catch (_) {
    _memory[key] = value;
  }
}

Future<void> storageDelete(String key) async {
  _memory.remove(key);
  try {
    if (kIsWeb) {
      await (await SharedPreferences.getInstance()).remove(key);
    } else {
      await _secure.delete(key: key);
    }
  } catch (_) {}
}

Future<void> storageClearSession() async {
  await storageDelete(_accessKey);
  await storageDelete(_refreshKey);
}

// ---------------------------------------------------------------- student

class Student {
  Student(this.raw);
  factory Student.fromJson(dynamic json) => Student(Map<String, dynamic>.from(json as Map));

  final Map<String, dynamic> raw;

  String get id => '${raw['id'] ?? ''}';
  String get email => '${raw['email'] ?? ''}';
  String get role => '${raw['role'] ?? ''}';
  String get firstName => '${raw['firstName'] ?? ''}';
  String get lastName => '${raw['lastName'] ?? ''}';
  String get phone => '${raw['phone'] ?? ''}';
  String get language => raw['language'] == 'ta' ? 'ta' : (raw['language'] == 'en' ? 'en' : '');
  bool get onboardingComplete => raw['onboardingComplete'] == true;
  List<dynamic> get education => raw['education'] is List ? raw['education'] as List : const [];
  List<dynamic> get examHistory => raw['examHistory'] is List ? raw['examHistory'] as List : const [];
  Map<String, dynamic> get preferences =>
      raw['preferences'] is Map ? Map<String, dynamic>.from(raw['preferences'] as Map) : <String, dynamic>{};
  bool get aiMemoryEnabled => raw['aiMemoryEnabled'] == true;
  String get primaryExamId => '${raw['primaryExamId'] ?? ''}';
  List<String> get examIds => raw['examIds'] is List ? (raw['examIds'] as List).map((e) => '$e').toList() : const [];
  int get streak => raw['streak'] is num ? (raw['streak'] as num).toInt() : 0;

  /// App UI language: preferences.appLanguage, else exam language, else English.
  String get appLanguage {
    final pref = preferences['appLanguage'];
    if (pref == 'ta' || pref == 'en') return pref as String;
    return language == 'ta' ? 'ta' : 'en';
  }

  Student merge(Student other) => Student({...raw, ...other.raw});
}

// ---------------------------------------------------------------- errors

class ApiError implements Exception {
  ApiError(this.message, {this.offline = false});
  final String message;
  final bool offline;
  @override
  String toString() => message;
}

String errorText(Object error, [String fallback = 'Something went wrong']) {
  if (error is ApiError) return error.message;
  final text = error.toString();
  return text.isEmpty ? fallback : text;
}

// ---------------------------------------------------------------- offline queue

Future<Map<String, dynamic>> _readQueue() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(_offlineQueueKey);
  final empty = <String, dynamic>{'practiceAnswers': <dynamic>[], 'completeSessionIds': <dynamic>[]};
  if (raw == null) return empty;
  try {
    final parsed = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    parsed['practiceAnswers'] ??= <dynamic>[];
    parsed['completeSessionIds'] ??= <dynamic>[];
    return parsed;
  } catch (_) {
    return empty;
  }
}

Future<void> _writeQueue(Map<String, dynamic> queue) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_offlineQueueKey, jsonEncode(queue));
}

final _answerPath = RegExp(r'^/practice/sessions/([^/]+)/answers$');
final _completePath = RegExp(r'^/practice/sessions/([^/]+)/complete$');

/// Practice answers / completions made offline are queued and synced later.
Future<Map<String, dynamic>?> _queueOfflineRequest(String path, Object? body) async {
  final answer = _answerPath.firstMatch(path);
  final complete = _completePath.firstMatch(path);
  if (answer == null && complete == null) return null;
  final queue = await _readQueue();
  if (answer != null) {
    final data = body is Map ? body : <String, dynamic>{};
    final answers = List<dynamic>.from(queue['practiceAnswers'] as List)
      ..removeWhere((item) => item['questionId'] == data['questionId']);
    answers.add({'sessionId': answer.group(1), 'questionId': data['questionId'], 'selectedKey': data['selectedKey']});
    queue['practiceAnswers'] = answers;
    await _writeQueue(queue);
    return {'pendingOffline': true, 'selectedKey': data['selectedKey']};
  }
  final ids = List<dynamic>.from(queue['completeSessionIds'] as List);
  if (!ids.contains(complete!.group(1))) ids.add(complete.group(1));
  queue['completeSessionIds'] = ids;
  await _writeQueue(queue);
  return {'pendingOffline': true};
}

String _randomKey() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  return 'mobile-${bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
}

Future<dynamic>? _syncInFlight;

Future<dynamic> syncOfflineQueue() {
  _syncInFlight ??= _runSync().whenComplete(() => _syncInFlight = null);
  return _syncInFlight!;
}

Future<dynamic> _runSync() async {
  final queue = await _readQueue();
  if (queue['syncKey'] == null || queue['syncBatch'] == null) {
    final answers = queue['practiceAnswers'] as List;
    final completes = queue['completeSessionIds'] as List;
    if (answers.isEmpty && completes.isEmpty) return {'applied': 0, 'completed': 0};
    queue['syncKey'] = _randomKey();
    // Server accepts at most 100 answers / 20 completions per sync; the rest go next round.
    queue['syncBatch'] = {
      'practiceAnswers': answers.take(100).toList(),
      'completeSessionIds': completes.take(20).toList(),
    };
    await _writeQueue(queue);
  }
  final token = await storageGet(_accessKey);
  if (token == null || token.isEmpty) return null;
  final batch = Map<String, dynamic>.from(queue['syncBatch'] as Map);
  final response = await http.post(
    Uri.parse('$apiBase/sync'),
    headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
    body: jsonEncode({
      'practiceAnswers': batch['practiceAnswers'],
      'completeSessionIds': batch['completeSessionIds'],
      'idempotencyKey': queue['syncKey'],
    }),
  );
  if (response.statusCode < 200 || response.statusCode >= 300) return null;
  final payload = jsonDecode(response.body);
  // Remove only what was sent; anything queued while the request was in flight stays.
  final latest = await _readQueue();
  final sentAnswers = batch['practiceAnswers'] as List;
  final sentCompletes = batch['completeSessionIds'] as List;
  final remainingAnswers = (latest['practiceAnswers'] as List)
      .where((item) => !sentAnswers.any((sent) =>
          sent['sessionId'] == item['sessionId'] &&
          sent['questionId'] == item['questionId'] &&
          sent['selectedKey'] == item['selectedKey']))
      .toList();
  final remainingCompletes =
      (latest['completeSessionIds'] as List).where((id) => !sentCompletes.contains(id)).toList();
  final prefs = await SharedPreferences.getInstance();
  if (remainingAnswers.isEmpty && remainingCompletes.isEmpty) {
    await prefs.remove(_offlineQueueKey);
  } else {
    await _writeQueue({'practiceAnswers': remainingAnswers, 'completeSessionIds': remainingCompletes});
  }
  return payload is Map ? payload['data'] : null;
}

// ---------------------------------------------------------------- session

Future<bool>? _refreshInFlight;

/// Single-flight: concurrent 401s share one refresh so the rotating token is only used once.
Future<bool> _refreshSession() {
  _refreshInFlight ??= () async {
    try {
      final refresh = await storageGet(_refreshKey);
      if (refresh == null || refresh.isEmpty) return false;
      final response = await http.post(
        Uri.parse('$apiBase/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refresh}),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) return false;
      final data = (jsonDecode(response.body) as Map)['data'] as Map;
      await storageSet(_accessKey, '${data['accessToken']}');
      await storageSet(_refreshKey, '${data['refreshToken']}');
      return true;
    } catch (_) {
      return false;
    }
  }()
      .whenComplete(() => _refreshInFlight = null);
  return _refreshInFlight!;
}

Future<void> logoutSession() async {
  final refreshToken = await storageGet(_refreshKey);
  if (refreshToken != null && refreshToken.isNotEmpty) {
    try {
      await http.post(
        Uri.parse('$apiBase/auth/logout'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
    } catch (_) {}
  }
  await storageClearSession();
}

Future<bool> hasSession() async {
  final token = await storageGet(_accessKey);
  return token != null && token.isNotEmpty;
}

/// Calls the backend and returns `payload.data`. Throws [ApiError] on failure.
Future<dynamic> api(String path, {String method = 'GET', Object? body, bool retry = true}) async {
  final headers = <String, String>{};
  if (body != null) headers['Content-Type'] = 'application/json';
  final token = await storageGet(_accessKey);
  if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
  final request = http.Request(method, Uri.parse('$apiBase$path'))..headers.addAll(headers);
  if (body != null) request.body = jsonEncode(body);

  http.Response response;
  try {
    response = await http.Response.fromStream(await request.send());
  } catch (_) {
    final queued = await _queueOfflineRequest(path, body);
    if (queued != null) return queued;
    throw ApiError('No connection. Check your network and try again.', offline: true);
  }
  if (response.statusCode == 401 && retry && !path.startsWith('/auth/')) {
    if (await _refreshSession()) return api(path, method: method, body: body, retry: false);
  }
  dynamic payload;
  try {
    payload = jsonDecode(utf8.decode(response.bodyBytes));
  } catch (_) {
    payload = <String, dynamic>{};
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    final message = payload is Map && payload['error'] is Map ? payload['error']['message'] : null;
    throw ApiError(message is String && message.isNotEmpty ? message : 'Request failed');
  }
  return payload is Map ? payload['data'] : null;
}

Future<Student> saveSession(dynamic data) async {
  final user = Student.fromJson(data['user']);
  if (user.role != 'student') throw ApiError('Use a student account in this app');
  await storageSet(_accessKey, '${data['accessToken']}');
  await storageSet(_refreshKey, '${data['refreshToken']}');
  return user;
}

// ---------------------------------------------------------------- dates (Asia/Kolkata)

DateTime _istNow() => DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String todayKey() => _ymd(_istNow());

int istHour() => _istNow().hour;

String shiftDay(String day, int delta) {
  final parts = day.split('-').map(int.parse).toList();
  return _ymd(DateTime.utc(parts[0], parts[1], parts[2] + delta));
}

// ---------------------------------------------------------------- json helpers

List<dynamic> asList(dynamic value) => value is List ? value : const [];
Map<String, dynamic> asMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
String str(dynamic value) => value == null ? '' : '$value';
num numOf(dynamic value) => value is num ? value : (num.tryParse('$value') ?? 0);
int intOf(dynamic value) => numOf(value).round();
