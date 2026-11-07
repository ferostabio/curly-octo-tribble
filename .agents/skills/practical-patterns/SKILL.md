---
name: practical-patterns
description: |
  Practical React Native patterns for list performance, state management, UI,
  design system conventions, and rendering. ACTIVATE when working on lists
  (FlashList, LegendList, ScrollView), state management (useState, derived state),
  images (expo-image), modals, safe areas, styling, fonts, or design system
  components in a React Native or Expo project.
---

# React Native Practical Patterns

Use these patterns where they fit the supplied project's conventions, dependencies, platform, and versions. Design-system examples are options, not a requirement to introduce wrappers or change an existing component API. Review findings need a concrete consequence beyond a preference in these references.

Read the relevant sub-skill for the topic at hand. All sub-skills are in `references/`.

## Sub-skills

| Sub-skill | When to use |
|-----------|-------------|
| `references/list-performance/SKILL.md` | Virtualized lists (FlashList, LegendList), ScrollView with mapped children, list re-renders, memoization, callbacks in lists, inline objects, item types for heterogeneous lists, image performance in lists |
| `references/state/SKILL.md` | useState patterns, dispatch updaters, stale closures, fallback state vs initialState, derived values, minimizing state variables |
| `references/design-system/SKILL.md` | Compound components, font loading with expo-font config plugin, importing from a design system folder |
| `references/ui-patterns/SKILL.md` | expo-image, measuring view dimensions, native modals vs JS bottom sheets, safe area handling, ScrollView contentInset, styling (borderCurve, gap, boxShadow, gradients, typography) |
| `references/rendering/SKILL.md` | Text strings outside Text component, runtime crashes from bare strings in View |
