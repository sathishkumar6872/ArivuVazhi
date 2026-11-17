/// In-app routes. Each tab keeps its own stack, like the React Native app.
enum TabName { home, exams, practice, tutor, profile }

class AppRoute {
  AppRoute(this.name, [Map<String, dynamic>? params]) : p = params ?? const {};

  final String name;
  final Map<String, dynamic> p;

  String param(String key) => p[key] == null ? '' : '${p[key]}';

  /// Optional string param: null when missing or empty.
  String? opt(String key) => param(key).isEmpty ? null : param(key);
}

const _rooted = {'home', 'exams', 'practice', 'tutor', 'profile'};

bool isRootRoute(AppRoute route) => _rooted.contains(route.name);

TabName tabOf(AppRoute route) {
  const exams = {'exams', 'exam', 'pyq', 'pyqPaper'};
  const practice = {'practice', 'topics', 'quiz', 'practiceResult', 'bookmarks'};
  const tutor = {'tutor', 'chat'};
  const profile = {'profile', 'editProfile', 'settings', 'notes', 'achievements', 'support'};
  if (exams.contains(route.name)) return TabName.exams;
  if (practice.contains(route.name)) return TabName.practice;
  if (tutor.contains(route.name)) return TabName.tutor;
  if (profile.contains(route.name)) return TabName.profile;
  return TabName.home;
}

AppRoute rootOf(TabName tab) => AppRoute(tab.name);

typedef Go = void Function(AppRoute route);
