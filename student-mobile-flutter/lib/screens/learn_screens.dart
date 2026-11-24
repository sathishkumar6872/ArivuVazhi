import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/nav.dart';
import '../widgets/ui.dart';
import 'home_screens.dart' show StatTile;

const _statusLabel = {'completed': 'Completed', 'abandoned': 'Left midway', 'active': 'In progress'};

/// Average Easy → Medium → Hard progress of a subject's topics (0–100).
int subjectPercent(dynamic subject) {
  final topics = asList(subject?['topics']);
  if (topics.isEmpty) return 0;
  final total = topics.fold<num>(0, (sum, topic) => sum + numOf(asMap(topic['level'])['percent']));
  return (total / topics.length).round();
}

/// Levels open in at least one topic (Quick practice uses only those topics).
Map<String, bool> _openLevels(List<dynamic> subjects) {
  final topics = subjects.expand((subject) => asList(subject['topics']));
  bool unlocked(dynamic topic, String level) => asMap(asMap(asMap(topic['level'])['levels'])[level])['unlocked'] == true;
  return {
    'easy': true,
    'medium': topics.any((topic) => unlocked(topic, 'medium')),
    'hard': topics.any((topic) => unlocked(topic, 'hard')),
  };
}

class _FactRow extends StatelessWidget {
  const _FactRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        tx(label, color: palette.muted),
        gap(12),
        Expanded(child: tx(value, color: palette.ink, weight: w700, align: TextAlign.right)),
      ]),
    );
  }
}

Widget _chevron(Palette palette) => Icon(Icons.chevron_right, size: 18, color: palette.muted);

// ---------------------------------------------------------------- exams

class ExamsScreen extends StatefulWidget {
  const ExamsScreen({super.key, required this.user, required this.go});
  final Student user;
  final Go go;

  @override
  State<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends State<ExamsScreen> with SafeState {
  List<dynamic>? exams;
  String error = '';
  String tab = 'My Exams';

  @override
  void initState() {
    super.initState();
    api('/exams').then((v) => safe(() => exams = asList(v))).catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final user = widget.user;
    final mine = (exams ?? []).where((exam) => exam['id'] == user.primaryExamId || user.examIds.contains(str(exam['id']))).toList()
      // Current exam first.
      ..sort((a, b) => (b['id'] == user.primaryExamId ? 1 : 0) - (a['id'] == user.primaryExamId ? 1 : 0));
    final list = tab == 'My Exams' ? mine : (exams ?? []);
    return AppScreen(children: [
      Header(title: context.t('Exams')),
      Segment(options: const ['My Exams', 'All Exams'], value: tab, onChange: (v) => setState(() => tab = v)),
      if (error.isNotEmpty) AppBanner(message: error),
      if (exams == null && error.isEmpty) const Loading(),
      for (var index = 0; index < list.length; index++)
        Builder(builder: (context) {
          final exam = list[index];
          final current = str(exam['id']) == user.primaryExamId;
          return AppCard(
            onPress: () => widget.go(AppRoute('exam', {'examId': exam['id']})),
            color: current ? palette.greenSoft : null,
            borderColor: current ? palette.green : null,
            child: Row(children: [
              ColorIcon(icon: Icons.school, accent: current ? Accent.blue : accentAt(index + 1)),
              gap(12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  tx(str(exam['name']), color: palette.primary, weight: w800),
                  gap(2),
                  tx(current ? 'Your current exam' : str(exam['authority']), color: palette.muted),
                ]),
              ),
              _chevron(palette),
            ]),
          );
        }),
      if (exams != null && list.isEmpty)
        Empty(
          title: tab == 'My Exams' ? 'No exam selected' : 'No published exams',
          body: tab == 'My Exams'
              ? 'Open All Exams and set one exam as current.'
              : 'An admin publishes an exam before it appears here.',
        ),
    ]);
  }
}

class ExamScreen extends StatefulWidget {
  const ExamScreen({super.key, required this.examId, required this.user, required this.onUser, required this.back, required this.go});
  final String examId;
  final Student user;
  final ValueChanged<Student> onUser;
  final VoidCallback back;
  final Go go;

  @override
  State<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends State<ExamScreen> with SafeState {
  Map<String, dynamic>? exam;
  List<dynamic>? papers;
  String error = '';
  String tab = 'Overview';

  @override
  void initState() {
    super.initState();
    api('/exams/${widget.examId}').then((v) => safe(() => exam = asMap(v))).catchError((err) => safe(() => error = errorText(err)));
  }

  void _setTab(String next) {
    setState(() => tab = next);
    if (next != 'PYQ') return;
    setState(() => papers = null);
    api('/pyq?examId=${widget.examId}').then((v) => safe(() => papers = asList(v))).catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final go = widget.go;
    final subjects = asList(exam?['subjects']);
    final topicCount = subjects.fold<int>(0, (sum, subject) => sum + asList(subject['topics']).length);
    // Level progress: each topic counts Easy/Medium/Hard passed as thirds.
    final studied = subjects.fold<num>(
        0,
        (sum, subject) =>
            sum + asList(subject['topics']).fold<num>(0, (acc, topic) => acc + numOf(asMap(topic['level'])['percent']) / 100));
    final syllabusPercent = topicCount > 0 ? (studied / topicCount * 100).round() : 0;
    final pattern = exam?['pattern'] is Map ? asMap(exam!['pattern']) : null;
    final isCurrent = exam != null && str(exam!['id']) == widget.user.primaryExamId;
    final examLanguage = widget.user.language == 'ta' ? 'Tamil' : 'English';

    return AppScreen(children: [
      Header(title: str(exam?['name']).isNotEmpty ? str(exam?['name']) : 'Exam', subtitle: str(exam?['authority']), onBack: widget.back),
      Segment(options: const ['Overview', 'Syllabus', 'Pattern', 'PYQ'], value: tab, onChange: _setTab),
      if (error.isNotEmpty) AppBanner(message: error),
      if (exam == null && error.isEmpty) const Loading(),
      if (exam != null && tab == 'Overview') ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            if (isCurrent) const Pill(label: 'Your current exam', tone: PillTone.good),
            Pill(label: examLanguage),
            Pill(label: str(exam!['code']).isNotEmpty ? str(exam!['code']) : str(exam!['authority'])),
          ]),
        ),
        if (str(exam!['description']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: tx(str(exam!['description']), color: palette.muted, lineHeight: 20),
          ),
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            tx('Key facts', color: palette.ink, weight: w800),
            gap(10),
            _FactRow('Questions', pattern != null ? str(pattern['totalQuestions']) : '—'),
            _FactRow('Duration', pattern != null ? '${pattern['durationMinutes']} min' : '—'),
            _FactRow('Marks / Q', pattern != null ? str(pattern['marksPerQuestion']) : '—'),
            _FactRow('Negative', pattern != null ? str(pattern['negativeMarks']) : '—'),
            _FactRow('Syllabus', '${subjects.length} subjects · $topicCount topics'),
            _FactRow('Your coverage', topicCount > 0 ? '$syllabusPercent% topics touched' : 'Not started'),
          ]),
        ),
        if (topicCount > 0)
          Padding(padding: const EdgeInsets.only(top: 4, bottom: 8), child: ProgressBar(value: syllabusPercent)),
        if (!isCurrent)
          AppButton(
            label: 'Set as current exam',
            onPress: () async {
              try {
                widget.onUser(Student.fromJson(await api('/exams/${exam!['id']}/select', method: 'POST', body: {'primary': true})));
              } catch (err) {
                safe(() => error = errorText(err));
              }
            },
          ),
        AppButton(
          label: 'Start practice',
          icon: Icons.play_arrow,
          onPress: () => go(AppRoute('quiz', {'examId': exam!['id'], 'title': '${exam!['name']} practice', 'difficulty': 'easy'})),
        ),
        AppButton(label: 'Open syllabus', tone: Tone.ghost, onPress: () => _setTab('Syllabus')),
        AppButton(label: 'Daily mock', tone: Tone.ghost, onPress: () => go(AppRoute('mocks'))),
      ],
      if (exam != null && tab == 'Syllabus') ...[
        for (var i = 0; i < subjects.length; i++)
          Builder(builder: (context) {
            final subject = subjects[i];
            final (icon, accent) = subjectVisual(str(subject['name']), i);
            final topics = asList(subject['topics']);
            final mastered = topics.where((topic) => asMap(topic['level'])['mastered'] == true).length;
            final percent = subjectPercent(subject);
            return AppCard(
              onPress: () => go(AppRoute('topics', {'subjectId': subject['id'], 'subjectName': subject['name'], 'examId': exam!['id']})),
              child: Row(children: [
                ColorIcon(icon: icon, accent: accent),
                gap(12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    tx(str(subject['name']), color: palette.ink, weight: w800),
                    gap(4),
                    tx('${topics.length} topics · $mastered mastered', color: palette.muted),
                    if (topics.isNotEmpty) ProgressBar(value: percent),
                  ]),
                ),
                gap(8),
                tx('$percent%', color: palette.green, weight: w800),
                _chevron(palette),
              ]),
            );
          }),
        if (subjects.isEmpty) const Empty(title: 'Syllabus coming', body: 'Subjects appear after admin refreshes this exam syllabus.'),
      ],
      if (exam != null && tab == 'Pattern') ...[
        if (pattern != null) ...[
          AppCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx('Exam pattern', color: palette.ink, weight: w800),
              gap(10),
              _FactRow('Total questions', str(pattern['totalQuestions'])),
              _FactRow('Duration', '${pattern['durationMinutes']} minutes'),
              _FactRow('Marks per question', str(pattern['marksPerQuestion'])),
              _FactRow('Negative marking', str(pattern['negativeMarks'])),
            ]),
          ),
          if (asList(pattern['sections']).isNotEmpty)
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx('Sections', color: palette.ink, weight: w800),
                for (final section in asList(pattern['sections']))
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: tx('${section['name']} · ${section['questionCount']} questions', color: palette.muted),
                  ),
              ]),
            ),
        ] else
          const Empty(title: 'No pattern yet', body: 'Pattern details are not published for this exam.'),
      ],
      if (exam != null && tab == 'PYQ') ...[
        if (papers == null && error.isEmpty) const Loading(),
        for (final paper in papers ?? const [])
          AppCard(
            onPress: () => go(AppRoute('pyqPaper', {'paperId': paper['id']})),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx(str(paper['title']), color: palette.ink, weight: w700),
              tx('${paper['year']} · ${paper['questionCount'] ?? asList(paper['questionIds']).length} questions · ${str(paper['sourceName'])}',
                  color: palette.muted),
            ]),
          ),
        if (papers != null && papers!.isEmpty)
          const Empty(title: 'No PYQ yet', body: 'Previous year papers for this exam will show here when published.'),
      ],
    ]);
  }
}

// ---------------------------------------------------------------- PYQ

class PyqScreen extends StatefulWidget {
  const PyqScreen({super.key, required this.user, required this.go, required this.back});
  final Student user;
  final Go go;
  final VoidCallback back;

  @override
  State<PyqScreen> createState() => _PyqScreenState();
}

class _PyqScreenState extends State<PyqScreen> with SafeState {
  List<dynamic>? papers;
  String error = '';

  @override
  void initState() {
    super.initState();
    if (widget.user.primaryExamId.isEmpty) {
      papers = [];
      return;
    }
    api('/pyq?examId=${widget.user.primaryExamId}').then((v) => safe(() => papers = asList(v))).catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final hasExam = widget.user.primaryExamId.isNotEmpty;
    return AppScreen(children: [
      Header(title: 'Previous papers', subtitle: 'Only rights-verified papers', onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      if (!hasExam) const Empty(title: 'Choose an exam', body: 'Set a current exam first, then open previous papers.'),
      if (hasExam && papers == null && error.isEmpty) const Loading(),
      for (final paper in papers ?? const [])
        AppCard(
          onPress: () => widget.go(AppRoute('pyqPaper', {'paperId': paper['id']})),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            tx(str(paper['title']), color: palette.ink, weight: w700),
            tx('${paper['year']} · ${paper['questionCount']} questions · ${str(paper['sourceName'])}', color: palette.muted),
          ]),
        ),
      if (hasExam && papers != null && papers!.isEmpty)
        const Empty(title: 'No papers yet', body: 'A paper appears only after rights are verified and it is published.'),
    ]);
  }
}

class PyqPaperScreen extends StatefulWidget {
  const PyqPaperScreen({super.key, required this.paperId, required this.back});
  final String paperId;
  final VoidCallback back;

  @override
  State<PyqPaperScreen> createState() => _PyqPaperScreenState();
}

class _PyqPaperScreenState extends State<PyqPaperScreen> with SafeState {
  Map<String, dynamic>? paper;
  Map<String, dynamic>? result;
  String error = '';
  bool busy = false;
  int index = 0;
  final Map<String, String> answers = {};

  @override
  void initState() {
    super.initState();
    api('/pyq/${widget.paperId}').then((v) => safe(() => paper = asMap(v))).catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> submitPaper() async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final payload = await api('/pyq/${widget.paperId}/submit', method: 'POST', body: {
        'answers': answers.entries.map((e) => {'questionId': e.key, 'selectedKey': e.value}).toList(),
      });
      safe(() => result = asMap(payload));
    } catch (err) {
      safe(() => error = errorText(err, 'Submit failed'));
    } finally {
      safe(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final questions = asList(paper?['questions']);
    final question = index < questions.length ? questions[index] : null;
    final selected = question != null ? answers[str(question['id'])] : null;
    final answeredCount = answers.length;
    final total = numOf(result?['total']);
    final percent = total > 0 ? (numOf(result?['correct']) / total * 100).round() : 0;
    final answering = paper != null && questions.isNotEmpty && result == null && question != null;

    return AppScreen(
        footer: !answering
            ? null
            : Pair([
                AppButton(
                    label: 'Previous', tone: Tone.ghost, marginTop: 0, disabled: index == 0, onPress: () => setState(() => index -= 1)),
                index + 1 < questions.length
                    ? AppButton(label: 'Next', marginTop: 0, disabled: selected == null, onPress: () => setState(() => index += 1))
                    : AppButton(
                        label: busy ? 'Submitting…' : 'Submit paper',
                        marginTop: 0,
                        disabled: answeredCount < questions.length || busy,
                        onPress: submitPaper,
                      ),
              ]),
        children: [
      Header(
        title: str(paper?['title']).isNotEmpty ? str(paper?['title']) : 'Paper',
        subtitle: paper != null ? '${paper!['year']} · ${questions.length} questions' : null,
        onBack: widget.back,
      ),
      if (error.isNotEmpty) AppBanner(message: error),
      if (paper == null && error.isEmpty) const Loading(),
      if (paper != null && questions.isEmpty) const Empty(title: 'No questions', body: 'This paper has no published questions yet.'),
      if (paper != null && questions.isNotEmpty && result == null && question != null) ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: tx('Q ${index + 1} of ${questions.length} · keys unlock only after submit', color: palette.muted),
        ),
        ProgressBar(value: (index + (selected != null ? 1 : 0)) / questions.length * 100),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: tx(str(question['stem']), color: palette.ink, size: 17, weight: w700, lineHeight: 24),
        ),
        for (final option in asList(question['options']))
          Choice(
            letter: str(option['key']),
            text: str(option['text']),
            state: selected == str(option['key']) ? ChoiceState.selected : ChoiceState.idle,
            onPress: () => setState(() => answers[str(question['id'])] = str(option['key'])),
          ),
        if (answeredCount < questions.length && index + 1 >= questions.length)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: AppBanner(tone: BannerTone.info, message: 'Answer all questions to submit ($answeredCount/${questions.length}).'),
          ),
      ],
      if (result != null) ...[
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            tx('${result!['correct']} / ${result!['total']}', color: palette.ink, size: 28, weight: w800),
            tx('$percent% · scored after submit', color: palette.muted),
            ProgressBar(value: percent),
          ]),
        ),
        for (var q = 0; q < asList(result!['questions']).length; q++)
          Builder(builder: (context) {
            final item = asList(result!['questions'])[q];
            final correct = item['correct'] == true;
            return AppCard(
              color: correct ? palette.greenSoft : palette.dangerSoft,
              borderColor: Colors.transparent,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx('${q + 1}. ${str(item['stem'])}', color: palette.ink, weight: w700),
                gap(6),
                tx(
                  correct
                      ? 'Correct'
                      : 'Your answer ${str(item['selectedKey']).isEmpty ? '—' : str(item['selectedKey'])} · Key ${str(item['correctKey'])}',
                  color: correct ? palette.good : palette.danger,
                  weight: w800,
                ),
                if (str(item['explanation']).isNotEmpty)
                  Padding(padding: const EdgeInsets.only(top: 6), child: tx(str(item['explanation']), color: palette.muted)),
              ]),
            );
          }),
        AppButton(label: 'Back', onPress: widget.back),
      ],
    ]);
  }
}

// ---------------------------------------------------------------- practice

/// One topic row: name, level chips and overall level progress. Tapping the row practises the current level.
class _TopicLevelCard extends StatelessWidget {
  const _TopicLevelCard({required this.topic, this.subtitle, required this.onStart});
  final dynamic topic;
  final String? subtitle;
  final ValueChanged<String> onStart;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final level = topic['level'] is Map ? asMap(topic['level']) : freshLevel;
    final current = str(level['current']).isEmpty ? 'easy' : str(level['current']);
    final mastered = level['mastered'] == true;
    return AppCard(
      onPress: () => onStart(current),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx(str(topic['name']), color: palette.ink, weight: w800),
              gap(2),
              tx('${subtitle != null ? '$subtitle · ' : ''}${mastered ? 'Mastered' : 'Next: ${levelName[current] ?? current}'}',
                  color: palette.muted, size: 12),
            ]),
          ),
          gap(8),
          tx('${level['percent'] ?? 0}%', color: palette.green, weight: w800),
        ]),
        LevelSteps(level: level, onPick: onStart),
      ]),
    );
  }
}

class PracticeScreen extends StatefulWidget {
  const PracticeScreen({super.key, required this.user, required this.go});
  final Student user;
  final Go go;

  @override
  State<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends State<PracticeScreen> with SafeState {
  Map<String, dynamic>? exam;
  List<dynamic> marks = [];
  List<dynamic> history = [];
  Map<String, dynamic>? resume;
  String error = '';
  late bool loading = widget.user.primaryExamId.isNotEmpty;
  String tab = 'Subjects';
  String difficulty = 'easy';

  @override
  void initState() {
    super.initState();
    final examId = widget.user.primaryExamId;
    if (examId.isEmpty) return;
    Future.wait([
      api('/exams/$examId'),
      api('/bookmarks').catchError((_) => <dynamic>[]),
      api('/practice/history').catchError((_) => <dynamic>[]),
      api('/practice/active?examId=$examId').catchError((_) => null),
    ]).then((results) {
      safe(() {
        exam = asMap(results[0]);
        marks = asList(results[1]);
        history = asList(results[2]);
        resume = results[3] is Map ? asMap(results[3]) : null;
        error = '';
      });
    }).catchError((err) {
      safe(() => error = errorText(err));
    }).whenComplete(() => safe(() => loading = false));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final go = widget.go;
    final examId = widget.user.primaryExamId;
    final hasExam = examId.isNotEmpty;
    final subjects = asList(exam?['subjects']);
    final topics = [
      for (final subject in subjects)
        for (final topic in asList(subject['topics'])) {...asMap(topic), 'subjectName': subject['name']}
    ];
    final open = _openLevels(subjects);
    void startTopic(dynamic topic, String level) =>
        go(AppRoute('quiz', {'examId': examId, 'topicId': topic['id'], 'title': topic['name'], 'difficulty': level}));

    return AppScreen(children: [
      Header(title: context.t('Practice'), subtitle: str(exam?['name']).isNotEmpty ? str(exam?['name']) : 'Primary exam'),
      if (resume != null)
        AppCard(
          onPress: () => go(AppRoute('quiz', {
            'examId': resume!['examId'],
            'topicId': resume!['topicId'],
            'title': str(resume!['topicName']).isNotEmpty ? resume!['topicName'] : 'Practice',
            'difficulty': resume!['difficulty'],
            'sessionId': resume!['id'],
          })),
          color: palette.greenSoft,
          borderColor: palette.green,
          child: Row(children: [
            Icon(Icons.play_circle, size: 30, color: palette.green),
            gap(12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx('Continue practice', color: palette.primary, weight: w800),
                gap(2),
                tx(
                  '${str(resume!['topicName']).isNotEmpty ? resume!['topicName'] : 'Quick practice'}'
                  '${levelName[resume!['difficulty']] != null ? ' · ${levelName[resume!['difficulty']]}' : ''}'
                  ' · ${resume!['answered']} of ${resume!['total']} done',
                  color: palette.muted,
                ),
              ]),
            ),
            _chevron(palette),
          ]),
        ),
      Segment(options: const ['Subjects', 'Topics', 'Saved', 'History'], value: tab, onChange: (v) => setState(() => tab = v)),
      if (error.isNotEmpty) AppBanner(message: error),
      if (loading) const Loading(label: 'Loading practice…'),
      if (!loading && !hasExam)
        const Empty(title: 'Choose an exam', body: 'Open the Exams tab, pick an exam, then set it as your current exam.'),
      if (!loading && hasExam && tab == 'Subjects')
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(padding: const EdgeInsets.only(bottom: 6), child: tx('Quick practice level', color: palette.muted, weight: w700)),
            Segment(options: levels, value: difficulty, onChange: (v) => setState(() => difficulty = v)),
            if (open[difficulty] == true)
              AppButton(
                label: 'Quick 5 · ${levelName[difficulty]}',
                icon: Icons.bolt,
                onPress: () => go(AppRoute('quiz', {
                  'examId': examId,
                  'title': 'Quick practice · ${levelName[difficulty]}',
                  'difficulty': difficulty,
                })),
              )
            else
              AppBanner(
                tone: BannerTone.info,
                message:
                    '${levelName[difficulty]} unlocks topic by topic: score ${difficulty == 'medium' ? '80% in Easy' : '70% in Medium'} (10+ questions) on a topic first.',
              ),
          ]),
        ),
      if (!loading && hasExam && tab == 'Subjects')
        for (var i = 0; i < subjects.length; i++)
          Builder(builder: (context) {
            final subject = subjects[i];
            final rows = asList(subject['topics']);
            final percent = subjectPercent(subject);
            final mastered = rows.where((topic) => asMap(topic['level'])['mastered'] == true).length;
            final (icon, accent) = subjectVisual(str(subject['name']), i);
            return AppCard(
              onPress: () => go(AppRoute('topics', {'subjectId': subject['id'], 'subjectName': subject['name'], 'examId': examId})),
              child: Row(children: [
                ColorIcon(icon: icon, accent: accent),
                gap(12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: tx(str(subject['name']), color: palette.ink, weight: w800)),
                      tx('$percent%', color: palette.green, weight: w800),
                    ]),
                    ProgressBar(value: percent),
                    tx('${rows.length} ${rows.length == 1 ? 'topic' : 'topics'} · $mastered mastered', color: palette.muted),
                  ]),
                ),
                _chevron(palette),
              ]),
            );
          }),
      if (!loading && tab == 'Subjects' && hasExam && exam != null && subjects.isEmpty)
        const Empty(title: 'No syllabus yet', body: 'Subjects for your exam are being prepared. Please check back soon.'),
      if (!loading && tab == 'Topics')
        for (final topic in topics)
          _TopicLevelCard(topic: topic, subtitle: str(topic['subjectName']), onStart: (level) => startTopic(topic, level)),
      if (!loading && tab == 'Topics' && hasExam && exam != null && topics.isEmpty)
        const Empty(title: 'No topics yet', body: 'Topics for your exam are being prepared. Please check back soon.'),
      if (!loading && tab == 'Saved')
        for (final question in marks) AppCard(child: tx(str(question['stem']), color: palette.ink, weight: w700)),
      if (!loading && tab == 'Saved' && marks.isEmpty)
        const Empty(title: 'No bookmarks', body: 'Save a question after you check the answer.'),
      if (!loading && tab == 'History')
        for (final session in history)
          AppCard(
            onPress: intOf(session['answered']) > 0
                ? () => go(AppRoute('practiceResult', {
                      'sessionId': session['id'],
                      'examId': session['examId'],
                      'topicId': session['topicId'],
                      'title': str(session['topicName']).isNotEmpty ? session['topicName'] : 'Quick practice',
                      'difficulty': session['difficulty'],
                      'kind': session['kind'],
                      'correct': session['correct'],
                      'answered': session['answered'],
                      'total': session['total'],
                    }))
                : null,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: tx(str(session['topicName']).isNotEmpty ? str(session['topicName']) : 'Quick practice',
                      color: palette.ink, weight: w800),
                ),
                gap(8),
                tx('${session['correct']}/${session['answered']}', color: palette.good, weight: w800),
              ]),
              gap(2),
              tx(
                '${session['kind'] == 'retry' ? 'Retry · ' : ''}'
                '${levelName[session['difficulty']] ?? 'Mixed'} · '
                '${_statusLabel[session['status']] ?? str(session['status'])} · '
                '${session['answered']} of ${session['total']} answered',
                color: palette.muted,
              ),
            ]),
          ),
      if (!loading && tab == 'History' && history.isEmpty)
        const Empty(title: 'No practice history', body: 'Complete a practice set to see it here.'),
    ]);
  }
}

class TopicsScreen extends StatefulWidget {
  const TopicsScreen({super.key, required this.route, required this.back, required this.go});
  final AppRoute route;
  final VoidCallback back;
  final Go go;

  @override
  State<TopicsScreen> createState() => _TopicsScreenState();
}

class _TopicsScreenState extends State<TopicsScreen> with SafeState {
  Map<String, dynamic>? exam;
  String error = '';

  @override
  void initState() {
    super.initState();
    api('/exams/${widget.route.param('examId')}')
        .then((v) => safe(() => exam = asMap(v)))
        .catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final route = widget.route;
    final subject = asList(exam?['subjects']).cast<dynamic>().firstWhere((item) => str(item['id']) == route.param('subjectId'), orElse: () => null);
    final topicRows = asList(subject?['topics']);
    return AppScreen(children: [
      Header(
        title: route.param('subjectName'),
        subtitle: subject != null ? '${subjectPercent(subject)}% · Easy → Medium → Hard' : null,
        onBack: widget.back,
      ),
      if (error.isNotEmpty) AppBanner(message: error),
      if (exam == null && error.isEmpty) const Loading(),
      if (exam != null && topicRows.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: palette.greenSoft, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            Icon(Icons.lock_open, size: 16, color: palette.green),
            gap(8),
            Expanded(
              child: tx('Easy 80% → Medium · Medium 70% → Hard · Hard 60% = mastered (10+ Q each)',
                  color: palette.primary, size: 12, weight: w600),
            ),
          ]),
        ),
      for (final topic in topicRows)
        _TopicLevelCard(
          topic: topic,
          onStart: (level) => widget.go(AppRoute('quiz', {
            'examId': route.param('examId'),
            'topicId': topic['id'],
            'title': topic['name'],
            'difficulty': level,
          })),
        ),
      if (exam != null && subject != null && topicRows.isEmpty)
        const Empty(title: 'No topics', body: 'Topics for this subject are being prepared. Please check back soon.'),
      if (exam != null && subject == null) const Empty(title: 'Subject missing', body: 'This subject is not in the current syllabus.'),
    ]);
  }
}

/// Lets a student flag a wrong or unclear question; 3 reports hide it until an admin reviews it.
class _ReportQuestion extends StatefulWidget {
  const _ReportQuestion({super.key, required this.questionId});
  final String questionId;

  @override
  State<_ReportQuestion> createState() => _ReportQuestionState();
}

class _ReportQuestionState extends State<_ReportQuestion> with SafeState {
  bool open = false;
  bool done = false;

  Future<void> send(String reason) async {
    await api('/questions/${widget.questionId}/report', method: 'POST', body: {'reason': reason});
    safe(() => done = true);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (done) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: tx('Thanks — reported for review.', color: palette.muted, align: TextAlign.center),
      );
    }
    if (!open) {
      return Center(
        child: Tap(
          label: 'Report this question',
          onTap: () => setState(() => open = true),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.outlined_flag, size: 14, color: palette.muted),
              gap(6),
              tx('Report a problem', color: palette.muted, weight: w700),
            ]),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Pair([
        AppButton(label: 'Answer is wrong', tone: Tone.ghost, onPress: () => send('wrong_answer')),
        AppButton(label: 'Question unclear', tone: Tone.ghost, onPress: () => send('unclear')),
      ]),
    );
  }
}

class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key, required this.route, required this.back, required this.onDone});
  final AppRoute route;
  final VoidCallback back;
  final Go onDone;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> with SafeState {
  String sessionId = '';
  List<dynamic> questions = [];
  int index = 0;
  Map<String, Map<String, dynamic>> feedbackByQuestion = {};
  int elapsed = 0;
  String error = '';
  final Map<String, bool> saved = {};
  late String kind = widget.route.opt('retryOf') != null ? 'retry' : 'practice';
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => safe(() => elapsed += 1));
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _load() {
    final route = widget.route;
    setState(() {
      sessionId = '';
      questions = [];
      index = 0;
      feedbackByQuestion = {};
      elapsed = 0;
      error = '';
      saved.clear();
    });
    final resumeId = route.opt('sessionId');
    final Future<dynamic> load = resumeId != null
        // Resume: answered questions come back with their result; continue at the first unanswered.
        ? api('/practice/sessions/$resumeId').then((session) {
            final answered = <String, Map<String, dynamic>>{};
            final list = asList(session['questions']);
            for (final question in list) {
              if (str(question['yourAnswer']).isNotEmpty) {
                answered[str(question['id'])] = {
                  'selectedKey': question['yourAnswer'],
                  'correct': question['correct'],
                  'correctKey': question['correctKey'],
                  'explanation': question['explanation'],
                };
              }
            }
            final firstOpen = list.indexWhere((question) => str(question['yourAnswer']).isEmpty);
            safe(() {
              feedbackByQuestion = answered;
              index = firstOpen < 0 ? (list.length - 1).clamp(0, list.length) : firstOpen;
              kind = str(session['kind']).isNotEmpty ? str(session['kind']) : 'practice';
            });
            return session;
          })
        : api('/practice/sessions', method: 'POST', body: {
            'examId': route.param('examId'),
            if (route.opt('topicId') != null) 'topicId': route.opt('topicId'),
            if (route.opt('difficulty') != null) 'difficulty': route.opt('difficulty'),
            if (route.opt('retryOf') != null) 'retryOf': route.opt('retryOf'),
            'count': 5,
          });
    load.then((session) {
      safe(() {
        sessionId = str(session['id']);
        questions = asList(session['questions']);
      });
    }).catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> answer(dynamic question, String key) async {
    if (feedbackByQuestion[str(question['id'])] != null) return;
    try {
      // The server keeps the first answer; a repeat returns that original result.
      final checked = await api('/practice/sessions/$sessionId/answers',
          method: 'POST', body: {'questionId': question['id'], 'selectedKey': key});
      safe(() => feedbackByQuestion = {...feedbackByQuestion, str(question['id']): asMap(checked)});
    } catch (err) {
      safe(() => error = errorText(err, 'Could not check'));
    }
  }

  Future<void> next() async {
    final route = widget.route;
    if (index + 1 >= questions.length) {
      try {
        final result = asMap(await api('/practice/sessions/$sessionId/complete', method: 'POST'));
        widget.onDone(AppRoute('practiceResult', {
          'sessionId': sessionId,
          'examId': route.param('examId'),
          'topicId': route.opt('topicId'),
          'title': route.param('title'),
          'difficulty': route.opt('difficulty'),
          'kind': kind,
          'correct': intOf(result['correct']),
          'answered': result['answered'] ?? feedbackByQuestion.length,
          'total': result['total'] ?? questions.length,
          'topics': asList(result['topics']),
          'pendingOffline': result['pendingOffline'] == true,
        }));
      } catch (err) {
        safe(() => error = errorText(err));
      }
      return;
    }
    setState(() => index += 1);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final route = widget.route;
    final question = index < questions.length ? questions[index] : null;
    final feedback = question != null ? feedbackByQuestion[str(question['id'])] : null;
    final pendingOffline = feedback?['pendingOffline'] == true;
    final subtitle = [
      kind == 'retry' ? 'Retry wrong answers' : (levelName[route.opt('difficulty')] ?? ''),
      if (question != null) '${index + 1} of ${questions.length}',
    ].where((part) => part.isNotEmpty).join(' · ');
    final locked = RegExp('unlock', caseSensitive: false).hasMatch(error);
    final clock = '${(elapsed ~/ 60).toString().padLeft(2, '0')}:${(elapsed % 60).toString().padLeft(2, '0')}';

    return AppScreen(
        footer: question == null
            ? null
            : Pair([
                AppButton(
                    label: 'Previous', tone: Tone.ghost, marginTop: 0, disabled: index == 0, onPress: () => setState(() => index -= 1)),
                AppButton(
                    label: index + 1 >= questions.length ? 'See result' : 'Next',
                    marginTop: 0,
                    disabled: feedback == null,
                    onPress: next),
              ]),
        children: [
      Header(title: route.param('title'), subtitle: subtitle, onBack: widget.back),
      if (question == null && error.isEmpty) const Loading(variant: LoadingVariant.quiz, label: 'Preparing your questions…'),
      if (error.isNotEmpty && question == null) ...[
        Empty(title: locked ? 'Level locked' : 'Could not start practice', body: error),
        locked
            ? AppButton(label: 'Back', tone: Tone.ghost, onPress: widget.back)
            : AppButton(label: 'Try again', icon: Icons.refresh, onPress: _load),
      ],
      if (error.isNotEmpty && question != null) AppBanner(message: error),
      if (question != null) ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            tx('Q ${index + 1} of ${questions.length}', color: palette.green, weight: w800),
            tx(clock, color: palette.muted),
          ]),
        ),
        ProgressBar(value: (index + (feedback != null ? 1 : 0)) / questions.length * 100),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: tx(str(question['stem']), color: palette.ink, size: 18, weight: w700, lineHeight: 26),
        ),
        for (final option in asList(question['options']))
          Builder(builder: (context) {
            final key = str(option['key']);
            final selected = feedback?['selectedKey'] == key;
            final correct = feedback != null && !pendingOffline && key == str(feedback['correctKey']);
            final state = correct
                ? ChoiceState.correct
                : selected && feedback != null && !pendingOffline && feedback['correct'] != true
                    ? ChoiceState.wrong
                    : selected
                        ? ChoiceState.selected
                        : ChoiceState.idle;
            return Choice(
              letter: key,
              text: str(option['text']),
              state: state,
              disabled: feedback != null,
              onPress: () => answer(question, key),
            );
          }),
        if (pendingOffline)
          const AppBanner(
            tone: BannerTone.info,
            message: 'Answer saved on this device. Correct answer and explanation will be available after reconnecting.',
          )
        else if (feedback != null)
          AppCard(
            color: feedback['correct'] == true ? palette.greenSoft : palette.dangerSoft,
            borderColor: Colors.transparent,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx(feedback['correct'] == true ? 'Correct answer' : 'Answer ${str(feedback['correctKey'])}',
                  color: feedback['correct'] == true ? palette.good : palette.danger, weight: w800),
              gap(6),
              tx(str(feedback['explanation']), color: palette.ink, lineHeight: 20),
            ]),
          ),
        if (feedback != null)
          AppButton(
            label: saved[str(question['id'])] == true ? 'Saved' : 'Bookmark',
            tone: Tone.ghost,
            icon: saved[str(question['id'])] == true ? Icons.bookmark : Icons.bookmark_border,
            disabled: saved[str(question['id'])] == true,
            onPress: () async {
              try {
                await api('/bookmarks', method: 'POST', body: {'questionId': question['id']});
                safe(() => saved[str(question['id'])] = true);
              } catch (err) {
                safe(() => error = errorText(err));
              }
            },
          ),
        if (feedback != null && !pendingOffline) _ReportQuestion(key: ValueKey(question['id']), questionId: str(question['id'])),
      ],
    ]);
  }
}

class PracticeResultScreen extends StatefulWidget {
  const PracticeResultScreen({super.key, required this.route, required this.back, required this.go});
  final AppRoute route;
  final VoidCallback back;
  final Go go;

  @override
  State<PracticeResultScreen> createState() => _PracticeResultScreenState();
}

class _PracticeResultScreenState extends State<PracticeResultScreen> with SafeState {
  Map<String, dynamic>? review;
  final Map<String, bool> saved = {};
  String error = '';

  bool get pendingOffline => widget.route.p['pendingOffline'] == true;

  @override
  void initState() {
    super.initState();
    if (pendingOffline) return;
    api('/practice/sessions/${widget.route.param('sessionId')}')
        .then((v) => safe(() => review = asMap(v)))
        .catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final route = widget.route;
    final go = widget.go;
    final answered = intOf(review?['answered'] ?? route.p['answered']);
    final correct = intOf(review?['correct'] ?? route.p['correct']);
    final accuracy = answered > 0 ? (correct / answered * 100).round() : 0;
    final wrong = answered - correct;
    final isRetry = (str(review?['kind']).isNotEmpty ? str(review?['kind']) : route.param('kind')) == 'retry';
    final topics = asList(route.p['topics']);
    final difficulty = route.opt('difficulty');
    final weakTopic = review?['weakTopic'];

    return AppScreen(children: [
      Header(title: 'Practice result', subtitle: route.param('title'), onBack: widget.back),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          tx(isRetry ? 'Retry score' : 'Score', color: palette.muted),
          if (pendingOffline)
            Padding(padding: const EdgeInsets.only(top: 6), child: tx('Saved for sync', color: palette.ink, size: 22, weight: w700))
          else
            tx('$correct / $answered', color: palette.ink, size: 36, weight: w700),
          tx(
            pendingOffline
                ? 'Score after reconnect'
                : '$accuracy% accuracy${difficulty != null ? ' · ${levelName[difficulty] ?? difficulty}' : ''}${isRetry ? ' · not counted in progress' : ''}',
            color: palette.muted,
          ),
          if (!pendingOffline) ProgressBar(value: accuracy),
        ]),
      ),
      for (final topic in topics)
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: tx(str(topic['name']).isNotEmpty ? str(topic['name']) : 'Topic', color: palette.ink, weight: w800)),
              tx(topic['mastered'] == true ? 'Mastered' : 'Next: ${levelName[topic['current']] ?? str(topic['current'])}',
                  color: palette.green, weight: w800),
            ]),
            LevelSteps(
              level: topic,
              onPick: (level) => go(AppRoute('quiz', {
                'examId': route.param('examId'),
                'topicId': topic['topicId'],
                'title': str(topic['name']).isNotEmpty ? topic['name'] : route.param('title'),
                'difficulty': level,
              })),
            ),
          ]),
        ),
      if (weakTopic is Map)
        AppBanner(tone: BannerTone.info, message: 'Weak area: ${weakTopic['name']}. Practise it again to strengthen it.'),
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (!isRetry && !pendingOffline)
            AppButton(
              label: 'Next 5 questions',
              icon: Icons.arrow_forward,
              onPress: () => go(AppRoute('quiz', {
                'examId': route.param('examId'),
                'topicId': route.opt('topicId'),
                'title': route.param('title'),
                'difficulty': difficulty,
              })),
            ),
          if (!isRetry && wrong > 0 && !pendingOffline)
            AppButton(
              label: 'Retry wrong answers ($wrong)',
              tone: Tone.ghost,
              icon: Icons.refresh,
              onPress: () => go(AppRoute('quiz', {
                'examId': route.param('examId'),
                'title': '${route.param('title')} · retry',
                'retryOf': route.param('sessionId'),
              })),
            ),
          AppButton(label: 'Back to practice', tone: Tone.ghost, onPress: widget.back),
        ]),
      ),
      if (error.isNotEmpty) AppBanner(message: error),
      if (review != null)
        Padding(padding: const EdgeInsets.only(bottom: 8), child: tx('Review answers', color: palette.primary, size: 17, weight: w800)),
      ...() {
        final answeredQuestions = asList(review?['questions']).where((q) => str(q['yourAnswer']).isNotEmpty).toList();
        return [
          for (var at = 0; at < answeredQuestions.length; at++)
            Builder(builder: (context) {
              final question = answeredQuestions[at];
              final options = asList(question['options']);
              String optionText(dynamic key) =>
                  str(options.cast<dynamic>().firstWhere((o) => o['key'] == key, orElse: () => null)?['text']);
              final right = question['correct'] == true;
              final id = str(question['id']);
              return AppCard(
                borderColor: right ? palette.good : palette.danger,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(right ? Icons.check_circle : Icons.cancel, size: 20, color: right ? palette.good : palette.danger),
                    gap(8),
                    Expanded(child: tx('${at + 1}. ${str(question['stem'])}', color: palette.ink, weight: w700, lineHeight: 20)),
                  ]),
                  if (!right)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: tx('Your answer: ${question['yourAnswer']}. ${optionText(question['yourAnswer'])}', color: palette.danger),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: tx('Correct: ${question['correctKey']}. ${optionText(question['correctKey'])}',
                        color: palette.good, weight: w700),
                  ),
                  if (str(question['explanation']).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: tx(str(question['explanation']), color: palette.muted, lineHeight: 19),
                    ),
                  AppButton(
                    label: saved[id] == true ? 'Saved' : 'Bookmark',
                    tone: Tone.ghost,
                    icon: saved[id] == true ? Icons.bookmark : Icons.bookmark_border,
                    disabled: saved[id] == true,
                    onPress: () async {
                      try {
                        await api('/bookmarks', method: 'POST', body: {'questionId': question['id']});
                        safe(() => saved[id] = true);
                      } catch (err) {
                        safe(() => error = errorText(err));
                      }
                    },
                  ),
                  _ReportQuestion(key: ValueKey('report-$id'), questionId: id),
                ]),
              );
            }),
        ];
      }(),
    ]);
  }
}

class BookmarksScreen extends StatefulWidget {
  const BookmarksScreen({super.key, required this.back});
  final VoidCallback back;

  @override
  State<BookmarksScreen> createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends State<BookmarksScreen> with SafeState {
  List<dynamic>? items;
  String error = '';

  @override
  void initState() {
    super.initState();
    _load().catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> _load() async {
    final value = await api('/bookmarks');
    safe(() => items = asList(value));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppScreen(children: [
      Header(title: context.t('Bookmarks'), onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      if (items == null && error.isEmpty) const Loading(),
      for (final question in items ?? const [])
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            tx(str(question['stem']), color: palette.ink, weight: w700),
            AppButton(
              label: context.t('Remove'),
              tone: Tone.ghost,
              onPress: () async {
                try {
                  await api('/bookmarks/${question['id']}', method: 'DELETE');
                  await _load();
                } catch (err) {
                  safe(() => error = errorText(err));
                }
              },
            ),
          ]),
        ),
      if (items != null && items!.isEmpty) const Empty(title: 'No bookmarks', body: 'Save a question after you check the answer.'),
    ]);
  }
}

// ---------------------------------------------------------------- mocks

/// How today's personal mock stands, for a list row or the intro screen.
({String label, PillTone tone, bool ready, String detail}) _mockReadiness(dynamic mock) {
  if (mock['todayStatus'] == 'submitted') return (label: 'Attempted', tone: PillTone.soft, ready: false, detail: '');
  if (mock['todayStatus'] == 'in_progress') return (label: 'Continue', tone: PillTone.good, ready: true, detail: '');
  if (mock['todaySet'] == 'ready') return (label: 'Ready', tone: PillTone.good, ready: true, detail: '');
  final prep = asMap(mock['preparation']);
  if (mock['todaySet'] == 'failed') {
    return (
      label: 'Not ready',
      tone: PillTone.warn,
      ready: false,
      detail: str(prep['error']).isNotEmpty ? str(prep['error']) : 'Preparation failed. It will be retried.'
    );
  }
  if (mock['todaySet'] == 'generating') {
    return (
      label: 'Preparing',
      tone: PillTone.soft,
      ready: false,
      detail: intOf(prep['total']) > 0 ? 'Preparing your questions: ${prep['done']} of ${prep['total']}' : 'Preparing your questions'
    );
  }
  return (label: 'Not ready', tone: PillTone.soft, ready: false, detail: "Today's questions are not prepared yet.");
}

/// Reloads the mock list every 10 s while today's set is still being prepared.
mixin _MocksPolling<T extends StatefulWidget> on State<T>, SafeState<T> {
  List<dynamic>? mocks;
  String mocksError = '';
  Timer? _poll;

  bool waitingFor(List<dynamic> list);

  void loadMocks() {
    api('/mocks').then((list) {
      safe(() {
        mocks = asList(list);
        mocksError = '';
      });
      _poll?.cancel();
      if (mounted && waitingFor(mocks!)) _poll = Timer(const Duration(seconds: 10), loadMocks);
    }).catchError((err) => safe(() => mocksError = errorText(err)));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }
}

class MocksScreen extends StatefulWidget {
  const MocksScreen({super.key, required this.go, required this.back});
  final Go go;
  final VoidCallback back;

  @override
  State<MocksScreen> createState() => _MocksScreenState();
}

class _MocksScreenState extends State<MocksScreen> with SafeState, _MocksPolling {
  String tab = 'Available';

  @override
  bool waitingFor(List<dynamic> list) => list.any((mock) => mock['todaySet'] == 'generating');

  @override
  void initState() {
    super.initState();
    loadMocks();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final all = mocks ?? [];
    final list = all
        .where((mock) => tab == 'Attempted'
            ? mock['todayStatus'] == 'submitted' || mock['lastScore'] != null
            : mock['todayStatus'] != 'submitted')
        .toList();
    return AppScreen(children: [
      Header(title: 'Mock tests', subtitle: 'A fresh full mock of your exam every day', onBack: widget.back),
      Segment(options: const ['Available', 'Attempted'], value: tab, onChange: (v) => setState(() => tab = v)),
      if (mocksError.isNotEmpty) AppBanner(message: mocksError),
      if (mocks == null && mocksError.isEmpty) const Loading(),
      for (final mock in list)
        Builder(builder: (context) {
          final state = _mockReadiness(mock);
          return AppCard(
            onPress: () => mock['todayStatus'] == 'submitted'
                ? widget.go(AppRoute('mockResult', {'attemptId': mock['todayAttemptId']}))
                : widget.go(AppRoute('mockIntro', {'mockId': mock['id']})),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: tx(str(mock['title']), color: palette.ink, weight: w700)),
                gap(8),
                Pill(label: state.label, tone: state.tone),
              ]),
              tx('${mock['questionCount']} questions · ${mock['durationMinutes']} min', color: palette.muted),
              if (tab == 'Available' && state.detail.isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 4), child: tx(state.detail, color: palette.muted)),
              if (mock['lastScore'] is Map)
                tx('Last score ${mock['lastScore']['rawScore']}/${mock['lastScore']['maxScore']}', color: palette.muted),
            ]),
          );
        }),
      if (mocks != null && list.isEmpty)
        Empty(
          title: tab == 'Available' ? (all.isNotEmpty ? 'Done for today' : 'No mock yet') : 'No attempts yet',
          body: tab == 'Available'
              ? (all.isNotEmpty
                  ? "Today's mock is submitted. A new one is prepared at 2:00 AM."
                  : 'Choose your exam first. Its daily mock appears here.')
              : 'Finish a mock to see it here. The server keeps the score.',
        ),
    ]);
  }
}

class MockIntroScreen extends StatefulWidget {
  const MockIntroScreen({super.key, required this.mockId, required this.go, required this.back});
  final String mockId;
  final Go go;
  final VoidCallback back;

  @override
  State<MockIntroScreen> createState() => _MockIntroScreenState();
}

class _MockIntroScreenState extends State<MockIntroScreen> with SafeState, _MocksPolling {
  String note = '';

  @override
  bool waitingFor(List<dynamic> list) => _find(list)?['todaySet'] == 'generating';

  dynamic _find(List<dynamic> list) =>
      list.cast<dynamic>().firstWhere((item) => str(item['id']) == widget.mockId, orElse: () => null);

  @override
  void initState() {
    super.initState();
    loadMocks();
  }

  Future<void> prepare() async {
    // The start call begins preparing today's set when it does not exist yet.
    try {
      await api('/mocks/${widget.mockId}/start', method: 'POST', body: {'idempotencyKey': 'mobile-prepare-${widget.mockId}'});
      widget.go(AppRoute('mockRun', {'mockId': widget.mockId}));
    } catch (err) {
      safe(() => note = errorText(err, 'Could not prepare the mock'));
      loadMocks();
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final mock = mocks == null ? null : _find(mocks!);
    final state = mock != null ? _mockReadiness(mock) : null;
    return AppScreen(children: [
      Header(title: str(mock?['title']).isNotEmpty ? str(mock?['title']) : 'Mock test', onBack: widget.back),
      if (mocksError.isNotEmpty) AppBanner(message: mocksError),
      if (mocks == null && mocksError.isEmpty) const Loading(),
      if (mocks != null && mock == null) const Empty(title: 'Mock not found', body: 'Go back and open the mock list again.'),
      if (mock != null && state != null) ...[
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Pair([
            StatTile(label: 'Questions', value: str(mock['questionCount']), valueSize: 18, labelSize: 12),
            StatTile(label: 'Minutes', value: str(mock['durationMinutes']), valueSize: 18, labelSize: 12),
            StatTile(label: 'Marks/Q', value: str(mock['marksPerQuestion']), valueSize: 18, labelSize: 12),
            StatTile(label: 'Negative', value: str(mock['negativeMarks']), valueSize: 18, labelSize: 12),
          ]),
        ),
        AppCard(
          child: Column(children: [
            for (final (icon, line) in [
              (Icons.event_repeat, 'A fresh personal set every day at 2:00 AM. Questions do not repeat.'),
              (Icons.looks_one_outlined, 'One attempt per day.'),
              (Icons.timer_outlined, 'The server keeps the timer and calculates the score.'),
            ])
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(icon, size: 18, color: palette.green),
                  gap(10),
                  Expanded(child: tx(line, color: palette.muted, size: 13, lineHeight: 18)),
                ]),
              ),
          ]),
        ),
        // A failed set's own reason wins over the older "being prepared" note from the start call.
        if (!state.ready)
          AppBanner(
            tone: mock['todaySet'] == 'failed' ? BannerTone.error : BannerTone.info,
            message: mock['todaySet'] == 'failed' || note.isEmpty ? state.detail : note,
          ),
        if (state.ready)
          AppButton(
            label: mock['todayStatus'] == 'in_progress' ? 'Continue test' : 'Start test',
            onPress: () => widget.go(AppRoute('mockRun', {'mockId': widget.mockId})),
          )
        else if (mock['todaySet'] == 'generating')
          AppButton(label: 'Preparing questions', disabled: true, loading: true, onPress: () {})
        else
          AppButton(label: "Prepare today's mock", onPress: prepare),
      ],
    ]);
  }
}

class MockRunScreen extends StatefulWidget {
  const MockRunScreen({super.key, required this.mockId, required this.onDone});
  final String mockId;
  final Go onDone;

  @override
  State<MockRunScreen> createState() => _MockRunScreenState();
}

class _MockRunScreenState extends State<MockRunScreen> with SafeState {
  Map<String, dynamic>? attempt;
  int index = 0;
  Map<String, ({String selectedKey, bool markedForReview})> answers = {};
  DateTime now = DateTime.now();
  String error = '';
  String saved = '';
  bool _submitted = false;
  Timer? _clock;
  Timer? _autosave;

  @override
  void initState() {
    super.initState();
    api('/mocks/${widget.mockId}/start',
        method: 'POST', body: {'idempotencyKey': 'mobile-${widget.mockId}-${DateTime.now().millisecondsSinceEpoch}'}).then((value) {
      final next = asMap(value);
      if (next['redirect'] == 'result' || next['status'] == 'submitted') {
        widget.onDone(AppRoute('mockResult', {'attemptId': next['id']}));
        return;
      }
      final restored = <String, ({String selectedKey, bool markedForReview})>{};
      for (final answer in asList(next['answers'])) {
        restored[str(answer['questionId'])] = (selectedKey: str(answer['selectedKey']), markedForReview: answer['markedForReview'] == true);
      }
      safe(() {
        attempt = next;
        answers = restored;
      });
    }).catchError((err) => safe(() => error = errorText(err)));
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      safe(() => now = DateTime.now());
      if (attempt != null && _left == Duration.zero) submit();
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    _autosave?.cancel();
    super.dispose();
  }

  Duration get _left {
    final deadline = DateTime.tryParse(str(attempt?['deadlineAt']));
    if (deadline == null) return Duration.zero;
    final left = deadline.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  List<Map<String, dynamic>> _payload({bool onlyTouched = false}) => answers.entries
      .where((e) => !onlyTouched || e.value.selectedKey.isNotEmpty || e.value.markedForReview)
      .map((e) => {'questionId': e.key, 'selectedKey': e.value.selectedKey, 'markedForReview': e.value.markedForReview})
      .toList();

  void _setAnswer(String questionId, ({String selectedKey, bool markedForReview}) value) {
    setState(() => answers = {...answers, questionId: value});
    // Autosave 700 ms after the last change.
    _autosave?.cancel();
    final attemptId = str(attempt?['id']);
    if (attemptId.isEmpty) return;
    _autosave = Timer(const Duration(milliseconds: 700), () {
      api('/mocks/attempts/$attemptId', method: 'PUT', body: {'answers': _payload(onlyTouched: true)})
          .then((_) => safe(() => saved = 'Saved'))
          .catchError((err) => safe(() => error = errorText(err)));
    });
  }

  Future<void> submit() async {
    final attemptId = str(attempt?['id']);
    if (_submitted || attemptId.isEmpty) return;
    _submitted = true;
    _autosave?.cancel();
    try {
      await api('/mocks/attempts/$attemptId', method: 'PUT', body: {'answers': _payload()});
      await api('/mocks/attempts/$attemptId/submit', method: 'POST', body: {'idempotencyKey': 'submit-$attemptId'});
      widget.onDone(AppRoute('mockResult', {'attemptId': attemptId}));
    } catch (err) {
      _submitted = false;
      safe(() => error = errorText(err, 'Could not submit'));
    }
  }

  void _openPalette() {
    final questions = asList(attempt?['questions']);
    showSheet(context, title: 'Questions', builder: (sheetContext) {
      final palette = context.palette;
      return Wrap(spacing: 8, runSpacing: 8, children: [
        for (var i = 0; i < questions.length; i++)
          Builder(builder: (_) {
            final state = answers[str(questions[i]['id'])];
            final label = state?.markedForReview == true ? 'Review' : (state?.selectedKey.isNotEmpty == true ? 'Answered' : 'Blank');
            return Tap(
              label: 'Question ${i + 1} $label',
              onTap: () {
                setState(() => index = i);
                Navigator.of(sheetContext).pop();
              },
              child: Container(
                width: 64,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: palette.inset, borderRadius: BorderRadius.circular(10)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  tx('${i + 1}', color: palette.ink, weight: w700),
                  tx(label, color: palette.muted, size: 10, lines: 1),
                ]),
              ),
            );
          }),
      ]);
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final questions = asList(attempt?['questions']);
    final question = index < questions.length ? questions[index] : null;
    final left = _left;
    final clock = attempt == null
        ? '00:00'
        : '${left.inMinutes.toString().padLeft(2, '0')}:${(left.inSeconds % 60).toString().padLeft(2, '0')}';
    final current = question != null ? answers[str(question['id'])] ?? (selectedKey: '', markedForReview: false) : null;

    return AppScreen(
        footer: question == null
            ? null
            : Pair([
                AppButton(
                    label: 'Previous', tone: Tone.ghost, marginTop: 0, disabled: index == 0, onPress: () => setState(() => index -= 1)),
                index < questions.length - 1
                    ? AppButton(label: 'Next', marginTop: 0, onPress: () => setState(() => index += 1))
                    : AppButton(
                        label: 'Submit',
                        marginTop: 0,
                        // Not awaited: the button must not show a spinner while the dialog is just open.
                        onPress: () => unawaited(showConfirm(
                          context,
                          title: 'Submit this test?',
                          body: 'You can submit once today. Unanswered questions stay blank. The server calculates the score.',
                          confirm: 'Submit',
                          cancel: 'Keep working',
                          onConfirm: submit,
                        )),
                      ),
              ]),
        children: [
      Header(
        title: clock,
        subtitle: saved.isNotEmpty ? saved : 'Server timer',
        right: Tap(label: 'Question list', onTap: _openPalette, child: tx('List', color: palette.green, weight: w700)),
      ),
      if (error.isNotEmpty) AppBanner(message: error),
      if (question == null && error.isEmpty) const Loading(variant: LoadingVariant.quiz, label: 'Preparing mock · AI may generate questions…'),
      if (question != null && current != null) ...[
        tx('Question ${index + 1} of ${questions.length}', color: palette.muted, weight: w700),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: tx(str(question['stem']), color: palette.ink, size: 18, weight: w700, lineHeight: 26),
        ),
        for (final option in asList(question['options']))
          Choice(
            letter: str(option['key']),
            text: str(option['text']),
            state: current.selectedKey == str(option['key']) ? ChoiceState.selected : ChoiceState.idle,
            onPress: () => _setAnswer(str(question['id']), (selectedKey: str(option['key']), markedForReview: current.markedForReview)),
          ),
        AppButton(
          label: current.markedForReview ? 'Marked for review' : 'Mark for review',
          tone: Tone.ghost,
          onPress: () => _setAnswer(str(question['id']), (selectedKey: current.selectedKey, markedForReview: !current.markedForReview)),
        ),
      ],
    ]);
  }
}

class MockResultScreen extends StatefulWidget {
  const MockResultScreen({super.key, required this.attemptId, required this.back});
  final String attemptId;
  final VoidCallback back;

  @override
  State<MockResultScreen> createState() => _MockResultScreenState();
}

class _MockResultScreenState extends State<MockResultScreen> with SafeState {
  Map<String, dynamic>? result;
  String error = '';

  @override
  void initState() {
    super.initState();
    api('/mocks/attempts/${widget.attemptId}/result')
        .then((v) => safe(() => result = asMap(v)))
        .catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final r = result;
    final maxScore = numOf(r?['maxScore']);
    return AppScreen(children: [
      Header(title: str(r?['title']).isNotEmpty ? str(r?['title']) : 'Result', onBack: widget.back),
      if (error.isNotEmpty) AppBanner(message: error),
      if (r == null && error.isEmpty) const Loading(),
      if (r != null) ...[
        ScoreRing(
          value: maxScore > 0 ? (numOf(r['rawScore']) / maxScore * 100).round() : 0,
          caption: '${r['rawScore']} / ${r['maxScore']}',
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Pair([
            StatTile(label: 'Correct', value: str(r['correct'])),
            StatTile(label: 'Wrong', value: str(r['incorrect'])),
            StatTile(label: 'Blank', value: str(r['unanswered'])),
          ]),
        ),
        if (asList(r['weakAreas']).isNotEmpty)
          AppCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx('Weak areas to revise', color: palette.ink, weight: w800),
              gap(6),
              for (final area in asList(r['weakAreas']))
                tx('${area['topic']}: ${area['accuracy']}% across ${area['attempted']}', color: palette.muted),
            ]),
          ),
        Padding(padding: const EdgeInsets.only(bottom: 8), child: tx('Review answers', color: palette.ink, size: 18, weight: w800)),
        for (var i = 0; i < asList(r['questions']).length; i++)
          Builder(builder: (context) {
            final question = asList(r['questions'])[i];
            final correct = question['correct'] == true;
            final selected = str(question['selectedKey']);
            return AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx('${i + 1}. ${str(question['stem'])}', color: palette.ink, weight: w700),
                gap(6),
                tx(correct ? 'Correct' : 'Your answer ${selected.isEmpty ? 'blank' : selected} · answer ${str(question['correctKey'])}',
                    color: correct ? palette.good : palette.danger),
                gap(4),
                tx(str(question['explanation']), color: palette.muted),
              ]),
            );
          }),
      ],
    ]);
  }
}
