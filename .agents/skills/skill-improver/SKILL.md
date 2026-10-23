---
name: skill-improver
description: Improve shared agent skills based on human-identified gaps. Analyze what was missed, why it was missed, and suggest concrete improvements for future runs.
allowed-tools: [Read, Grep, Glob, Edit, Write]
metadata:
  version: "1.2.0"
---

# Skill Improver

A meta-skill for systematically improving shared agent skills when they fail to catch issues.

## Purpose

When a human identifies that a skill missed something important, this skill:
1. Analyzes the original skill instructions
2. Reviews the transcript of the skill being used
3. Identifies the root cause of the miss
4. Proposes concrete improvements to prevent the same miss in the future
5. Optionally applies the improvements

---

## Inputs Required

To use this skill, you need:
1. **Skill name/path**: Which skill missed something?
2. **Human feedback**: What specific issue was missed?
3. **Transcript** (optional but helpful): Conversation showing the skill being used and the miss
4. **Context**: What was being reviewed (commit, PR, code files, etc.)

---

## Analysis Protocol

### Phase 1: Understand What Was Missed

**Step 1.1: Extract the specific miss**

From human feedback, identify:
- **What concrete issue was missed**: e.g., "unused field `text` in type `CharJumpMatch`"
- **Why it matters**: e.g., "stores unnecessary data, violates simplicity principle"
- **How it should have been caught**: e.g., "grep for field usage, verify reads vs writes"

**Step 1.2: Classify the miss type**

Categorize as:
- **Pattern-based**: Requires recognizing a code pattern (wrapper types, duplication, etc.)
- **Mechanical**: Requires running a specific command/search
- **Judgment**: Requires evaluating trade-offs or architectural fit
- **Attention**: Was covered but skipped/forgotten

---

### Phase 2: Analyze the Skill Definition

**Step 2.1: Read the skill file**

```bash
# Find the skill file
rg --files --hidden .agents/skills/<skill-name> -g SKILL.md
```

Read the SKILL.md content.

**Step 2.2: Check if the miss is covered**

Search the skill for:
- Keywords related to the missed issue
- Checklist items that should have caught it
- Example patterns that match the miss

**Questions to answer:**
1. **Is the check described in the skill?**
   - ✅ Yes, explicitly → Attention/execution gap
   - ⚠️ Yes, but vague → Needs more explicit instructions
   - ❌ No → Missing from skill entirely

2. **If covered, how explicit is it?**
   - Does it say "check for unused fields"? (Vague)
   - Does it say "run `grep -rn '\.fieldname'` and classify reads vs writes"? (Explicit)

3. **Is it in a checklist or buried in prose?**
   - Checklist items are more likely to be followed
   - Prose explanations are more likely to be skipped

---

### Phase 3: Analyze the Transcript

**Step 3.1: Find where the skill was invoked**

Look for:
- `<command-message>The "{skill}" skill is running</command-message>`
- The skill content being loaded into context
- The agent's response after using the skill

**Step 3.2: Trace the execution**

For each checklist item in the skill:
- Did the agent mention it?
- Did the agent run the suggested commands?
- Did the agent skip it entirely?

**Step 3.3: Identify the failure mode**

Determine why the check was missed:

**Failure Mode A: Not in Skill**
- The check simply doesn't exist in the skill
- Example: "Skill has no section on checking field usage"

**Failure Mode B: Too Vague**
- The check exists but lacks concrete steps
- Example: "Skill says 'check abstractions' but doesn't say HOW"

**Failure Mode C: No Enforcement**
- The check exists but is optional/suggested
- Example: "Skill says 'consider checking...' instead of 'MUST check...'"

**Failure Mode D: Too Long/Buried**
- The check exists but is buried in a long document
- Example: "Item #37 in a 50-item checklist"

**Failure Mode E: No Verification**
- The check exists but there's no way to verify it was done
- Example: "Says to check, but no output required, so agent skips it"

**Failure Mode F: Attention Gap**
- Everything needed is there, agent just didn't execute
- Example: "Checklist says 'grep for usage' but agent didn't run grep"

---

### Phase 4: Propose Improvements

**Step 4.0: Decide - Modify or Split?**

Before proposing specific improvements, evaluate whether to:
- **Modify existing skill** (add/improve sections)
- **Create new skill** (extract distinct concern)

Use the decision framework below.

---

#### Decision Framework: When to Create a New Skill

**Strong signals to CREATE NEW SKILL:**

1. **Length threshold exceeded**
   - Existing skill > 500 lines
   - Adding the fix would push it > 700 lines
   - *Reasoning*: Long skills cause fatigue, skipping

2. **Distinct concern/domain**
   - The missed check is a self-contained domain (e.g., type analysis, security checks, performance)
   - It could be useful independently of the main skill
   - *Example*: Type checking is distinct from architectural review

3. **Different skill level/depth**
   - Main skill is high-level/strategic, missed check is low-level/mechanical
   - Or vice versa: main skill is tactical, but architectural checks are needed
   - *Example*: Strategic review + tactical type verification

4. **Multiple failure modes**
   - The miss reveals 3+ missing checks in a related area
   - Adding all of them would bloat the main skill
   - *Example*: No type checks → need field usage, inline types, derivability, etc.

5. **Specialization needed**
   - The check requires specialized knowledge or tools
   - Not all uses of the main skill need this specialization
   - *Example*: Security audit as subset of code review

6. **Repeated coordination pattern**
   - Other skills already coordinate with the main skill
   - This would be another skill in a suite
   - *Example*: code-review coordinates with test-analysis, type-analysis, etc.

**Signals to MODIFY EXISTING SKILL:**

1. **Skill is short** (< 300 lines)
   - Plenty of room to add checks without fatigue

2. **Check is core to skill purpose**
   - Can't do the skill's job without this check
   - *Example*: Naming convention check in style-review skill

3. **Quick fix** (< 50 lines added)
   - Adding a small section or explicit command
   - Doesn't significantly increase cognitive load

4. **Single isolated miss**
   - Only one thing was missed, not a pattern of gaps
   - Unlikely to need many related checks

5. **Already has the structure**
   - Skill already has a section for this, just needs to be more explicit
   - *Example*: Has "check types" section but needs grep commands

**When in doubt:**
- Count lines: > 500 → lean toward split
- Ask: "Could this new section be useful on its own?" → If yes, split
- Check: "Are there 3+ related checks to add?" → If yes, split

---

#### For Skills That Should Be Split

**Step 4.0a: Design the new skill**

1. **Choose a clear name**
   - Reflects the specific domain: `<parent>-<domain>`
   - Examples: `code-review-types`, `security-scanner`, `performance-audit`

2. **Define the scope**
   - What specific checks belong in this skill?
   - What stays in the parent skill?
   - Where's the boundary?

3. **Design coordination**
   - How does parent skill trigger child skill?
   - Detection logic: "If X is present, recommend Y skill"
   - Example: "If types modified, recommend type-analysis skill"

4. **Plan the handoff**
   - What context does new skill need?
   - What does it return to user/parent?

**Step 4.0b: Outline the new skill structure**

```markdown
---
name: <New Skill Name>
description: <Focused description of what this skill does>
allowed-tools: [Read, Grep, Glob, Bash]
version: 1.0.0
---

# <New Skill Name>

Purpose: [Specific, focused purpose]

When to use: [Trigger conditions]

## Protocol

### Phase 1: [First check]
[Explicit steps with commands]

### Phase 2: [Second check]
[Explicit steps with commands]

...

## Output Format
[What the skill reports]
```

**Step 4.0c: Update parent skill for coordination**

Add to parent skill:
```markdown
## Step X: Check if [domain] analysis needed

```bash
# Detection command
git diff | grep <pattern>
```

**If [condition detected]**: Note for final report. After completing this review,
recommend running the **<new-skill-name>** skill for [specific purpose].
```

---

Based on the failure mode, recommend specific fixes:

#### For Failure Mode A: Not in Skill

**Solution**: Add the missing check

```markdown
## New Section: Field Usage Verification

For every field in a type definition:
1. Run: `grep -rn "\.<fieldname>" <files>`
2. Classify each result as read (used) or write (assigned)
3. Flag fields with only writes → unused field
```

#### For Failure Mode B: Too Vague

**Solution**: Make instructions explicit and actionable

```diff
- Check if fields are necessary
+ For each field in the type, verify it's used:
+   1. Run: `grep -rn "\.<fieldname>" <files>`
+   2. Find at least one READ usage (not just assignments)
+   3. If only found in assignments → unused field
```

#### For Failure Mode C: No Enforcement

**Solution**: Make checks mandatory with strong language

```diff
- Consider checking field usage
+ MANDATORY: Before approving any type definition, verify each field is used:
+   [specific steps...]
```

Or: Move to a "Phase 1: Mandatory Pre-Checks" section at the top.

#### For Failure Mode D: Too Long/Buried

**Solution**: Split skill or reorganize

**If skill > 500 lines OR adding fix would push > 700 lines:**
→ **Create new skill** (see Step 4.0a-4.0c above)

**Otherwise:**
1. Move critical checks to a "Quick Checklist" at the top
2. Add a decision tree: "If types changed → go to Section X"
3. Use visual separators to break up long sections

#### For Failure Mode E: No Verification

**Solution**: Require output/evidence

```diff
  Check for unused fields
+
+ Required output: For each field, show:
+   - Field name and location
+   - Grep results showing reads (or "No reads found")
```

#### For Failure Mode F: Attention Gap

**Solution**: Add reminders and structure

1. Add "STOP - Have you..." checkpoints
2. Use visual separators (---) between phases
3. Add explicit: "Before proceeding, run these commands..."
4. Consider if skill is too long (agent fatigues)

---

### Phase 5: Draft the Improvement

**Step 5.1: Create a concrete diff or new section**

Based on the proposed improvement, draft:
- New section to add
- Existing section to modify (with before/after)
- New separate skill (if splitting)

**Step 5.1a: Check abstraction level (CRITICAL - prevents over-fitting)**

⚠️ **First drafts are usually too specific to the exact case that was missed.**

Before proceeding, test your proposed improvement:

**Test 1: The Specificity Test**
- Does your improvement reference specific details from the missed case?
  - Specific function names, specific patterns, specific code examples from the case?
  - ❌ Red flag: "Check if viewport filtering can be called during traversal"
  - ✅ Good: "Verify if complexity justifications are actually true"

**Test 2: The Generalization Test**
- Would this catch similar but *different* mistakes?
  - Imagine 3 different scenarios with the same underlying issue
  - Would your improvement catch all 3, or just the original case?
  - ❌ Red flag: Only catches two-pass patterns with viewport checks
  - ✅ Good: Catches any unverified assumption about complexity

**Test 3: The Mentor Heuristic**
- Imagine you're mentoring someone who you've noticed has a *tendency* or *pattern* of making this type of mistake in different ways across different contexts
- What advice would you give them to help them be less likely to make this mistake in the future?
  - Not: "Here's a checklist for two-pass patterns with viewport filtering"
  - But: "You're making assertions about complexity without verifying them—that's a thinking pattern to watch for"
- The advice should address the underlying thinking pattern, not just the specific symptom

**Test 4: Principle vs Procedure**
- Are you adding a procedure (checklist, specific commands) or teaching a principle (mindset, thinking approach)?
- Procedures are brittle and case-specific
- Principles are robust and generalizable
- ❌ Red flag: "Decision tree for when two-pass is justified (checks A, B, C)"
- ✅ Good: "Question complexity justifications—verify them or flag as uncertain"

**If you fail any test, revise to a higher abstraction level:**
1. Identify the general principle that was violated (not the specific pattern)
2. What thinking error led to the miss? (assumed vs verified, pattern-matched vs analyzed, etc.)
3. How do you teach someone to avoid that thinking error in general?

**Expect to iterate 2-3 times before reaching the right level.**

**Step 5.2: Validate against the original miss**

Mental simulation:
> If an agent were to run the IMPROVED skill on the original scenario, would they catch the issue?

Trace through:
1. They load the skill
2. They follow the (now improved) instructions
3. At step X, they would run command Y
4. Command Y would reveal the issue
5. ✅ Issue caught

If the answer is "maybe" or "probably not", iterate on the improvement.

---

## Output Format

Structure your analysis as:

### Summary
- **Skill analyzed**: `<skill-name>`
- **Issue missed**: `<concrete description>`
- **Root cause**: `<failure mode(s)>`
- **Recommended fix**: `<high-level approach>`

---

### Detailed Analysis

#### What Was Missed
[Specific issue with example]

#### Current Skill Coverage
[Quote relevant sections from skill, or note absence]

**Gap identified**: [Explain what's missing or insufficient]

#### Transcript Analysis
[What the agent did/didn't do when using the skill]

**Execution gap**: [Why the check was skipped]

#### Root Cause
- **Primary failure mode**: [A through F]
- **Contributing factors**: [Additional context]

---

### Skill Splitting Decision

**Current skill length**: [X lines]
**Proposed addition**: [Y lines]
**Total after addition**: [X+Y lines]

**Evaluation against split criteria:**
- [ ] Length > 500 lines (or would exceed 700)?
- [ ] Distinct domain that's self-contained?
- [ ] Different depth level (high vs low)?
- [ ] 3+ related checks to add?
- [ ] Could be useful independently?
- [ ] Specialization needed?

**Decision**:
- ✅ **Create new skill** - [Brief reasoning]
- ❌ **Modify existing skill** - [Brief reasoning]

---

### Proposed Improvement

#### Option 1: [Approach name]

**Change type**: [Add new section / Modify existing / **Create new skill** / etc.]

**Diff**:
```diff
[Show before/after, or new content]
```

**Validation**: [Would this catch the original miss? Walk through it.]

**Pros/Cons**:
- ✅ Pro: ...
- ❌ Con: ...

#### Option 2: [Alternative approach]

[Same structure as Option 1]

---

### Recommendation

**Preferred option**: Option X

**Reasoning**: [Why this option is best]

**Implementation steps**:
1. [Step-by-step how to apply]

---

## Common Improvement Patterns

### Pattern: Vague → Explicit Commands

**Before**:
```markdown
Check for code duplication
```

**After**:
```markdown
Check for code duplication:
1. Run: `grep -rn "function <name>" lib/`
2. For each result, compare implementations
3. If >80% similar → flag for consolidation
```

---

### Pattern: Optional → Mandatory

**Before**:
```markdown
Consider checking field usage
```

**After**:
```markdown
## Phase 1: MANDATORY Pre-Checks

Before proceeding, run field usage verification:
[steps...]

DO NOT SKIP: These checks catch the most common issues.
```

---

### Pattern: Prose → Checklist

**Before**:
```markdown
You should think about whether fields are needed and check if they're used.
Sometimes fields are added but never read, which is wasteful.
```

**After**:
```markdown
## Field Usage Checklist

For each field in new/modified types:
- [ ] Field name: `_______`
- [ ] Ran grep: `grep -rn "\.<fieldname>"`
- [ ] Found reads (not just writes): Yes / No
- [ ] Action: Keep / Remove
```

---

### Pattern: Long Skill → Split Skills

**Trigger**: Skill > 500 lines, or multiple distinct domains

**Before**:
```markdown
# Mega Code Review Skill (722 lines)
- Architecture (10 items)
- Patterns (15 items)
- Types (8 items)
- Tests (12 items)
- Docs (5 items)
[50 total checklist items]
```

**After**:
```markdown
# Main Code Review Skill (400 lines, high-level)
- Architecture
- Patterns
- Tests (high-level)
- Docs

Coordination step:
"If types modified → recommend trot-n-spot-type-analysis skill"

# Type Analysis Skill (200 lines, focused)
- Field usage verification
- Inline type duplication detection
- Derivability checks
- [8 specific type checks with explicit commands]
```

**Key aspects of split:**
1. Clear naming: `<parent>-<domain>` (e.g., `code-review-types`)
2. Detection logic: Parent detects when child is needed
3. Recommendation: Parent explicitly recommends child in output
4. Independence: Child can be used standalone
5. Coordination: Clear handoff of context/findings

---

### Pattern: No Verification → Required Output

**Before**:
```markdown
3. Check field usage
```

**After**:
```markdown
3. Check field usage

   Required: Document findings in your output:

   | Field | File | Reads Found | Status |
   |-------|------|-------------|--------|
   | text  | ...  | 0           | ❌ UNUSED |
   | from  | ...  | 3           | ✅ Used |
```

---

## Skill Coordination Patterns

When creating new skills that coordinate with existing skills, use these patterns:

### Pattern 1: Detection-Based Recommendation

**Parent skill detects a condition and recommends child skill.**

**In parent skill:**
```markdown
## Step X: Check for [Domain] Analysis Need

```bash
# Detection command
git diff <commit> | grep -E "^[+-](export )?(type|interface)"
```

**If [types/domain] modified**: After completing this review,
recommend running **[child-skill-name]** for detailed [domain] analysis.
```

**At end of parent skill output:**
```markdown
## Recommendations

⚠️ Type definitions were modified in this change. For deep type analysis:
- Field usage verification
- Inline type duplication detection
- Data intentionality checks

**Action**: Run the `trot-n-spot-type-analysis` skill for comprehensive type review.
```

---

### Pattern 2: Conditional Delegation

**Parent skill acknowledges a domain but explicitly delegates it.**

**In parent skill:**
```markdown
## Step X: Security Review (High-Level)

Note: This step performs only high-level security checks:
- No hardcoded secrets in diffs
- No SQL injection patterns in new queries

For comprehensive security analysis, use the **security-audit** skill.
```

This sets expectations and points users to the right tool.

---

### Pattern 3: Progressive Depth

**Create a suite of skills with increasing depth.**

Example hierarchy:
```
code-review          (30 min, high-level, catches 80% of issues)
  ├─ type-analysis   (10 min, deep types, catches 90% of type issues)
  ├─ security-audit  (15 min, security focus, catches 95% of vulns)
  └─ perf-analysis   (20 min, performance, catches common bottlenecks)
```

**Coordination:**
- Quick review → Just run `code-review`
- Thorough review → Run `code-review`, then recommended child skills
- Targeted review → Run specific child skill directly

---

### Pattern 4: Skill Suite with Shared Context

**Multiple skills that share a common context/setup.**

**Example: Testing Suite**
```
test-runner           (runs tests, collects results)
  ↓ outputs test results
test-analyzer         (analyzes why tests failed)
  ↓ identifies patterns
test-fixer            (suggests fixes for common failures)
```

Each skill builds on the previous one's output.

---

### Pattern 5: Parallel Specialists

**Parent coordinates multiple independent specialist skills.**

**Example: Comprehensive Code Review**
```
code-review-orchestrator
  ├─ architecture-review  (can run in parallel)
  ├─ type-analysis        (can run in parallel)
  ├─ security-scan        (can run in parallel)
  └─ test-coverage        (can run in parallel)
```

The orchestrator:
1. Detects what types of analysis are needed
2. Recommends running all applicable skills
3. User can run them in parallel for speed
4. Consolidates findings

---

### Coordination Anti-Patterns

**❌ Circular dependencies**
```
skill-A recommends skill-B
skill-B recommends skill-A
→ Confusing, unclear which to run first
```

**❌ Overlapping responsibilities**
```
code-review: checks types deeply
type-analysis: checks types deeply
→ Unclear which to use, duplication of effort
```

**❌ No clear handoff**
```
parent-skill: "You might want to check types"
→ User doesn't know which skill to use or when
```

**✅ Good coordination:**
- Clear trigger conditions
- Explicit skill names in recommendations
- No overlap in what they check
- Clear hierarchy or independence

---

## Meta-Improvement

This skill itself can be improved! When using it:

- Track: What types of skill improvements work best?
- Track: Do the improved skills actually catch issues on replay?
- Iterate: Update this skill based on what works

---

## Example Session

### Inputs
- **Skill**: trot-n-spot-code-review
- **Miss**: Unused `text` field in `CharJumpMatch` type
- **Feedback**: "You didn't check if the text field was actually used, only that it was defined"

### Analysis

**Phase 1: What was missed**
- Unused field `text` in `CharJumpMatch`
- Should grep for `.text` usage and verify reads vs writes

**Phase 2: Skill coverage**
- Skill has section "Abstraction Level Check" that says "Can fields be derived instead of stored?"
- But it's vague - doesn't say HOW to check

**Phase 3: Transcript**
- Agent read the skill
- Agent mentioned types but didn't run field usage grep
- Agent focused on high-level patterns, skipped low-level verification

**Root cause**: Failure Mode B (Too Vague) + Mode F (Attention Gap)

**Phase 4: Proposed improvement**

Option 1: Add explicit field usage check to existing skill
- Add grep command to "Abstraction Level Check" section
- Make it a mandatory step with command to run

Option 2: Create separate "Type Analysis" skill
- Extract all type-checking into focused skill
- Keep main skill high-level
- Coordinate between them

**Phase 5: Recommendation**
- Chose Option 2 (separate skill)
- Reasoning: Main skill was getting long, type checking is distinct concern
- Created `trot-n-spot-type-analysis` skill with explicit grep protocol

---

## Version History
- v1.2.0 (2024-12-25): Add Step 5.1a "Check abstraction level" with tests to prevent over-fitting to specific cases (Specificity, Generalization, Mentor Heuristic, Principle vs Procedure)
- v1.1.0 (2024-12-24): Add skill-splitting decision framework, new skill creation guidelines, and coordination patterns
- v1.0.0 (2024-12-24): Initial skill-improver meta-skill for systematic skill improvement based on human feedback
