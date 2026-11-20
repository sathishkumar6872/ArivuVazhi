import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'core/api.dart';
import 'core/app_state.dart';
import 'core/nav.dart';
import 'screens/account_screens.dart';
import 'screens/auth_screens.dart';
import 'screens/home_screens.dart';
import 'screens/learn_screens.dart';
import 'screens/current_affairs_screens.dart';
import 'screens/tutor_screens.dart';
import 'widgets/ui.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState()..load();
  runApp(ArivuVazhiApp(state: state));
}

class ArivuVazhiApp extends StatelessWidget {
  const ArivuVazhiApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: ListenableBuilder(
        listenable: state,
        builder: (context, _) {
          final palette = state.palette;
          return MaterialApp(
            title: 'ArivuVazhi',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              brightness: palette.dark ? Brightness.dark : Brightness.light,
              scaffoldBackgroundColor: palette.bg,
              colorScheme: ColorScheme.fromSeed(
                seedColor: palette.green,
                brightness: palette.dark ? Brightness.dark : Brightness.light,
              ),
              textSelectionTheme: TextSelectionThemeData(
                cursorColor: palette.green,
                selectionColor: palette.green.withAlpha(0x55),
                selectionHandleColor: palette.green,
              ),
              // Floating, rounded snackbars that match the cards.
              snackBarTheme: SnackBarThemeData(
                behavior: SnackBarBehavior.floating,
                backgroundColor: palette.dark ? const Color(0xF0143326) : const Color(0xFF0B3D2E),
                contentTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
              ),
            ),
            home: AnnotatedRegion<SystemUiOverlayStyle>(
              value: palette.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
              child: const _PhoneFrame(child: Root()),
            ),
          );
        },
      ),
    );
  }
}

/// On a wide web window, show the app inside a phone-sized frame (same as the Expo web build).
class _PhoneFrame extends StatelessWidget {
  const _PhoneFrame({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    if (!kIsWeb || size.width < 500) return child;
    return ColoredBox(
      color: const Color(0xFFE8F5EE),
      child: Center(
        child: Container(
          width: 390,
          height: (size.height - 48).clamp(400, 844).toDouble(),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(42),
            border: Border.all(color: const Color(0xFF0B3D2E), width: 12),
          ),
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(size: Size(366, (size.height - 72).clamp(376, 820).toDouble())),
            child: child,
          ),
        ),
      ),
    );
  }
}

class Root extends StatefulWidget {
  const Root({super.key});

  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> with WidgetsBindingObserver {
  bool ready = false;
  Student? user;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _restore();
  }

  Future<void> _restore() async {
    try {
      if (await hasSession()) {
        try {
          _setUser(Student.fromJson(await api('/me')));
          syncOfflineQueue().catchError((_) => null);
        } catch (_) {
          await storageClearSession();
        }
      }
    } finally {
      if (mounted) setState(() => ready = true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && user != null) syncOfflineQueue().catchError((_) => null);
  }

  void _setUser(Student? next) {
    if (!mounted) return;
    setState(() => user = next);
    if (next != null) context.app.setLanguage(next.appLanguage);
  }

  Future<void> _logout() async {
    await logoutSession();
    _setUser(null);
  }

  @override
  Widget build(BuildContext context) {
    final current = user;
    late final Widget page;
    if (!ready) {
      page = const SplashScreen();
    } else if (current == null) {
      page = AuthFlow(onDone: _setUser);
    } else if (!current.onboardingComplete) {
      page = OnboardingScreen(user: current, onDone: _setUser);
    } else {
      page = Shell(user: current, setUser: _setUser, onLogout: _logout);
    }
    // One backdrop (gradient + glow) behind every screen; screens themselves are transparent.
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: Colors.transparent,
      body: AppBackground(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 350),
          child: KeyedSubtree(key: ValueKey(page.runtimeType), child: page),
        ),
      ),
    );
  }
}

class Shell extends StatefulWidget {
  const Shell({super.key, required this.user, required this.setUser, required this.onLogout});
  final Student user;
  final ValueChanged<Student> setUser;
  final Future<void> Function() onLogout;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  TabName tab = TabName.home;
  final Map<TabName, List<AppRoute>> stacks = {for (final t in TabName.values) t: [rootOf(t)]};

  /// Hide the tab bar while the keyboard is open. Scaffold strips viewInsets from MediaQuery,
  /// so this listens for metric changes and reads the raw keyboard height from the View.
  bool keyboardOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeMetrics() {
    if (!mounted) return;
    final open = View.of(context).viewInsets.bottom > 0;
    if (open != keyboardOpen) setState(() => keyboardOpen = open);
  }

  AppRoute get route => stacks[tab]!.last;

  void open(AppRoute next, {bool replace = false}) {
    if (isRootRoute(next)) {
      setState(() => tab = tabOf(next));
      return;
    }
    final nextTab = replace ? tabOf(next) : tab;
    setState(() {
      tab = nextTab;
      final stack = stacks[nextTab]!;
      if (replace && stack.length > 1) stack.removeLast();
      stack.add(next);
    });
  }

  void back() {
    final stack = stacks[tab]!;
    if (stack.length <= 1) return;
    setState(() => stack.removeLast());
  }

  DateTime? _lastBackOnHome;

  /// Android back / swipe-back: previous screen → Home tab → press again to exit.
  void _systemBack() {
    if (stacks[tab]!.length > 1) {
      back();
      return;
    }
    if (tab != TabName.home) {
      goTab(TabName.home.name);
      return;
    }
    final now = DateTime.now();
    if (_lastBackOnHome != null && now.difference(_lastBackOnHome!) < const Duration(seconds: 2)) {
      SystemNavigator.pop();
      return;
    }
    _lastBackOnHome = now;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Press back again to exit'), duration: Duration(seconds: 2)));
  }

  /// A tab press always lands on that tab's first screen, not on whatever was opened inside it earlier.
  void goTab(String name) {
    final next = TabName.values.byName(name);
    setState(() {
      stacks[next] = [rootOf(next)];
      tab = next;
    });
  }

  Widget _screen(AppRoute r) {
    final user = widget.user;
    void push(AppRoute next) => open(next);
    void replace(AppRoute next) => open(next, replace: true);
    switch (r.name) {
      case 'home':
        return HomeScreen(user: user, go: push);
      case 'planner':
        return PlannerScreen(back: back);
      case 'analytics':
        return AnalyticsScreen(back: back);
      case 'alerts':
        return AlertsScreen(back: back);
      case 'mocks':
        return MocksScreen(back: back, go: push);
      case 'mockIntro':
        return MockIntroScreen(mockId: r.param('mockId'), back: back, go: push);
      case 'mockRun':
        return MockRunScreen(mockId: r.param('mockId'), onDone: replace);
      case 'mockResult':
        return MockResultScreen(attemptId: r.param('attemptId'), back: back);
      case 'exams':
        return ExamsScreen(user: user, go: push);
      case 'exam':
        return ExamScreen(examId: r.param('examId'), user: user, onUser: widget.setUser, back: back, go: push);
      case 'pyq':
        return PyqScreen(user: user, back: back, go: push);
      case 'pyqPaper':
        return PyqPaperScreen(paperId: r.param('paperId'), back: back);
      case 'practice':
        return PracticeScreen(user: user, go: push);
      case 'topics':
        return TopicsScreen(route: r, back: back, go: push);
      case 'quiz':
        return QuizScreen(route: r, back: back, onDone: replace);
      case 'practiceResult':
        return PracticeResultScreen(route: r, back: back, go: replace);
      case 'bookmarks':
        return BookmarksScreen(back: back);
      case 'tutor':
        return TutorScreen(user: user, go: push);
      case 'chat':
        return ChatScreen(user: user, conversationId: r.opt('conversationId'), starter: r.opt('starter'), back: back);
      case 'profile':
        return ProfileScreen(user: user, go: push, logout: widget.onLogout);
      case 'editProfile':
        return EditProfileScreen(user: user, onUser: widget.setUser, back: back);
      case 'settings':
        return SettingsScreen(user: user, onUser: widget.setUser, back: back);
      case 'notes':
        return NotesScreen(back: back);
      case 'achievements':
        return AchievementsScreen(user: user, back: back);
      case 'support':
        return SupportScreen(back: back);
      case 'currentAffairs':
        return CurrentAffairsScreen(back: back, go: push);
      case 'currentAffairsQuiz':
        return CurrentAffairsQuizScreen(route: r, back: back);
    }
    return const SizedBox.shrink();
  }

  @override
  Widget build(BuildContext context) {
    final current = route;
    final fullScreen = current.name == 'chat' || current.name == 'quiz' || current.name == 'mockRun' || current.name == 'currentAffairsQuiz';
    return PopScope(
      // The app handles every Android back itself (see _systemBack), so it never closes by accident.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _systemBack();
      },
      child: Builder(builder: (context) {
        final showTabs = !fullScreen && !keyboardOpen;
        final media = MediaQuery.of(context);
        // Content scrolls under the floating glass tab bar, so reserve its height as bottom padding.
        final screen = MediaQuery(
          data: media.copyWith(
            padding: media.padding.copyWith(bottom: showTabs ? media.padding.bottom + tabBarSpace : media.padding.bottom),
          ),
          child: SafeArea(
            top: false,
            bottom: fullScreen,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 280),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0.04, 0), end: Offset.zero).animate(animation),
                  child: child,
                ),
              ),
              // ObjectKey: a new route object always gets a fresh screen state.
              child: KeyedSubtree(key: ObjectKey(current), child: _screen(current)),
            ),
          ),
        );
        return Stack(children: [
          Positioned.fill(child: screen),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutCubic,
              offset: showTabs ? Offset.zero : const Offset(0, 1.6),
              child: IgnorePointer(ignoring: !showTabs, child: AppTabBar(tab: tab.name, onChange: goTab)),
            ),
          ),
        ]);
      }),
    );
  }
}
