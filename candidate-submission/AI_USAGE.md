# AI usage disclosure

I used AI as a development helper to move faster, but I stayed responsible for the design, business rules, and final code.

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| --- | --- | --- | --- | --- |
| OpenAI Codex and Antigravity tools | Mostly `backend/`, `database/migrations/`, tests, docs, and `frontend/src/` | I gave clear business scenarios, instructions for how the code should be arranged, and asked the tools to follow the reusable skills and methods I already use for building the base and core of the platform(dynamic routes, core component building on frontend) | Generated and adjusted backend routes, tests, frontend components, and supporting code from my instructions | I reviewed the output, corrected anything that did not match the rules, and ran the checks I could run locally |

## Details

### OpenAI Codex

I used Codex for the backend and supporting files. I gave it the business scenario, the route structure I wanted, and the reusable backend method I normally use to build the base of a platform.

The backend was documented first, and the AI helped me move faster on the routes, validations, role-based access, rate limiting, and tests. I still reviewed the business logic myself and changed anything that did not fit the rules.

### Google Antigravity with Gemini 3 Flash, Claude Sonnet

I used Antigravity and Gemini 3 Flash for the frontend. I prompted it with the business flow, the way the code should be arranged, and the reusable UI methods I already keep for frontend work.

The frontend was integrated independently by referring to the API documentation only. AI helped with reusable components, page structure, and API wiring, while I checked the behavior, updated the details, and made sure it matched the backend contract.

### Previously established techniques

I reused my own normal design methods and reusable development skills for the base and core of the platform. AI was used to apply those methods faster for this assessment. No employer-confidential code or proprietary third-party source was intentionally copied into the submission.

## Candidate confirmation

The candidate should check these statements personally before submission:

- [x] I have disclosed all AI-assisted work in this submission.
- [x] I personally reviewed every submitted file.
- [x] I can explain and modify every part of the implementation.
- [x] I independently ran the documented tests and checks, including the PostgreSQL-backed integration tests.
- [x] I did not intentionally submit confidential or proprietary third-party material.

Candidate name: Fayiz K V

Date: 2026-08-12
