# Milestone 2 — deliverables

This directory holds the planning, implementation, and verification artifacts for Milestone 2 (test scaffolding, CI, frontend ↔ backend wiring, and the three Hugging Face AI endpoints).

| File | What it is |
|------|------------|
| [`01-testing-strategy.md`](./01-testing-strategy.md) | Initial QA strategy tailored to the GIU Nexus stack (drove the test-scaffolding + CI + FE↔BE wiring PRs). |
| [`02-milestone-2-report.md`](./02-milestone-2-report.md) | Final Milestone 2 report — three Hugging Face endpoints (`/api/ai/skills/extract`, `/match`, `/summarize`), feature-branch / PR plan, live demo evidence with real model attribution. |
| [`03-hf-token-guide.md`](./03-hf-token-guide.md) | Long-form technical guide for regenerating an HF token, integrating it, demoing the endpoints, and pushing changes via the project's branch + PR workflow. |
| [`04-hf-token-quickstart.md`](./04-hf-token-quickstart.md) | Short-form quickstart of the same flow. |
| [`05-test-plan-pr3.md`](./05-test-plan-pr3.md) | Adversarial UI test plan for PR #3 (FE↔BE wiring: api.js, register/login, jobs board). |
| [`06-test-report-pr3.md`](./06-test-report-pr3.md) | Pass/fail report for the PR #3 plan. |
| [`07-test-plan-pr7.md`](./07-test-plan-pr7.md) | Adversarial test plan for the four pre-merge fixes on PR #7 (JWT-gated AI routes, demo-card removal, recruiter company field, motion.js fix). |
| [`08-test-report-pr7.md`](./08-test-report-pr7.md) | Pass/fail report for the PR #7 plan — 7/7 passed. |
| [`screenshots/`](./screenshots/) | Inline screenshots and the raw probe log from the PR #7 run. |

## Reproducing the PR #7 run

The Playwright runner that drove the verification lives at [`tests/e2e/run-tests.js`](../../tests/e2e/run-tests.js). See [`tests/e2e/README.md`](../../tests/e2e/README.md) for instructions.

## Recordings

Recordings (MP4) are intentionally not committed — they are large binaries that don't belong in a code repo. They live as PR attachments instead:
- Milestone 2 HF demo (visual proof that the three AI endpoints render real Hugging Face attribution in the UI)
- PR #7 pre-merge fixes E2E (annotated test_start / assertion markers for all 7 adversarial tests)
