import 'package:material_ui/material_ui.dart';

import 'api.dart';

/// Design tokens — "Matte Blue". Light: #F8FBFF page, white cards, soft shadows.
/// Dark: #06152E page, #102440 cards with hairline borders. Every screen reads colours
/// from here, so both themes stay consistent.
///
/// Token names are historical: `green` is the brand action colour (blue now), `primary`
/// the heading colour. Correct / success states use `good` + `goodSoft` (real green).
class Palette {
  const Palette({
    required this.bg,
    required this.bgTop,
    required this.bgBottom,
    required this.glowA,
    required this.glowB,
    required this.surface,
    required this.elevated,
    required this.inset,
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
    required this.gold,
    required this.goldSoft,
    required this.danger,
    required this.dangerSoft,
    required this.good,
    required this.goodSoft,
    required this.info,
    required this.infoSoft,
    required this.heroStart,
    required this.heroEnd,
    required this.shadow,
    required this.dark,
  });

  /// Page base colour and the backdrop gradient + two soft glow blobs.
  final Color bg, bgTop, bgBottom, glowA, glowB;

  /// `surface`: cards. `elevated`: dialogs and sheets. `inset`: wells inside cards.
  final Color surface, elevated, inset;

  /// `gold` / `goldSoft`: rewards only (streak, achievements, mastered).
  final Color gold, goldSoft;
  final Color ink,
      muted,
      line,
      primary,
      green,
      accent,
      highlight,
      greenInk,
      greenSoft,
      mint,
      amber,
      danger,
      dangerSoft,
      good,
      goodSoft,
      info,
      infoSoft,
      shadow;

  /// Hero card gradient (home score, profile, tutor). Text on it is always white.
  final Color heroStart, heroEnd;
  final bool dark;

  static const light = Palette(
    bg: Color(0xFFF8FBFF),
    bgTop: Color(0xFFF8FBFF),
    bgBottom: Color(0xFFEEF5FF),
    glowA: Color(0x2419BFFF),
    glowB: Color(0x1A1769C2),
    surface: Color(0xFFFFFFFF),
    elevated: Color(0xFFFFFFFF),
    inset: Color(0xFFF1F5FB),
    ink: Color(0xFF102A56),
    muted: Color(0xFF64748B),
    line: Color(0xFFE5EDF7),
    primary: Color(0xFF102A56),
    green: Color(0xFF1769C2),
    accent: Color(0xFF19BFFF),
    highlight: Color(0xFF19BFFF),
    greenInk: Color(0xFFFFFFFF),
    greenSoft: Color(0xFFE7F0FC),
    mint: Color(0xFFDCEAFB),
    amber: Color(0xFFF59E0B),
    gold: Color(0xFFD97706),
    goldSoft: Color(0xFFFEF3C7),
    danger: Color(0xFFE5484D),
    dangerSoft: Color(0xFFFDECEC),
    good: Color(0xFF16A34A),
    goodSoft: Color(0xFFE6F7ED),
    info: Color(0xFF1769C2),
    infoSoft: Color(0xFFE7F0FC),
    heroStart: Color(0xFF0A2457),
    heroEnd: Color(0xFF1769C2),
    shadow: Color(0x1A123B78),
    dark: false,
  );

  static const darkPalette = Palette(
    bg: Color(0xFF06152E),
    bgTop: Color(0xFF081B3A),
    bgBottom: Color(0xFF05122A),
    glowA: Color(0x661769C2),
    glowB: Color(0x3D19BFFF),
    surface: Color(0xF2102440),
    elevated: Color(0xFA0E2039),
    inset: Color(0xFF0B1C36),
    ink: Color(0xFFF5F8FF),
    muted: Color(0xFFAABBD1),
    line: Color(0xFF263D5B),
    primary: Color(0xFFF5F8FF),
    green: Color(0xFF19BFFF),
    accent: Color(0xFF19BFFF),
    highlight: Color(0xFF7DD8FF),
    greenInk: Color(0xFF06152E),
    greenSoft: Color(0x331769C2),
    mint: Color(0x401769C2),
    amber: Color(0xFFFBBF24),
    gold: Color(0xFFFBBF24),
    goldSoft: Color(0x29FBBF24),
    danger: Color(0xFFF87171),
    dangerSoft: Color(0x2EF87171),
    good: Color(0xFF34D399),
    goodSoft: Color(0x2934D399),
    info: Color(0xFF7DB4FF),
    infoSoft: Color(0x2E1769C2),
    heroStart: Color(0xFF0A2457),
    heroEnd: Color(0xFF1769C2),
    shadow: Color(0x66000000),
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
  const AppScope({super.key, required AppState state, required super.child})
    : super(notifier: state);

  static AppState of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}

extension AppContext on BuildContext {
  AppState get app => AppScope.of(this);
  Palette get palette => AppScope.of(this).palette;
  String t(String key) => AppScope.of(this).t(key);
}
