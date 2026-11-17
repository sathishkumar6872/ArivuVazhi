import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/app_state.dart';

// ---------------------------------------------------------------- text helper

/// Short Text builder that mirrors the React Native inline styles.
Text tx(
  String text, {
  Color? color,
  double size = 14,
  FontWeight? weight,
  double? lineHeight,
  TextAlign? align,
  int? lines,
  FontStyle? style,
  double? letterSpacing,
}) {
  return Text(
    text,
    textAlign: align,
    maxLines: lines,
    overflow: lines == null ? null : TextOverflow.ellipsis,
    style: TextStyle(
      color: color,
      fontSize: size,
      fontWeight: weight,
      height: lineHeight == null ? null : lineHeight / size,
      fontStyle: style,
      letterSpacing: letterSpacing,
    ),
  );
}

const w600 = FontWeight.w600;
const w700 = FontWeight.w700;
const w800 = FontWeight.w800;
const w900 = FontWeight.w900;

/// Tappable area without ripple (like RN Pressable).
class Tap extends StatelessWidget {
  const Tap({super.key, required this.child, this.onTap, this.label});
  final Widget child;
  final VoidCallback? onTap;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: child),
    );
  }
}

/// Vertical spacing helper.
Widget gap(double size) => SizedBox(height: size, width: size);

// ---------------------------------------------------------------- screen + header

class AppScreen extends StatelessWidget {
  const AppScreen({super.key, this.children = const [], this.body, this.padded = true, this.controller});

  final List<Widget> children;
  final Widget? body;
  final bool padded;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final content = body != null
        ? (padded ? Padding(padding: const EdgeInsets.all(16), child: body) : body!)
        : ListView(
            controller: controller,
            padding: padded ? const EdgeInsets.fromLTRB(16, 16, 16, 28) : EdgeInsets.zero,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
            children: children,
          );
    return ColoredBox(color: palette.bg, child: SafeArea(bottom: false, child: content));
  }
}

class Header extends StatelessWidget {
  const Header({super.key, required this.title, this.subtitle, this.onBack, this.right});
  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final Widget? right;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 52),
        child: Row(
          children: [
            SizedBox(
              width: 44,
              child: onBack == null
                  ? null
                  : Align(
                      alignment: Alignment.centerLeft,
                      child: Tap(label: 'Back', onTap: onBack, child: Icon(Icons.chevron_left, size: 30, color: palette.ink)),
                    ),
            ),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  tx(title, color: palette.ink, size: 17, weight: w700, lines: 1, align: TextAlign.center),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: tx(subtitle!, color: palette.muted, size: 12, lines: 1, align: TextAlign.center),
                    ),
                ],
              ),
            ),
            SizedBox(width: 44, child: Align(alignment: Alignment.centerRight, child: right)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- buttons

typedef PressHandler = FutureOr<void> Function();

enum Tone { primary, ghost, danger, outline }

class AppButton extends StatefulWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPress,
    this.tone = Tone.primary,
    this.disabled = false,
    this.icon,
    this.loading = false,
    this.iconOnly = false,
    this.marginTop = 8,
  });

  final String label;
  final PressHandler onPress;
  final Tone tone;
  final bool disabled;
  final IconData? icon;
  final bool loading;
  final bool iconOnly;
  final double marginTop;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pending = false;

  /// An async handler shows a spinner and blocks repeat taps until it settles.
  void _handle() {
    if (_pending) return;
    final result = widget.onPress();
    if (result is Future) {
      setState(() => _pending = true);
      result.then((_) {}, onError: (_) {}).whenComplete(() {
        if (mounted) setState(() => _pending = false);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final busy = widget.loading || _pending;
    final tone = widget.tone;
    final background = tone == Tone.primary
        ? palette.green
        : tone == Tone.danger
            ? palette.dangerSoft
            : tone == Tone.outline
                ? palette.surface
                : palette.mint;
    final color = tone == Tone.primary ? palette.greenInk : (tone == Tone.danger ? palette.danger : palette.primary);
    final border = tone == Tone.outline ? palette.green : Colors.transparent;
    final inactive = widget.disabled || busy;
    final spinner = SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: color));

    if (widget.iconOnly && widget.icon != null) {
      return Opacity(
        opacity: inactive ? 0.45 : 1,
        child: Tap(
          label: widget.label,
          onTap: inactive ? null : _handle,
          child: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: border),
            ),
            child: busy ? spinner : Icon(widget.icon, size: 18, color: color),
          ),
        ),
      );
    }
    final label = busy ? (widget.label.endsWith('...') ? widget.label : '${widget.label}...') : widget.label;
    return Padding(
      padding: EdgeInsets.only(top: widget.marginTop),
      child: Opacity(
        opacity: inactive ? 0.45 : 1,
        child: Tap(
          label: widget.label,
          onTap: inactive ? null : _handle,
          child: Container(
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (busy) ...[spinner, gap(8)],
                if (!busy && widget.icon != null) ...[Icon(widget.icon, size: 16, color: color), gap(8)],
                Flexible(child: tx(label, color: color, weight: w700, size: 15, align: TextAlign.center)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class IconBtn extends StatelessWidget {
  const IconBtn({
    super.key,
    required this.label,
    required this.icon,
    required this.onPress,
    this.tone = Tone.ghost,
    this.disabled = false,
    this.loading = false,
  });
  final String label;
  final IconData icon;
  final PressHandler onPress;
  final Tone tone;
  final bool disabled;
  final bool loading;

  @override
  Widget build(BuildContext context) => AppButton(
        label: label,
        icon: icon,
        onPress: onPress,
        tone: tone,
        disabled: disabled,
        loading: loading,
        iconOnly: true,
      );
}

/// Two widgets side by side with an 8px gap (RN `flexDirection: row, gap: 8` with flex: 1 children).
class Pair extends StatelessWidget {
  const Pair(this.children, {super.key, this.spacing = 8});
  final List<Widget?> children;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    final items = children.whereType<Widget>().toList();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) SizedBox(width: spacing),
          Expanded(child: items[i]),
        ],
      ],
    );
  }
}

/// Grid laid out row by row with equal columns.
class GridRows extends StatelessWidget {
  const GridRows({super.key, required this.columns, required this.children, this.spacing = 10, this.runSpacing = 10});
  final int columns;
  final List<Widget> children;
  final double spacing;
  final double runSpacing;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var start = 0; start < children.length; start += columns) {
      final cells = <Widget>[];
      for (var i = 0; i < columns; i++) {
        if (i > 0) cells.add(SizedBox(width: spacing));
        final index = start + i;
        cells.add(Expanded(child: index < children.length ? children[index] : const SizedBox()));
      }
      rows.add(Padding(
        padding: EdgeInsets.only(bottom: runSpacing),
        child: IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: cells)),
      ));
    }
    return Column(children: rows);
  }
}

// ---------------------------------------------------------------- field

enum FieldKeyboard { text, email, number }

class Field extends StatefulWidget {
  const Field({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.placeholder,
    this.secure = false,
    this.keyboard = FieldKeyboard.text,
    this.icon,
    this.passwordToggle = false,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final String? placeholder;
  final bool secure;
  final FieldKeyboard keyboard;
  final IconData? icon;
  final bool passwordToggle;

  @override
  State<Field> createState() => _FieldState();
}

class _FieldState extends State<Field> {
  late final TextEditingController _controller = TextEditingController(text: widget.value);
  final FocusNode _focus = FocusNode();
  late bool _hidden = widget.secure;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void didUpdateWidget(Field oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Controlled input: follow the parent value when it changes from outside (e.g. cleared after save).
    if (widget.value != _controller.text) {
      _controller.value = TextEditingValue(
        text: widget.value,
        selection: TextSelection.collapsed(offset: widget.value.length),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final focused = _focus.hasFocus;
    final email = widget.keyboard == FieldKeyboard.email;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: tx(widget.label, color: palette.muted, size: 13, weight: w600),
          ),
          Container(
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: focused ? palette.green : palette.line),
            ),
            child: Row(
              children: [
                if (widget.icon != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Icon(widget.icon, size: 18, color: focused ? palette.green : palette.muted),
                  ),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focus,
                    onChanged: widget.onChanged,
                    obscureText: widget.passwordToggle ? _hidden : widget.secure,
                    keyboardType: email
                        ? TextInputType.emailAddress
                        : widget.keyboard == FieldKeyboard.number
                            ? TextInputType.number
                            : TextInputType.text,
                    textCapitalization: email ? TextCapitalization.none : TextCapitalization.sentences,
                    autocorrect: !email && !widget.secure,
                    cursorColor: palette.green,
                    style: TextStyle(color: palette.ink, fontSize: 16),
                    decoration: InputDecoration(
                      isDense: true,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      hintText: widget.placeholder ?? widget.label,
                      hintStyle: TextStyle(color: palette.muted, fontSize: 16),
                    ),
                  ),
                ),
                if (widget.passwordToggle)
                  Tap(
                    label: _hidden ? 'Show password' : 'Hide password',
                    onTap: () => setState(() => _hidden = !_hidden),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Icon(
                        _hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        size: 18,
                        color: focused ? palette.green : palette.muted,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Plain bordered input used for search and the chat composer.
class PlainInput extends StatefulWidget {
  const PlainInput({
    super.key,
    required this.value,
    required this.onChanged,
    required this.placeholder,
    this.onSubmit,
    this.onFocus,
    this.height,
    this.background,
    this.radius = 14,
    this.sendAction = false,
  });
  final String value;
  final ValueChanged<String> onChanged;
  final String placeholder;
  final VoidCallback? onSubmit;
  final VoidCallback? onFocus;
  final double? height;
  final Color? background;
  final double radius;
  final bool sendAction;

  @override
  State<PlainInput> createState() => _PlainInputState();
}

class _PlainInputState extends State<PlainInput> {
  late final TextEditingController _controller = TextEditingController(text: widget.value);
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (_focus.hasFocus) widget.onFocus?.call();
      setState(() {});
    });
  }

  @override
  void didUpdateWidget(PlainInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _controller.text) {
      _controller.value = TextEditingValue(
        text: widget.value,
        selection: TextSelection.collapsed(offset: widget.value.length),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      height: widget.height,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: widget.background ?? palette.surface,
        borderRadius: BorderRadius.circular(widget.radius),
        border: Border.all(color: _focus.hasFocus ? palette.green : palette.line),
      ),
      child: TextField(
        controller: _controller,
        focusNode: _focus,
        onChanged: widget.onChanged,
        onSubmitted: (_) => widget.onSubmit?.call(),
        textInputAction: widget.sendAction ? TextInputAction.send : TextInputAction.search,
        cursorColor: palette.green,
        style: TextStyle(color: palette.ink, fontSize: 15),
        decoration: InputDecoration(
          isDense: true,
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(vertical: widget.height == null ? 13 : 8),
          hintText: widget.placeholder,
          hintStyle: TextStyle(color: palette.muted, fontSize: 15),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- card + small pieces

class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onPress,
    this.color,
    this.borderColor,
    this.padding = const EdgeInsets.all(14),
    this.marginBottom = 10,
    this.marginTop = 0,
  });

  final Widget child;
  final VoidCallback? onPress;
  final Color? color;
  final Color? borderColor;
  final EdgeInsets padding;
  final double marginBottom;
  final double marginTop;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final box = Container(
      width: double.infinity,
      margin: EdgeInsets.only(bottom: marginBottom, top: marginTop),
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor ?? palette.line),
      ),
      child: child,
    );
    if (onPress == null) return box;
    return Tap(onTap: onPress, child: box);
  }
}

class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.value});
  final num value;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final fraction = (value.clamp(0, 100)) / 100;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: Container(
          height: 6,
          color: palette.line,
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: fraction.toDouble(),
            child: Container(
              decoration: BoxDecoration(color: palette.green, borderRadius: BorderRadius.circular(99)),
            ),
          ),
        ),
      ),
    );
  }
}

class Segment extends StatelessWidget {
  const Segment({super.key, required this.options, required this.value, required this.onChange});
  final List<String> options;
  final String value;
  final ValueChanged<String> onChange;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: palette.greenSoft, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          for (final option in options)
            Expanded(
              child: Tap(
                label: option,
                onTap: () => onChange(option),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: option == value ? palette.primary : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: tx(option,
                      color: option == value ? palette.greenInk : palette.muted, weight: w700, size: 13, lines: 1),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class ScoreRing extends StatelessWidget {
  const ScoreRing({super.key, required this.value, required this.caption});
  final num value;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Container(
          width: 148,
          height: 148,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: palette.surface,
            border: Border.all(color: palette.accent, width: 12),
          ),
          alignment: Alignment.center,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              tx('$value%', color: palette.primary, size: 34, weight: w800),
              gap(2),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: tx(caption, color: palette.muted, align: TextAlign.center, lines: 2),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- accents + icons

/// Icon accent colours from the design board; tiles use a soft tint of the same colour.
enum Accent { green, olive, purple, orange, red, blue, lime, teal }

const Map<Accent, Color> accents = {
  Accent.green: Color(0xFF16A34A),
  Accent.olive: Color(0xFF4D7C0F),
  Accent.purple: Color(0xFF7C3AED),
  Accent.orange: Color(0xFFF59E0B),
  Accent.red: Color(0xFFEF4444),
  Accent.blue: Color(0xFF0EA5E9),
  Accent.lime: Color(0xFF65A30D),
  Accent.teal: Color(0xFF0D9488),
};

const _rotation = [Accent.green, Accent.blue, Accent.orange, Accent.red, Accent.purple, Accent.teal, Accent.lime];

/// Rotating accent for lists without a natural colour (exams, unknown subjects).
Accent accentAt(int index) => _rotation[index % _rotation.length];

final List<(RegExp, IconData, Accent)> _subjectIcons = [
  (RegExp(r'polity|constitution|civics|governance'), Icons.verified_user, Accent.red),
  (RegExp(r'history|heritage|culture'), Icons.hourglass_bottom, Accent.orange),
  (RegExp(r'geograph|environment|ecology'), Icons.public, Accent.blue),
  (RegExp(r'aptitude|mental ability|reasoning|math|quantitative|numer'), Icons.calculate, Accent.purple),
  (RegExp(r'current affairs|news'), Icons.newspaper, Accent.orange),
  (RegExp(r'tamil|english|language|grammar|literature'), Icons.translate, Accent.green),
  (RegExp(r'science|physics|chemistry|biology'), Icons.science, Accent.teal),
  (RegExp(r'econom|finance|budget|commerce'), Icons.payments, Accent.lime),
  (RegExp(r'general studies|general knowledge|\bgk\b'), Icons.school, Accent.green),
  (RegExp(r'computer|technology'), Icons.laptop, Accent.blue),
];

/// Icon and colour for a subject, matched on its name (Polity red, History orange…).
(IconData, Accent) subjectVisual(String name, [int index = 0]) {
  final text = name.toLowerCase();
  for (final (pattern, icon, accent) in _subjectIcons) {
    if (pattern.hasMatch(text)) return (icon, accent);
  }
  return (Icons.menu_book, accentAt(index));
}

/// Coloured icon on a soft tinted rounded square (list rows).
class ColorIcon extends StatelessWidget {
  const ColorIcon({super.key, required this.icon, this.accent = Accent.green, this.size = 44});
  final IconData icon;
  final Accent accent;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = accents[accent]!;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withAlpha(0x1F),
        borderRadius: BorderRadius.circular((size * 0.3).roundToDouble()),
      ),
      child: Icon(icon, size: (size * 0.5).roundToDouble(), color: color),
    );
  }
}

// ---------------------------------------------------------------- levels

const levels = ['easy', 'medium', 'hard'];
const levelName = {'easy': 'Easy', 'medium': 'Medium', 'hard': 'Hard'};

/// A topic with no answers yet: Easy open, the rest locked.
const Map<String, dynamic> freshLevel = {
  'current': 'easy',
  'step': 0,
  'mastered': false,
  'percent': 0,
  'levels': {
    'easy': {'answered': 0, 'correct': 0, 'accuracy': 0, 'unlocked': true, 'passed': false},
    'medium': {'answered': 0, 'correct': 0, 'accuracy': 0, 'unlocked': false, 'passed': false},
    'hard': {'answered': 0, 'correct': 0, 'accuracy': 0, 'unlocked': false, 'passed': false},
  },
};

/// Easy → Medium → Hard chips for one topic: ✓ passed, ▶ current, 🔒 locked.
/// Tapping an open level starts practice at that level.
class LevelSteps extends StatelessWidget {
  const LevelSteps({super.key, this.level, this.onPick});
  final dynamic level;
  final ValueChanged<String>? onPick;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final progress = level is Map && level['levels'] is Map ? level as Map : freshLevel;
    final states = progress['levels'] as Map;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          for (var i = 0; i < levels.length; i++) ...[
            if (i > 0) gap(6),
            Expanded(child: _chip(context, palette, progress, asMap(states[levels[i]]), levels[i])),
          ],
        ],
      ),
    );
  }

  Widget _chip(BuildContext context, Palette palette, Map progress, Map<String, dynamic> state, String name) {
    final passed = state['passed'] == true;
    final unlocked = state['unlocked'] == true;
    final current = progress['mastered'] != true && progress['current'] == name;
    final color = passed ? palette.green : (current ? palette.primary : palette.muted);
    final icon = passed ? Icons.check_circle : (unlocked ? Icons.play_circle : Icons.lock);
    final answered = intOf(state['answered']);
    return Opacity(
      opacity: unlocked ? 1 : 0.6,
      child: Tap(
        label: '${levelName[name]} ${passed ? 'passed' : unlocked ? 'open' : 'locked'}',
        onTap: !unlocked || onPick == null ? null : () => onPick!(name),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          decoration: BoxDecoration(
            color: passed ? palette.greenSoft : palette.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: passed ? palette.green : (current ? palette.primary : palette.line),
              width: current ? 1.5 : 1,
            ),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 13, color: color),
                  gap(4),
                  tx(context.t(levelName[name]!), color: color, weight: w800, size: 12),
                ],
              ),
              gap(2),
              tx(
                answered > 0
                    ? '${state['accuracy']}% · $answered Q'
                    : unlocked
                        ? 'Start'
                        : 'Locked',
                color: palette.muted,
                size: 10,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Quick-action tile: white card, coloured filled icon, label under it.
class IconTile extends StatelessWidget {
  const IconTile({super.key, required this.icon, required this.label, required this.onPress, this.accent = Accent.green});
  final IconData icon;
  final String label;
  final VoidCallback onPress;
  final Accent accent;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Tap(
      label: label,
      onTap: onPress,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: palette.line),
          boxShadow: const [BoxShadow(color: Color(0x0F0B3D2E), blurRadius: 8, offset: Offset(0, 3))],
        ),
        child: Column(
          children: [
            Icon(icon, size: 28, color: accents[accent]),
            gap(6),
            tx(label, color: palette.ink, size: 12, weight: w700, align: TextAlign.center, lines: 1),
          ],
        ),
      ),
    );
  }
}

enum PillTone { soft, good, warn }

class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, this.tone = PillTone.soft});
  final String label;
  final PillTone tone;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: tone == PillTone.warn ? palette.dangerSoft : palette.greenSoft,
        borderRadius: BorderRadius.circular(99),
      ),
      child: tx(label, color: tone == PillTone.warn ? palette.danger : palette.green, size: 12, weight: w700),
    );
  }
}

enum BannerTone { error, info, success }

class AppBanner extends StatelessWidget {
  const AppBanner({super.key, required this.message, this.tone = BannerTone.error});
  final String message;
  final BannerTone tone;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone == BannerTone.error ? palette.dangerSoft : palette.greenSoft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: tx(message, color: tone == BannerTone.error ? palette.danger : palette.green, lineHeight: 20),
    );
  }
}

// ---------------------------------------------------------------- loading + empty

class Bone extends StatelessWidget {
  const Bone({super.key, this.width, this.widthFactor, this.height = 14, this.radius = 8});
  final double? width;
  final double? widthFactor;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final box = Opacity(
      opacity: 0.85,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(color: context.palette.line, borderRadius: BorderRadius.circular(radius)),
      ),
    );
    if (width != null) return Align(alignment: Alignment.centerLeft, child: box);
    return Align(alignment: Alignment.centerLeft, child: FractionallySizedBox(widthFactor: widthFactor ?? 1, child: box));
  }
}

enum LoadingVariant { list, home, quiz, spinner }

class SkeletonCards extends StatelessWidget {
  const SkeletonCards({super.key, this.rows = 4, this.variant = LoadingVariant.list});
  final int rows;
  final LoadingVariant variant;

  Widget _card(BuildContext context, List<Widget> children) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (variant == LoadingVariant.home) {
      return Semantics(
        label: 'Loading',
        child: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            children: [
              _card(context, [
                Row(children: [
                  const Bone(width: 92, height: 92, radius: 46),
                  gap(16),
                  Expanded(
                    child: Column(children: [
                      const Bone(widthFactor: 0.4, height: 12),
                      gap(8),
                      const Bone(widthFactor: 0.8, height: 18),
                      gap(8),
                      const Bone(widthFactor: 0.6, height: 12),
                    ]),
                  ),
                ]),
              ]),
              gap(2),
              const Bone(height: 64, radius: 16),
              gap(12),
              for (var i = 0; i < 3; i++)
                _card(context, [const Bone(widthFactor: 0.7, height: 16), gap(10), const Bone(widthFactor: 0.45, height: 12)]),
            ],
          ),
        ),
      );
    }
    if (variant == LoadingVariant.quiz) {
      return Semantics(
        label: 'Loading',
        child: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(children: [
            const Bone(widthFactor: 0.35, height: 12),
            gap(12),
            const Bone(height: 8, radius: 99),
            gap(20),
            const Bone(height: 72, radius: 14),
            gap(20),
            for (var i = 0; i < 4; i++) ...[const Bone(height: 52, radius: 14), gap(12)],
          ]),
        ),
      );
    }
    return Semantics(
      label: 'Loading',
      child: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Column(children: [
          for (var i = 0; i < rows; i++)
            _card(context, [
              Bone(widthFactor: (70 - (i % 3) * 8) / 100, height: 16),
              gap(10),
              const Bone(widthFactor: 0.5, height: 12),
              gap(12),
              const Bone(height: 8, radius: 99),
            ]),
        ]),
      ),
    );
  }
}

class Loading extends StatelessWidget {
  const Loading({super.key, this.label, this.variant = LoadingVariant.list, this.rows = 4});
  final String? label;
  final LoadingVariant variant;
  final int rows;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final spinner = SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: palette.green));
    if (variant == LoadingVariant.spinner) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(children: [
          spinner,
          if (label != null) ...[gap(8), tx(label!, color: palette.muted)],
        ]),
      );
    }
    return Column(children: [
      if (label != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [spinner, gap(8), Expanded(child: tx(label!, color: palette.muted))]),
        ),
      SkeletonCards(rows: rows, variant: variant),
    ]);
  }
}

class Empty extends StatelessWidget {
  const Empty({super.key, required this.title, required this.body});
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(children: [
        Icon(Icons.eco_outlined, size: 28, color: palette.green),
        gap(8),
        tx(title, color: palette.ink, size: 18, weight: w700, align: TextAlign.center),
        gap(8),
        tx(body, color: palette.muted, align: TextAlign.center, lineHeight: 20),
      ]),
    );
  }
}

enum ChoiceState { idle, selected, correct, wrong }

class Choice extends StatelessWidget {
  const Choice({super.key, required this.letter, required this.text, required this.state, required this.onPress, this.disabled = false});
  final String letter;
  final String text;
  final ChoiceState state;
  final VoidCallback onPress;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final border = switch (state) {
      ChoiceState.correct => palette.good,
      ChoiceState.wrong => palette.danger,
      ChoiceState.selected => palette.green,
      ChoiceState.idle => palette.line,
    };
    final background = switch (state) {
      ChoiceState.correct => palette.greenSoft,
      ChoiceState.wrong => palette.dangerSoft,
      _ => palette.surface,
    };
    final idle = state == ChoiceState.idle;
    return Tap(
      label: '$letter. $text',
      onTap: disabled ? null : onPress,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(14), border: Border.all(color: border)),
        child: Row(children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(shape: BoxShape.circle, color: idle ? palette.bg : palette.green),
            child: tx(letter, weight: w700, color: idle ? palette.ink : palette.greenInk),
          ),
          gap(10),
          Expanded(child: tx(text, color: palette.ink, lineHeight: 20)),
        ]),
      ),
    );
  }
}

// ---------------------------------------------------------------- dialogs + sheets

/// Confirm dialog. The confirm button waits for [onConfirm] and then closes the dialog.
Future<void> showConfirm(
  BuildContext context, {
  required String title,
  required String body,
  required String confirm,
  String? cancel,
  bool danger = false,
  required PressHandler onConfirm,
}) {
  return showDialog<void>(
    context: context,
    barrierColor: const Color(0x73121614),
    builder: (dialogContext) {
      final palette = context.palette;
      return Dialog(
        backgroundColor: palette.surface,
        insetPadding: const EdgeInsets.all(20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              tx(title, color: palette.ink, size: 18, weight: w700),
              gap(8),
              tx(body, color: palette.muted, lineHeight: 20),
              gap(8),
              AppButton(
                label: confirm,
                tone: danger ? Tone.danger : Tone.primary,
                onPress: () async {
                  await onConfirm();
                  if (dialogContext.mounted) Navigator.of(dialogContext).pop();
                },
              ),
              if (cancel != null) AppButton(label: cancel, tone: Tone.ghost, onPress: () => Navigator.of(dialogContext).pop()),
            ],
          ),
        ),
      );
    },
  );
}

/// Bottom sheet with a handle and title.
Future<void> showSheet(BuildContext context, {required String title, required WidgetBuilder builder}) {
  final palette = context.palette;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: palette.surface,
    barrierColor: const Color(0x73121614),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
    builder: (sheetContext) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.8),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: const Color(0xFFD5D0C8), borderRadius: BorderRadius.circular(99)),
              ),
            ),
            gap(12),
            tx(title, color: palette.ink, size: 18, weight: w700),
            gap(12),
            builder(sheetContext),
          ],
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- tab bar + brand

class AppTabBar extends StatelessWidget {
  const AppTabBar({super.key, required this.tab, required this.onChange});
  final String tab;
  final ValueChanged<String> onChange;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    // Design order: the AI Tutor is the raised round button in the middle.
    const items = [
      ('home', Icons.home, Icons.home_outlined, 'Home'),
      ('exams', Icons.menu_book, Icons.menu_book_outlined, 'Exams'),
      ('tutor', Icons.auto_awesome, Icons.auto_awesome, 'AI Tutor'),
      ('practice', Icons.assignment, Icons.assignment_outlined, 'Practice'),
      ('profile', Icons.person, Icons.person_outline, 'Profile'),
    ];
    final bottom = MediaQuery.of(context).padding.bottom;
    return Container(
      padding: EdgeInsets.only(top: 6, bottom: 10 + bottom),
      decoration: BoxDecoration(color: palette.surface, border: Border(top: BorderSide(color: palette.line))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final (id, activeIcon, icon, label) in items)
            Expanded(
              child: Tap(
                label: label,
                onTap: () => onChange(id),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (id == 'tutor')
                      SizedBox(
                        height: 30,
                        child: OverflowBox(
                          minHeight: 56,
                          maxHeight: 56,
                          alignment: Alignment.bottomCenter,
                          child: Container(
                            width: 56,
                            height: 56,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: palette.green,
                              shape: BoxShape.circle,
                              border: Border.all(color: palette.surface, width: 4),
                              boxShadow: const [BoxShadow(color: Color(0x5916A34A), blurRadius: 10, offset: Offset(0, 4))],
                            ),
                            child: tx('AI', color: Colors.white, size: 17, weight: w900),
                          ),
                        ),
                      )
                    else
                      Icon(tab == id ? activeIcon : icon, size: 22, color: tab == id ? palette.green : palette.muted),
                    gap(2),
                    tx(context.t(label),
                        size: 10,
                        weight: tab == id && id != 'tutor' ? w800 : w700,
                        color: tab == id ? palette.green : palette.muted,
                        lines: 1),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.light = false, this.centered = false});
  final bool light;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final word = Text.rich(
      TextSpan(children: [
        const TextSpan(text: 'Arivu'),
        TextSpan(text: 'Vazhi', style: TextStyle(color: light ? palette.highlight : palette.green)),
      ]),
      style: TextStyle(
        fontSize: centered ? 22 : 18,
        fontWeight: centered ? w800 : w700,
        color: light ? Colors.white : palette.primary,
      ),
    );
    if (centered) {
      return Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 56,
          height: 56,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: light ? const Color(0x29FFFFFF) : palette.greenSoft,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(Icons.menu_book, size: 28, color: light ? Colors.white : palette.green),
        ),
        gap(8),
        word,
      ]);
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: light ? const Color(0x2EFFFFFF) : palette.green,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(Icons.menu_book, size: 16, color: light ? Colors.white : palette.greenInk),
      ),
      gap(8),
      word,
    ]);
  }
}

class Dots extends StatelessWidget {
  const Dots({super.key, required this.count, required this.index});
  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == index ? 18 : 7,
              height: 7,
              decoration: BoxDecoration(
                color: i == index ? palette.accent : palette.line,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
        ],
      ),
    );
  }
}

/// `setState` only while mounted, for async loaders.
mixin SafeState<T extends StatefulWidget> on State<T> {
  void safe(VoidCallback fn) {
    if (mounted) setState(fn);
  }
}
