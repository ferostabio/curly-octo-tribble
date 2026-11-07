# Bowery

Document-sync development demo built with Expo SDK 58, React Native, TypeScript, and Expo Router. iOS bundle identifier and Android package: `com.expo.bowery`.

## Run

Requires Node.js 22.22+, npm 11.19.1, and Xcode or Android Studio.

```sh
npm ci
npm run ios       # iOS simulator
npm run android   # Android emulator
```

Use `npm start` for subsequent sessions. Native dependency changes require a new development build; Expo Go is unsupported because the queue uses SQLCipher.

The project enforces a seven-day minimum package release age through `.npmrc`. Keep `package-lock.json` committed and use `npm ci` for repeatable installs.

The iOS configuration builds `expo-modules-core` from source as a workaround for a missing precompiled-framework header. The app runs with this override; its necessity has not been verified with a comparison build. Native projects are generated through Expo.

## Demo behavior

Authentication, uploads, and confirmation are mocked; nothing is sent to a server. Use synthetic documents only.

1. Launch the app; sync starts idle.
2. Tap **Initialize mock session** to process saved items and retry every 30 seconds while the screen is mounted.
3. Tap **Queue sample document** to create a synthetic file, persist it, and trigger sync.

The queue uses encrypted SQLite with atomic per-document writes and its key in SecureStore. Uploads do not block enqueueing. Failures remain visible, and persisted acknowledgements allow local reconciliation without another upload.

## Checks

```sh
npm test
npm run typecheck
npm run lint
```

Tests cover the processor, hook, and screen, retaining SecureStore key validation and using in-memory SQLite transactions. They do not verify native encryption or real backend behavior.

## AI transcript

[TRANSCRIPT.md](TRANSCRIPT.md) follows the implementation. It shows how findings were challenged, fixes verified, and a regression reverted.

## Development skills

The project includes 14 AI coding skills combining general engineering practices with framework guidance.

| Source | Coverage |
| --- | --- |
| Callstack | React Native performance and component testing |
| Expo | Routing, native UI, animations, and SDK upgrades |
| Cursor | TypeScript modeling, boundary validation, and structural safeguards |
| Matt Pocock | Module design and testability |
| Custom | Code review, planning, and state/rendering/UI patterns |

Project conventions, installed versions, and task requirements guide their application.
