import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/nav.dart';
import '../core/reminders.dart';
import '../widgets/ui.dart';
import 'current_affairs_screens.dart';

/// One planner task row with a tick circle.
class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.onTap});
  final dynamic task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final done = task['status'] == 'completed';
    return Tap(
      label: str(task['title']),
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: glassBox(palette, radius: 16),
        child: Row(
          children: [
            Icon(
              done ? Icons.check_circle : Icons.radio_button_unchecked,
              size: 22,
              color: done ? palette.green : (palette.dark ? const Color(0xFF5A7397) : const Color(0xFFB9C7DA)),
            ),
            gap(12),
            Expanded(
              child: tx(str(task['title']), color: palette.ink, weight: w600),
            ),
            tx('${task['minutes']}m', color: palette.muted),
          ],
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.user, required this.go});
  final Student user;
  final Go go;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SafeState {
  Map<String, dynamic>? data;
  List<dynamic> mocks = [];
  String error = '';
  Map<String, dynamic>? affairs;
  bool slow = false; // the free-tier server can take ~1 min to wake up
  int unread = 0; // cyan dot on the bell
  final ScrollController scroll =
      ScrollController(); // the header band scrolls with the page

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    safe(() {
      error = '';
      slow = false;
    });
    Future.delayed(const Duration(seconds: 8), () {
      if (data == null && error.isEmpty) safe(() => slow = true);
    });
    api('/notifications')
        .then(
          (value) => safe(
            () =>
                unread = asList(value)
                    .where((item) => asMap(item)['read'] != true)
                    .length,
          ),
        )
        .catchError((_) {});
    // Optional: the home screen still loads if current affairs fail.
    api('/current-affairs')
        .then((value) => safe(() => affairs = asMap(value)))
        .catchError((_) {});
    Future.wait([api('/dashboard'), api('/mocks')])
        .then((results) {
          safe(() {
            data = asMap(results[0]);
            mocks = asList(results[1]);
          });
        })
        .catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> toggle(dynamic task) async {
    final previous = str(task['status']);
    final status = previous == 'completed' ? 'pending' : 'completed';
    void setStatus(String value) => safe(() {
      data!['tasks'] = asList(data!['tasks'])
          .map(
            (item) => item['id'] == task['id']
                ? {...asMap(item), 'status': value}
                : item,
          )
          .toList();
    });
    setStatus(status); // tick immediately; roll back if the server refuses
    try {
      await api(
        '/planner/${task['id']}',
        method: 'PATCH',
        body: {'status': status},
      );
    } catch (_) {
      setStatus(previous);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final app = context.app;
    final go = widget.go;
    final tasks = asList(data?['tasks']);
    final planned = tasks.fold<num>(
      0,
      (sum, task) => sum + numOf(task['minutes']),
    );
    final done = tasks
        .where((task) => task['status'] == 'completed')
        .fold<num>(0, (sum, task) => sum + numOf(task['minutes']));
    final resume = mocks.cast<dynamic>().firstWhere(
      (mock) => mock['todayStatus'] == 'in_progress',
      orElse: () => null,
    );
    final name = str(data?['greetingName']).isNotEmpty
        ? str(data?['greetingName'])
        : widget.user.firstName;
    final hello = app.language == 'ta' ? 'வணக்கம்' : 'Hi';
    final openCount = tasks
        .where((task) => task['status'] != 'completed')
        .length;
    final accuracy = data?['accuracy'] ?? 0;
    final streak = data?['streak'] ?? (widget.user.streak);
    final ready = data != null;
    final examName = str(asMap(data?['exam'])['name']);

    final top = MediaQuery.of(context).padding.top;
    final screen = AppScreen(
      controller: scroll,
      topPadding: 0,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    tx(
                      '$hello $name! \u{1F44B}',
                      color: Colors.white,
                      size: 26,
                      weight: w800,
                      lines: 1,
                    ),
                    gap(2),
                    tx(
                      ready
                          ? (examName.isNotEmpty
                                ? examName
                                : 'Choose your exam')
                          : ' ',
                      color: const Color(0xFFDCEBFF),
                      size: 15,
                    ),
                  ],
                ),
              ),
              Tap(
                label: 'Notifications',
                onTap: () => go(AppRoute('alerts')),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0x4006152E),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0x4D7DB4FF)),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Icon(
                        Icons.notifications_none_rounded,
                        size: 21,
                        color: Colors.white,
                      ),
                      if (unread > 0)
                        Positioned(
                          top: 2,
                          right: 2,
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: const Color(0xFF19BFFF),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: const Color(0xFF0A2457),
                                width: 1.5,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              gap(10),
              Tap(
                label: 'Profile',
                onTap: () => go(AppRoute('profile')),
                child: Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF2389E8), Color(0xFF1559B0)],
                    ),
                    border: Border.all(color: const Color(0x4D7DB4FF)),
                  ),
                  child: tx(
                    name.isNotEmpty ? name[0].toUpperCase() : 'A',
                    color: Colors.white,
                    size: 18,
                    weight: w800,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (error.isNotEmpty) ...[
          AppBanner(message: error),
          AppButton(label: 'Try again', tone: Tone.outline, onPress: load),
        ],
        if (!ready && error.isEmpty && slow)
          const AppBanner(
            message: 'Server is waking up, this can take up to a minute…',
            tone: BannerTone.info,
          ),
        if (!ready && error.isEmpty)
          const Loading(variant: LoadingVariant.home),
        if (ready) ...[
          HeroCard(
            margin: const EdgeInsets.only(bottom: 22),
            child: Row(
              children: [
                RingGauge(
                  value: numOf(accuracy),
                  size: 92,
                  stroke: 8,
                  color: const Color(0xFF19BFFF),
                  gradient: const [Color(0xFF19BFFF), Color(0xFF1E6FE0)],
                  track: const Color(0x4006152E),
                  fill: const Color(0x1A06152E),
                  child: CountUp(
                    value: numOf(accuracy),
                    suffix: '%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: w800,
                      fontFamily: headingFont,
                    ),
                  ),
                ),
                gap(14),
                Container(width: 1, height: 76, color: const Color(0x337DB4FF)),
                gap(14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      tx(
                        'PRACTICE ACCURACY',
                        color: const Color(0xF2FFFFFF),
                        weight: w800,
                        size: 12,
                        letterSpacing: 0.4,
                      ),
                      gap(4),
                      Row(
                        children: [
                          const Icon(
                            Icons.local_fire_department_rounded,
                            size: 22,
                            color: Color(0xFFFBBF24),
                          ),
                          gap(4),
                          Flexible(
                            child: tx(
                              '$streak day study streak',
                              color: Colors.white,
                              size: 18,
                              weight: w800,
                            ),
                          ),
                        ],
                      ),
                      gap(4),
                      tx(
                        '$done/$planned min studied today',
                        color: const Color(0xFFDCEBFF),
                        size: 13,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          AppCard(
            marginBottom: 14,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            borderColor: palette.dark
                ? const Color(0xFF6F8DAA)
                : const Color(0xFFF6F9FD),
            onPress: () => go(AppRoute('exams')),
            child: Row(
              children: [
                const BrandIcon(icon: Icons.school_rounded, size: 44),
                gap(14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      tx(
                        examName.isNotEmpty ? examName : 'Choose an exam',
                        color: palette.ink,
                        weight: w800,
                        size: 15,
                        lines: 1,
                      ),
                      gap(2),
                      tx(
                        context.t('Your current exam'),
                        color: palette.muted,
                        size: 12.5,
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 13,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: palette.dark
                        ? const Color(0x4D1769C2)
                        : const Color(0xFFE2EDFC),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: tx(
                    context.t('Change'),
                    color: palette.green,
                    weight: w800,
                  ),
                ),
              ],
            ),
          ),
          if (asList(affairs?['items']).isNotEmpty)
            CurrentAffairsCard(
              day: str(affairs!['day']),
              count: asList(affairs!['items']).length,
              go: go,
            ),
          if (resume != null)
            AppCard(
              onPress: () => go(AppRoute('mockRun', {'mockId': resume['id']})),
              marginTop: 8,
              borderColor: palette.accent,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  tx('Continue mock', color: palette.green, weight: w800),
                  gap(4),
                  tx(str(resume['title']), color: palette.ink, weight: w700),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 14, bottom: 10),
            child: tx(
              'Quick actions',
              color: palette.primary,
              size: 18,
              weight: w800,
            ),
          ),
          GridRows(
            columns: 3,
            spacing: 10,
            runSpacing: 11,
            children: [
              IconTile(
                compact: true,
                icon: Icons.assignment,
                accent: Accent.blue,
                label: 'Practice',
                onPress: () => go(AppRoute('practice')),
              ),
              IconTile(
                compact: true,
                icon: Icons.timer,
                accent: Accent.orange,
                label: 'Mock Tests',
                onPress: () => go(AppRoute('mocks')),
              ),
              IconTile(
                compact: true,
                icon: Icons.auto_awesome,
                accent: Accent.purple,
                label: 'AI Tutor',
                onPress: () => go(AppRoute('tutor')),
              ),
              IconTile(
                compact: true,
                icon: Icons.menu_book,
                accent: Accent.green,
                label: 'Syllabus',
                onPress: () => go(AppRoute('exams')),
              ),
              IconTile(
                compact: true,
                icon: Icons.calendar_month,
                accent: Accent.blue,
                label: 'Study Plan',
                onPress: () => go(AppRoute('planner')),
              ),
              IconTile(
                compact: true,
                icon: Icons.bar_chart,
                accent: Accent.red,
                label: 'Analytics',
                onPress: () => go(AppRoute('analytics')),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                tx(
                  "${context.t("Today's plan")} ($openCount)",
                  color: palette.primary,
                  size: 18,
                  weight: w800,
                ),
                Tap(
                  label: 'Open planner',
                  onTap: () => go(AppRoute('planner')),
                  child: tx(
                    context.t('View all'),
                    color: palette.green,
                    weight: w800,
                  ),
                ),
              ],
            ),
          ),
          for (final task in tasks)
            _TaskRow(task: task, onTap: () => toggle(task)),
          if (tasks.isEmpty)
            const Empty(
              title: 'No plan yet',
              body: 'Add a task from the planner.',
            ),
        ],
      ],
    );
    // Navy band behind the greeting; it moves with the list so it scrolls away naturally.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Stack(
        children: [
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: AnimatedBuilder(
              animation: scroll,
              builder: (context, child) => Transform.translate(
                offset: Offset(
                  0,
                  scroll.hasClients
                      ? -scroll.offset.clamp(0, 2000).toDouble()
                      : 0,
                ),
                child: child,
              ),
              child: HeaderBand(height: top + 250),
            ),
          ),
          screen,
        ],
      ),
    );
  }
}

class PlannerScreen extends StatefulWidget {
  const PlannerScreen({super.key, required this.back});
  final VoidCallback back;

  @override
  State<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends State<PlannerScreen> with SafeState {
  String day = todayKey();
  List<dynamic> tasks = [];
  String title = '';
  String error = '';
  String reminder = '';
  List<(String, int)> week = [];
  String view = 'Today';

  @override
  void initState() {
    super.initState();
    final start = shiftDay(todayKey(), -3);
    Future.wait(
      List.generate(7, (index) {
        final date = shiftDay(start, index);
        return api('/planner?date=$date')
            .then((items) => (date, asList(items).length));
      }),
    ).then((items) => safe(() => week = items)).catchError((_) {});
    _loadDay();
  }

  void _loadDay() {
    final requested = day;
    api('/planner?date=$requested')
        .then((items) {
          if (requested == day) safe(() => tasks = asList(items));
        })
        .catchError((err) => safe(() => error = errorText(err)));
  }

  void _pick(String date, {bool toToday = false}) {
    setState(() {
      day = date;
      if (toToday) view = 'Today';
    });
    _loadDay();
  }

  Future<void> _toggle(dynamic task) async {
    final previous = str(task['status']);
    final status = previous == 'completed' ? 'pending' : 'completed';
    void setStatus(String value) => safe(() {
      tasks = tasks
          .map(
            (item) => item['id'] == task['id']
                ? {...asMap(item), 'status': value}
                : item,
          )
          .toList();
    });
    setStatus(status); // tick immediately; roll back if the server refuses
    try {
      await api(
        '/planner/${task['id']}',
        method: 'PATCH',
        body: {'status': status},
      );
    } catch (err) {
      setStatus(previous);
      safe(() => error = errorText(err, 'Could not update task'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final done = tasks.where((task) => task['status'] == 'completed').length;
    final max = week.fold<int>(1, (m, item) => item.$2 > m ? item.$2 : m);
    final monthPrefix = day.substring(0, 7);
    final year = int.parse(monthPrefix.substring(0, 4));
    final month = int.parse(monthPrefix.substring(5, 7));
    final daysInMonth = DateTime.utc(year, month + 1, 0).day;
    final monthDays = List.generate(
      daysInMonth,
      (i) => '$monthPrefix-${(i + 1).toString().padLeft(2, '0')}',
    );
    final today = todayKey();

    return AppScreen(
      children: [
        Header(title: 'Study planner', onBack: widget.back),
        Segment(
          options: const ['Today', 'Week', 'Month'],
          value: view,
          onChange: (v) => setState(() => view = v),
        ),
        if (error.isNotEmpty) AppBanner(message: error),
        if (reminder.isNotEmpty)
          AppBanner(tone: BannerTone.success, message: reminder),
        if (view == 'Week')
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx('This week', color: palette.ink, weight: w800),
                gap(12),
                SizedBox(
                  height: 110,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final item in week)
                        Expanded(
                          child: Tap(
                            label: item.$1,
                            onTap: () => _pick(item.$1, toToday: true),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Container(
                                  width: 16,
                                  height: (item.$2 / max * 84)
                                      .roundToDouble()
                                      .clamp(8, 84),
                                  decoration: BoxDecoration(
                                    color: item.$1 == day
                                        ? palette.green
                                        : palette.greenSoft,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                ),
                                gap(4),
                                tx(
                                  item.$1.substring(8),
                                  color: palette.muted,
                                  size: 11,
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                gap(8),
                tx(
                  'Bar height is the number of planned tasks that day.',
                  color: palette.muted,
                ),
              ],
            ),
          ),
        if (view == 'Month')
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(monthPrefix, color: palette.ink, weight: w800),
                gap(10),
                GridRows(
                  columns: 7,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final date in monthDays)
                      Tap(
                        label: date,
                        onTap: () => _pick(date, toToday: true),
                        child: AspectRatio(
                          aspectRatio: 1,
                          child: Container(
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: date == day
                                  ? palette.green
                                  : (date == today
                                        ? palette.greenSoft
                                        : palette.inset),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: tx(
                              '${int.parse(date.substring(8))}',
                              color: date == day
                                  ? palette.greenInk
                                  : palette.ink,
                              weight: w700,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: tx(
            '$day · $done of ${tasks.length} complete',
            color: palette.muted,
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            children: [
              for (var i = 0; i < week.length; i++) ...[
                if (i > 0) gap(6),
                Expanded(
                  child: Tap(
                    label: week[i].$1,
                    onTap: () => _pick(week[i].$1),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: week[i].$1 == day
                            ? palette.green
                            : palette.surface,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: tx(
                        week[i].$1.substring(8),
                        color: week[i].$1 == day
                            ? palette.greenInk
                            : palette.ink,
                        size: 11,
                        weight: w700,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        for (final task in tasks)
          _TaskRow(task: task, onTap: () => _toggle(task)),
        if (tasks.isEmpty)
          const Empty(
            title: 'Nothing on this day',
            body: 'Add a task below. Unfinished work moves to today when carry-forward is on.',
          ),
        Field(
          label: 'New task',
          value: title,
          onChanged: (v) => setState(() => title = v),
        ),
        AppButton(
          label: 'Add 30 min task',
          onPress: () async {
            if (title.trim().length < 2)
              return setState(
                () => error = 'Task title needs at least 2 characters.',
              );
            try {
              await api(
                '/planner',
                method: 'POST',
                body: {'title': title, 'dueDate': day, 'minutes': 30},
              );
              safe(() => title = '');
              _loadDay();
            } catch (err) {
              safe(() => error = errorText(err));
            }
          },
        ),
        AppButton(
          label: Reminders.supported
              ? 'Remind me in 1 hour'
              : 'Study reminders are on Android',
          tone: Tone.ghost,
          disabled: !Reminders.supported,
          onPress: () async {
            try {
              final open = tasks.cast<dynamic>().firstWhere(
                (task) => task['status'] != 'completed',
                orElse: () => null,
              );
              final ok = await Reminders.scheduleInOneHour(
                open != null
                    ? str(open['title'])
                    : 'Open your study plan and complete one task.',
              );
              if (!ok)
                return safe(
                  () => error = 'Notification permission was not granted.',
                );
              safe(
                () => reminder =
                    'Study reminder scheduled for one hour from now.',
              );
            } catch (err) {
              safe(
                () => error = errorText(err, 'Could not schedule the reminder'),
              );
            }
          },
        ),
      ],
    );
  }
}

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key, required this.back, required this.go});
  final VoidCallback back;
  final void Function(AppRoute) go;

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> with SafeState {
  Map<String, dynamic>? data;
  List<dynamic> history = [];
  String error = '';

  @override
  void initState() {
    super.initState();
    Future.wait([api('/analytics'), api('/practice/history')])
        .then((results) {
          safe(() {
            data = asMap(results[0]);
            history = asList(results[1]);
          });
        })
        .catchError((err) => safe(() => error = errorText(err)));
  }

  static const _weekday = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final today = todayKey();
    // Questions answered per India-time day (last 28 days), from the server.
    final byDay = asMap(asMap(data?['consistency'])['days']);
    final trend = List.generate(7, (index) {
      final date = shiftDay(today, index - 6);
      return (date, numOf(byDay[date]));
    });
    final trendMax = trend.fold<num>(1, (m, item) => item.$2 > m ? item.$2 : m);
    final subjects = asList(data?['subjects']);
    void practiceTopic(dynamic topic) => widget.go(
      AppRoute('quiz', {
        'examId': topic['examId'],
        'topicId': topic['id'],
        'title': topic['name'],
      }),
    );

    return AppScreen(
      children: [
        Header(
          title: 'Analytics',
          subtitle: str(data?['readiness']).isNotEmpty
              ? str(data?['readiness'])
              : 'Building',
          onBack: widget.back,
        ),
        if (error.isNotEmpty) AppBanner(message: error),
        if (data == null && error.isEmpty)
          const Loading(variant: LoadingVariant.home),
        if (data != null) ...[
          _SummaryCard(data: data!),
          _TodayFocusCard(subjects: subjects, onPractice: practiceTopic),
          ScoreRing(
            value: numOf(data!['accuracy']),
            caption: str(data!['readiness']).isNotEmpty
                ? str(data!['readiness'])
                : 'Accuracy',
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Pair([
              StatTile(
                label: 'Questions',
                value: str(data!['attempted']),
                valueSize: 18,
                labelSize: 12,
              ),
              StatTile(
                label: 'Streak',
                value: '${data!['streak']}d',
                valueSize: 18,
                labelSize: 12,
              ),
              StatTile(
                label: 'Syllabus',
                value: '${data!['syllabusCompletion']}%',
                valueSize: 18,
                labelSize: 12,
              ),
            ]),
          ),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx('Last 7 days practice', color: palette.ink, weight: w800),
                gap(12),
                SizedBox(
                  height: 96,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final item in trend)
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Container(
                                width: 14,
                                height: (item.$2 / trendMax * 64)
                                    .roundToDouble()
                                    .clamp(6, 64),
                                decoration: BoxDecoration(
                                  color: palette.green,
                                  borderRadius: BorderRadius.circular(7),
                                ),
                              ),
                              gap(4),
                              tx(
                                _weekday[DateTime.parse(item.$1).weekday - 1],
                                color: palette.muted,
                                size: 10,
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                gap(6),
                tx(
                  'Questions answered each day',
                  color: palette.muted,
                  size: 12,
                ),
              ],
            ),
          ),
          _StudyDaysCard(days: byDay.keys.toSet()),
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: tx('Subjects', color: palette.ink, size: 18, weight: w800),
          ),
          if (subjects.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: tx(
                'Tap a subject to see its topics and practise the ones that need you.',
                color: palette.muted,
                size: 13,
              ),
            ),
          for (var i = 0; i < subjects.length; i++)
            _SubjectCard(
              subject: subjects[i],
              index: i,
              onPractice: practiceTopic,
            ),
          if (subjects.isEmpty)
            const Empty(
              title: 'No subject split yet',
              body: 'Finish a practice set to see strengths and weak areas.',
            ),
          _MasteredCard(data: data!),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: tx(
              'Recent practice',
              color: palette.ink,
              size: 18,
              weight: w700,
            ),
          ),
          // Sets left with nothing answered say nothing; leave them out.
          for (final session in history
              .where((s) => numOf(s['answered']) > 0 || str(s['status']) == 'active')
              .take(6))
            _RecentPracticeCard(session: session),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: tx(
              'Mock tests',
              color: palette.ink,
              size: 18,
              weight: w700,
            ),
          ),
          if (asList(data!['mockTrend']).isNotEmpty)
            _MockTrendCard(trend: asList(data!['mockTrend']))
          else
            const Empty(
              title: 'No mock score yet',
              body: 'Submit a mock test to see it here. Scoring stays on the server.',
            ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: tx(str(data!['caveat']), color: palette.muted),
          ),
        ],
      ],
    );
  }

}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Section card title with a small coloured icon.
Widget _cardTitle(BuildContext context, IconData icon, Accent accent, String title, [String? subtitle]) {
  final palette = context.palette;
  return Row(
    children: [
      ColorIcon(icon: icon, accent: accent, size: 36),
      gap(10),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            tx(title, color: palette.ink, weight: w800),
            if (subtitle != null) tx(subtitle, color: palette.muted, size: 12),
          ],
        ),
      ),
    ],
  );
}

/// The 1–2 weakest topics to practise today, each one tap away.
class _TodayFocusCard extends StatelessWidget {
  const _TodayFocusCard({required this.subjects, required this.onPractice});
  final List<dynamic> subjects;
  final void Function(dynamic topic) onPractice;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final picks = [
      for (final subject in subjects)
        for (final topic in asList(subject['topics']))
          if (['focus', 'improving'].contains(str(topic['band']))) {...asMap(topic), 'subjectName': subject['name']},
    ]..sort((a, b) => numOf(a['accuracy']).compareTo(numOf(b['accuracy'])));
    if (picks.isEmpty) return const SizedBox.shrink();
    return AppCard(
      padding: const EdgeInsets.all(16),
      marginBottom: 14,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(context, Icons.flag_outlined, Accent.orange, "Today's focus", '5 questions each · about 10 minutes'),
          for (final topic in picks.take(2))
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        tx(str(topic['name']), color: palette.ink, size: 13.5, weight: w600, lines: 2),
                        tx(
                          '${topic['accuracy']}% correct · ${topic['subjectName']}',
                          color: palette.muted,
                          size: 11.5,
                          lines: 1,
                        ),
                      ],
                    ),
                  ),
                  gap(8),
                  _PracticeChip(onTap: () => onPractice(topic)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PracticeChip extends StatelessWidget {
  const _PracticeChip({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = context.palette.dark;
    return Tap(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: dark ? const Color(0x331769C2) : const Color(0xFFEAF2FD),
          borderRadius: BorderRadius.circular(99),
        ),
        child: tx(
          'Practice',
          color: dark ? const Color(0xFF8CC4FF) : const Color(0xFF1769C2),
          size: 12,
          weight: w700,
        ),
      ),
    );
  }
}

/// Last 28 days as a 4×7 grid of dots: filled on days with a finished practice set.
class _StudyDaysCard extends StatelessWidget {
  const _StudyDaysCard({required this.days});
  final Set<String> days;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final today = todayKey();
    final dates = List.generate(28, (i) => shiftDay(today, i - 27));
    final count = dates.where(days.contains).length;
    final message = count == 0
        ? 'Every day you practise lights up a dot.'
        : count >= 20
            ? 'Excellent habit! Keep it up.'
            : count >= 10
                ? 'Good habit. A few more days makes it stronger.'
                : 'A good start. Try a little practice every day.';
    const fill = Color(0xFF19BFFF);
    return AppCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(context, Icons.calendar_month_outlined, Accent.green, 'Study days', '$count of the last 28 days'),
          gap(14),
          for (var row = 0; row < 4; row++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var col = 0; col < 7; col++)
                    Builder(builder: (context) {
                      final date = dates[row * 7 + col];
                      final on = days.contains(date);
                      final isToday = date == today;
                      return Container(
                        width: 30,
                        height: 30,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: on
                              ? const LinearGradient(colors: [fill, Color(0xFF1769C2)])
                              : null,
                          color: on ? null : (palette.dark ? palette.inset : palette.line),
                          border: isToday ? Border.all(color: fill, width: 2) : null,
                        ),
                        child: tx(
                          '${int.parse(date.substring(8))}',
                          color: on ? Colors.white : palette.muted,
                          size: 10.5,
                          weight: on ? w700 : null,
                        ),
                      );
                    }),
                ],
              ),
            ),
          tx(message, color: palette.muted, size: 12.5),
        ],
      ),
    );
  }
}

/// Topics mastered (Easy, Medium and Hard passed) out of the exam's topics.
class _MasteredCard extends StatelessWidget {
  const _MasteredCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final total = numOf(data['topicCount']);
    if (total == 0) return const SizedBox.shrink();
    final mastered = numOf(data['masteredTopics']);
    final studied = numOf(data['studiedTopics']);
    return AppCard(
      padding: const EdgeInsets.all(16),
      marginTop: 4,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: _cardTitle(context, Icons.workspace_premium_outlined, Accent.purple, 'Topics mastered'),
              ),
              tx('$mastered', color: palette.ink, size: 20, weight: w800),
              tx(' / $total', color: palette.muted, size: 14, weight: w600),
            ],
          ),
          ProgressBar(value: mastered / total * 100),
          gap(8),
          tx(
            studied == 0
                ? "Pass a topic's Easy level to start. A topic is mastered once you pass Easy, Medium and Hard."
                : 'Easy passed in $studied topics. A topic is mastered once you pass Easy, Medium and Hard.',
            color: palette.muted,
            size: 12,
            lineHeight: 17,
          ),
        ],
      ),
    );
  }
}

/// Mock score % over the latest mocks as a line, with last / best and the change.
class _MockTrendCard extends StatelessWidget {
  const _MockTrendCard({required this.trend});
  final List<dynamic> trend;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final points = trend.length > 10 ? trend.sublist(trend.length - 10) : trend;
    final values = points.map((item) => numOf(item['percent']).toDouble().clamp(0, 100).toDouble()).toList();
    final last = values.last.round();
    final best = values.reduce((a, b) => a > b ? a : b).round();
    final change = values.length > 1 ? (values.last - values[values.length - 2]).round() : 0;
    final note = values.length < 2
        ? 'Take a few more mocks to see your trend.'
        : change > 0
            ? 'Up $change% from the mock before. Well done!'
            : change < 0
                ? 'A little lower than last time. One mock does not decide anything; keep going.'
                : 'Same as the mock before. Steady!';
    return AppCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(context, Icons.show_chart, Accent.blue, 'Mock score trend', 'Last ${values.length} mocks'),
          gap(14),
          SizedBox(
            height: 110,
            width: double.infinity,
            child: CustomPaint(painter: _TrendPainter(values, palette.dark ? palette.inset : palette.line, palette.muted)),
          ),
          gap(10),
          Row(
            children: [
              tx('Last ', color: palette.muted, size: 12.5),
              tx('$last%', color: palette.ink, size: 13, weight: w800),
              tx('   ·   Best ', color: palette.muted, size: 12.5),
              tx('$best%', color: palette.ink, size: 13, weight: w800),
            ],
          ),
          gap(4),
          tx(note, color: palette.muted, size: 12.5, lineHeight: 18),
        ],
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.values, this.grid, this.labelColor);
  final List<double> values;
  final Color grid;
  final Color labelColor;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 6.0;
    // Left gutter for the % labels, so they never sit under a point.
    const left = 34.0;
    final h = size.height - pad * 2;
    double y(double v) => pad + h - v / 100 * h;
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (final v in [0.0, 50.0, 100.0]) {
      canvas.drawLine(Offset(left, y(v)), Offset(size.width, y(v)), gridPaint);
      // Small % label in the left gutter, centred on its grid line.
      final label = TextPainter(
        text: TextSpan(
          text: '${v.round()}%',
          style: TextStyle(color: labelColor, fontSize: 9.5, fontFamily: headingFont),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(canvas, Offset(left - 6 - label.width, y(v) - label.height / 2));
    }
    final step = values.length > 1 ? (size.width - left - pad * 2) / (values.length - 1) : 0.0;
    final points = [
      for (var i = 0; i < values.length; i++)
        Offset(values.length > 1 ? left + pad + i * step : (left + size.width) / 2, y(values[i])),
    ];
    if (points.length > 1) {
      final line = Path()..moveTo(points.first.dx, points.first.dy);
      for (final point in points.skip(1)) {
        line.lineTo(point.dx, point.dy);
      }
      final area = Path.from(line)
        ..lineTo(points.last.dx, y(0))
        ..lineTo(points.first.dx, y(0))
        ..close();
      canvas.drawPath(
        area,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x5519BFFF), Color(0x0019BFFF)],
          ).createShader(Offset.zero & size),
      );
      canvas.drawPath(
        line,
        Paint()
          ..color = const Color(0xFF19BFFF)
          ..strokeWidth = 2.5
          ..style = PaintingStyle.stroke
          ..strokeJoin = StrokeJoin.round,
      );
    }
    for (final point in points) {
      canvas.drawCircle(point, 4, Paint()..color = Colors.white);
      canvas.drawCircle(point, 2.6, Paint()..color = const Color(0xFF1769C2));
    }
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) => old.values != values || old.grid != grid;
}

/// "Today", "Yesterday" or "26 Nov", in India time.
String _dayLabel(String stamp) {
  final parsed = DateTime.tryParse(stamp);
  if (parsed == null) return '';
  final ist = parsed.toUtc().add(const Duration(hours: 5, minutes: 30));
  final key = '${ist.year}-${ist.month.toString().padLeft(2, '0')}-${ist.day.toString().padLeft(2, '0')}';
  final today = todayKey();
  if (key == today) return 'Today';
  if (key == shiftDay(today, -1)) return 'Yesterday';
  return '${ist.day} ${_months[ist.month - 1]}';
}

/// One practice set: what it was (subject · topic), when, level and score.
class _RecentPracticeCard extends StatelessWidget {
  const _RecentPracticeCard({required this.session});
  final dynamic session;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final subject = str(session['subjectName']);
    final topic = str(session['topicName']);
    final kind = str(session['kind']);
    final status = str(session['status']);
    final title = topic.isNotEmpty
        ? topic
        : kind == 'retry'
            ? 'Retry of mistakes'
            : 'Quick practice';
    final (icon, accent) = subject.isNotEmpty
        ? subjectVisual(subject)
        : (Icons.bolt, Accent.blue);
    final level = str(session['difficulty']);
    final when = _dayLabel(str(session['completedAt'] ?? session['startedAt']));
    // Date first so a long subject name never cuts it off.
    final details = [
      if (when.isNotEmpty) when,
      if (level.isNotEmpty) '${level[0].toUpperCase()}${level.substring(1)}',
      if (subject.isNotEmpty) subject,
    ].join(' · ');
    final correct = numOf(session['correct']);
    final answered = numOf(session['answered']);
    final total = numOf(session['total']);
    final done = status == 'completed';
    final band = !done || answered == 0
        ? 'more_practice'
        : correct / answered >= 0.75
            ? 'strong'
            : correct / answered >= 0.5
                ? 'improving'
                : 'focus';
    final (_, base, _) = _bandStyle(band);
    final scoreColor = palette.dark ? Color.lerp(base, Colors.white, 0.35)! : base;
    return AppCard(
      child: Row(
        children: [
          ColorIcon(icon: icon, accent: accent, size: 40),
          gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(title, color: palette.ink, weight: w700, lines: 2),
                if (details.isNotEmpty) tx(details, color: palette.muted, size: 12, lines: 1),
              ],
            ),
          ),
          gap(8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              tx(
                done ? '$correct/$total' : '$answered/$total',
                color: done ? scoreColor : palette.ink,
                size: 16,
                weight: w800,
              ),
              tx(
                done ? 'correct' : status == 'active' ? 'in progress' : 'not finished',
                color: palette.muted,
                size: 11,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Strong / Improving / Focus here / Need more practice: colour, label and icon.
/// Calm colours on purpose (no red): the screen should guide, not scare.
(String, Color, IconData) _bandStyle(String band) => switch (band) {
  'strong' => ('Strong', const Color(0xFF16A34A), Icons.check_circle),
  'improving' => ('Improving', const Color(0xFFD97706), Icons.trending_up),
  'focus' => ('Focus here', const Color(0xFF1769C2), Icons.center_focus_strong),
  _ => ('Need more practice', const Color(0xFF64748B), Icons.more_horiz),
};

class _BandPill extends StatelessWidget {
  const _BandPill({required this.band});
  final String band;

  @override
  Widget build(BuildContext context) {
    final (label, base, icon) = _bandStyle(band);
    final dark = context.palette.dark;
    // Lighter text on dark cards so the label stays readable.
    final color = dark ? Color.lerp(base, Colors.white, 0.35)! : base;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: base.withAlpha(dark ? 0x33 : 0x1F),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          tx(label, color: color, size: 11.5, weight: w700),
        ],
      ),
    );
  }
}

/// One plain-language line on how the student is doing, then where to go next.
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final subjects = asList(data['subjects']);
    final weekly = asMap(data['weekly']);
    final now = asMap(weekly['thisWeek']);
    final before = asMap(weekly['lastWeek']);
    final nowCount = numOf(now['attempted']);
    final beforeCount = numOf(before['attempted']);
    final diff = numOf(now['accuracy']) - numOf(before['accuracy']);

    String headline;
    if (numOf(data['attempted']) == 0) {
      headline = 'Welcome! Finish your first practice set and your progress will show up here.';
    } else if (nowCount >= 5 && beforeCount >= 5 && diff > 0) {
      headline = 'Great work! Your correct answers went up by $diff% this week.';
    } else if (nowCount >= 5 && beforeCount >= 5 && diff < 0) {
      headline = 'A tougher week, and that is normal. A little practice will bring it back up.';
    } else if (nowCount > 0) {
      headline = 'You answered $nowCount questions this week. Keep the habit going!';
    } else {
      headline = 'No practice this week yet. A quick set of 5 questions is a good start.';
    }

    String names(String band) => subjects
        .where((s) => str(s['band']) == band)
        .map((s) => str(s['name']))
        .take(2)
        .join(' and ');
    final strong = names('strong');
    final focus = names('focus').isNotEmpty ? names('focus') : names('improving');
    final next = [
      if (strong.isNotEmpty) 'You are strong in $strong.',
      if (focus.isNotEmpty) 'Spend a little time on $focus next.',
    ].join(' ');

    return AppCard(
      padding: const EdgeInsets.all(16),
      marginBottom: 14,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ColorIcon(icon: Icons.emoji_objects_outlined, accent: Accent.blue, size: 42),
          gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(headline, color: palette.ink, size: 15, weight: w700, lineHeight: 21),
                if (next.isNotEmpty) ...[
                  gap(6),
                  tx(next, color: palette.muted, size: 13.5, lineHeight: 19),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Subject accuracy with its band; tap to open the topic list (weakest first).
class _SubjectCard extends StatefulWidget {
  const _SubjectCard({required this.subject, required this.index, required this.onPractice});
  final dynamic subject;
  final int index;
  final void Function(dynamic topic) onPractice;

  @override
  State<_SubjectCard> createState() => _SubjectCardState();
}

class _SubjectCardState extends State<_SubjectCard> {
  bool open = false;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final subject = widget.subject;
    final topics = asList(subject['topics']);
    final (icon, accent) = subjectVisual(str(subject['name']), widget.index);
    final enough = str(subject['band']) != 'more_practice';
    return AppCard(
      onPress: topics.isEmpty ? null : () => setState(() => open = !open),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ColorIcon(icon: icon, accent: accent, size: 40),
              gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    tx(str(subject['name']), color: palette.ink, weight: w700, lines: 2),
                    gap(4),
                    _BandPill(band: str(subject['band'])),
                  ],
                ),
              ),
              gap(8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  tx(
                    enough ? '${subject['accuracy']}%' : '${subject['attempted']} Qs',
                    color: palette.ink,
                    size: 17,
                    weight: w800,
                  ),
                  tx(enough ? 'correct' : 'answered', color: palette.muted, size: 11),
                ],
              ),
              if (topics.isNotEmpty)
                Icon(open ? Icons.expand_less : Icons.expand_more, color: palette.muted),
            ],
          ),
          if (enough) ProgressBar(value: numOf(subject['accuracy'])),
          gap(6),
          tx(
            enough
                ? '${subject['attempted']} questions answered'
                : 'Answer at least 10 questions to see how strong you are here.',
            color: palette.muted,
            size: 12,
          ),
          if (open) ...[
            gap(10),
            Divider(height: 1, color: palette.line),
            for (final topic in topics) _TopicRow(topic: topic, onPractice: () => widget.onPractice(topic)),
          ],
        ],
      ),
    );
  }
}

class _TopicRow extends StatelessWidget {
  const _TopicRow({required this.topic, required this.onPractice});
  final dynamic topic;
  final VoidCallback onPractice;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final band = str(topic['band']);
    final (_, color, _) = _bandStyle(band);
    final enough = band != 'more_practice';
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(str(topic['name']), color: palette.ink, size: 13.5, weight: w600, lines: 2),
                tx(
                  enough
                      ? '${topic['accuracy']}% correct · ${_bandStyle(band).$1}'
                      : '${topic['attempted']} answered · practise a few more',
                  color: palette.muted,
                  size: 11.5,
                ),
              ],
            ),
          ),
          if (band != 'strong')
            Tap(
              onTap: onPractice,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: palette.dark ? const Color(0x331769C2) : const Color(0xFFEAF2FD),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: tx(
                  'Practice',
                  color: palette.dark ? const Color(0xFF8CC4FF) : const Color(0xFF1769C2),
                  size: 12,
                  weight: w700,
                ),
              ),
            )
          else
            Icon(Icons.check_circle, size: 18, color: color),
        ],
      ),
    );
  }
}

/// Small stat tile shared with the mock result screen.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.valueSize = 20,
    this.labelSize = 14,
  });
  final String label;
  final String value;
  final double valueSize;
  final double labelSize;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: glassBox(palette, radius: 14, shadow: false),
      child: Column(
        children: [
          tx(value, color: palette.ink, size: valueSize, weight: w800),
          tx(label, color: palette.muted, size: labelSize),
        ],
      ),
    );
  }
}

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key, required this.back});
  final VoidCallback back;

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> with SafeState {
  List<dynamic>? items;
  String error = '';

  @override
  void initState() {
    super.initState();
    api('/notifications')
        .then((value) => safe(() => items = asList(value)))
        .catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppScreen(
      children: [
        Header(title: context.t('Notifications'), onBack: widget.back),
        if (error.isNotEmpty) AppBanner(message: error),
        if (items == null && error.isEmpty) const Loading(),
        for (final item in items ?? const [])
          AppCard(
            onPress: () async {
              try {
                await api('/notifications/${item['id']}/read', method: 'POST');
                safe(
                  () => items = items!
                      .map(
                        (row) => row['id'] == item['id']
                            ? {...asMap(row), 'read': true}
                            : row,
                      )
                      .toList(),
                );
              } catch (err) {
                safe(() => error = errorText(err));
              }
            },
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(str(item['title']), color: palette.ink, weight: w700),
                tx(str(item['body']), color: palette.muted),
                gap(6),
                tx(
                  item['read'] == true ? 'Read' : 'New',
                  color: item['read'] == true ? palette.muted : palette.green,
                  weight: w700,
                ),
              ],
            ),
          ),
        if (items != null && items!.isEmpty)
          const Empty(
            title: 'No notifications',
            body: 'Exam and support updates will appear here.',
          ),
      ],
    );
  }
}
