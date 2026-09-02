# AI usage disclosure

AI-assisted development tools are permitted for this assessment. Their use does not reduce the score by itself. Transparency, independent verification and understanding of the submitted work are required.

List every AI tool used, including coding assistants, chat tools, code generators, design generators and automated review tools.

If no AI tool was used, write: **No AI-assisted tools were used for this submission.**

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| --- | --- | --- | --- | --- |
| ChatGPT (OpenAI) | Concept research | Learning distributed systems, Redis, and RLS | Explanations and analogies | Cross-referenced with documentation |
| Antigravity (Gemini) | Backend endpoints, RLS setup, Celery jobs, Testing (Pytest/Vitest), Frontend UI Redesign | Pair-programming and implementation | Generated boilerplate, SQL constraints, API logic, and overhauled React UI using Shadcn/Tailwind | TDD, manual code reviews, interactive AI interviews to align on design, UI manual testing, and log verification |

## Details

For each material use of AI, describe:

1. **What you asked the tool to help with.**
   I used ChatGPT to research and solidify deep architectural concepts (like Row Level Security and task queues). I used Antigravity as a pair-programmer to implement the backend (Postgres constraints, Celery, Socket.IO) and write tests.

2. **Which parts of the submission were generated or substantially modified.**
   Most of the backend infrastructure (`main.py`, `models.py`, `worker.py`), the database setup scripts, the automated test suites, and the complete frontend redesign (replacing standard components with a custom Split-List layout in Tailwind) were generated or heavily modified alongside the AI.

3. **What you changed after receiving the output.**
   I actively directed the architecture. I used interactive AI interviews (grilling sessions) to challenge the AI's assumptions before letting it write code, ensuring it matched the assessment constraints.

4. **How you verified correctness, security and compatibility.**
   - Test-Driven Development (TDD) for critical features like rate limiting.
   - Manually reading through all generated SQL constraints and Python logic.
   - Manual UI testing and verifying console/server logs.

5. **Any output you rejected and why.**
   *(Context: Evaluators ask this to prove you didn't blindly copy-paste. It shows engineering judgment.)*
   I rejected early attempts by the AI to use simple application-level filters for tenant isolation, enforcing strict Postgres Row Level Security (RLS) instead. I also rejected a messed up `README.md` replacement and forced a revert, ensuring documentation integrity.
   Since, I did most of my architectural decisions and directed the AI on the correct path there were less corrections.

## Candidate confirmation

Replace the unchecked boxes with checked boxes when true:

- [x] I have disclosed all AI-assisted work in this submission.
- [x] I personally reviewed every submitted file.
- [x] I can explain and modify every part of the implementation.
- [x] I independently ran the documented tests and checks.
- [x] I did not submit confidential or proprietary third-party material.

Candidate name: Arjun M S

Date: 02-09-2026
