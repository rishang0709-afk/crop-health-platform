# AI Coding Rules — Crop Health Platform

## 1. Purpose

This file defines mandatory rules for all AI coding agents working on this project.

The goal is to keep the project:

* Maintainable
* Testable
* Secure
* Understandable
* Consistent with the documented architecture
* Safe from uncontrolled AI-generated changes

---

# 2. Source of Truth

Before making implementation changes, read:

```text
Docs/Product.md
Docs/ARCHITECTURE.md
Docs/DATABASE.md
Docs/API.md
Docs/AI.md
```

These documents define the intended product and architecture.

If code conflicts with the documentation, do not silently redesign the system.

Explain the conflict and ask for a decision.

---

# 3. Work Incrementally

Never attempt to build the entire application in one task.

Use:

```text
One task
   ↓
One feature
   ↓
Implementation
   ↓
Testing
   ↓
Review
   ↓
Git checkpoint
   ↓
Next task
```

Large features must be broken into smaller independently testable tasks.

---

# 4. Planning Before Large Changes

Before implementing a task that affects multiple files or systems:

1. Inspect the existing code.
2. Explain the proposed approach.
3. List the files expected to change.
4. Identify possible risks.
5. Provide acceptance criteria.

Do not start large architectural changes without a plan.

---

# 5. Preserve Existing Functionality

Never modify working functionality unnecessarily.

Before changing existing code:

* Understand what it currently does.
* Identify dependencies.
* Preserve existing behavior unless the task explicitly requires changing it.

Avoid broad rewrites when a localized change is sufficient.

---

# 6. Smallest Change Principle

When fixing a bug:

> Make the smallest change that correctly fixes the root cause.

Do not rewrite an entire file to fix a small bug.

Do not refactor unrelated code during a bug fix unless explicitly requested.

---

# 7. Architecture Boundaries

Maintain these responsibilities:

```text
client/
→ User interface and client-side interaction

server/
→ Authentication, authorization, business logic,
  database operations and service orchestration

ai-service/
→ Machine-learning inference and AI processing

MongoDB
→ Persistent application data
```

---

# 8. Frontend Rules

The frontend must:

* Use React.
* Use the existing routing solution.
* Communicate with the backend through APIs.
* Keep UI components reasonably reusable.
* Handle loading states.
* Handle error states.
* Handle empty states.
* Avoid duplicating business logic unnecessarily.

The frontend must NOT:

* Connect directly to MongoDB.
* Contain private API keys.
* Directly access the internal AI service.
* Make authoritative authorization decisions.

---

# 9. Backend Rules

The backend is the trusted application layer.

It must:

* Validate incoming requests.
* Authenticate users.
* Authorize access.
* Validate resource ownership.
* Handle database operations.
* Communicate with external/internal services.
* Handle failures gracefully.
* Return consistent API responses.

Never trust client-supplied:

* User IDs
* Roles
* Ownership
* Privileged permissions

---

# 10. AI Service Rules

The AI service must remain independent.

It is responsible for:

* Image preprocessing
* Model inference
* Prediction
* Confidence
* Severity where supported
* Model/version metadata

It must NOT:

* Manage users.
* Manage authentication.
* Make database authorization decisions.
* Directly modify application data.
* Invent uncertain diagnoses.
* Pretend to have expert validation.

---

# 11. API Contract Rules

Before changing an API:

1. Check `Docs/API.md`.
2. Check frontend usage.
3. Check backend usage.
4. Check dependent services.
5. Explain the change.

If an API contract is intentionally changed:

* Update `Docs/API.md`.
* Update affected code.
* Test both success and failure cases.

Do not silently break existing API consumers.

---

# 12. Database Rules

Before changing database structure:

1. Check `Docs/DATABASE.md`.
2. Determine whether the change is actually required.
3. Consider existing data.
4. Explain the migration/data impact.
5. Update the documentation.

Do not create unnecessary collections.

Do not duplicate the same authoritative data in many places without a clear reason.

Never silently delete historical records.

---

# 13. Security Rules

Never:

* Hardcode API keys.
* Hardcode passwords.
* Commit secrets.
* Expose JWT secrets.
* Expose database credentials.
* Trust client-side authorization.
* Return password hashes.
* Log sensitive credentials.

Use environment variables for secrets.

---

# 14. Environment Variables

Actual secrets must be stored in `.env`.

The repository may contain:

```text
.env.example
```

but must not contain actual secret values.

Example:

```text
MONGODB_URI=
JWT_SECRET=
AI_SERVICE_URL=
WEATHER_API_KEY=
```

---

# 15. Dependencies

Do not install a new dependency automatically.

Before adding a dependency:

1. Determine whether an existing dependency can solve the problem.
2. Explain why the new dependency is needed.
3. Check whether it introduces unnecessary complexity.
4. Keep the dependency focused on the actual requirement.

Avoid unnecessary libraries.

---

# 16. Error Handling

Every important operation must account for failure.

Examples:

```text
Database unavailable
AI service unavailable
Weather service unavailable
Invalid image
Invalid request
Unauthorized request
Resource not found
Network timeout
```

The application should return useful errors rather than crashing.

---

# 17. AI Uncertainty

Never fabricate an AI answer.

If the AI is uncertain:

```text
Unknown / Uncertain
        ↓
Explain uncertainty
        ↓
Expert review / Additional information
```

Do not convert a low-confidence prediction into a fake high-confidence result.

---

# 18. Risk Engine Rules

Do not confuse:

```text
AI confidence
```

with:

```text
Overall crop-health risk
```

AI confidence answers:

> How confident is the model in its prediction?

Risk answers:

> How concerning is the crop-health situation given all available evidence?

Risk calculations belong to the backend risk engine.

Do not duplicate risk formulas across multiple frontend/backend modules.

---

# 19. Recommendation Rules

Recommendations must not be treated as unrestricted AI-generated medical-style prescriptions.

Recommendations should use controlled agricultural guidance.

Prefer:

```text
Monitoring
Cultural control
Mechanical control
Biological control
Expert referral
Appropriate chemical guidance
```

where applicable.

Never invent pesticide products, dosages or safety instructions.

---

# 20. Expert Validation Rules

Never overwrite the original AI prediction with an expert correction.

Store:

```text
Original AI result
+
Expert decision
+
Corrected diagnosis if applicable
+
Expert comments
```

This preserves traceability and supports future model evaluation.

---

# 21. Testing Rules

A feature is NOT complete merely because:

* The code compiles.
* The dev server starts.
* The AI says "done."

A feature is complete only after appropriate testing.

Test:

```text
Happy path
Failure path
Boundary cases
Authorization
Validation
Existing functionality
```

---

# 22. Frontend Testing

When modifying UI:

* Run the application.
* Check the affected screen in a browser.
* Test navigation.
* Check loading state.
* Check error state.
* Check empty state.
* Check basic responsive behavior where relevant.

Do not claim UI work is verified without actually checking it.

---

# 23. API Testing

Before connecting a new API to the frontend:

* Test the endpoint independently.
* Test valid input.
* Test invalid input.
* Test unauthorized requests.
* Test forbidden requests.
* Test missing resources.
* Test service failure where relevant.

---

# 24. Bug-Fixing Protocol

When a bug is reported:

### Step 1

Reproduce the bug if possible.

### Step 2

Inspect:

* Error message
* Relevant logs
* Request/response
* Stack trace
* Affected code

### Step 3

Identify the root cause.

### Step 4

Explain the root cause.

### Step 5

Apply the smallest reasonable fix.

### Step 6

Run the relevant tests.

### Step 7

Verify that the fix did not break existing functionality.

### Step 8

Report:

```text
Root cause:
Fix:
Files changed:
Tests run:
Result:
Remaining issues:
```

---

# 25. Do Not Guess

When information is unavailable:

> Say that it is unavailable.

Do not invent:

* API responses
* Database records
* AI predictions
* Weather values
* Expert confirmations
* Test results
* File contents

---

# 26. Do Not Pretend to Test

Never report:

> "Test passed"

unless the test was actually executed or otherwise verifiably completed.

Clearly distinguish:

```text
Tested
```

from:

```text
Not tested
```

---

# 27. File Modification Rules

Before modifying files:

* Inspect existing content.
* Avoid unnecessary formatting changes.
* Preserve existing conventions.

After modification, report:

```text
Files created:
Files modified:
Files deleted:
```

Never delete important files without explicit approval.

---

# 28. Git Rules

Do not make commits automatically unless explicitly instructed.

The developer should normally:

```text
Review changes
↓
Run tests
↓
Commit
↓
Push
```

Suggested checkpoint format:

```text
Feature:
"Initialize frontend"

Commit:
"Initialize React frontend"
```

Every major working milestone should have a Git checkpoint.

---

# 29. Working Checkpoint Rule

Before a large change, ensure the current project is committed or otherwise recoverable.

After completing a major feature:

```text
Test
 ↓
Review
 ↓
Git commit
```

This protects the project from failed AI changes.

---

# 30. Multi-Agent Rules

If multiple AI agents are used:

* Assign each agent a clearly defined task.
* Avoid simultaneous changes to the same files.
* Avoid conflicting architecture decisions.
* Review changes before integration.
* Run tests after merging.

Do not use multiple agents simply because parallelism is available.

---

# 31. Documentation Rules

When implementation meaningfully changes:

* Product behavior
* Architecture
* Database structure
* API contract
* AI behavior

the relevant documentation must be updated.

Documentation should describe the actual system, not an imagined future system.

---

# 32. Product Scope Rules

Respect the MVP scope in:

```text
Docs/Product.md
```

Do not introduce new major features just because they are technically interesting.

Examples of future features include:

* IoT sensors
* Smart pest traps
* Satellite imagery
* Voice assistant
* Advanced outbreak prediction
* Automated model retraining

These require explicit prioritization before implementation.

---

# 33. Performance Rules

Do not optimize prematurely.

First make the feature:

```text
Correct
Reliable
Tested
```

Then optimize when there is evidence that performance is a problem.

Avoid adding unnecessary caching, queues or infrastructure during the MVP.

---

# 34. Code Quality

Prefer:

* Clear names.
* Small functions.
* Simple control flow.
* Reusable components where appropriate.
* Explicit error handling.
* Minimal duplication.
* Consistent project conventions.

Avoid clever code that is difficult for a beginner developer to understand.

---

# 35. Beginner-Friendly Code

The project is being developed by developers who are still learning.

Prefer code that is:

* Readable.
* Well structured.
* Reasonably commented.
* Easy to debug.

Do not introduce advanced abstractions when a simpler implementation is sufficient.

---

# 36. Task Completion Report

After every substantial task, report:

```text
Task:
What was implemented.

Files created:
...

Files modified:
...

Dependencies added:
...

Tests run:
...

Verification:
...

Known issues:
...

Next suggested task:
...
```

---

# 37. Stop Conditions

Stop and report instead of continuing when:

* A required dependency is missing.
* Architecture is unclear.
* Documentation conflicts.
* A destructive change appears necessary.
* A required external service is unavailable.
* A test fails and the root cause is unclear.
* Credentials or secrets are required but unavailable.
* The requested feature conflicts with the documented architecture.

Do not make up a solution merely to continue.

---

# 38. Core Principle

The AI coding agent is an implementation assistant.

It is not the final authority on:

* Product scope
* Architecture
* Security
* Agricultural advice
* AI reliability
* Deployment decisions

Human developers remain responsible for approving important decisions.

---

# 39. Final Rule

Before every substantial implementation task, ask:

```text
What already works?
What exactly am I changing?
What must remain unchanged?
How will I verify the change?
What is the smallest safe implementation?
```

Then implement only what is required.

---

# 40. Project Philosophy

The project should evolve like this:

```text
PLAN
  ↓
IMPLEMENT
  ↓
TEST
  ↓
REVIEW
  ↓
COMMIT
  ↓
DOCUMENT
  ↓
NEXT FEATURE
```

Never:

```text
PLAN
  ↓
BUILD EVERYTHING
  ↓
HOPE
```
