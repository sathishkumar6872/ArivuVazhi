import 'package:material_ui/material_ui.dart';

import 'api.dart';

/// Brand tokens (Green Theme), same as the React Native app.
class Palette {
  const Palette({
    required this.bg,
    required this.surface,
    required this.ink,
    required this.muted,
    required this.line,
    required this.primary,
    required this.green,
    required this.accent,
    required this.highlight,
    required this.greenInk,
    required this.greenSoft,
    required this.mint,
    required this.amber,
    required this.danger,
    required this.dangerSoft,
    required this.good,
    required this.info,
    required this.shadow,
    required this.dark,
  });

  final Color bg, surface, ink, muted, line, primary, green, accent, highlight, greenInk, greenSoft, mint, amber,
      danger, dangerSoft, good, info, shadow;
  final bool dark;

  static const light = Palette(
    bg: Color(0xFFF3F4F6),
    surface: Color(0xFFFFFFFF),
    ink: Color(0xFF0B1F17),
    muted: Color(0xFF5B6B63),
    line: Color(0xFFD7E8DC),
    primary: Color(0xFF0B3D2E),
    green: Color(0xFF16A34A),
    accent: Color(0xFF22C55E),
    highlight: Color(0xFFA3E635),
    greenInk: Color(0xFFFFFFFF),
    greenSoft: Color(0xFFE8F8EE),
    mint: Color(0xFFA7F3D0),
    amber: Color(0xFFF59E0B),
    danger: Color(0xFFEF4444),
    dangerSoft: Color(0xFFFEE2E2),
    good: Color(0xFF10B981),
    info: Color(0xFF3B82F6),
    shadow: Color(0x140B3D2E),
    dark: false,
  );

  static const darkPalette = Palette(
    bg: Color(0xFF071510),
    surface: Color(0xFF0F241C),
    ink: Color(0xFFF0FDF4),
    muted: Color(0xFF9CB5A8),
    line: Color(0xFF1F3A2E),
    primary: Color(0xFFA7F3D0),
    green: Color(0xFF22C55E),
    accent: Color(0xFF4ADE80),
    highlight: Color(0xFFA3E635),
    greenInk: Color(0xFF052E1C),
    greenSoft: Color(0xFF143528),
    mint: Color(0xFF14532D),
    amber: Color(0xFFFBBF24),
    danger: Color(0xFFF87171),
    dangerSoft: Color(0xFF3F1D1D),
    good: Color(0xFF34D399),
    info: Color(0xFF60A5FA),
    shadow: Color(0x59000000),
    dark: true,
  );
}

const Map<String, String> _tamil = {
  'Home': 'முகப்பு',
  'Exams': 'தேர்வுகள்',
  'Practice': 'பயிற்சி',
  'AI Tutor': 'AI ஆசிரியர்',
  'Profile': 'சுயவிவரம்',
  'Accuracy': 'துல்லியம்',
  'Study streak': 'தொடர் பயிற்சி',
  'Change': 'மாற்று',
  'Your current exam': 'உங்கள் தற்போதைய தேர்வு',
  'View all': 'அனைத்தையும் காண்க',
  "Today's plan": 'இன்றைய திட்டம்',
  'Notifications': 'அறிவிப்புகள்',
  'My details': 'என் விவரங்கள்',
  'Edit profile': 'சுயவிவரம் திருத்து',
  'Settings': 'அமைப்புகள்',
  'Analytics': 'பகுப்பாய்வு',
  'Bookmarks': 'சேமித்தவை',
  'Notes': 'குறிப்புகள்',
  'Achievements': 'சாதனைகள்',
  'AI memory': 'AI நினைவகம்',
  'Help and support': 'உதவி மற்றும் ஆதரவு',
  'Logout': 'வெளியேறு',
  'Personal': 'தனிப்பட்டவை',
  'App language': 'செயலி மொழி',
  'Exam language': 'தேர்வு மொழி',
  'Exam goal': 'தேர்வு இலக்கு',
  'Education': 'கல்வி',
  'Experience': 'அனுபவம்',
  'Add education': 'கல்வி சேர்',
  'Add experience': 'அனுபவம் சேர்',
  'Remove': 'நீக்கு',
  'Save changes': 'மாற்றங்களை சேமி',
  'Cancel': 'ரத்து',
  'Tamil': 'தமிழ்',
  'English': 'ஆங்கிலம்',
};

/// Theme mode + app language, shared through [AppScope].
class AppState extends ChangeNotifier {
  bool _dark = false;
  String _language = 'en';

  Palette get palette => _dark ? Palette.darkPalette : Palette.light;
  String get language => _language;

  Future<void> load() async {
    final value = await storageGet('av_m_theme');
    if (value == 'dark' || value == 'light') {
      _dark = value == 'dark';
      notifyListeners();
    }
  }

  void toggleTheme() {
    _dark = !_dark;
    storageSet('av_m_theme', _dark ? 'dark' : 'light');
    notifyListeners();
  }

  void setLanguage(String language) {
    final next = language == 'ta' ? 'ta' : 'en';
    if (next == _language) return;
    _language = next;
    notifyListeners();
  }

  String t(String key) => _language == 'ta' ? (_tamil[key] ?? key) : key;
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}

extension AppContext on BuildContext {
  AppState get app => AppScope.of(this);
  Palette get palette => AppScope.of(this).palette;
  String t(String key) => AppScope.of(this).t(key);
}
