# AGENT RULES — كُتُبِي (owner-set, 2026-11-10)

## A) Scope
1. One task per message.
2. Work only inside the folder named in the task.
3. Never open C:\Users\Win10\wasla.
4. New branch per task.
5. Edit only the files the task names.
6. In-place only on current v25 project. No rebuilds/rewrites. Patch-style edits.

## B) Safety
7. Free only.
8. Never ask for or print tokens/passwords/secrets.
9. Never push or merge without explicit approval.
10. Never re-clone or delete folders unless the task says so.
11. Read-only tasks must not edit anything.
12. Never rename internal IDs/storage keys.
13. Never touch user data without a versioned migration + backup.
14. Do not deploy.

## C) Process (Windows)
15. Run commands sequentially, no background jobs or parallel processes (crashed git on this machine).
16. Read files with grep + line ranges, never whole files.
17. If a tool fails twice, stop and report instead of retrying.

## D) Honesty
18. Report only what a command output proved.
19. Never write "done" or a confidence % without the command and its output.
20. Do not guess names; grep several synonyms and check git log and STATE.md before saying something is missing.
21. Do not repeat checks after reporting.

## E) Code quality
22. Every async stage needs a timeout and an error state.
23. Every fix needs a guard test.
24. Keep tests/lint-layering.js at 63/63 or explain why not.
25. tests/geometry.test.js needs Chrome via CHROME_BIN.
26. Root-cause protocol: Reproduce → exact file:line → why → fix at source (no !important, no z-index hacks, no symptom hiding) → guard test failing before and passing after → grep same pattern elsewhere and fix it.
27. Targeted tests during a task; full suite once at end of wave. Build once per wave.
28. No screenshots unless a numeric assertion fails (then one, downscaled).
29. No new features outside the task list. Do not re-verify what STATE.md marks done.
30. Decide small questions yourself and log them in STATE.md; ask owner only if blocked.

## F) Reporting
31. End every task with a report <=10 lines (what changed, test results, what is left), then update STATE.md. Do not paste files or diffs in chat.

## G) Hard safety (added 2026-11-12, overrides rule 17 for file edits)
32. AGENT_RULES.md is human-owned. Never edit it.
33. STATE.md: change only the specific lines needed, never rewrite the whole file.
34. Before creating ANY file run git ls-files NAME. If it is listed, STOP and report. Never overwrite a tracked file.
35. If the edit tool fails ONCE: STOP and print the exact error. No shell, Python, PowerShell, heredoc or temp files to write files.
36. Never run git commit, reset, checkout, stash, restore, push, merge unless the task says so.
37. Use git --no-pager for every git command.
38. End of task: run git status -sb. Any changed file not named in the task must be reported and left untouched.
39. Start of session: grep AGENT_RULES.md and STATE.md by line ranges, run git status -sb, write one line Current task.
40. If you are about to run out of room or time: write the exact stopping point in STATE.md first.