import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/nav.dart';
import '../widgets/ui.dart';
import 'auth_screens.dart' show ExamPicker;

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.user, required this.go, required this.logout});
  final Student user;
  final Go go;
  final Future<void> Function() logout;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final quick = [
      ('Analytics', Icons.bar_chart, Accent.orange, 'analytics'),
      ('Notes', Icons.description, Accent.green, 'notes'),
      ('Bookmarks', Icons.bookmark, Accent.orange, 'bookmarks'),
      ('Achievements', Icons.emoji_events, Accent.purple, 'achievements'),
    ];
    final rows = [
      ('Edit profile', Icons.person_outline, 'editProfile'),
      ('Settings', Icons.settings_outlined, 'settings'),
      ('AI memory', Icons.auto_awesome_outlined, 'settings'),
      ('Help and support', Icons.help_outline, 'support'),
      ('Notifications', Icons.notifications_none, 'alerts'),
    ];
    final appTamil = user.appLanguage == 'ta';
    final examTamil = user.language == 'ta';
    return AppScreen(children: [
      HeroCard(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(18),
        child: Row(children: [
          Container(
            width: 68,
            height: 68,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: palette.mint, borderRadius: BorderRadius.circular(22)),
            child: tx(user.firstName.isNotEmpty ? user.firstName[0] : 'A', color: palette.primary, size: 26, weight: w800),
          ),
          gap(14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx('${user.firstName} ${user.lastName}', color: Colors.white, size: 20, weight: w800),
              gap(2),
              tx(user.email, color: const Color(0xFFA7F3D0), lines: 1),
              gap(6),
              tx(
                '${appTamil ? context.t('Tamil') : context.t('English')} · Exam ${examTamil ? context.t('Tamil') : context.t('English')}',
                color: palette.highlight,
                size: 12,
                weight: w700,
              ),
            ]),
          ),
          IconBtn(label: context.t('Edit profile'), icon: Icons.edit_outlined, onPress: () => go(AppRoute('editProfile'))),
        ]),
      ),
      Padding(padding: const EdgeInsets.only(bottom: 10), child: tx('Quick access', color: palette.primary, weight: w800)),
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: GridRows(columns: 4, spacing: 8, runSpacing: 12, children: [
          for (final (label, icon, accent, route) in quick)
            Tap(
              label: label,
              onTap: () => go(AppRoute(route)),
              child: Column(children: [
                ColorIcon(icon: icon, accent: accent, size: 52),
                gap(6),
                tx(context.t(label), color: palette.ink, size: 11, weight: w700, align: TextAlign.center),
              ]),
            ),
        ]),
      ),
      AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        marginBottom: 12,
        child: Column(children: [
          for (var i = 0; i < rows.length; i++)
            Tap(
              label: rows[i].$1,
              onTap: () => go(AppRoute(rows[i].$3)),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(border: i > 0 ? Border(top: BorderSide(color: palette.line)) : null),
                child: Row(children: [
                  SizedBox(width: 28, child: Icon(rows[i].$2, size: 22, color: palette.ink)),
                  gap(12),
                  Expanded(child: tx(context.t(rows[i].$1), color: palette.ink, weight: w700)),
                  Icon(Icons.chevron_right, size: 18, color: palette.muted),
                ]),
              ),
            ),
        ]),
      ),
      Tap(
        label: 'Logout',
        onTap: () => unawaited(showConfirm(
          context,
          title: 'Log out?',
          body: 'This device will forget the session. You can sign in again.',
          confirm: 'Logout',
          cancel: 'Stay',
          danger: true,
          onConfirm: logout,
        )),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: palette.dangerSoft, borderRadius: BorderRadius.circular(16)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.power_settings_new, size: 20, color: palette.danger),
            gap(8),
            tx(context.t('Logout'), color: palette.danger, weight: w800),
          ]),
        ),
      ),
    ]);
  }
}

class _LanguagePick extends StatelessWidget {
  const _LanguagePick({required this.value, required this.onChange});
  final String value;
  final ValueChanged<String> onChange;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: palette.greenSoft, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        for (final option in const ['ta', 'en'])
          Expanded(
            child: Tap(
              label: option == 'ta' ? context.t('Tamil') : context.t('English'),
              onTap: () => onChange(option),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: value == option ? palette.primary : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: tx(option == 'ta' ? context.t('Tamil') : context.t('English'),
                    color: value == option ? palette.greenInk : palette.muted, weight: w800, size: 13),
              ),
            ),
          ),
      ]),
    );
  }
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key, required this.user, required this.onUser, required this.back});
  final Student user;
  final ValueChanged<Student> onUser;
  final VoidCallback back;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> with SafeState {
  late String firstName = widget.user.firstName;
  late String lastName = widget.user.lastName;
  late String phone = widget.user.phone;
  late String appLanguage = widget.user.appLanguage;
  late String examLanguage = widget.user.language.isEmpty ? 'en' : widget.user.language;
  late List<Map<String, String>> education = widget.user.education.isNotEmpty
      ? widget.user.education.map((row) => {'level': str(row['level']), 'institution': str(row['institution']), 'year': str(row['year'])}).toList()
      : [_emptyEdu()];
  late List<Map<String, String>> experience = widget.user.examHistory.isNotEmpty
      ? widget.user.examHistory.map((row) => {'examName': str(row['examName']), 'year': str(row['year']), 'result': str(row['result'])}).toList()
      : [_emptyExp()];
  List<dynamic> exams = [];
  late String examId = widget.user.primaryExamId;
  bool examOpen = false;
  bool saving = false;
  String error = '';
  String message = '';
  // Bumped when a row is removed so the remaining rows rebuild with fresh inputs.
  int _rowsVersion = 0;

  static Map<String, String> _emptyEdu() => {'level': '', 'institution': '', 'year': ''};
  static Map<String, String> _emptyExp() => {'examName': '', 'year': '', 'result': ''};

  @override
  void initState() {
    super.initState();
    api('/exams').then((items) {
      safe(() {
        exams = asList(items);
        if (examId.isEmpty && exams.isNotEmpty) examId = str(exams.first['id']);
      });
    }).catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> save() async {
    if (firstName.trim().isEmpty) return setState(() => error = 'Enter your first name.');
    final educationPayload = education
        .map((row) => {'level': row['level']!.trim(), 'institution': row['institution']!.trim(), 'year': row['year']!.trim()})
        .where((row) => row['level']!.isNotEmpty && row['institution']!.isNotEmpty && row['year']!.isNotEmpty)
        .toList();
    final partialEdu = education.any((row) {
      final any = row.values.any((v) => v.isNotEmpty);
      final all = row.values.every((v) => v.trim().isNotEmpty);
      return any && !all;
    });
    if (partialEdu) return setState(() => error = 'Complete each education row (level, institution, year) or clear it.');
    final experiencePayload = experience
        .map((row) => {
              'examName': row['examName']!.trim(),
              'year': row['year']!.trim(),
              'result': row['result']!.trim().isEmpty ? 'attempted' : row['result']!.trim(),
            })
        .where((row) => row['examName']!.isNotEmpty)
        .toList();
    final partialExp = experience.any((row) => (row['year']!.isNotEmpty || row['result']!.isNotEmpty) && row['examName']!.trim().isEmpty);
    if (partialExp) return setState(() => error = 'Each experience row needs an exam name, or clear the row.');

    setState(() {
      saving = true;
      error = '';
      message = '';
    });
    try {
      final prefs = widget.user.preferences;
      var next = Student.fromJson(await api('/profile', method: 'PATCH', body: {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'phone': phone.trim(),
        'language': examLanguage,
        'education': educationPayload,
        'examHistory': experiencePayload,
        'preferences': {
          'carryForward': prefs['carryForward'] ?? true,
          'notifications': prefs['notifications'] ?? true,
          'appLanguage': appLanguage,
        },
      }));
      if (examId.isNotEmpty && examId != widget.user.primaryExamId) {
        next = Student.fromJson(await api('/exams/$examId/select', method: 'POST', body: {'primary': true}));
      }
      widget.onUser(next);
      safe(() => message = 'Profile saved');
    } catch (err) {
      safe(() => error = errorText(err, 'Could not save profile'));
    } finally {
      safe(() => saving = false);
    }
  }

  Widget _rowBox(BuildContext context, int index, int count, VoidCallback onRemove, List<Widget> fields) {
    final palette = context.palette;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: palette.inset, borderRadius: BorderRadius.circular(14), border: Border.all(color: palette.line)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            tx('#${index + 1}', color: palette.muted, weight: w700),
            if (count > 1)
              IconBtn(label: context.t('Remove'), icon: Icons.delete_outline, tone: Tone.danger, onPress: onRemove)
            else
              const SizedBox(height: 40),
          ]),
        ),
        ...fields,
      ]),
    );
  }

  Widget _sectionHeader(BuildContext context, String title, String addLabel, VoidCallback onAdd) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        tx(context.t(title), color: palette.primary, weight: w800),
        IconBtn(label: context.t(addLabel), icon: Icons.add, onPress: onAdd),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final selected = exams.cast<dynamic>().firstWhere((item) => str(item['id']) == examId, orElse: () => null);
    return AppScreen(children: [
      Header(title: context.t('Edit profile'), subtitle: 'Update your student details', onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      if (message.isNotEmpty) AppBanner(tone: BannerTone.success, message: message),
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Column(children: [
          Container(
            width: 84,
            height: 84,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: palette.mint, shape: BoxShape.circle),
            child: tx(firstName.isNotEmpty ? firstName[0] : 'A', color: palette.primary, size: 32, weight: w800),
          ),
          gap(10),
          tx(widget.user.email, color: palette.ink, weight: w700),
          gap(2),
          tx('Email cannot be changed in this release', color: palette.muted, size: 12, align: TextAlign.center),
        ]),
      ),
      AppCard(
        marginBottom: 12,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.only(bottom: 12), child: tx(context.t('Personal'), color: palette.primary, weight: w800)),
          Field(label: 'First name', value: firstName, onChanged: (v) => setState(() => firstName = v), icon: Icons.person_outline),
          Field(label: 'Last name', value: lastName, onChanged: (v) => setState(() => lastName = v)),
          Field(
            label: 'Phone',
            value: phone,
            onChanged: (v) => setState(() => phone = v),
            keyboard: FieldKeyboard.number,
            icon: Icons.call_outlined,
          ),
        ]),
      ),
      AppCard(
        marginBottom: 12,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          tx(context.t('App language'), color: palette.primary, weight: w800),
          gap(4),
          tx('Menus, tabs and labels in the app.', color: palette.muted, size: 13),
          gap(8),
          _LanguagePick(value: appLanguage, onChange: (v) => setState(() => appLanguage = v)),
          tx(context.t('Exam language'), color: palette.primary, weight: w800),
          gap(4),
          tx('Practice, mock and syllabus questions this language-la generate aagum. Tutor follows whatever you type.',
              color: palette.muted, size: 13),
          gap(8),
          _LanguagePick(value: examLanguage, onChange: (v) => setState(() => examLanguage = v)),
        ]),
      ),
      AppCard(
        marginBottom: 12,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(bottom: 8), child: tx(context.t('Exam goal'), color: palette.primary, weight: w800)),
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
            fieldColor: palette.inset,
            showAuthority: true,
          ),
        ]),
      ),
      AppCard(
        marginBottom: 12,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _sectionHeader(context, 'Education', 'Add education', () => setState(() => education = [...education, _emptyEdu()])),
          for (var i = 0; i < education.length; i++)
            KeyedSubtree(
              key: ValueKey('edu-$_rowsVersion-$i'),
              child: _rowBox(context, i, education.length, () => setState(() {
                education = [...education]..removeAt(i);
                _rowsVersion++;
              }), [
                Field(
                  label: 'Level',
                  value: education[i]['level']!,
                  onChanged: (v) => setState(() => education[i]['level'] = v),
                  placeholder: 'Degree, diploma...',
                ),
                Field(label: 'Institution', value: education[i]['institution']!, onChanged: (v) => setState(() => education[i]['institution'] = v)),
                Field(label: 'Year', value: education[i]['year']!, onChanged: (v) => setState(() => education[i]['year'] = v), placeholder: '2024'),
              ]),
            ),
        ]),
      ),
      AppCard(
        marginBottom: 12,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _sectionHeader(context, 'Experience', 'Add experience', () => setState(() => experience = [...experience, _emptyExp()])),
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: tx('Previous exam attempts. Leave empty if this is your first attempt.', color: palette.muted, size: 13),
          ),
          for (var i = 0; i < experience.length; i++)
            KeyedSubtree(
              key: ValueKey('exp-$_rowsVersion-$i'),
              child: _rowBox(context, i, experience.length, () => setState(() {
                experience = [...experience]..removeAt(i);
                _rowsVersion++;
              }), [
                Field(label: 'Exam name', value: experience[i]['examName']!, onChanged: (v) => setState(() => experience[i]['examName'] = v)),
                Field(label: 'Year', value: experience[i]['year']!, onChanged: (v) => setState(() => experience[i]['year'] = v)),
                Field(
                  label: 'Result',
                  value: experience[i]['result']!,
                  onChanged: (v) => setState(() => experience[i]['result'] = v),
                  placeholder: 'Attempted, qualified...',
                ),
              ]),
            ),
        ]),
      ),
      AppButton(label: context.t('Save changes'), icon: Icons.check, loading: saving, onPress: save),
      AppButton(label: context.t('Cancel'), tone: Tone.ghost, icon: Icons.close, onPress: widget.back),
    ]);
  }
}

class NotesScreen extends StatefulWidget {
  const NotesScreen({super.key, required this.back});
  final VoidCallback back;

  @override
  State<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends State<NotesScreen> with SafeState {
  List<dynamic>? items;
  String body = '';
  String error = '';
  bool saving = false;
  String deleting = '';

  @override
  void initState() {
    super.initState();
    _load().catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> _load() async {
    final value = await api('/notes');
    safe(() => items = asList(value));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppScreen(children: [
      Header(title: context.t('Notes'), subtitle: 'Private to your account', onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      Field(label: 'Write a note', value: body, onChanged: (v) => setState(() => body = v)),
      AppButton(
        label: 'Save note',
        icon: Icons.save_outlined,
        disabled: body.trim().isEmpty,
        loading: saving,
        onPress: () async {
          setState(() => saving = true);
          try {
            await api('/notes', method: 'POST', body: {'body': body});
            safe(() => body = '');
            await _load();
          } catch (err) {
            safe(() => error = errorText(err, 'Could not save note'));
          } finally {
            safe(() => saving = false);
          }
        },
      ),
      gap(8),
      if (items == null && error.isEmpty) const Loading(),
      for (final note in items ?? const [])
        AppCard(
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: tx(str(note['body']), color: palette.ink, lineHeight: 20)),
            gap(10),
            IconBtn(
              label: 'Delete',
              icon: Icons.delete_outline,
              tone: Tone.danger,
              loading: deleting == str(note['id']),
              onPress: () async {
                setState(() => deleting = str(note['id']));
                try {
                  await api('/notes/${note['id']}', method: 'DELETE');
                  await _load();
                } catch (err) {
                  safe(() => error = errorText(err));
                } finally {
                  safe(() => deleting = '');
                }
              },
            ),
          ]),
        ),
      if (items != null && items!.isEmpty) const Empty(title: 'No notes yet', body: 'Save revision points and doubts here.'),
    ]);
  }
}

class AchievementsScreen extends StatefulWidget {
  const AchievementsScreen({super.key, required this.user, required this.back});
  final Student user;
  final VoidCallback back;

  @override
  State<AchievementsScreen> createState() => _AchievementsScreenState();
}

class _AchievementsScreenState extends State<AchievementsScreen> with SafeState {
  Map<String, dynamic>? stats;
  List<dynamic> history = [];
  String error = '';

  @override
  void initState() {
    super.initState();
    Future.wait([api('/analytics'), api('/practice/history')]).then((results) {
      safe(() {
        stats = asMap(results[0]);
        history = asList(results[1]);
      });
    }).catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final s = stats;
    if (s == null) {
      return AppScreen(children: [
        Header(title: context.t('Achievements'), onBack: widget.back),
        if (error.isNotEmpty) AppBanner(message: error) else const Loading(),
      ]);
    }
    final streak = s['streak'] ?? widget.user.streak;
    final achievements = [
      ('First practice', 'Complete one practice set', history.any((item) => item['status'] == 'completed')),
      ('Five-day learner', 'Reach a 5 day study streak', numOf(streak) >= 5),
      ('Accuracy builder', 'Reach 75% practice accuracy', numOf(s['accuracy']) >= 75),
      (
        'Syllabus explorer',
        'Pass Easy in every syllabus topic',
        numOf(s['topicCount']) > 0 && numOf(s['studiedTopics']) >= numOf(s['topicCount'])
      ),
    ];
    return AppScreen(children: [
      Header(title: context.t('Achievements'), subtitle: 'Personal milestones', onBack: widget.back),
      for (final (title, detail, earned) in achievements)
        AppCard(
          color: earned ? palette.goldSoft : null,
          borderColor: earned ? palette.gold : null,
          child: Row(children: [
            Icon(earned ? Icons.workspace_premium : Icons.workspace_premium_outlined, size: 24, color: earned ? palette.gold : palette.muted),
            gap(12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx(title, color: palette.ink, weight: w800),
                tx(detail, color: palette.muted),
              ]),
            ),
            tx(earned ? 'Earned' : 'Locked', color: earned ? palette.gold : palette.muted, weight: w700),
          ]),
        ),
    ]);
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.user, required this.onUser, required this.back});
  final Student user;
  final ValueChanged<Student> onUser;
  final VoidCallback back;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with SafeState {
  Map<String, dynamic>? memory;
  String message = '';
  String error = '';

  @override
  void initState() {
    super.initState();
    api('/tutor/memory').then((v) => safe(() => memory = asMap(v))).catchError((_) {});
  }

  Future<void> save(Map<String, dynamic> patch) async {
    setState(() => error = '');
    try {
      widget.onUser(Student.fromJson(await api('/profile', method: 'PATCH', body: patch)));
      safe(() => message = 'Saved');
    } catch (err) {
      safe(() => error = errorText(err, 'Could not save'));
    }
  }


  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final user = widget.user;
    final prefs = user.preferences;
    final items = asList(memory?['items']);
    return AppScreen(children: [
      Header(title: context.t('Settings'), onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      if (message.isNotEmpty) AppBanner(tone: BannerTone.success, message: message),
      AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        child: Column(children: [
          SwitchRow(
            icon: Icons.dark_mode_outlined,
            title: 'Dark theme',
            value: palette.dark,
            divider: false,
            onChanged: (_) => context.app.toggleTheme(),
          ),
          SwitchRow(
            icon: Icons.notifications_none,
            title: context.t('Notifications'),
            subtitle: 'In-app updates under the bell',
            value: prefs['notifications'] == true,
            onChanged: (on) => save({'preferences': {...prefs, 'notifications': on}}),
          ),
          SwitchRow(
            icon: Icons.event_repeat,
            title: 'Carry unfinished tasks',
            subtitle: 'Move unfinished plan tasks to today',
            value: prefs['carryForward'] == true,
            onChanged: (on) => save({'preferences': {...prefs, 'carryForward': on}}),
          ),
        ]),
      ),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          tx('Privacy and data', color: palette.ink, weight: w800),
          gap(4),
          tx("Practice, mocks and tutor memory stay on your account. Other students' scores are not shown.", color: palette.muted),
        ]),
      ),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          tx('About ArivuVazhi', color: palette.ink, weight: w800),
          gap(4),
          tx('Government exam preparation. Release 1 is free. Email password reset is not connected.', color: palette.muted),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: tx('Profile name, phone, education and exam goal are under Edit profile.', color: palette.muted),
      ),
      Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: tx(context.t('AI memory'), color: palette.ink, weight: w700)),
      AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        child: SwitchRow(
          icon: Icons.auto_awesome_outlined,
          title: 'Learning memory',
          subtitle: 'Tutor remembers what you find difficult',
          value: user.aiMemoryEnabled,
          divider: false,
          onChanged: (enabled) async {
            try {
              widget.onUser(Student.fromJson(await api('/profile', method: 'PATCH', body: {'aiMemoryEnabled': enabled})));
              await api('/tutor/memory', method: 'PATCH', body: {'enabled': enabled});
            } catch (err) {
              safe(() => error = errorText(err));
            }
          },
        ),
      ),
      for (final item in items.take(4))
        Field(
          key: ValueKey('memory-${item['id']}'),
          label: 'Memory item',
          value: str(item['text']),
          onChanged: (text) => setState(() {
            memory = {
              ...memory!,
              'items': items.map((row) => row['id'] == item['id'] ? {...asMap(row), 'text': text} : row).toList(),
            };
          }),
        ),
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Pair([
          if (items.isNotEmpty)
            AppButton(
              label: 'Save',
              icon: Icons.save_outlined,
              tone: Tone.ghost,
              onPress: () async {
                try {
                  final next = await api('/tutor/memory', method: 'PATCH', body: {
                    'items': items.map((item) => {'id': item['id'], 'text': item['text']}).toList(),
                  });
                  safe(() {
                    memory = asMap(next);
                    message = 'Memory corrections saved';
                  });
                } catch (err) {
                  safe(() => error = errorText(err));
                }
              },
            ),
          AppButton(
            label: 'Reset',
            icon: Icons.refresh,
            tone: Tone.danger,
            onPress: () async {
              try {
                await api('/tutor/memory/reset', method: 'POST');
                safe(() {
                  memory = {...?memory, 'items': <dynamic>[]};
                  message = 'Memory cleared';
                });
              } catch (err) {
                safe(() => error = errorText(err));
              }
            },
          ),
        ]),
      ),
    ]);
  }
}

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key, required this.back});
  final VoidCallback back;

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> with SafeState {
  List<dynamic>? tickets;
  List<dynamic>? feedback;
  String subject = '', body = '', feedbackMsg = '', reply = '', openId = '', error = '', message = '';
  String feedbackCategory = 'new_feature';

  @override
  void initState() {
    super.initState();
    _load().catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> _load() async {
    final t = await api('/support/tickets');
    safe(() => tickets = asList(t));
    final f = await api('/feedback');
    safe(() => feedback = asList(f));
  }

  /// Runs a support action and shows its error in the banner.
  Future<void> _run(Future<void> Function() action) async {
    setState(() => error = '');
    try {
      await action();
    } catch (err) {
      safe(() => error = errorText(err));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    const categories = [('new_feature', 'New feature'), ('app_update', 'App update'), ('bug', 'Bug'), ('general', 'General')];
    return AppScreen(children: [
      Header(title: context.t('Help and support'), onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      if (message.isNotEmpty) AppBanner(tone: BannerTone.success, message: message),
      Padding(padding: const EdgeInsets.only(bottom: 8), child: tx('App feedback', color: palette.primary, weight: w800)),
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: tx('App update, new feature ideas, bugs — ithu product improve panna use aagum.', color: palette.muted, size: 13),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: GridRows(columns: 2, spacing: 8, runSpacing: 0, children: [
          for (final (value, label) in categories)
            AppButton(
              label: label,
              tone: feedbackCategory == value ? Tone.primary : Tone.ghost,
              onPress: () => setState(() => feedbackCategory = value),
            ),
        ]),
      ),
      Field(label: 'Your feedback', value: feedbackMsg, onChanged: (v) => setState(() => feedbackMsg = v)),
      AppButton(
        label: 'Send feedback',
        icon: Icons.favorite_border,
        onPress: () => _run(() async {
          if (feedbackMsg.trim().length < 5) {
            safe(() => error = 'Feedback needs at least 5 characters.');
            return;
          }
          await api('/feedback', method: 'POST', body: {'category': feedbackCategory, 'message': feedbackMsg.trim()});
          safe(() {
            feedbackMsg = '';
            message = 'Feedback sent — thanks';
          });
          await _load();
        }),
      ),
      gap(8),
      for (final item in (feedback ?? const []).take(3))
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            tx('${item['category']} · ${item['status']}', color: palette.ink, weight: w700),
            tx(str(item['message']), color: palette.muted),
          ]),
        ),
      Padding(padding: const EdgeInsets.only(top: 16, bottom: 8), child: tx('Support ticket', color: palette.primary, weight: w800)),
      Field(label: 'Subject', value: subject, onChanged: (v) => setState(() => subject = v)),
      Field(label: 'Message', value: body, onChanged: (v) => setState(() => body = v)),
      AppButton(
        label: 'Send ticket',
        icon: Icons.send,
        onPress: () => _run(() async {
          if (subject.trim().length < 3 || body.trim().length < 3) {
            safe(() => error = 'Subject and message need at least 3 characters.');
            return;
          }
          await api('/support/tickets', method: 'POST', body: {'subject': subject, 'body': body, 'category': 'general'});
          safe(() {
            subject = '';
            body = '';
            message = 'Ticket sent';
          });
          await _load();
        }),
      ),
      gap(8),
      if (tickets == null && error.isEmpty) const Loading(),
      for (final ticket in tickets ?? const [])
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  tx(str(ticket['subject']), color: palette.ink, weight: w700),
                  tx('${ticket['status']} · ${ticket['body']}', color: palette.muted),
                ]),
              ),
              gap(10),
              IconBtn(
                label: openId == str(ticket['id']) ? 'Hide reply' : 'Reply',
                icon: openId == str(ticket['id']) ? Icons.expand_less : Icons.chat_bubble_outline,
                onPress: () => setState(() => openId = openId == str(ticket['id']) ? '' : str(ticket['id'])),
              ),
            ]),
            if (openId == str(ticket['id'])) ...[
              gap(8),
              Field(label: 'Reply', value: reply, onChanged: (v) => setState(() => reply = v)),
              AppButton(
                label: 'Send reply',
                icon: Icons.send,
                onPress: () => _run(() async {
                  await api('/support/tickets/${ticket['id']}/reply', method: 'POST', body: {'body': reply});
                  safe(() {
                    reply = '';
                    message = 'Reply sent';
                  });
                  await _load();
                }),
              ),
            ],
          ]),
        ),
      if (tickets != null && tickets!.isEmpty)
        const Empty(title: 'No tickets', body: 'Write to us if something in practice, mocks or the tutor looks wrong.'),
    ]);
  }
}
