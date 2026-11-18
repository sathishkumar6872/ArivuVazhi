import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/nav.dart';
import '../widgets/rich_text.dart';
import '../widgets/ui.dart';

const _starters = [
  ('Explain', Icons.menu_book, Accent.green, 'Explain this topic'),
  ('Practice', Icons.help, Accent.orange, 'Give one practice question'),
  ('Revise', Icons.refresh, Accent.purple, 'Revise the last point'),
];

class TutorScreen extends StatefulWidget {
  const TutorScreen({super.key, required this.user, required this.go});
  final Student user;
  final Go go;

  @override
  State<TutorScreen> createState() => _TutorScreenState();
}

class _TutorScreenState extends State<TutorScreen> with SafeState {
  List<dynamic>? items;
  String query = '';
  String scope = 'Current exam';
  String error = '';

  @override
  void initState() {
    super.initState();
    load('');
  }

  void load([String? q]) {
    final text = (q ?? query).trim();
    final params = <String, String>{
      if (text.isNotEmpty) 'q': text,
      if (scope == 'Current exam' && widget.user.primaryExamId.isNotEmpty) 'examId': widget.user.primaryExamId,
    };
    final search = params.isEmpty ? '' : '?${Uri(queryParameters: params).query}';
    api('/tutor/conversations$search').then((v) => safe(() => items = asList(v))).catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final go = widget.go;
    return AppScreen(children: [
      Header(title: context.t('AI Tutor')),
      if (error.isNotEmpty) AppBanner(message: error),
      Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: palette.primary, borderRadius: BorderRadius.circular(22)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: const Color(0x24FFFFFF), borderRadius: BorderRadius.circular(16)),
              child: Icon(Icons.auto_awesome, size: 24, color: palette.highlight),
            ),
            gap(12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx('ArivuVazhi AI Tutor', color: Colors.white, size: 17, weight: w800),
                gap(4),
                tx('Tamil, English or Tanglish. Grounded in approved notes.', color: palette.mint, lineHeight: 18, size: 13),
              ]),
            ),
          ]),
          gap(4),
          AppButton(label: 'Start chat', icon: Icons.arrow_forward, onPress: () => go(AppRoute('chat'))),
        ]),
      ),
      Padding(padding: const EdgeInsets.only(bottom: 10), child: tx('Quick prompts', color: palette.primary, weight: w800)),
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Pair([
          for (final (label, icon, accent, text) in _starters)
            Tap(
              label: text,
              onTap: () => go(AppRoute('chat', {'starter': text})),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
                decoration: BoxDecoration(
                  color: palette.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: palette.line),
                ),
                child: Column(children: [
                  ColorIcon(icon: icon, accent: accent, size: 40),
                  gap(6),
                  tx(label, color: palette.ink, size: 11, weight: w700, align: TextAlign.center),
                ]),
              ),
            ),
        ]),
      ),
      Segment(
        options: const ['Current exam', 'All history'],
        value: scope,
        onChange: (v) {
          setState(() => scope = v);
          load('');
        },
      ),
      Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 8),
        child: Row(children: [
          Expanded(
            child: PlainInput(
              value: query,
              onChanged: (v) => setState(() => query = v),
              placeholder: 'Search conversations',
              onSubmit: load,
            ),
          ),
          gap(8),
          IconBtn(label: 'Search', icon: Icons.search, onPress: load),
        ]),
      ),
      if (items == null && error.isEmpty) const Loading(),
      for (final item in items ?? const [])
        AppCard(
          onPress: () => go(AppRoute('chat', {'conversationId': item['id']})),
          child: Row(children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: palette.greenSoft, borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.chat_bubble_outline, size: 16, color: palette.primary),
            ),
            gap(12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                tx(str(item['title']), color: palette.ink, weight: w700, lines: 1),
                tx(str(item['preview']), color: palette.muted, lines: 2),
              ]),
            ),
            Icon(Icons.chevron_right, size: 18, color: palette.muted),
          ]),
        ),
      if (items != null && items!.isEmpty) const Empty(title: 'No conversations yet', body: 'Start a chat with one doubt.'),
    ]);
  }
}

class _Message {
  _Message(this.role, this.content, [this.sources = const []]);
  final String role;
  final String content;
  final List<String> sources;
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.user, this.conversationId, this.starter, required this.back});
  final Student user;
  final String? conversationId;
  final String? starter;
  final VoidCallback back;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with SafeState, WidgetsBindingObserver {
  final _scroll = ScrollController();
  final List<_Message> messages = [];
  late String thread = widget.conversationId ?? '';
  late String text = widget.starter ?? '';
  String error = '';
  bool sending = false;
  final Map<int, String> rated = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final id = widget.conversationId;
    if (id == null) return;
    api('/tutor/conversations/$id').then((conversation) {
      safe(() {
        thread = str(conversation['id']);
        messages
          ..clear()
          ..addAll(asList(conversation['messages']).map((m) => _Message(
                str(m['role']),
                str(m['content']),
                asList(m['sources']).map((s) => s is Map ? str(s['title']) : str(s)).toList(),
              )));
      });
      _scrollToEnd();
    }).catchError((err) => safe(() => error = errorText(err)));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> send() async {
    final message = text.trim();
    if (message.isEmpty || sending) return;
    setState(() {
      text = '';
      error = '';
      sending = true;
      messages.add(_Message('user', message));
    });
    _scrollToEnd();
    try {
      final data = await api('/tutor/messages', method: 'POST', body: {
        'message': message,
        if (thread.isNotEmpty) 'conversationId': thread,
        'examId': widget.user.primaryExamId,
      });
      safe(() {
        thread = str(data['conversationId']);
        messages.add(_Message(
          'assistant',
          str(data['reply']),
          asList(data['sources']).map((s) => s is Map ? str(s['title']) : str(s)).toList(),
        ));
      });
    } catch (err) {
      safe(() => error = errorText(err, 'Tutor is unavailable'));
    } finally {
      safe(() => sending = false);
      _scrollToEnd();
    }
  }

  double _lastInset = 0;

  /// Keep the latest message visible while the keyboard opens and the list shrinks.
  /// (Scaffold strips viewInsets from MediaQuery, so read the raw keyboard height from the View.)
  @override
  void didChangeMetrics() {
    if (!mounted) return;
    final inset = View.of(context).viewInsets.bottom;
    if (inset > _lastInset) _scrollToEnd();
    _lastInset = inset;
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppScreen(
      padded: false,
      body: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Header(title: 'Tutor', onBack: widget.back)),
        Expanded(
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              for (var i = 0; i < messages.length; i++) _bubble(context, palette, i, messages[i]),
              if (messages.isEmpty)
                const Empty(
                  title: 'Ask one doubt',
                  body: 'Try “Explain Article 14 in Tanglish” or “Give me one practice question on Fundamental Rights”.',
                ),
              if (error.isNotEmpty) AppBanner(message: error),
            ],
          ),
        ),
        // Text-only composer for now (image / document / voice deferred).
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: palette.surface, border: Border(top: BorderSide(color: palette.line))),
          child: Row(children: [
            Expanded(
              child: PlainInput(
                value: text,
                onChanged: (v) => setState(() => text = v),
                placeholder: 'Ask anything',
                onSubmit: send,
                onFocus: _scrollToEnd,
                height: 40,
                radius: 12,
                background: palette.bg,
                sendAction: true,
              ),
            ),
            gap(8),
            IconBtn(label: 'Send', icon: Icons.send, tone: Tone.primary, loading: sending, onPress: send),
          ]),
        ),
      ]),
    );
  }

  /// Copies a tutor reply as plain text (markdown symbols removed, links kept as "label (url)").
  Future<void> _copy(String content) async {
    final plain = content
        .replaceAllMapped(RegExp(r'\[([^\]]+)\]\((https?://[^)\s]+)\)'), (m) => '${m[1]} (${m[2]})')
        .replaceAllMapped(RegExp(r'\*\*([^*]+)\*\*'), (m) => m[1]!)
        .replaceAllMapped(RegExp(r'\*([^*\n]+)\*'), (m) => m[1]!)
        .replaceAllMapped(RegExp(r'`([^`\n]+)`'), (m) => m[1]!)
        .replaceAll(RegExp(r'^#{1,3}\s+', multiLine: true), '')
        .replaceAll(RegExp(r'^>\s?', multiLine: true), '')
        .trim();
    await Clipboard.setData(ClipboardData(text: plain));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Copied'), duration: Duration(seconds: 2)));
  }

  Widget _bubble(BuildContext context, Palette palette, int index, _Message message) {
    final user = message.role == 'user';
    final maxWidth = MediaQuery.of(context).size.width * 0.9 - 32;
    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Column(
            crossAxisAlignment: user ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: user ? palette.green : palette.surface,
                  border: user ? null : Border.all(color: palette.line),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(user ? 16 : 18),
                    topRight: Radius.circular(user ? 16 : 18),
                    bottomLeft: Radius.circular(user ? 16 : 6),
                    bottomRight: Radius.circular(user ? 6 : 16),
                  ),
                  boxShadow: user ? null : [BoxShadow(color: palette.shadow, blurRadius: 8, offset: const Offset(0, 2))],
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (user)
                    tx(message.content, color: palette.greenInk, lineHeight: 22, size: 15)
                  else
                    RichMarkdown(content: message.content),
                  if (message.sources.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: tx('Sources: ${message.sources.join(', ')}', color: palette.muted, size: 12, weight: w600),
                    ),
                ]),
              ),
              if (!user)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    IconBtn(label: 'Copy', icon: Icons.copy_rounded, onPress: () => _copy(message.content)),
                    gap(6),
                    IconBtn(
                      label: 'Helpful',
                      icon: rated[index] == 'Helpful' ? Icons.thumb_up : Icons.thumb_up_outlined,
                      tone: rated[index] == 'Helpful' ? Tone.primary : Tone.ghost,
                      disabled: rated[index] != null,
                      onPress: () => setState(() => rated[index] = 'Helpful'),
                    ),
                    gap(6),
                    IconBtn(
                      label: 'Needs review',
                      icon: rated[index] == 'Needs review' ? Icons.flag : Icons.outlined_flag,
                      tone: rated[index] == 'Needs review' ? Tone.danger : Tone.ghost,
                      disabled: rated[index] != null,
                      onPress: () async {
                        setState(() => rated[index] = 'Needs review');
                        final excerpt = message.content.length > 500 ? message.content.substring(0, 500) : message.content;
                        await api('/support/tickets', method: 'POST', body: {
                          'subject': 'AI Tutor answer review',
                          'body': 'Conversation ${thread.isNotEmpty ? thread : 'new'}: $excerpt',
                          'category': 'ai_feedback',
                        });
                      },
                    ),
                  ]),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
