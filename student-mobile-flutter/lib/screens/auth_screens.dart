import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';

class BrandImages {
  static const mountain = 'assets/brand-use/splash-mountain-hq.jpg';
  static const characters = 'assets/brand-use/onboarding-student-hq.jpg';
  static const practice = 'assets/brand-use/onboarding-practice-hq.jpg';
  static const aiTutor = 'assets/brand-use/onboarding-ai-hq.jpg';
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF0B3D2E),
      child: Stack(fit: StackFit.expand, children: [
        Opacity(opacity: 0.55, child: Image.asset(BrandImages.mountain, fit: BoxFit.cover)),
        Container(
          color: const Color(0x8C08281E),
          padding: const EdgeInsets.all(24),
          child: SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 56),
                  child: Column(children: [
                    const Wordmark(light: true, centered: true),
                    gap(10),
                    tx('LEARN • PRACTICE • ACHIEVE', color: const Color(0xFFA7F3D0), letterSpacing: 2, size: 11, weight: w700),
                  ]),
                ),
                Column(children: [
                  tx('Your Government Exam Journey Starts Here',
                      color: Colors.white, size: 30, weight: w800, align: TextAlign.center, lineHeight: 38),
                  gap(12),
                  tx('Learn smarter, practice better, and achieve your goal with AI.',
                      color: const Color(0xFFD1FAE5), size: 15, lineHeight: 22, align: TextAlign.center),
                ]),
              ],
            ),
          ),
        ),
      ]),
    );
  }
}

enum _AuthMode { welcome, login, register, forgot, verify }

class AuthFlow extends StatefulWidget {
  const AuthFlow({super.key, required this.onDone});
  final ValueChanged<Student> onDone;

  @override
  State<AuthFlow> createState() => _AuthFlowState();
}

class _AuthFlowState extends State<AuthFlow> with SafeState {
  _AuthMode mode = _AuthMode.welcome;
  int splashPage = 0;
  String firstName = '', lastName = '', email = '', password = '', confirm = '';
  bool remember = true;
  List<dynamic> exams = [];
  String examId = '';
  bool examOpen = false;
  String error = '';
  Student? pending;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    storageGet('av_m_remember_email').then((value) {
      if (value != null && value.isNotEmpty) safe(() => email = value);
    });
    api('/auth/catalogue').then((items) {
      safe(() {
        exams = asList(items);
        examId = exams.isNotEmpty ? str(exams.first['id']) : '';
      });
    }).catchError((_) {});
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    if (mode != _AuthMode.welcome) return;
    _timer = Timer.periodic(const Duration(milliseconds: 3500), (_) => safe(() => splashPage = (splashPage + 1) % 3));
  }

  void _setMode(_AuthMode next) {
    setState(() {
      mode = next;
      error = '';
    });
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() => error = '');
    if (!email.contains('@') || password.length < 8) {
      setState(() => error = 'Use a valid email and a password of at least 8 characters, with a letter and a number.');
      return;
    }
    try {
      if (mode == _AuthMode.register) {
        if (firstName.trim().isEmpty) return setState(() => error = 'Enter your first name.');
        if (password != confirm) return setState(() => error = 'Password and confirm password must match.');
        if (examId.isEmpty) return setState(() => error = 'Choose your exam goal.');
        final data = await api('/auth/register', method: 'POST', body: {
          'firstName': firstName,
          'lastName': lastName,
          'email': email,
          'password': password,
        });
        final user = await saveSession(data);
        await storageSet('av_m_exam_goal', examId);
        if (remember) await storageSet('av_m_remember_email', email);
        safe(() => pending = user);
        _setMode(_AuthMode.verify);
        return;
      }
      final data = await api('/auth/login', method: 'POST', body: {'email': email, 'password': password});
      await storageSet('av_m_remember_email', remember ? email : '');
      widget.onDone(await saveSession(data));
    } catch (err) {
      safe(() => error = errorText(err, 'Could not continue'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    if (mode == _AuthMode.welcome) {
      const slides = [
        ('Your Government Exam Journey Starts Here', 'Learn smarter, practice better, and achieve your goal with AI.'),
        ('Practice with real exam patterns', 'Mocks, previous papers and topic practice stay inside approved content.'),
        (
          'AI tutor in Tamil, English or Tanglish',
          'Type your doubts in Tamil, English or Tanglish and pick up past conversations from your search history.'
        ),
      ];
      final slide = slides[splashPage];
      return ColoredBox(
        color: const Color(0xFF071F18),
        child: Stack(fit: StackFit.expand, children: [
          Image.asset(BrandImages.mountain, fit: BoxFit.cover),
          Container(
            color: const Color(0x94071F18),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(22, 56, 22, 28),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(children: [
                      const Wordmark(light: true, centered: true),
                      gap(10),
                      tx('LEARN • PRACTICE • ACHIEVE', color: const Color(0xFFA7F3D0), letterSpacing: 2.2, size: 11, weight: w700),
                    ]),
                    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      tx(slide.$1, color: Colors.white, size: 30, weight: w800, lineHeight: 38),
                      gap(12),
                      tx(slide.$2, color: const Color(0xFFD1FAE5), size: 15, lineHeight: 22),
                      gap(22),
                      Dots(count: 3, index: splashPage),
                      AppButton(label: 'Get Started', icon: Icons.arrow_forward, onPress: () => _setMode(_AuthMode.login)),
                      gap(14),
                      Tap(
                        onTap: () => _setMode(_AuthMode.register),
                        child: tx('New here? Create an account',
                            color: const Color(0xFFA7F3D0), align: TextAlign.center, weight: w700),
                      ),
                    ]),
                  ],
                ),
              ),
            ),
          ),
        ]),
      );
    }

    if (mode == _AuthMode.forgot) {
      return AppScreen(children: [
        const Wordmark(centered: true),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: tx('Reset password', size: 26, weight: w800, color: palette.ink, align: TextAlign.center),
        ),
        const AppBanner(
          tone: BannerTone.info,
          message:
              'Password reset email is not connected in this release. Sign in with the password you created, or register a new student account.',
        ),
        AppButton(label: 'Back to login', onPress: () => _setMode(_AuthMode.login)),
      ]);
    }

    if (mode == _AuthMode.verify && pending != null) {
      return AppScreen(children: [
        const Wordmark(centered: true),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: tx('Account active', size: 26, weight: w800, color: palette.ink, align: TextAlign.center),
        ),
        AppBanner(
          tone: BannerTone.success,
          message:
              '${pending!.email} is ready. This release does not send a verification email. You can start onboarding now.',
        ),
        AppButton(label: 'Continue', icon: Icons.arrow_forward, onPress: () => widget.onDone(pending!)),
      ]);
    }

    if (mode == _AuthMode.login) {
      return AppScreen(children: [
        const Padding(padding: EdgeInsets.only(top: 12, bottom: 20), child: Wordmark(centered: true)),
        tx('Login to ArivuVazhi', size: 26, weight: w800, color: palette.ink, align: TextAlign.center),
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 18),
          child: tx('Welcome back. Continue your preparation.', color: palette.muted, align: TextAlign.center),
        ),
        if (error.isNotEmpty) AppBanner(message: error),
        Field(
          label: 'Email',
          value: email,
          onChanged: (v) => setState(() => email = v),
          keyboard: FieldKeyboard.email,
          icon: Icons.person_outline,
        ),
        Field(
          label: 'Password',
          value: password,
          onChanged: (v) => setState(() => password = v),
          secure: true,
          passwordToggle: true,
          icon: Icons.lock_outline,
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Tap(
                label: 'Remember me',
                onTap: () => setState(() => remember = !remember),
                child: Row(children: [
                  Icon(remember ? Icons.check_box : Icons.check_box_outline_blank,
                      size: 20, color: remember ? palette.green : palette.muted),
                  gap(8),
                  tx('Remember me', color: palette.ink, weight: w600),
                ]),
              ),
              Tap(
                label: 'Forgot password',
                onTap: () => _setMode(_AuthMode.forgot),
                child: tx('Forgot password?', color: palette.green, weight: w700),
              ),
            ],
          ),
        ),
        AppButton(label: 'Login', onPress: submit),
        gap(18),
        Tap(
          onTap: () => _setMode(_AuthMode.register),
          child: Text.rich(
            TextSpan(children: [
              const TextSpan(text: 'New to ArivuVazhi? '),
              TextSpan(text: 'Create an account', style: TextStyle(color: palette.green, fontWeight: w800)),
            ]),
            textAlign: TextAlign.center,
            style: TextStyle(color: palette.muted, fontWeight: w600),
          ),
        ),
      ]);
    }

    final selected = exams.cast<dynamic>().firstWhere((item) => str(item['id']) == examId, orElse: () => null);
    return AppScreen(children: [
      const Padding(padding: EdgeInsets.only(top: 8, bottom: 16), child: Wordmark(centered: true)),
      tx('Create Account', size: 26, weight: w800, color: palette.ink, align: TextAlign.center),
      Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 16),
        child: tx('Start your government exam preparation journey', color: palette.muted, align: TextAlign.center),
      ),
      if (error.isNotEmpty) AppBanner(message: error),
      Pair([
        Field(label: 'First Name', value: firstName, onChanged: (v) => setState(() => firstName = v)),
        Field(label: 'Last Name', value: lastName, onChanged: (v) => setState(() => lastName = v)),
      ]),
      Field(
        label: 'Email',
        value: email,
        onChanged: (v) => setState(() => email = v),
        keyboard: FieldKeyboard.email,
        icon: Icons.mail_outline,
      ),
      Field(
        label: 'Password',
        value: password,
        onChanged: (v) => setState(() => password = v),
        secure: true,
        passwordToggle: true,
        icon: Icons.lock_outline,
      ),
      Field(
        label: 'Confirm Password',
        value: confirm,
        onChanged: (v) => setState(() => confirm = v),
        secure: true,
        passwordToggle: true,
        icon: Icons.lock_outline,
      ),
      Padding(padding: const EdgeInsets.only(bottom: 6), child: tx('Exam Goal', color: palette.muted, size: 13, weight: w600)),
      ExamPicker(
        exams: exams,
        examId: examId,
        open: examOpen,
        onToggle: () => setState(() => examOpen = !examOpen),
        onPick: (id) => setState(() {
          examId = id;
          examOpen = false;
        }),
        selectedName: selected == null ? null : str(selected['name']),
      ),
      AppButton(label: 'Create Account', onPress: submit),
      gap(18),
      Tap(
        onTap: () => _setMode(_AuthMode.login),
        child: Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Already have an account? '),
            TextSpan(text: 'Login', style: TextStyle(color: palette.green, fontWeight: w800)),
          ]),
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.muted, fontWeight: w600),
        ),
      ),
    ]);
  }
}

/// Dropdown-style exam chooser used in register and edit profile.
class ExamPicker extends StatelessWidget {
  const ExamPicker({
    super.key,
    required this.exams,
    required this.examId,
    required this.open,
    required this.onToggle,
    required this.onPick,
    this.selectedName,
    this.fieldColor,
    this.showAuthority = false,
  });

  final List<dynamic> exams;
  final String examId;
  final bool open;
  final VoidCallback onToggle;
  final ValueChanged<String> onPick;
  final String? selectedName;
  final Color? fieldColor;
  final bool showAuthority;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: EdgeInsets.only(bottom: open ? 0 : 12),
      child: Column(children: [
        Tap(
          label: 'Exam goal',
          onTap: onToggle,
          child: Container(
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: fieldColor ?? palette.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: palette.line),
            ),
            child: Row(children: [
              Expanded(child: tx(selectedName ?? 'Select exam', color: selectedName != null ? palette.ink : palette.muted, size: 16)),
              Icon(open ? Icons.expand_less : Icons.expand_more, size: 18, color: palette.muted),
            ]),
          ),
        ),
        if (open)
          Container(
            margin: const EdgeInsets.only(top: 8, bottom: 12),
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: palette.line),
            ),
            child: Column(children: [
              for (final exam in exams)
                Tap(
                  label: str(exam['name']),
                  onTap: () => onPick(str(exam['id'])),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: str(exam['id']) == examId ? palette.greenSoft : palette.surface,
                      border: Border(bottom: BorderSide(color: palette.line)),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      tx(str(exam['name']), color: palette.ink, weight: str(exam['id']) == examId ? w800 : w600),
                      if (showAuthority && str(exam['authority']).isNotEmpty)
                        Padding(padding: const EdgeInsets.only(top: 2), child: tx(str(exam['authority']), color: palette.muted)),
                    ]),
                  ),
                ),
              if (exams.isEmpty)
                Padding(padding: const EdgeInsets.all(14), child: tx('No published exams yet.', color: palette.muted)),
            ]),
          ),
      ]),
    );
  }
}

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.user, required this.onDone});
  final Student user;
  final ValueChanged<Student> onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> with SafeState {
  int intro = 0;
  bool started = false;
  late String phone = widget.user.phone;
  late String language = widget.user.language.isEmpty ? 'ta' : widget.user.language;
  String level = '', institution = '', year = '';
  List<dynamic> exams = [];
  String examId = '';
  String pastName = '', pastYear = '', pastResult = '';
  bool carry = true, notes = true;
  int step = 0;
  String error = '';
  bool loading = false;
  Timer? _timer;

  static const introSlides = [
    (
      'Crack Government Exams with Confidence',
      'Personalized learning, AI support and structured preparation in one place.',
      BrandImages.characters
    ),
    (
      'Build a clear study plan',
      'Plan today, this week and this month. Carry unfinished work forward when you want.',
      BrandImages.practice
    ),
    (
      'Practice and mock with real rules',
      'Scoring stays deterministic on the server. One mock attempt per mock each day.',
      BrandImages.practice
    ),
    (
      'Ask the AI tutor when stuck',
      'Tamil, English or Tanglish. Answers stay inside approved notes for your exam.',
      BrandImages.aiTutor
    ),
  ];

  @override
  void initState() {
    super.initState();
    Future.wait([api('/exams'), storageGet('av_m_exam_goal')]).then((results) {
      final items = asList(results[0]);
      final goal = results[1] as String?;
      safe(() {
        exams = items;
        examId = goal != null && items.any((item) => str(item['id']) == goal)
            ? goal
            : (items.isNotEmpty ? str(items.first['id']) : '');
      });
    }).catchError((err) => safe(() => error = errorText(err)));
    _timer = Timer.periodic(const Duration(milliseconds: 3500), (_) {
      if (!started) safe(() => intro = (intro + 1) % 4);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> finish() async {
    if (examId.isEmpty) return setState(() => error = 'Choose an exam to continue.');
    setState(() {
      loading = true;
      error = '';
    });
    try {
      final education = level.isNotEmpty && institution.isNotEmpty && year.isNotEmpty
          ? [
              {'level': level, 'institution': institution, 'year': year}
            ]
          : [];
      final next = Student.fromJson(
          await api('/onboarding', method: 'POST', body: {'language': language, 'examId': examId, 'education': education}));
      final history = pastName.isNotEmpty
          ? [
              {'examName': pastName, 'year': pastYear, 'result': pastResult.isEmpty ? 'attempted' : pastResult}
            ]
          : [];
      final saved = Student.fromJson(await api('/profile', method: 'PATCH', body: {
        'phone': phone,
        'preferences': {'carryForward': carry, 'notifications': notes, 'appLanguage': language},
        'examHistory': history,
      }));
      await storageSet('av_m_exam_goal', '');
      widget.onDone(next.merge(saved));
    } catch (err) {
      safe(() => error = errorText(err, 'Could not save onboarding'));
    } finally {
      safe(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (!started) {
      final slide = introSlides[intro];
      return AppScreen(
        body: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: Wordmark(centered: true)),
              Column(children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: Image.asset(slide.$3, height: 240, width: double.infinity, fit: BoxFit.contain),
                ),
                gap(18),
                tx(slide.$1, color: palette.ink, size: 26, weight: w800, align: TextAlign.center, lineHeight: 34),
                gap(10),
                tx(slide.$2, color: palette.muted, size: 15, lineHeight: 22, align: TextAlign.center),
              ]),
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Dots(count: 4, index: intro),
                AppButton(
                  label: 'Get Started',
                  icon: Icons.arrow_forward,
                  onPress: () => setState(() {
                    if (intro < introSlides.length - 1) {
                      intro += 1;
                    } else {
                      started = true;
                    }
                  }),
                ),
              ]),
            ],
          ),
        ),
      );
    }

    const titles = ['About you', 'Education', 'Exam', 'Previous attempts', 'Learning'];
    return AppScreen(children: [
      const Align(alignment: Alignment.centerLeft, child: Wordmark()),
      Padding(padding: const EdgeInsets.only(top: 12), child: tx('Step ${step + 1} of 5', color: palette.green, weight: w700)),
      Padding(padding: const EdgeInsets.only(bottom: 12), child: tx(titles[step], size: 28, weight: w800, color: palette.primary)),
      if (error.isNotEmpty) AppBanner(message: error),
      if (step == 0) ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: tx('${widget.user.firstName} ${widget.user.lastName}', color: palette.muted),
        ),
        Field(
          label: 'Phone',
          value: phone,
          onChanged: (v) => setState(() => phone = v),
          keyboard: FieldKeyboard.number,
          icon: Icons.call_outlined,
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: tx('App and exam language (you can split these later in Edit profile)', color: palette.muted),
        ),
        Pair([
          AppButton(label: 'Tamil', tone: language == 'ta' ? Tone.primary : Tone.ghost, onPress: () => setState(() => language = 'ta')),
          AppButton(label: 'English', tone: language == 'en' ? Tone.primary : Tone.ghost, onPress: () => setState(() => language = 'en')),
        ]),
      ],
      if (step == 1) ...[
        Field(label: 'Level', value: level, onChanged: (v) => setState(() => level = v), placeholder: 'Degree, diploma...'),
        Field(label: 'Institution', value: institution, onChanged: (v) => setState(() => institution = v)),
        Field(label: 'Year', value: year, onChanged: (v) => setState(() => year = v), placeholder: '2024'),
        tx('Optional. You can add this later in profile.', color: palette.muted),
      ],
      if (step == 2)
        for (final exam in exams)
          Tap(
            label: str(exam['name']),
            onTap: () => setState(() => examId = str(exam['id'])),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: examId == str(exam['id']) ? palette.greenSoft : palette.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: examId == str(exam['id']) ? palette.green : palette.line),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx(str(exam['name']), color: palette.ink, weight: w700),
                tx(str(exam['authority']), color: palette.muted),
              ]),
            ),
          ),
      if (step == 3) ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: tx('Optional. Leave blank if this is your first attempt.', color: palette.muted),
        ),
        Field(label: 'Exam name', value: pastName, onChanged: (v) => setState(() => pastName = v)),
        Field(label: 'Year', value: pastYear, onChanged: (v) => setState(() => pastYear = v)),
        Field(label: 'Result', value: pastResult, onChanged: (v) => setState(() => pastResult = v), placeholder: 'Attempted, qualified...'),
      ],
      if (step == 4) ...[
        AppButton(
          label: carry ? 'Carry unfinished tasks forward' : 'Keep tasks on their original day',
          tone: carry ? Tone.primary : Tone.ghost,
          onPress: () => setState(() => carry = !carry),
        ),
        AppButton(
          label: notes ? 'In-app notifications on' : 'In-app notifications off',
          tone: notes ? Tone.primary : Tone.ghost,
          onPress: () => setState(() => notes = !notes),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: tx('In-app updates appear under the bell. You can schedule an Android study reminder from the planner.',
              color: palette.muted),
        ),
      ],
      gap(8),
      Pair([
        if (step > 0) AppButton(label: 'Back', tone: Tone.ghost, onPress: () => setState(() => step -= 1)),
        AppButton(
          label: step == 4 ? (loading ? 'Saving' : 'Finish') : 'Next',
          disabled: loading,
          onPress: () => step == 4 ? finish() : setState(() => step += 1),
        ),
      ]),
    ]);
  }
}
