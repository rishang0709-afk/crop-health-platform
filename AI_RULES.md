# AI CODING RULES

## General

1. Read PRODUCT.md before implementing features.
2. Read ARCHITECTURE.md before modifying architecture.
3. Follow the existing project structure.
4. Do not introduce unnecessary technologies.
5. Do not rewrite working code unnecessarily.

## Changes

6. Make the smallest change required.
7. Do not modify unrelated files.
8. Do not delete existing functionality without approval.
9. Do not change API contracts without approval.
10. Do not change database schema without approval.

## Dependencies

11. Do not install new packages without explaining why.
12. Prefer existing dependencies when possible.

## Security

13. Never hardcode API keys.
14. Never commit passwords or secrets.
15. Never expose environment variables to the frontend unless intended.

## Testing

16. Test every feature after implementation.
17. Run existing tests before and after major changes.
18. Verify frontend functionality in the browser.
19. Verify APIs independently.
20. Report failures honestly.

## Bug Fixing

21. Identify the root cause before changing code.
22. Make the smallest possible fix.
23. Do not rewrite entire files to fix small bugs.
24. Explain what caused the bug.
25. List files changed after fixing.

## Architecture

26. React handles UI.
27. Node/Express handles application logic.
28. MongoDB handles persistent data.
29. Python/FastAPI handles AI inference.
30. Keep AI service independent from the frontend.

## Important

Do not consider a feature complete merely because the code compiles.

A feature is complete only when it has been tested.