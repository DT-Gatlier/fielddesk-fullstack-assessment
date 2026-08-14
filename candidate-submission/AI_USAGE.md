# AI usage disclosure

AI-assisted development tools are permitted for this assessment. Their use does not reduce the score by itself. Transparency, independent verification and understanding of the submitted work are required.

List every AI tool used, including coding assistants, chat tools, code generators, design generators and automated review tools.

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| --- | --- | --- | --- | --- |
| Antigravity Agent (Claude 3.5 Sonnet / Gemini) | `backend/src/*`, `frontend/src/*`, `tests/e2e/*` | Bug fixing, frontend UI implementation, and E2E test generation | Generated code patches and new test files | Ran all tests manually, inspected UI changes in browser |

## Details

For each material use of AI, describe:

1. **What you asked the tool to help with:** Fixing critical validation bugs, implementing responsive UI and missing frontend forms, and generating E2E test coverage.
2. **Which parts of the submission were generated or substantially modified:** `tests/e2e/suites/*`, `frontend/src/index.css`, `frontend/src/pages/*`, `backend/src/utils/csvExport.ts`, `backend/src/middleware/validate.ts`.
3. **What you changed after receiving the output:** Adjusted test credentials to properly match the actual seed data after noticing mismatches in the AI-generated documentation.
4. **How you verified correctness, security and compatibility:** Ran `npm run test:e2e`, manually reviewed code diffs against assessment requirements.
5. **Any output you rejected and why:** Rejected initially incorrect seed credential assumptions.

## Candidate confirmation

Replace the unchecked boxes with checked boxes when true:

- [x] I have disclosed all AI-assisted work in this submission.
- [x] I personally reviewed every submitted file.
- [x] I can explain and modify every part of the implementation.
- [x] I independently ran the documented tests and checks.
- [x] I did not submit confidential or proprietary third-party material.

Candidate name: Sreehari A H

Date: 14 August 2026
