@AGENTS.md

<!--
以下は、ユーザーから提供されたPDF「CLAUDE.md — Development and Design Rules」の内容を
そのまま組み込んだものです（取り込み日: 2026-09-15）。原文（英語）の規範的な文言
（must/should/do not等）の意味を変えないよう、翻訳せずそのまま採用しています。
このプロジェクトでの今後の開発は、以下のルールに従ってください。
-->

# CLAUDE.md — Development and Design Rules

## 1. Project Purpose

This project is a web application for improving the management and operational efficiency of road
disaster-prevention records ("防災カルテ").

Claude must not act only as a code generator. Claude should also act as a development and design
assistant.

When implementing a feature, Claude should consider not only whether the requested implementation
works, but also whether the implementation is appropriate for this project's requirements, architecture,
maintainability, performance, security, and future use.

The user may know what outcome they want without knowing the best technical implementation.

When the user specifies a desired outcome but does not specify the implementation method, Claude
should consider and propose appropriate implementation methods rather than assuming a particular
technical approach.

## 2. General Development Process

For a normal feature, use the following process:

1. Inspect the existing implementation.
2. Understand the requirement and its relationship to existing functionality.
3. Determine whether the requirement can be implemented using existing patterns and
   components.
4. Plan the implementation.
5. Implement the feature.
6. Test the implementation.
7. Check the actual UI and behavior.
8. Fix problems found during verification.
9. Confirm that the implementation satisfies the completion criteria.

Do not consider a task complete merely because the code has been written.

The implementation must satisfy the actual user-facing requirements.

## 3. Technology Selection

### 3.1 Prefer Existing Technology and Patterns

Prefer the existing architecture, components, libraries, and patterns when they can reasonably satisfy the
requirement.

Do not introduce a new library, service, architecture, or abstraction merely because it is technically
possible or convenient.

Before introducing a new technology, consider:

- Why the existing approach is insufficient
- Benefits of the new approach
- Disadvantages and risks
- Maintenance implications
- Security implications
- Performance implications
- Cost
- External dependencies
- Additional complexity
- Impact on existing functionality

A technically possible solution is not necessarily an appropriate solution.

## 4. Technology Exploration Gate

Do not immediately implement a feature when the correct technical approach is uncertain.

A technology exploration phase is required when one or more of the following conditions apply:

- Multiple substantially different implementation approaches exist.
- Choosing the wrong approach would make later changes expensive.
- A new external library or service must be selected.
- A new architecture or major data model is being considered.
- The feature involves Excel, PDF, images, SVG, GIS, document conversion, or other specialized
  formats.
- Authentication or authorization architecture is involved.
- File storage or file processing architecture is involved.
- Performance characteristics are uncertain.
- Browser compatibility or rendering behavior is uncertain.
- The feature introduces a significant dependency on an external system.
- A technical assumption has not been validated.
- The implementation method itself is part of the problem to be solved.

The amount of code required is NOT the primary criterion.

The primary criteria are:

1. Technical uncertainty
2. Cost of changing the decision later
3. Impact on the overall system

A small feature with high technical uncertainty should trigger exploration.

A large feature that follows an established project pattern may not require extensive exploration.

## 5. Technology Exploration Process

When the Technology Exploration Gate is triggered:

### Step 1: Define the problem

Clearly identify:

- What the user actually needs
- What must be preserved
- What is flexible
- What constraints exist
- What constitutes success

Do not assume that the user's suggested implementation method is necessarily the best method unless
the user explicitly requires it.

### Step 2: Identify candidate approaches

Identify the realistically viable implementation approaches.

Normally consider at least three substantially different approaches when three or more reasonable
approaches exist.

Do not artificially include obviously unsuitable approaches merely to reach a target number.

### Step 3: Compare the approaches

Evaluate each candidate using weighted criteria appropriate to the problem.

Possible criteria include:

- Requirement fit
- UI/UX
- Fidelity to the original format or system
- Implementation complexity
- Maintainability
- Performance
- Security
- Scalability
- Extensibility
- Integration with the existing system
- Operational complexity
- Cost
- External dependencies

The criteria and their weights must be adapted to the actual problem.

Do not use the same weights for every technical decision.

## 6. Scoring and Confidence

Use a 1–5 score for each evaluation criterion.

Use weighted scoring when the criteria have different levels of importance.

The total score should represent the relative suitability of each candidate for THIS project, not a universal
ranking of technologies.

Every significant score must have a short explanation.

In addition to the score, assign a confidence level to the assessment.

Distinguish between:

- Verified by a working PoC
- Verified using official documentation or reliable technical documentation
- Based on established technical knowledge
- Inferred or estimated
- Not yet verified

Do not treat an unverified assumption as an established fact.

For example:

    HTML-based rendering: 4.2/5, confidence 90%
    SVG-based rendering: 4.5/5, confidence 55%

A higher score with substantially lower confidence does not automatically mean that the approach
should be selected.

When confidence is low and the decision is important, recommend a PoC.

## 7. Recommendation and User Decision

Claude must NOT automatically select and implement the highest-scoring approach when the decision
involves meaningful trade-offs.

After exploration, present the user with:

1. The recommended top approach
2. The second-best approach
3. The key reasons for the ranking
4. The important trade-offs
5. Confidence levels
6. Any unresolved uncertainties
7. Whether a PoC is recommended

The user makes the final decision between the top two approaches.

Do not overwhelm the user with every discarded option unless the discarded options contain
information that is important for the decision.

The purpose of the exploration phase is to reduce the user's decision burden, not to hide the decision
from the user.

## 8. Proof of Concept (PoC)

A PoC should be used when theoretical comparison is insufficient to determine the best approach.

A PoC is particularly appropriate when:

- Visual fidelity is important.
- Excel/PDF/image conversion is involved.
- Browser rendering behavior is uncertain.
- A third-party library's actual behavior is uncertain.
- Performance is uncertain.
- Compatibility is uncertain.
- The cost of choosing the wrong architecture is high.

A PoC should be small and focused.

The purpose of a PoC is to answer a specific technical question and compare approaches.

Do not turn a PoC into a full production implementation before the technical approach has been
selected.

When possible, test the PoC using actual project data or data representative of real-world usage.

If a PoC demonstrates that an approach does not meet the requirements, do not continue optimizing that
approach merely because implementation has already started.

## 9. Subagents

Subagents should be used when independent investigation provides meaningful value.

Do NOT use subagents simply because they are available.

Subagents are particularly useful when:

- Several independent technical approaches need to be investigated.
- Independent evaluations may reduce confirmation bias.
- A security review should be separated from implementation reasoning.
- Performance and architecture should be evaluated independently.
- A large technical investigation can be divided into independent tasks.
- Multiple approaches can be prototyped or researched in parallel.

For example:

- Agent A: HTML/CSS approach
- Agent B: PDF-based approach
- Agent C: SVG/vector approach
- Agent D: image-based approach

The main agent should then compare the results using the project's evaluation criteria.

When the problem is simple enough for one agent to evaluate reliably, do not create unnecessary
subagents.

## 10. Excel and Document Rendering

When the requirement involves displaying an Excel document in the web application, distinguish
between:

1. Displaying the Excel file itself
2. Reproducing the visual appearance of the Excel document in a web UI

If the requirement is to reproduce the appearance of Excel as closely as possible, do not assume that
converting Excel directly to HTML is the correct solution.

Consider approaches such as:

- HTML/CSS reconstruction
- Generating HTML from Excel data
- PDF conversion
- SVG or other vector representations
- Raster image rendering
- Excel-compatible rendering libraries
- Hybrid approaches combining HTML, SVG, images, or PDF

Evaluate at least the following when relevant:

- Cell merging
- Row heights
- Column widths
- Text size and placement
- Text wrapping
- Borders
- Backgrounds
- Images and shapes
- Page layout
- Fonts
- Printing appearance
- Zoom behavior
- Browser compatibility
- Searchability
- Editability
- Performance

Do not treat "converting everything to HTML" as an objective in itself.

If some parts of a document are difficult to reproduce faithfully as HTML, a hybrid implementation may
be preferable.

For example:

- Interactive and structured information → HTML/CSS
- Highly specialized visual content → SVG/image/PDF

Image rendering is not automatically considered a bad or temporary solution.

It should be evaluated against the actual requirements.

## 11. Avoid Premature Commitment to a Technical Approach

When a technical approach has not been validated, describe it as a hypothesis.

For example:

> "EMF may provide good visual fidelity, but this has not yet been validated with the actual
> Excel files."

Do not treat an initially proposed approach as the project's permanent architecture until it has been
validated.

If implementation results contradict the original assumption, reconsider the approach rather than merely
adding increasingly complex workarounds.

## 12. Requirements Before Implementation

For a new feature, identify the following before implementation when appropriate:

**Purpose** — What business or operational problem does this feature solve?

**Users** — Who will use it and in what situation?

**Inputs** — What information is entered, selected, uploaded, or retrieved?

**Outputs** — What should the user see or receive?

**Data** — What existing data is used? What new data must be stored?

**UI** — Where does the feature appear? How does the user reach it?

**Permissions** — Who can view, create, edit, or delete the data?

**Error Handling** — What should happen when an operation fails?

**Existing System Impact** — Could the change affect existing data, screens, APIs, or workflows?

**Completion Criteria** — How can the user verify that the feature is complete?

## 13. Completion Criteria

Do not define completion as "the code has been implemented."

Completion should be defined in terms that can be verified from the user's perspective.

Examples:

- A user can search for a record.
- The correct information is displayed.
- A specified layout is reproduced within an acceptable tolerance.
- Existing records remain intact.
- Existing functionality continues to work.
- The feature works on supported screen sizes.
- Processing completes within an acceptable time.
- Unauthorized users cannot access protected data.

If the implementation does not satisfy the completion criteria, continue investigating and fixing the
implementation.

## 14. Performance

Do not perform speculative performance optimization based only on code inspection.

When performance is a concern:

1. Measure the current behavior.
2. Identify the actual bottleneck.
3. Determine the likely cause.
4. Estimate the expected benefit of a change.
5. Implement the change.
6. Measure again under comparable conditions.

Pay particular attention to:

- Database round trips
- N+1 queries
- Unnecessary database queries
- API calls
- Data transfer size
- Image size
- Rendering cost
- Unnecessary React re-renders
- Caching opportunities
- Database indexes

Prefer measured improvements over theoretical improvements.

Do not significantly increase code complexity for a negligible performance improvement.

## 15. Security

Security must not rely solely on the assumptions made during implementation.

Important functionality should be reviewed independently from the implementation reasoning.

Pay particular attention to:

- Authentication
- Authorization
- IDOR / unauthorized access to other records
- Direct API access bypassing UI restrictions
- File uploads
- File storage
- File names and paths
- XSS
- CSRF
- SQL injection
- Secret exposure
- Database permissions
- Storage permissions
- External service access

For security-sensitive changes, perform a separate security review after implementation.

Do not assume that code is secure simply because Claude generated and reviewed it.

## 16. UI and UX

Evaluate UI changes from the perspective of actual users rather than code structure alone.

The application should support both:

- Desktop use
- Field use on smartphones

Important workflows should remain straightforward, including:

Search → Map/List → Record detail → Record-specific information → Historical comparison → Editing

The system should support tracking the same record across different years where applicable.

Prefer reusing existing components and UI patterns rather than creating duplicate implementations of
the same concept.

## 17. Data Model and Scope

Avoid unnecessary expansion of the data model.

Do not introduce broad abstractions merely because they may be useful someday.

When considering a data-model expansion, distinguish between:

- Required for the current business requirement
- Likely to be required in the near future
- Merely theoretically reusable

Do not implement the third category unless there is a strong architectural reason.

At the same time, recognize that some architectural decisions are expensive to change later. Those
decisions should go through the Technology Exploration Gate.

## 18. Avoid Overengineering

Avoid unnecessary:

- Abstractions
- Generalization
- Shared layers
- Design patterns
- Dependencies
- Architecture changes
- Configuration complexity

Prefer the simplest architecture that reliably satisfies the requirements.

However, simplicity does not mean choosing a short-term implementation that creates significant future
migration costs.

When simplicity and long-term architectural safety conflict, explicitly identify the trade-off.

## 19. Autonomous Decisions

Claude may make decisions autonomously when they are within the existing architecture and do not
materially change project behavior.

Examples:

- Component organization
- CSS implementation details
- Variable names
- Function names
- Minor refactoring
- Adding tests
- Obvious bug fixes
- Minor performance improvements

## 20. Decisions Requiring User Approval

Ask the user for approval before making decisions that materially affect the system, including:

- Major database schema changes
- Data migration
- Data deletion
- Major authentication or authorization changes
- Major UI/UX changes
- Production-impacting architectural changes
- New paid services
- New significant external dependencies
- Major architecture changes
- Decisions where multiple approaches have meaningful business trade-offs

Before asking the user, Claude should first explain the available options and their major trade-offs.

Do not ask the user to make a technical decision without first doing the technical investigation that
Claude can reasonably perform.

## 21. Primary Sources and Domain Rules

When the system depends on domain-specific classifications, regulations, official terminology, or
government documents, use authoritative source material whenever available.

Do not infer official classifications when reliable primary sources are available.

If the user provides an authoritative document or source, treat it as the source of truth for that specific
requirement unless the user instructs otherwise.

If there is ambiguity or conflict between sources, identify the conflict and ask the user rather than silently
choosing an interpretation.

## 22. Development Loop

Use one of the following development loops depending on the task.

**Standard Feature**

Inspect → Understand requirements → Plan → Implement → Test → Verify UI/behavior → Fix →
Complete

**Technically Uncertain Feature**

Requirements → Technology exploration → Candidate comparison → Optional subagent investigation →
Optional PoC → Scoring + confidence assessment → Present top two approaches → User selects the
approach → Implement → Test → Verify → Performance review if relevant → Security review if relevant →
Complete

**Important Principle**

Do not spend significant implementation effort before resolving high-impact technical uncertainty.

The goal is to move uncertainty earlier in the development process, where it is cheaper to change.

## 23. Final Report

At the end of a substantial task, briefly report:

- What was changed
- Important design decisions
- Tests performed
- Important verification results
- Performance measurements, if relevant
- Security checks, if relevant
- Remaining limitations or uncertainties

If a technology exploration phase was performed, also record:

- Candidate approaches considered
- Selected approach
- Main reason for selection
- Important rejected alternatives
- PoC results, if any
- Remaining uncertainty

<!--
以下（24章）は上記PDF原文には含まれない、本プロジェクトでの実際の調査経験
（2026-09-17、様式Ａ画像の白紙化不具合の根本原因調査）を踏まえて追加した
プロジェクト固有のルールです。他章と文体・規範レベルを揃えるため英語で
記述しています。
-->

## 24. Diagnosing Pipeline / Conversion Bugs

This section applies when a bug occurs inside a multi-stage pipeline that converts, renders, or
transforms data through one or more external tools or libraries (for example: Excel → PDF → image
conversion, document rendering, format conversion, or any pipeline built on LibreOffice, ImageMagick,
a headless browser, or a similar external binary).

Signals that this section applies:

- The bug affects only some inputs and not others, with no obvious difference in the request itself.
- The bug is inside a pipeline with multiple sequential stages (e.g. convert → rasterize → crop).
- The suspected cause is an external tool or library rather than this project's own code.
- A plausible-sounding explanation exists but has not been tested causally.

Do not jump directly to a fix based on a plausible-sounding theory. A theory that merely correlates with
the symptom (e.g. "this file uses a different font" or "this value differs between the working and broken
file") is not sufficient. Follow this process instead:

### Step 1: Separate the pipeline into stages

Identify every stage the data passes through, and capture the intermediate output at each stage
boundary (not just the final output). Determine at which specific stage the bug first appears by
inspecting the intermediate output directly, rather than inferring it from the final result.

### Step 2: Compare a known-good input against a known-bad input, stage by stage

Compare the two inputs' structure and the intermediate output they produce at each stage. Do not stop
at the first difference found — record every difference, and do not assume the first or most visible
difference is the cause.

### Step 3: Build a minimal reproduction

Starting from the broken input, remove or simplify one element at a time (content, formatting, objects,
settings) while re-testing after each change, to isolate the smallest change that still reproduces the bug.
Prefer this over reasoning about the full, complex real-world file.

### Step 4: Treat each candidate cause as a hypothesis to be falsified, not confirmed

A difference between the good and bad input is not, by itself, evidence that it is the cause. Only a
controlled experiment counts as evidence: change one candidate factor, re-run the pipeline, and observe
whether the symptom changes.

- If changing the candidate factor does not change the symptom, record this explicitly as a refutation.
  Do not treat a lack of change as an inconclusive result to be quietly dropped — state it as a ruled-out
  cause and move to the next candidate.
- If changing the candidate factor does change the symptom, treat it as a confirmed causal factor, not
  merely a correlated one.
- Do not declare an external tool or library itself as the root cause until configuration-level and
  data-level causes have been ruled out through this same process. Once an external tool is suspected,
  confirm it causally (for example: does the bug reproduce across multiple versions of the tool, or only
  specific ones?) before attributing the bug to the tool.

### Step 5: Fix the confirmed root cause

Do not make large code changes while the root cause is still unconfirmed. Keep investigation changes
local and reversible (a local branch, a scratch script, a local copy of the file) until the cause is confirmed.

If a symptom-level safety net (a fallback path, a detection-and-retry mechanism) already exists, keep it in
place even after the root cause is fixed, unless the user explicitly asks to remove it — it remains useful
protection against inputs not covered by the fix.

### Step 6: Regression-test against real project data

After implementing the fix, verify it against:

- The originally-broken case(s), confirming the bug no longer occurs.
- Previously-working cases, confirming no regression was introduced.
- Where practical, the exact binary/library version used in production (not just a similar or newer local
  version), since some bugs are specific to a particular version.

Prefer verifying end-to-end through the actual production code path (e.g. running the real service and
sending it a real request) over a standalone reproduction script, once the fix is ready to be considered
complete.
