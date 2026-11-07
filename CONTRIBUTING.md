# Contributing

## Architecture

- Keep Expo Router files thin; put screen implementations in `src/components`.
- Keep domain logic pure, independent of React, Expo, React Native, and external SDKs. Isolate external integrations behind app-owned interfaces when needed.
- Keep ownership clear; avoid giant barrels and compatibility re-exports.

## Code conventions

- Prefer function declarations for named components, utilities, and handlers. Use arrow functions for inline callbacks; prefer implicit returns for single expressions.
- Prefer absolute imports from `@/` over relative imports.
- Use `Component.Subcomponent` directly instead of destructuring compound components.
- Give hook return fields descriptive names and expose only what current callers need. Keep specialized queries close to their consumers.
- Treat more than five props as a composition signal. Prefer cohesive children or slots over prop drilling; avoid hiding props in a bag object.

## State and behavior

- Keep state minimal; derive values instead of duplicating them.
- Subscribe to reactive state in the narrowest component that consumes it.
- Validate external data at system boundaries.
- Handle loading, empty, and error states where applicable. Account for async cleanup, accessibility, and relevant iOS and Android differences.

## Dependencies and native projects

- Use pnpm and the project's scripts. Install libraries with `pnpm expo install <library>` to preserve Expo compatibility.
- Never edit `node_modules`.
- Manage generated `ios/` and `android/` projects through Expo configuration and config plugins rather than manual native edits.

## Verification

- Keep tests beside their subject.
- Run checks relevant to the change and exercise changed app behavior in a development build on an available simulator or device when practical.
- Report what was verified, remaining limitations, and pre-existing failures without expanding scope.
