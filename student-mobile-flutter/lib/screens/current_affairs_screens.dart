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

(String, IconData, Accent) _category(String key) => _categories[key] ?? ('News', Icons.article, Accent.green);

/// "12 Nov" from "2026-11-12".
String prettyDay(String day) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final parts = day.split('-');
  if (parts.length != 3) return day;
  final month = int.tryParse(parts[1]) ?? 1;
  return '${int.tryParse(parts[2]) ?? parts[2]} ${months[(month - 1).clamp(0, 11)]}';
}

/// Home card: today's verified current affairs, opens the full list.
class CurrentAffairsCard extends StatelessWidget {
  const CurrentAffairsCard({super.key, required this.day, required this.count, required this.go});
  final String day;
  final int count;
  final Go go;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppCard(
      marginTop: 8,
      onPress: () => go(AppRoute('currentAffairs')),
      child: Row(children: [
        const ColorIcon(icon: Icons.newspaper, accent: Accent.blue, size: 46),
        gap(12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            tx('Current affairs', color: palette.ink, size: 16, weight: w800),
            gap(2),
            tx('$count verified updates · ${prettyDay(day)}', color: palette.muted, size: 13),
          ]),
        ),
        Icon(Icons.chevron_right, size: 20, color: palette.muted),
      ]),
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

class _CurrentAffairsScreenState extends State<CurrentAffairsScreen> with SafeState {
  String day = '';
  List<dynamic> days = [];
  List<dynamic>? items;
  String error = '';
  final Set<String> reported = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load([String? pick]) {
    setState(() {
      items = null;
      error = '';
    });
    api('/current-affairs${pick == null ? '' : '?day=$pick'}').then((value) {
      final data = asMap(value);
      safe(() {
        day = str(data['day']);
        days = asList(data['days']);
        items = asList(data['items']);
      });
    }).catchError((err) => safe(() => error = errorText(err)));
  }

  Future<void> _report(String id) async {
    try {
      await api('/current-affairs/$id/report', method: 'POST');
      safe(() => reported.add(id));
    } catch (err) {
      safe(() => error = errorText(err));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final list = items ?? const [];
    final quiz = list.where((item) => item['quiz'] is Map && str(item['quiz']['stem']).isNotEmpty).toList();
    return AppScreen(
      footer: quiz.isEmpty
          ? null
          : AppButton(
              label: 'Quick ${quiz.length} questions',
              icon: Icons.bolt,
              marginTop: 0,
              onPress: () => widget.go(AppRoute('currentAffairsQuiz', {'items': quiz, 'day': day})),
            ),
      children: [
        Header(title: 'Current affairs', subtitle: day.isEmpty ? null : 'News of ${prettyDay(day)} · verified', onBack: widget.back),
        if (days.length > 1)
          SizedBox(
            height: 40,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final d in days.take(7))
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Tap(
                    label: str(d),
                    onTap: () => _load(str(d)),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      decoration: str(d) == day
                          ? BoxDecoration(color: palette.green, borderRadius: BorderRadius.circular(99))
                          : glassBox(palette, radius: 99, shadow: false),
                      child: tx(prettyDay(str(d)),
                          color: str(d) == day ? palette.greenInk : palette.ink, size: 13, weight: w700),
                    ),
                  ),
                ),
            ]),
          ),
        gap(12),
        if (error.isNotEmpty) AppBanner(message: error),
        if (items == null && error.isEmpty) const Loading(),
        for (final item in list) _item(context, palette, item),
        if (items != null && list.isEmpty)
          const Empty(title: 'No updates yet', body: "Yesterday's verified current affairs appear here every morning."),
        if (list.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: tx('Each update is checked against 2+ news sources and two independent AI fact checks before it is shown.',
                color: palette.muted, size: 12, align: TextAlign.center),
          ),
      ],
    );
  }

  Widget _item(BuildContext context, Palette palette, dynamic item) {
    final (label, icon, accent) = _category(str(item['category']));
    final id = str(item['id']);
    final sources = asList(item['sources']);
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 15, color: accents[accent]),
          gap(6),
          tx(label.toUpperCase(), color: accents[accent], size: 11, weight: w800, letterSpacing: 0.6),
        ]),
        gap(8),
        tx(str(item['title']), color: palette.ink, size: 16, weight: w800, lineHeight: 22),
        gap(8),
        for (final point in asList(item['points']))
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(
                padding: const EdgeInsets.only(top: 7),
                child: Container(width: 6, height: 6, decoration: BoxDecoration(color: palette.green, shape: BoxShape.circle)),
              ),
              gap(10),
              Expanded(child: tx(str(point), color: palette.ink, lineHeight: 21)),
            ]),
          ),
        gap(4),
        Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          for (final source in sources.take(3))
            Tap(
              label: 'Open source',
              onTap: () => launchUrl(Uri.parse(str(source['url'])), mode: LaunchMode.externalApplication).catchError((_) => false),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: palette.inset, borderRadius: BorderRadius.circular(99)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.link, size: 13, color: palette.muted),
                  gap(4),
                  tx(_host(str(source['url'])), color: palette.muted, size: 12, weight: w600),
                ]),
              ),
            ),
          Tap(
            label: 'Report wrong information',
            onTap: reported.contains(id) ? null : () => _report(id),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
              child: tx(reported.contains(id) ? 'Reported' : 'Report wrong',
                  color: reported.contains(id) ? palette.muted : palette.danger, size: 12, weight: w700),
            ),
          ),
        ]),
      ]),
    );
  }

  String _host(String url) {
    final host = Uri.tryParse(url)?.host ?? '';
    return host.startsWith('www.') ? host.substring(4) : host;
  }
}

/// Quick quiz over the day's current affairs (checked on the device; nothing is scored on the server).
class CurrentAffairsQuizScreen extends StatefulWidget {
  const CurrentAffairsQuizScreen({super.key, required this.route, required this.back});
  final AppRoute route;
  final VoidCallback back;

  @override
  State<CurrentAffairsQuizScreen> createState() => _CurrentAffairsQuizScreenState();
}

class _CurrentAffairsQuizScreenState extends State<CurrentAffairsQuizScreen> {
  late final List<dynamic> items = asList(widget.route.p['items']);
  int index = 0;
  final Map<int, String> answers = {};
  bool finished = false;

  int get correct => answers.entries.where((e) => str(asMap(items[e.key]['quiz'])['correctKey']) == e.value).length;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (finished) {
      final percent = items.isEmpty ? 0 : (correct / items.length * 100).round();
      return AppScreen(children: [
        Header(title: 'Current affairs quiz', onBack: widget.back),
        ScoreRing(value: percent, caption: '$correct of ${items.length} correct'),
        gap(8),
        AppButton(label: 'Back to current affairs', onPress: widget.back),
      ]);
    }
    final quiz = asMap(items[index]['quiz']);
    final picked = answers[index];
    final key = str(quiz['correctKey']);
    return AppScreen(
      footer: Pair([
        AppButton(label: 'Previous', tone: Tone.ghost, marginTop: 0, disabled: index == 0, onPress: () => setState(() => index -= 1)),
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
        Header(title: 'Current affairs quiz', subtitle: '${index + 1} of ${items.length}', onBack: widget.back),
        ProgressBar(value: (index + (picked != null ? 1 : 0)) / items.length * 100),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: tx(str(quiz['stem']), color: palette.ink, size: 18, weight: w700, lineHeight: 26),
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
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              tx(picked == key ? 'Correct' : 'Answer $key', color: picked == key ? palette.green : palette.danger, weight: w800),
              gap(6),
              tx(str(quiz['explanation']), color: palette.ink, lineHeight: 20),
            ]),
          ),
      ],
    );
  }
}
