import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import 'ui.dart';

enum RichTone { ink, onGreen }

String _cleanHref(String href) {
  final uri = Uri.tryParse(href);
  if (uri == null) return href;
  const drop = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'};
  final params = Map<String, String>.from(uri.queryParameters)..removeWhere((key, _) => drop.contains(key));
  return uri.replace(queryParameters: params.isEmpty ? null : params).toString();
}

final _inlinePattern = RegExp(r'(\[[^\]]+\]\((https?://[^)\s]+)\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)');
final _mdLink = RegExp(r'^\[([^\]]+)\]\((https?://[^)\s]+)\)$');

/// Renders **bold**, *italic*, `code` and [links](https://…) inside one line.
class _InlineText extends StatelessWidget {
  const _InlineText({required this.text, required this.tone, this.size = 15, this.weight, this.italic = false});
  final String text;
  final RichTone tone;
  final double size;
  final FontWeight? weight;
  final bool italic;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = tone == RichTone.onGreen ? palette.greenInk : palette.ink;
    final linkColor = tone == RichTone.onGreen ? palette.mint : palette.green;
    final mutedBg = tone == RichTone.onGreen ? const Color(0x2EFFFFFF) : palette.greenSoft;
    final spans = <InlineSpan>[];
    var last = 0;
    for (final match in _inlinePattern.allMatches(text)) {
      if (match.start > last) spans.add(TextSpan(text: text.substring(last, match.start)));
      final token = match.group(0)!;
      final link = _mdLink.firstMatch(token);
      if (link != null) {
        final href = _cleanHref(link.group(2)!);
        spans.add(TextSpan(
          text: link.group(1),
          style: TextStyle(color: linkColor, fontWeight: w700, decoration: TextDecoration.underline),
          recognizer: TapGestureRecognizer()
            ..onTap = () => launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication).catchError((_) => false),
        ));
      } else if (token.startsWith('**') && token.endsWith('**')) {
        spans.add(TextSpan(text: token.substring(2, token.length - 2), style: const TextStyle(fontWeight: w800)));
      } else if (token.startsWith('`') && token.endsWith('`')) {
        spans.add(TextSpan(
          text: token.substring(1, token.length - 1),
          style: TextStyle(fontFamily: 'monospace', backgroundColor: mutedBg, fontSize: 13),
        ));
      } else if (token.startsWith('*') && token.endsWith('*')) {
        spans.add(TextSpan(text: token.substring(1, token.length - 1), style: const TextStyle(fontStyle: FontStyle.italic)));
      } else {
        spans.add(TextSpan(text: token));
      }
      last = match.end;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return Text.rich(
      TextSpan(children: spans),
      style: TextStyle(
        color: color,
        fontSize: size,
        height: (size + 7) / size,
        fontWeight: weight,
        fontStyle: italic ? FontStyle.italic : null,
      ),
    );
  }
}

/// Renders tutor markdown: **bold**, *italic*, `code`, lists, headings, quotes.
class RichMarkdown extends StatelessWidget {
  const RichMarkdown({super.key, required this.content, this.tone = RichTone.ink});
  final String content;
  final RichTone tone;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final accent = tone == RichTone.onGreen ? palette.mint : palette.green;
    final lines = content.replaceAll('\r\n', '\n').split('\n');
    final blocks = <Widget>[];
    for (final raw in lines) {
      final trimmed = raw.trim();
      if (blocks.isNotEmpty) blocks.add(gap(6));
      if (trimmed.isEmpty) {
        blocks.add(const SizedBox(height: 4));
        continue;
      }
      final heading = RegExp(r'^(#{1,3})\s+(.+)$').firstMatch(trimmed);
      if (heading != null) {
        final level = heading.group(1)!.length;
        final size = level == 1 ? 18.0 : (level == 2 ? 16.0 : 15.0);
        blocks.add(Padding(
          padding: EdgeInsets.only(top: blocks.length > 1 ? 4 : 0),
          child: _InlineText(text: heading.group(2)!, tone: tone, size: size, weight: w800),
        ));
        continue;
      }
      final bullet = RegExp(r'^[-*•]\s+(.+)$').firstMatch(trimmed);
      if (bullet != null) {
        blocks.add(_listRow(tx('•', color: accent, weight: w800, lineHeight: 22), bullet.group(1)!));
        continue;
      }
      final numbered = RegExp(r'^(\d+)[.)]\s+(.+)$').firstMatch(trimmed);
      if (numbered != null) {
        blocks.add(_listRow(
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 18),
            child: tx('${numbered.group(1)}.', color: accent, weight: w800, lineHeight: 22),
          ),
          numbered.group(2)!,
        ));
        continue;
      }
      final quote = RegExp(r'^>\s?(.+)$').firstMatch(trimmed);
      if (quote != null) {
        blocks.add(Container(
          padding: const EdgeInsets.only(left: 10, top: 2, bottom: 2),
          decoration: BoxDecoration(
            color: tone == RichTone.onGreen ? const Color(0x14FFFFFF) : palette.greenSoft,
            borderRadius: BorderRadius.circular(6),
            border: Border(left: BorderSide(color: accent, width: 3)),
          ),
          child: _InlineText(text: quote.group(1)!, tone: tone, italic: true),
        ));
        continue;
      }
      blocks.add(_InlineText(text: trimmed, tone: tone));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: blocks);
  }

  Widget _listRow(Widget marker, String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [marker, gap(8), Expanded(child: _InlineText(text: text, tone: tone))],
      ),
    );
  }
}
