import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:material_ui/material_ui.dart';

import '../core/app_state.dart';

// ---------------------------------------------------------------- backdrop

/// App-wide backdrop: a soft vertical gradient with two glow blobs. In dark mode the glass
/// cards sit on this, so their translucency picks up the colour.
class AppBackground extends StatelessWidget {
  const AppBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [palette.bgTop, palette.bgBottom],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          _Glow(
            color: palette.glowA,
            alignment: const Alignment(-1.3, -1.05),
            size: 1.25,
          ),
          _Glow(
            color: palette.glowB,
            alignment: const Alignment(1.4, 0.35),
            size: 1.1,
          ),
          if (palette.dark)
            _Glow(
              color: palette.glowA.withAlpha(0x22),
              alignment: const Alignment(-0.6, 1.2),
              size: 0.9,
            ),
          child,
        ],
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({
    required this.color,
    required this.alignment,
    required this.size,
  });
  final Color color;
  final Alignment alignment;
  final double size;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width * size;
    return IgnorePointer(
      child: Align(
        alignment: alignment,
        child: Container(
          width: width,
          height: width,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            // A radial fade looks like a blurred blob without the cost of a blur filter.
            gradient: RadialGradient(colors: [color, color.withAlpha(0)]),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- surfaces

/// Card surface: frosted glass in both themes — translucent fill with a top-left sheen,
/// a light hairline border, and (light) a soft, wide shadow.
BoxDecoration glassBox(
  Palette palette, {
  double radius = 18,
  Color? color,
  Color? border,
  bool shadow = true,
}) {
  if (palette.dark) {
    return BoxDecoration(
      color: color ?? palette.surface,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: border ?? const Color(0x40A9CCFF)),
      gradient: color == null
          ? const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0x2EA9CCFF), Color(0x0D7DB4FF)],
            )
          : null,
    );
  }
  return BoxDecoration(
    color: color ?? palette.surface,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: border ?? (color == null ? const Color(0xE6FFFFFF) : palette.line)),
    gradient: color == null
        ? const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xE6FFFFFF), Color(0xA6FFFFFF)],
          )
        : null,
    boxShadow: shadow
        ? [
            BoxShadow(
              color: palette.shadow,
              blurRadius: 24,
              offset: const Offset(0, 10),
              spreadRadius: -8,
            ),
            const BoxShadow(
              color: Color(0x08000000),
              blurRadius: 3,
              offset: Offset(0, 1),
            ),
          ]
        : null,
  );
}

/// Real frosted glass (backdrop blur) for fixed chrome: tab bar, action bars, sheets.
class Frosted extends StatelessWidget {
  const Frosted({
    super.key,
    required this.child,
    this.radius = 0,
    this.decoration,
    this.blur = 24,
  });
  final Widget child;
  final double radius;
  final BoxDecoration? decoration;
  final double blur;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: DecoratedBox(
          decoration: decoration ?? const BoxDecoration(),
          child: child,
        ),
      ),
    );
  }
}

/// Navy gradient hero card with a soft wave in the lower right (home score, profile, tutor).
/// Text on it is always white.
class HeroCard extends StatelessWidget {
  const HeroCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin = EdgeInsets.zero,
    this.radius = 24,
  });
  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      margin: margin,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [palette.heroStart, palette.heroEnd],
        ),
        // The reference uses the same crisp cyan hairline in both themes.
        border: Border.all(color: const Color(0xFF45CEFF), width: 1),
        boxShadow: [
          BoxShadow(
            color: palette.dark
                ? const Color(0x521769C2)
                : const Color(0x33123B78),
            blurRadius: 28,
            offset: const Offset(0, 12),
            spreadRadius: -10,
          ),
        ],
      ),
      child: Stack(
        children: [
          const Positioned.fill(
            child: IgnorePointer(child: CustomPaint(painter: _WavePainter())),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    );
  }
}

/// Two soft light-blue waves rising towards the bottom-right corner.
class _WavePainter extends CustomPainter {
  const _WavePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    Path wave(double lift) => Path()
      ..moveTo(w * 0.35, h)
      ..cubicTo(
        w * 0.6,
        h * (0.86 - lift),
        w * 0.8,
        h * (0.98 - lift),
        w,
        h * (0.55 - lift),
      )
      ..lineTo(w, h)
      ..close();
    canvas.drawPath(wave(0.12), Paint()..color = const Color(0x1F19BFFF));
    canvas.drawPath(
      wave(0),
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0x0019BFFF), Color(0x8019BFFF)],
        ).createShader(Rect.fromLTWH(w * 0.35, 0, w * 0.65, h)),
    );
    // Bright crest line along the wave.
    final crest = Path()
      ..moveTo(w * 0.35, h)
      ..cubicTo(w * 0.6, h * 0.86, w * 0.8, h * 0.98, w, h * 0.55);
    canvas.drawPath(
      crest,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..shader = const LinearGradient(
          colors: [Color(0x0019BFFF), Color(0xCC5FD3FF)],
        ).createShader(Rect.fromLTWH(w * 0.35, 0, w * 0.65, h)),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Navy band behind the Home greeting. Fades into the page at the bottom.
class HeaderBand extends StatelessWidget {
  const HeaderBand({super.key, required this.height});
  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return IgnorePointer(
      child: SizedBox(
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0, 0.62, 1],
                  colors: [
                    const Color(0xFF0A2457),
                    const Color(0xFF1148A0),
                    palette.bg.withAlpha(0),
                  ],
                ),
              ),
            ),
            // A faint diagonal light streak, as in the reference.
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: const Alignment(-0.2, -1),
                  end: const Alignment(1, 0.4),
                  stops: const [0.42, 0.55, 0.72],
                  colors: [
                    const Color(0x0019BFFF),
                    const Color(0x4019BFFF),
                    palette.bg.withAlpha(0),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- motion

/// Shrinks the child a little while pressed (tactile feedback without a ripple).
class PressScale extends StatefulWidget {
  const PressScale({
    super.key,
    required this.child,
    this.enabled = true,
    this.scale = 0.97,
  });
  final Widget child;
  final bool enabled;
  final double scale;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _down = false;

  void _set(bool down) {
    if (!widget.enabled || down == _down) return;
    setState(() => _down = down);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: _down ? widget.scale : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

/// Fades and slides the child in once, after an optional delay (staggered lists).
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.offset = 14,
  });
  final Widget child;
  final Duration delay;
  final double offset;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 380),
  );
  late final Animation<double> _curve = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
  );
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.delay == Duration.zero) {
      _controller.forward();
    } else {
      _timer = Timer(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _curve,
      builder: (context, child) => Opacity(
        opacity: _curve.value,
        child: Transform.translate(
          offset: Offset(0, (1 - _curve.value) * widget.offset),
          child: child,
        ),
      ),
      child: widget.child,
    );
  }
}

/// Number that counts up from 0 to [value] the first time it is shown.
class CountUp extends StatelessWidget {
  const CountUp({
    super.key,
    required this.value,
    required this.style,
    this.suffix = '',
    this.decimals = 0,
  });
  final num value;
  final TextStyle style;
  final String suffix;
  final int decimals;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value.toDouble()),
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeOutCubic,
      builder: (context, v, _) =>
          Text('${v.toStringAsFixed(decimals)}$suffix', style: style),
    );
  }
}

/// Plays a short pulse (correct) or shake (wrong) whenever [trigger] changes to a new value.
class AnswerFeedback extends StatefulWidget {
  const AnswerFeedback({super.key, required this.child, required this.trigger});
  final Widget child;

  /// 'correct' pulses, 'wrong' shakes, anything else does nothing.
  final String trigger;

  @override
  State<AnswerFeedback> createState() => _AnswerFeedbackState();
}

class _AnswerFeedbackState extends State<AnswerFeedback>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void didUpdateWidget(AnswerFeedback oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.trigger != oldWidget.trigger &&
        (widget.trigger == 'correct' || widget.trigger == 'wrong')) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value;
        if (_controller.isDismissed || t == 1) return child!;
        if (widget.trigger == 'wrong') {
          final dx = math.sin(t * math.pi * 6) * 7 * (1 - t);
          return Transform.translate(offset: Offset(dx, 0), child: child);
        }
        final scale = 1 + math.sin(t * math.pi) * 0.035;
        return Transform.scale(scale: scale, child: child);
      },
      child: widget.child,
    );
  }
}
