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
          padding: const EdgeInsets.only(bottom: 2),
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
            margin: const EdgeInsets.only(top: 2, bottom: 10),
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
            marginTop: 8,
            marginBottom: 4,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            borderColor: palette.dark
                ? const Color(0xFF6F8DAA)
                : const Color(0xFFF6F9FD),
            onPress: () => go(AppRoute('exams')),
            child: Row(
              children: [
                const BrandIcon(icon: Icons.school_rounded, size: 42),
                gap(12),
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
            padding: const EdgeInsets.only(top: 12, bottom: 8),
            child: tx(
              'Quick actions',
              color: palette.primary,
              size: 18,
              weight: w800,
            ),
          ),
          GridRows(
            columns: 3,
            spacing: 8,
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
            padding: const EdgeInsets.only(bottom: 8),
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
  const AnalyticsScreen({super.key, required this.back});
  final VoidCallback back;

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> with SafeState {
  Map<String, dynamic>? data;
  List<dynamic> history = [];
  List<dynamic> mocks = [];
  String error = '';

  @override
  void initState() {
    super.initState();
    Future.wait([api('/analytics'), api('/practice/history'), api('/mocks')])
        .then((results) {
          safe(() {
            data = asMap(results[0]);
            history = asList(results[1]);
            mocks = asList(results[2])
                .where((item) => item['lastScore'] != null)
                .toList();
          });
        })
        .catchError((err) => safe(() => error = errorText(err)));
  }

  static const _weekday = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final today = todayKey();
    final trend = List.generate(7, (index) {
      final date = shiftDay(today, index - 6);
      final sessions = history.where((item) {
        final stamp = str(
          item['completedAt'] ?? item['updatedAt'] ?? item['createdAt'],
        );
        return stamp.length >= 10 && stamp.substring(0, 10) == date;
      });
      final answered = sessions.fold<num>(
        0,
        (sum, item) => sum + numOf(item['total'] ?? item['answered']),
      );
      return (date, answered);
    });
    final trendMax = trend.fold<num>(1, (m, item) => item.$2 > m ? item.$2 : m);
    final subjects = asList(data?['subjects']);

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
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: tx('Subjects', color: palette.ink, size: 18, weight: w800),
          ),
          for (final subject in subjects)
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: tx(
                          str(subject['name']),
                          color: palette.ink,
                          weight: w700,
                        ),
                      ),
                      tx(
                        '${subject['accuracy']}%',
                        color: palette.green,
                        weight: w800,
                      ),
                    ],
                  ),
                  ProgressBar(value: numOf(subject['accuracy'])),
                  tx('${subject['attempted']} attempted', color: palette.muted),
                ],
              ),
            ),
          if (subjects.isNotEmpty)
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  tx('Strengths and focus', color: palette.ink, weight: w800),
                  gap(6),
                  tx(
                    'Stronger: ${_names(subjects.where((s) => numOf(s['accuracy']) >= 60), 'none yet')}',
                    color: palette.muted,
                  ),
                  gap(4),
                  tx(
                    'Focus next: ${_names(subjects.where((s) => numOf(s['accuracy']) < 60), 'none below 60%')}',
                    color: palette.muted,
                  ),
                ],
              ),
            ),
          if (subjects.isEmpty)
            const Empty(
              title: 'No subject split yet',
              body: 'Finish a practice set to see strengths and weak areas.',
            ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: tx(
              'Recent practice',
              color: palette.ink,
              size: 18,
              weight: w700,
            ),
          ),
          for (final session in history.take(6))
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  tx(
                    '${session['correct']}/${session['total']} correct',
                    color: palette.ink,
                    weight: w700,
                  ),
                  tx(str(session['status']), color: palette.muted),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: tx(
              'Mock scores',
              color: palette.ink,
              size: 18,
              weight: w700,
            ),
          ),
          for (final mock in mocks)
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  tx(str(mock['title']), color: palette.ink, weight: w700),
                  tx(
                    'Last score ${mock['lastScore']['rawScore']} / ${mock['lastScore']['maxScore']}',
                    color: palette.muted,
                  ),
                ],
              ),
            ),
          if (mocks.isEmpty)
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

  String _names(Iterable<dynamic> subjects, String fallback) {
    final names = subjects.map((s) => str(s['name'])).join(', ');
    return names.isEmpty ? fallback : names;
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
