import 'package:material_ui/material_ui.dart';

import 'api.dart';

/// Design tokens. Light = premium soft surfaces; dark = glassmorphism over a glowing
/// emerald backdrop. Every screen reads colours from here, so both themes stay consistent.
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
    required this.info,
    required this.infoSoft,
    required this.heroStart,
    required this.heroEnd,
    required this.shadow,
    required this.dark,
  });

  /// Page base colour and the backdrop gradient + two soft glow blobs.
  final Color bg, bgTop, bgBottom, glowA, glowB;

  /// `surface`: cards (white in light, translucent glass in dark).
  /// `elevated`: dialogs and sheets (always mostly opaque).
  /// `inset`: wells inside cards (inputs, letter chips, calendar cells).
  final Color surface, elevated, inset;
  /// `gold` / `goldSoft`: rewards only (streak, achievements, mastered).
  final Color gold, goldSoft;
  final Color ink, muted, line, primary, green, accent, highlight, greenInk, greenSoft, mint, amber, danger,
      dangerSoft, good, info, infoSoft, shadow;

  /// Hero card gradient (home score, profile, tutor). Text on it is always white.
  final Color heroStart, heroEnd;
  final bool dark;

  static const light = Palette(
    bg: Color(0xFFF3F7F4),
    bgTop: Color(0xFFF8FBF9),
    bgBottom: Color(0xFFEAF3EE),
    glowA: Color(0x2E34D399),
    glowB: Color(0x1F38BDF8),
    surface: Color(0xFFFFFFFF),
    elevated: Color(0xFFFFFFFF),
    inset: Color(0xFFF2F6F3),
    ink: Color(0xFF0B1F17),
    muted: Color(0xFF5E6E66),
    line: Color(0xFFE3ECE6),
    primary: Color(0xFF0B3D2E),
    green: Color(0xFF16A34A),
    accent: Color(0xFF22C55E),
    highlight: Color(0xFFA3E635),
    greenInk: Color(0xFFFFFFFF),
    greenSoft: Color(0xFFE6F7ED),
    mint: Color(0xFFD5F5E3),
    amber: Color(0xFFF59E0B),
    gold: Color(0xFFD97706),
    goldSoft: Color(0xFFFEF3C7),
    danger: Color(0xFFE5484D),
    dangerSoft: Color(0xFFFDECEC),
    good: Color(0xFF10B981),
    info: Color(0xFF2563EB),
    infoSoft: Color(0xFFEAF1FD),
    heroStart: Color(0xFF0B3D2E),
    heroEnd: Color(0xFF15803D),
    shadow: Color(0x1A0B3D2E),
    dark: false,
  );

  static const darkPalette = Palette(
    bg: Color(0xFF040B08),
    bgTop: Color(0xFF071811),
    bgBottom: Color(0xFF020604),
    glowA: Color(0x5522C55E),
    glowB: Color(0x3D14B8A6),
    surface: Color(0x17FFFFFF),
    elevated: Color(0xF00D1C16),
    inset: Color(0x12FFFFFF),
    ink: Color(0xFFEFFCF5),
    muted: Color(0xFFA3BAAF),
    line: Color(0x24FFFFFF),
    primary: Color(0xFFB4F5D5),
    green: Color(0xFF22C55E),
    accent: Color(0xFF4ADE80),
    highlight: Color(0xFFBEF264),
    greenInk: Color(0xFF03261A),
    greenSoft: Color(0x2922C55E),
    mint: Color(0x334ADE80),
    amber: Color(0xFFFBBF24),
    gold: Color(0xFFFBBF24),
    goldSoft: Color(0x29FBBF24),
    danger: Color(0xFFF87171),
    dangerSoft: Color(0x2EF87171),
    good: Color(0xFF34D399),
    info: Color(0xFF7DB4FF),
    infoSoft: Color(0x2E60A5FA),
    heroStart: Color(0x8C15803D),
    heroEnd: Color(0x5914B8A6),
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
