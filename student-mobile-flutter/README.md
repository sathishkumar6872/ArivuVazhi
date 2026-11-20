# ArivuVazhi Student App (Flutter)

The student mobile app for ArivuVazhi. Replaces the React Native app in `../student-mobile` (frozen on branch `version-0.01`). Same backend API, same screens and flows.

## Requirements

- Flutter 3.50+ (Dart 3.14), on `PATH` (`C:\src\flutter\bin` on the dev machine)
- Android SDK with platform 37 and NDK 28.2.13676358 (`sdkmanager "ndk;28.2.13676358"`)
- JDK: the one bundled with Android Studio (`JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`)

## Run and build

```powershell
flutter pub get
flutter analyze

# Android emulator against a local API
flutter run --dart-define=API_URL=http://10.0.2.2:4000/api/v1

# Release APK against the hosted API (default API_URL)
flutter build apk --release
# → build/app/outputs/flutter-apk/app-release.apk
```

`API_URL` defaults to `https://arivu-backend-wzjh.onrender.com/api/v1` (see `lib/core/api.dart`). On a phone, a local API needs the laptop's LAN IP.

The release build is still signed with the debug key. To update installs of the old Expo app, sign with the EAS keystore; otherwise users must uninstall the old app first (same package id `in.arivuvazhi.student`).

## Code layout

| Path | What it holds |
|---|---|
| `lib/main.dart` | App root, session restore, tab shell with one stack per tab, Android back handling |
| `lib/core/api.dart` | HTTP client, token refresh (single-flight), secure storage, offline practice queue + sync, IST date helpers |
| `lib/core/app_state.dart` | Theme palettes (light / dark glass), app language and Tamil labels |
| `lib/core/nav.dart` | Routes and tab mapping |
| `lib/core/reminders.dart` | Local study reminder notifications (Android) |
| `lib/widgets/ui.dart` | Shared widgets: screen, header, buttons, inputs, cards, segment, rings, choices, dialogs, floating tab bar |
| `lib/widgets/glass.dart` | Backdrop glow, glass surfaces, hero card, motion helpers (press scale, fade-in, count-up, answer feedback) |
| `lib/widgets/rich_text.dart` | Tutor markdown renderer (also cleans LaTeX maths) |
| `lib/screens/*` | Auth/onboarding, home/planner/analytics, exams/practice/quiz/mock/PYQ, tutor, current affairs, profile/settings |

## Design

- **Light**: premium soft surfaces, gradient hero cards, glowing primary buttons.
- **Dark**: glassmorphism — translucent cards over an emerald glow, frosted tab bar and action bars.
- Brand: forest green (`#16A34A`), deep green (`#0B3D2E`); gold for rewards only (streak, achievements). Headings in Poppins (bundled, OFL).
- Motion is light and respects the system "reduce motion" setting where it loops.

## Behaviour worth knowing

- Android back: previous screen → Home tab → "press back again to exit".
- The keyboard is detected from window metrics (the Scaffold hides it from `MediaQuery`): the tab bar hides and chat scrolls to the latest message.
- Practice answers made offline are queued and synced on the next app start or resume.
