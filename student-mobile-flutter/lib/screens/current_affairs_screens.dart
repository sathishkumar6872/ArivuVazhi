import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/nav.dart';
import '../widgets/ui.dart';

const _categories = {
  'tamilnadu': ('Tamil Nadu', Icons.location_city, Accent.green),
  'national': ('National', Icons.flag, Accent.orange),
  'international': ('World', Icons.public, Accent.blue),
  'economy': ('Economy', Icons.payments, Accent.green),
  'science': ('Science & Tech', Icons.science, Accent.purple),
  'environment': ('Environment', Icons.eco, Accent.teal),
  'sports': ('Sports', Icons.emoji_events, Accent.orange),
  'awards': ('Awards', Icons.workspace_premium, Accent.orange),
  'appointments': ('Appointments', Icons.badge, Accent.purple),
};

(String, IconData, Accent) _category(String key) =>
    _categories[key] ?? ('News', Icons.article, Accent.green);

/// "12 Nov" from "2026-11-12".
String prettyDay(String day) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final parts = day.split('-');
  if (parts.length != 3) return day;
  final month = int.tryParse(parts[1]) ?? 1;
  return '${int.tryParse(parts[2]) ?? parts[2]} ${months[(month - 1).clamp(0, 11)]}';
}

/// Home card: today's verified current affairs, opens the full list.
class CurrentAffairsCard extends StatelessWidget {
  const CurrentAffairsCard({
    super.key,
    required this.day,
    required this.count,
    required this.go,
  });
  final String day;
  final int count;
  final Go go;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      borderColor: palette.dark
          ? const Color(0xFF6F8DAA)
          : const Color(0xFFF6F9FD),
      onPress: () => go(AppRoute('currentAffairs')),
      child: Row(
        children: [
          const BrandIcon(icon: Icons.event_note_rounded, size: 44),
          gap(14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(
                  'Current affairs',
                  color: palette.ink,
                  size: 15,
                  weight: w800,
                ),
                gap(2),
                tx(
                  '$count verified updates · ${prettyDay(day)}',
                  color: palette.muted,
                  size: 12.5,
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right, size: 24, color: palette.ink),
        ],
      ),
    );
  }
}

class CurrentAffairsScreen extends StatefulWidget {
  const CurrentAffairsScreen({super.key, required this.back, required this.go});
  final VoidCallback back;
  final Go go;

  @override
  State<CurrentAffairsScreen> createState() => _CurrentAffairsScreenState();
}

class _CurrentAffairsScreenState extends State<CurrentAffairsScreen>
    with SafeState {
  /// 'latest', '7', '30', '90' (days back) or 'custom' (picked dates).
  String preset = 'latest';
  String from = '';
  String to = '';
  String category = '';
  List<dynamic>? items;
  String error = '';
  final Set<String> reported = {};
  int _request = 0;

  static const _presets = [
    ('latest', 'Latest'),
    ('7', '7 days'),
    ('30', '30 days'),
    ('90', '3 months'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final request = ++_request;
    setState(() {
      items = null;
      error = '';
    });
    final params = <String, String>{
      if (from.isNotEmpty) 'from': from,
      if (to.isNotEmpty) 'to': to,
      if (category.isNotEmpty) 'category': category,
    };
    final query = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    api('/current-affairs$query')
        .then((value) {
          if (request != _request) return; // a newer filter is already loading
          final data = asMap(value);
          safe(() {
            items = asList(data['items']);
            if (preset == 'latest') {
              from = str(data['from']);
              to = str(data['to']);
            }
          });
        })
        .catchError((err) {
          if (request == _request) safe(() => error = errorText(err));
        });
  }

  void _pickPreset(String value) {
    setState(() {
      preset = value;
      if (value == 'latest') {
        from = '';
        to = '';
      } else {
        to = todayKey();
        from = shiftDay(to, -(int.parse(value) - 1));
      }
    });
    _load();
  }

  Future<void> _pickDates() async {
    DateTime parse(String day) => DateTime.parse(day);
    final today = parse(todayKey());
    final picked = await showDateRangePicker(
      context: context,
      firstDate: today.subtract(const Duration(days: 730)),
      lastDate: today,
      initialDateRange: from.isNotEmpty && to.isNotEmpty
          ? DateTimeRange(start: parse(from), end: parse(to))
          : null,
      helpText: 'Select a date or a date range',
      saveText: 'Show',
    );
    if (picked == null || !mounted) return;
    String key(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    setState(() {
      preset = 'custom';
      from = key(picked.start);
      to = key(picked.end);
    });
    _load();
  }

  /// A report must say what is wrong, so the admin can check it.
  Future<void> _report(String id) => showSheet(
    context,
    title: 'What is wrong?',
    builder: (sheetContext) => _ReportSheet(
      onSend: (reason, note) async {
        await api(
          '/current-affairs/$id/report',
          method: 'POST',
          body: {'reason': reason, 'note': note},
        );
        safe(() => reported.add(id));
        if (sheetContext.mounted) Navigator.of(sheetContext).pop();
      },
    ),
  );

  String get _rangeLabel {
    if (from.isEmpty) return '';
    if (from == to) return 'News of ${prettyDay(from)}';
    return '${prettyDay(from)} – ${prettyDay(to)}';
  }

  Widget _chip(
    Palette palette,
    String label,
    bool active,
    VoidCallback onTap, {
    IconData? icon,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Tap(
        label: label,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: active
              ? BoxDecoration(
                  color: palette.green,
                  borderRadius: BorderRadius.circular(99),
                )
              : glassBox(palette, radius: 99, shadow: false),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 15,
                  color: active ? palette.greenInk : palette.ink,
                ),
                gap(6),
              ],
              tx(
                label,
                color: active ? palette.greenInk : palette.ink,
                size: 13,
                weight: w700,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final list = items ?? const [];
    final quiz = list
        .where(
          (item) => item['quiz'] is Map && str(item['quiz']['stem']).isNotEmpty,
        )
        .take(20)
        .toList();
    final multiDay = from.isNotEmpty && from != to;
    final rows = <Widget>[];
    String lastDay = '';
    for (final item in list) {
      final day = str(item['newsDay']);
      if (multiDay && day != lastDay) {
        rows.add(
          Padding(
            padding: EdgeInsets.only(top: rows.isEmpty ? 0 : 8, bottom: 8),
            child: tx(
              prettyDay(day),
              color: palette.muted,
              size: 13,
              weight: w800,
              letterSpacing: 0.4,
            ),
          ),
        );
        lastDay = day;
      }
      rows.add(_item(context, palette, item));
    }
    return AppScreen(
      footer: quiz.isEmpty
          ? null
          : AppButton(
              label: 'Quick ${quiz.length} questions',
              icon: Icons.bolt,
              marginTop: 0,
              onPress: () => widget.go(
                AppRoute('currentAffairsQuiz', {'items': quiz, 'day': from}),
              ),
            ),
      children: [
        Header(
          title: 'Current affairs',
          subtitle: _rangeLabel.isEmpty
              ? null
              : '$_rangeLabel · ${list.length} verified',
          onBack: widget.back,
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final (value, label) in _presets)
                _chip(
                  palette,
                  label,
                  preset == value,
                  () => _pickPreset(value),
                ),
              _chip(
                palette,
                preset == 'custom' ? _rangeLabel : 'Pick dates',
                preset == 'custom',
                _pickDates,
                icon: Icons.calendar_month,
              ),
            ],
          ),
        ),
        gap(10),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _chip(palette, 'All', category.isEmpty, () {
                setState(() => category = '');
                _load();
              }),
              for (final entry in _categories.entries)
                _chip(palette, entry.value.$1, category == entry.key, () {
                  setState(() => category = entry.key);
                  _load();
                }),
            ],
          ),
        ),
        gap(14),
        if (error.isNotEmpty) AppBanner(message: error),
        if (items == null && error.isEmpty) const Loading(),
        ...rows,
        if (items != null && list.isEmpty)
          Empty(
            title: 'Nothing here',
            body: from.isEmpty
                ? "Yesterday's verified current affairs appear here every morning."
                : 'No verified updates for these dates${category.isEmpty ? '' : ' in this category'}. Try a wider range.',
          ),
        if (list.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: tx(
              'Each update is checked against 2+ news sources and two independent AI fact checks before it is shown.',
              color: palette.muted,
              size: 12,
              align: TextAlign.center,
            ),
          ),
      ],
    );
  }

  Widget _item(BuildContext context, Palette palette, dynamic item) {
    final (label, icon, accent) = _category(str(item['category']));
    final id = str(item['id']);
    final sources = asList(item['sources']);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: accents[accent]),
              gap(6),
              tx(
                label.toUpperCase(),
                color: accents[accent],
                size: 11,
                weight: w800,
                letterSpacing: 0.6,
              ),
            ],
          ),
          gap(8),
          tx(
            str(item['title']),
            color: palette.ink,
            size: 16,
            weight: w800,
            lineHeight: 22,
          ),
          gap(8),
          for (final point in asList(item['points']))
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: palette.green,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                  gap(10),
                  Expanded(
                    child: tx(str(point), color: palette.ink, lineHeight: 21),
                  ),
                ],
              ),
            ),
          gap(4),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final source in sources.take(3))
                Tap(
                  label: 'Open source',
                  onTap: () => launchUrl(
                    Uri.parse(str(source['url'])),
                    mode: LaunchMode.externalApplication,
                  ).catchError((_) => false),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: palette.inset,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.link, size: 13, color: palette.muted),
                        gap(4),
                        tx(
                          _host(str(source['url'])),
                          color: palette.muted,
                          size: 12,
                          weight: w600,
                        ),
                      ],
                    ),
                  ),
                ),
              Tap(
                label: 'Report wrong information',
                onTap: reported.contains(id) ? null : () => _report(id),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 5,
                  ),
                  child: tx(
                    reported.contains(id) ? 'Reported' : 'Report wrong',
                    color: reported.contains(id)
                        ? palette.muted
                        : palette.danger,
                    size: 12,
                    weight: w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _host(String url) {
    final host = Uri.tryParse(url)?.host ?? '';
    return host.startsWith('www.') ? host.substring(4) : host;
  }
}

/// Quick quiz over the day's current affairs (checked on the device; nothing is scored on the server).
class CurrentAffairsQuizScreen extends StatefulWidget {
  const CurrentAffairsQuizScreen({
    super.key,
    required this.route,
    required this.back,
  });
  final AppRoute route;
  final VoidCallback back;

  @override
  State<CurrentAffairsQuizScreen> createState() =>
      _CurrentAffairsQuizScreenState();
}

class _CurrentAffairsQuizScreenState extends State<CurrentAffairsQuizScreen> {
  late final List<dynamic> items = asList(widget.route.p['items']);
  int index = 0;
  final Map<int, String> answers = {};
  bool finished = false;

  int get correct => answers.entries
      .where((e) => str(asMap(items[e.key]['quiz'])['correctKey']) == e.value)
      .length;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (finished) {
      final percent = items.isEmpty
          ? 0
          : (correct / items.length * 100).round();
      return AppScreen(
        children: [
          Header(title: 'Current affairs quiz', onBack: widget.back),
          ScoreRing(
            value: percent,
            caption: '$correct of ${items.length} correct',
          ),
          gap(8),
          AppButton(label: 'Back to current affairs', onPress: widget.back),
        ],
      );
    }
    final quiz = asMap(items[index]['quiz']);
    final picked = answers[index];
    final key = str(quiz['correctKey']);
    return AppScreen(
      footer: Pair([
        AppButton(
          label: 'Previous',
          tone: Tone.ghost,
          marginTop: 0,
          disabled: index == 0,
          onPress: () => setState(() => index -= 1),
        ),
        AppButton(
          label: index + 1 >= items.length ? 'See result' : 'Next',
          marginTop: 0,
          disabled: picked == null,
          onPress: () => setState(() {
            if (index + 1 >= items.length) {
              finished = true;
            } else {
              index += 1;
            }
          }),
        ),
      ]),
      children: [
        Header(
          title: 'Current affairs quiz',
          subtitle: '${index + 1} of ${items.length}',
          onBack: widget.back,
        ),
        ProgressBar(
          value: (index + (picked != null ? 1 : 0)) / items.length * 100,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: tx(
            str(quiz['stem']),
            color: palette.ink,
            size: 18,
            weight: w700,
            lineHeight: 26,
          ),
        ),
        for (final option in asList(quiz['options']))
          Choice(
            key: ValueKey('$index-${option['key']}'),
            letter: str(option['key']),
            text: str(option['text']),
            disabled: picked != null,
            state: picked == null
                ? ChoiceState.idle
                : str(option['key']) == key
                ? ChoiceState.correct
                : str(option['key']) == picked
                ? ChoiceState.wrong
                : ChoiceState.idle,
            onPress: () => setState(() => answers[index] = str(option['key'])),
          ),
        if (picked != null && str(quiz['explanation']).isNotEmpty)
          AppCard(
            color: picked == key ? palette.greenSoft : palette.dangerSoft,
            borderColor: Colors.transparent,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                tx(
                  picked == key ? 'Correct' : 'Answer $key',
                  color: picked == key ? palette.good : palette.danger,
                  weight: w800,
                ),
                gap(6),
                tx(
                  str(quiz['explanation']),
                  color: palette.ink,
                  lineHeight: 20,
                ),
              ],
            ),
          ),
      ],
    );
  }
}

const _reportReasons = {
  'wrong_fact': 'Wrong fact / number',
  'wrong_date': 'Wrong date',
  'wrong_source': 'Source does not say this',
  'translation': 'Tamil / English mistake',
  'other': 'Something else',
};

/// Reason + details are both required before a report can be sent.
class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.onSend});
  final Future<void> Function(String reason, String note) onSend;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> with SafeState {
  String reason = '';
  String note = '';
  bool sending = false;
  String error = '';

  bool get valid => reason.isNotEmpty && note.trim().length >= 10;

  Future<void> send() async {
    setState(() {
      sending = true;
      error = '';
    });
    try {
      await widget.onSend(reason, note.trim());
    } catch (err) {
      safe(() => error = errorText(err));
    } finally {
      safe(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in _reportReasons.entries)
                Tap(
                  label: entry.value,
                  onTap: () => setState(() => reason = entry.key),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: reason == entry.key
                          ? palette.dangerSoft
                          : palette.inset,
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(
                        color: reason == entry.key
                            ? palette.danger
                            : palette.line,
                      ),
                    ),
                    child: tx(
                      entry.value,
                      color: reason == entry.key ? palette.danger : palette.ink,
                      size: 13,
                      weight: w600,
                    ),
                  ),
                ),
            ],
          ),
          gap(14),
          tx(
            'Tell us what is wrong and what is correct',
            color: palette.muted,
            size: 13,
            weight: w600,
          ),
          gap(6),
          PlainInput(
            value: note,
            onChanged: (value) => setState(() => note = value),
            placeholder: 'e.g. The date should be 18 Nov, not 19 Nov',
          ),
          gap(4),
          tx(
            note.trim().length < 10 ? 'At least 10 characters' : ' ',
            color: palette.muted,
            size: 12,
          ),
          if (error.isNotEmpty) ...[gap(8), AppBanner(message: error)],
          AppButton(
            label: 'Send report',
            tone: Tone.danger,
            disabled: !valid || sending,
            loading: sending,
            onPress: send,
          ),
        ],
      ),
    );
  }
}
