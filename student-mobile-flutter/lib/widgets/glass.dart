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
          if (!palette.dark)
            IgnorePointer(
              child: LayoutBuilder(
                builder: (context, box) => Align(
                  // Ellipse centre at (450, 720) of 900×1600.
                  alignment: const Alignment(0, -0.1),
                  child: Container(
                    width: box.maxWidth * 1.16,
                    height: box.maxHeight * 0.625,
                    decoration: const BoxDecoration(
                      borderRadius: BorderRadius.all(Radius.elliptical(9999, 9999)),
                      gradient: RadialGradient(
                        colors: [Color(0xB3DCEBFF), Color(0x00DCEBFF)],
                      ),
                    ),
                  ),
                ),
              ),
            ),
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
    this.art = HeroArt.accuracy,
    this.border = true,
  });
  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;
  final double radius;

  /// Which of the owner's decorative backgrounds to paint.
  final HeroArt art;

  /// Cyan hairline (Home and Profile). The AI Tutor hero has none.
  final bool border;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      margin: margin,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        color: palette.heroStart,
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
      // Border drawn above the art so it stays even all the way round. Without the cyan
      // line, a faint white hairline keeps the edge crisp on both themes.
      foregroundDecoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: border ? const Color(0xB345CEFF) : const Color(0x26FFFFFF),
          width: border ? 1.2 : 1,
        ),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: IgnorePointer(child: CustomPaint(painter: HeroArtPainter(art))),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    );
  }
}

enum HeroArt { accuracy, tutor, profile }

/// The owner's decorative SVGs (accuracy-banner-bg, ai-tutor-hero-bg, profile-header-bg),
/// painted natively: diagonal navy gradient, optional soft circle, cyan wave and crest line.
/// The art is scaled to cover the card and anchored bottom-right so the wave always shows.
class HeroArtPainter extends CustomPainter {
  const HeroArtPainter(this.art);
  final HeroArt art;

  @override
  void paint(Canvas canvas, Size size) {
    final (double vw, double vh) = switch (art) {
      HeroArt.accuracy => (900, 300),
      HeroArt.tutor => (900, 330),
      HeroArt.profile => (900, 360),
    };
    final bg = switch (art) {
      HeroArt.accuracy => (const [Color(0xFF092B5A), Color(0xFF104A91), Color(0xFF123E9A)], const [0.0, 0.58, 1.0]),
      HeroArt.tutor => (const [Color(0xFF082B5A), Color(0xFF0756A8), Color(0xFF164FC0)], const [0.0, 0.55, 1.0]),
      HeroArt.profile => (const [Color(0xFF092B5A), Color(0xFF1055A5), Color(0xFF1747B9)], const [0.0, 0.55, 1.0]),
    };
    final full = Offset.zero & size;
    canvas.drawRect(
      full,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: bg.$1,
          stops: bg.$2,
        ).createShader(full),
    );

    final s = math.max(size.width / vw, size.height / vh);
    canvas.save();
    canvas.translate(size.width - vw * s, size.height - vh * s);
    canvas.scale(s);

    switch (art) {
      case HeroArt.accuracy:
        _wave(
          canvas,
          fill: Path()
            ..moveTo(320, 300)
            ..cubicTo(470, 255, 570, 260, 690, 220)
            ..cubicTo(790, 185, 840, 150, 900, 105)
            ..lineTo(900, 300)
            ..close(),
          fillFrom: 320,
          from: const Color(0x1A0A6BC7),
          to: const Color(0xD919BFFF),
          line: Path()
            ..moveTo(360, 300)
            ..cubicTo(510, 265, 620, 270, 735, 225)
            ..cubicTo(815, 195, 860, 165, 900, 135),
          lineColor: const Color(0xBF19BFFF),
          s: s,
        );
      case HeroArt.tutor:
        canvas.drawCircle(const Offset(780, 80), 170, Paint()..color = const Color(0x33168BFF));
        _wave(
          canvas,
          fill: Path()
            ..moveTo(520, 330)
            ..cubicTo(620, 270, 680, 300, 760, 230)
            ..cubicTo(820, 175, 860, 165, 900, 145)
            ..lineTo(900, 330)
            ..close(),
          fillFrom: 520,
          from: const Color(0x0D0875D8),
          to: const Color(0xD919BFFF),
          line: Path()
            ..moveTo(540, 330)
            ..cubicTo(650, 285, 700, 300, 785, 245)
            ..cubicTo(835, 213, 870, 190, 900, 180),
          lineColor: const Color(0xFF19BFFF),
          s: s,
        );
      case HeroArt.profile:
        canvas.drawCircle(const Offset(760, 70), 150, Paint()..color = const Color(0x291689E8));
        _wave(
          canvas,
          fill: Path()
            ..moveTo(430, 360)
            ..cubicTo(570, 300, 600, 230, 720, 205)
            ..cubicTo(790, 190, 850, 150, 900, 115)
            ..lineTo(900, 360)
            ..close(),
          fillFrom: 430,
          from: const Color(0x1A0879D8),
          to: const Color(0xB319BFFF),
          line: Path()
            ..moveTo(470, 360)
            ..cubicTo(610, 305, 660, 278, 760, 260)
            ..cubicTo(820, 248, 865, 220, 900, 190),
          lineColor: const Color(0xB319BFFF),
          s: s,
        );
    }
    canvas.restore();
  }

  void _wave(
    Canvas canvas, {
    required Path fill,
    required double fillFrom,
    required Color from,
    required Color to,
    required Path line,
    required Color lineColor,
    required double s,
  }) {
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(colors: [from, to])
            .createShader(Rect.fromLTRB(fillFrom, 0, 900, 1)),
    );
    canvas.drawPath(
      line,
      Paint()
        ..style = PaintingStyle.stroke
        // 3 units in the SVG; never thinner than ~1.4 px on screen.
        ..strokeWidth = math.max(3, 1.4 / s)
        ..color = lineColor,
    );
  }

  @override
  bool shouldRepaint(HeroArtPainter old) => old.art != art;
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
