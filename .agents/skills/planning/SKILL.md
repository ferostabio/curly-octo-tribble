---
name: planning
description: Turn requirements from a prompt, conversation, or supplied document into a concise implementation plan with independently verifiable slices. Use when implementation planning is requested, with or without a formal spec; no project-specific stack or issue tracker is assumed.
---

# Planning

Create a practical plan from the supplied requirements and relevant project context. Planning alone does not authorize implementation, commits, or publishing.

- Accept a document, pasted requirements, or the current conversation as the source. Identify the source and read it fully. Do not require a separate spec, tracker issue, glossary, or setup workflow.
- Inspect only the relevant project structure, dependencies, and existing behavior needed to make the plan feasible. Follow the project's actual conventions; do not assume a backend, service provider, localization system, native build workflow, or architecture.
- Preserve agreed scope and decisions. Distinguish requirements, proposed assumptions, tradeoffs, and unresolved questions. If a missing decision is not blocking, propose a reasonable default and continue.
- State the intended observable outcome, then divide implementation into ordered, small end-to-end slices. Each slice should deliver a usable behavior, include necessary integration, and name its dependencies, acceptance criteria, and proportionate verification.
- For a small task, a short sequence is enough. Avoid architecture ceremonies, speculative abstractions, mandatory commits per slice, and layers-only phases. Include prerequisites only when the requested behavior needs them.
- Address consequential failure paths and platform constraints without inventing extra features. When the request is a requirements critique, focus on contradictions, consequential ambiguities, and testable acceptance criteria rather than generating an implementation plan unless asked.
- Return the plan in the requested format. Save a file only when asked; use the requested destination, or `plans/<task-slug>.md` when a saved plan is requested without a destination. Preserve any completed steps when updating an existing plan.

A typical plan contains the outcome, assumptions/open decisions, ordered slices with acceptance criteria and verification, and key risks or tradeoffs. Scale detail to the task and time budget.
