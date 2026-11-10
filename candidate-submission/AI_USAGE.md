# AI usage disclosure

AI-assisted development tools are permitted for this assessment. Their use does not reduce the score by itself. Transparency, independent verification and understanding of the submitted work are required.

List every AI tool used, including coding assistants, chat tools, code generators, design generators and automated review tools.

If no AI tool was used, write: **No AI-assisted tools were used for this submission.**

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| --- | --- | --- | --- | --- |
| OpenAI Codex; exact model identifier not verified | `api/src/`, `prisma/`, `web/src/` | Implement and review assessment workflows, security, notifications, customer creation and demo identities | Generated and substantially modified application code and migrations | Assistant ran PostgreSQL integration tests, TypeScript checks, build and browser workflows; candidate review remains pending |
| OpenAI Codex | `tests/`, `playwright.config.ts`, `scripts/` | Regression coverage, local verification and data maintenance | Generated/modified tests and scripts | 18 integration tests passed, one real-Redis test skipped; six Chrome browser workflows passed with manual Windows test-server cleanup |
| OpenAI Codex | `README.md`, `docs/PROJECT_GUIDE.md`, `docs/REQUIREMENTS.md`, submission documents | Setup guidance, architecture, limitations and disclosure | Drafted and revised documentation | Checked commands against repository scripts and configuration; candidate confirmation remains pending |
| OpenAI Codex | `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `.github/workflows/verify.yml`, `.gitignore` | Local deployment, CI and exclusion of secrets/builds/local tool files | Generated/modified configuration | Source review; Docker execution, live Redis processing and remote CI were not verified in this environment |

## Details

Codex helped implement, review, simplify and document this project during the recorded sessions on 9–10 November 2026. Existing uncommitted code preceded some assistance; earlier authorship or AI usage is not established by this record. Tests exposed issues in duplicate-event comparison and UI workflows that were corrected. Verification used a separate local PostgreSQL database. The production build and strict TypeScript checks passed. The first browser attempt lacked bundled Chromium; installed Chrome was used instead. Docker and Redis were unavailable locally. No candidate confirmation below has been checked on the candidate's behalf. Any additional assistance must also be disclosed by the candidate.

For each material use of AI, describe:

1. What you asked the tool to help with.
2. Which parts of the submission were generated or substantially modified.
3. What you changed after receiving the output.
4. How you verified correctness, security and compatibility.
5. Any output you rejected and why.

## Candidate confirmation

Replace the unchecked boxes with checked boxes when true:

- [ ] I have disclosed all AI-assisted work in this submission.
- [ ] I personally reviewed every submitted file.
- [ ] I can explain and modify every part of the implementation.
- [ ] I independently ran the documented tests and checks.
- [ ] I did not submit confidential or proprietary third-party material.

Candidate name:

Date:
