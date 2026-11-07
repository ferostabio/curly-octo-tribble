---
name: code-review
description: Review a local Git diff for correctness, project conventions, and conformance to requirements supplied in a prompt, conversation, or document. Use for reviews of local changes; no issue tracker is needed.
---

# Code review

Produce an evidence-backed review of the requested Git changes. Review only unless fixes are requested. This skill has no issue-tracker dependency.

## Establish inputs

- Read the review instructions and applicable repository guidance. Accept requirements as a supplied document, pasted text, or agreed conversation context. Read the relevant document rather than inferring its content from its name.
- Use the user's comparison base when provided and verify that it resolves. Otherwise use the obvious task baseline if one exists; for current uncommitted work, compare against `HEAD`. State the scope used. Ask only if competing baselines would materially change the review.
- For branch work, inspect the merge-base diff to `HEAD`; include staged and unstaged changes and relevant untracked files when reviewing the current working tree. A committed-only review should remain committed-only. Handle a repository with no initial commit by reading the scoped files directly and explaining the missing baseline.
- If requirements are absent, review correctness and documented conventions and identify the conformance limit. Do not block on a missing spec or look for tracker configuration.

## Review

- Inspect changed code and enough surrounding callers, types, tests, and configuration to understand its behavior. Load only relevant technical skill references and check their applicability to installed versions.
- Examine runtime correctness, async behavior, error handling, data boundaries, platform behavior, security exposure, and performance where the change gives concrete reason to do so.
- Compare observable behavior with each relevant requirement. Identify missing or incorrect behavior and consequential scope changes. Separate explicit requirements from assumptions.
- Check documented project conventions separately from behavioral defects. Treat design heuristics and library preferences as judgments, not automatic failures. Do not recommend a dependency migration or architecture rewrite merely to satisfy a skill.
- Validate important claims through focused checks or a traced execution sequence. Distinguish observed behavior from untested hypotheses. Do not manufacture findings to fill a quota.

## Deliver

Follow the requested response format first. Otherwise give prioritized findings, each with a concise title, file/line location, triggering condition, consequence, and targeted fix. Cite the relevant requirement when alleging nonconformance.

Keep correctness findings and requirement gaps distinguishable; put optional design/style suggestions last. Close briefly with review scope, verification performed, and material uncertainty. If there are no supported findings, say so and note any coverage limits.
