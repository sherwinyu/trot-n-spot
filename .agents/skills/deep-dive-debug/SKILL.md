---
name: deep-dive-debug
description: Systematic debugging methodology for intermittent or deterministic bugs that resist surface-level fixes. Uses strategic instrumentation, hypothesis testing, and root cause analysis.
allowed-tools: [Read, Edit, Write, Grep, Glob, Bash, Task]
metadata:
  version: "1.0.0"
---

# Deep Dive Debug

Read `AGENTS.md` and `docs/testing.md` for the current Expo/Jest/browser/native test paths. The editor examples below illustrate the method; their helpers are not APIs in this repository.

A systematic methodology for debugging complex issues, especially when:

- Initial fixes don't work
- The bug appears intermittent but is actually deterministic
- Surface-level analysis misses the root cause
- You need to understand "why this case but not that case?"

---

## Core Philosophy

### The Debugging Mindset

1. **Determinism over Randomness**: If a bug appears "intermittent," it's almost always deterministic with hidden conditions. Find those conditions.

2. **Trace, Don't Guess**: Don't hypothesize without data. Add instrumentation first, then form hypotheses from observations.

3. **Question the Obvious**: When initial fixes fail, your mental model is wrong. Go back to first principles.

4. **Follow the Data**: The code path that _actually executes_ matters more than what you _think_ should execute.

5. **Diff the Success Case**: When something works in case A but fails in case B, the _difference_ reveals the bug.

---

## Phase 1: Reproduce and Characterize

### Step 1.1: Create a Reliable Reproduction

Before anything else, create a test that reproduces the bug:

```bash
# For E2E issues
node e2e/run-e2e.js

# For unit test issues
npm test -- --runInBand -t "bug description"
```

**Characteristics of a good reproduction:**

- Fails 100% of the time (or has known failure rate)
- Minimal setup (smallest possible test case)
- Clear assertion that shows the failure
- Can be run quickly for iteration

### Step 1.2: Characterize the Determinism

**Critical Question**: Is this truly random, or does it have hidden determinism?

Find cases where it works vs. fails:

| Scenario | Works? | Key Difference |
| -------- | ------ | -------------- |
| Input A  | ❌ No  | ...            |
| Input B  | ✅ Yes | ...            |
| Input C  | ❌ No  | ...            |

**Pattern Recognition**:

- What do failing cases have in common?
- What do succeeding cases have in common?
- What's the minimal change that flips success ↔ failure?

### Step 1.3: Form Initial Hypothesis

Based on the pattern, form a hypothesis:

> "The bug occurs when [condition X] is true, because [proposed mechanism]"

**Write this down explicitly.** You'll test it with instrumentation.

---

## Phase 2: Strategic Instrumentation

### The Golden Rule of Instrumentation

> **Add logging to TRACE the actual execution path, not to prove your hypothesis.**

Good logging reveals what's happening. Bad logging confirms what you expect.

### Step 2.1: Identify Instrumentation Points

Choose logging locations at:

1. **State Transitions**: Where state changes (atom sets, Redux dispatches, setState calls)
2. **Decision Points**: Conditionals that affect control flow
3. **Boundaries**: Where data passes between modules/components
4. **The Suspected Code**: Your hypothesis area

### Step 2.2: Design Your Log Format

Create consistent, parseable log messages:

```typescript
console.log(`[DEBUG functionName] key1: ${val1}, key2: ${val2}, key3: ${val3}`);
```

**Essential elements:**

- **Tag**: `[DEBUG functionName]` for easy filtering
- **State values**: Log actual values, not just booleans
- **Context**: Include identifiers (IDs, names) to correlate events

### Step 2.3: Add Stack Traces at Critical Points

For async or event-driven code, stack traces reveal the _trigger_:

```typescript
console.log(`[DEBUG functionName] ...values...`);
const stack = new Error().stack;
console.log(`Stack: ${stack}`);
```

**When to add stack traces:**

- Unexpected function calls
- State changes from unknown sources
- Callback invocations you can't trace

### Step 2.4: Capture Browser Console in E2E Tests

For E2E tests, use the `captureDebugLogs` helper to capture and filter browser logs:

```typescript
import { captureDebugLogs, captureDebugTaggedLogs } from './debugConsoleHelper';

test('debugging example', async ({ page }) => {
  // Option 1: Capture all logs
  const logs = captureDebugLogs(page);

  // Option 2: Capture only [DEBUG ...] tagged logs (recommended)
  const debugLogs = captureDebugTaggedLogs(page);

  // ... perform actions ...

  // Filter logs by tag
  const zoomLogs = logs.filter("[DEBUG setPaneLocAtom]");

  // Print filtered logs for analysis
  logs.printFiltered("[DEBUG");

  // Get logs since a specific point in time
  const beforeAction = logs.now();
  await page.keyboard.press("Alt+]");
  const actionLogs = logs.since(beforeAction);

  // Check for errors
  const errors = logs.errors();
});
```

The helper provides methods for filtering, printing, and analyzing captured logs - making it easier to trace execution through multiple components.

### Step 2.5: Set Up Test State Declaratively

For complex document structures, use the `setNoteState` helper instead of simulating keyboard input:

```typescript
import { setNoteState, content } from './noteStateHelper';

test('zoom nested list', async ({ page }) => {
  // Set up the exact document structure needed for reproduction
  await setNoteState(page, {
    content: [
      content.heading("Test Title"),
      content.p("aa"),
      content.list("b"),   // Nested list with "b"
      content.list("cc"),  // Nested list with "cc"
    ]
  });

  // Now test the specific behavior
  // ... click on "b", press Alt+], verify zoom works
});
```

This makes tests faster, more reliable, and easier to read than simulating keyboard input.
---

## Phase 3: Execute and Observe

### Step 3.1: Run the Reproduction

Execute the test with instrumentation:

```bash
node e2e/run-e2e.js 2>&1 | tee debug-output.log
```

### Step 3.2: Extract the Critical Sequence

From the logs, identify the **critical sequence** - the actual order of operations:

```
[DEBUG step1] State set to X
[DEBUG step2] Callback triggered with Y  <-- UNEXPECTED VALUE
[DEBUG step3] State overwritten to Z     <-- THE BUG
```

**Look for:**

- Out-of-order operations
- Unexpected function calls
- Wrong values at critical points
- Missing expected calls

### Step 3.3: Compare Success vs Failure

Run the same instrumentation on the _success case_:

**Failing Case (Input A):**

```
step1 -> step2 (unexpected!) -> step3
```

**Succeeding Case (Input B):**

```
step1 -> (no step2) -> success
```

The difference reveals the trigger.

---

## Phase 4: Hypothesis Refinement

### Step 4.1: Revise Based on Observations

Your initial hypothesis is probably wrong. Update it based on what the logs actually show:

**Before:**

> "Race condition between X and Y"

**After (based on logs):**

> "Callback is invoked with stale data after state update"

### Step 4.2: Test the Refined Hypothesis

Add targeted logging to verify:

```typescript
console.log(
  `[DEBUG callback] closureValue: ${closureValue}, currentValue: ${getCurrentValue()}`,
);
```

If `closureValue !== currentValue`, you've confirmed the hypothesis.

### Step 4.3: Identify the Root Cause Category

Common root causes in frontend/React code:

| Category              | Symptom                               | Fix Pattern                   |
| --------------------- | ------------------------------------- | ----------------------------- |
| **Stale Closure**     | Callback has old values               | Read from source of truth     |
| **Duplicate Handler** | Action fires twice                    | Remove duplicate or add guard |
| **Async Ordering**    | Operations interleave unexpectedly    | Sequence or add guards        |
| **State Overwrite**   | Correct state replaced by stale state | Version check or guard        |
| **Missing Guard**     | Code runs when it shouldn't           | Add condition check           |
| **Dependency Issue**  | Effect runs at wrong time             | Fix dependency array          |

---

## Phase 5: The Diff Question

### The Most Important Question

> "Why does it fail on case A but succeed on case B?"

This question is more valuable than "why does it fail?" because it forces you to identify the specific trigger.

### Step 5.1: Isolate the Difference

List the concrete differences between success and failure cases:

| Aspect | Fails (A) | Succeeds (B) |
| ------ | --------- | ------------ |
| Input  | ...       | ...          |
| State  | ...       | ...          |
| Timing | ...       | ...          |

### Step 5.2: Trace the Difference Through Code

Follow the difference through the code path:

```
Difference: A has property X, B doesn't
  → Function F checks for X
  → When X exists, F does action Y
  → Action Y causes the bug
  → When X doesn't exist, F skips Y
  → Bug doesn't occur
```

### Step 5.3: The Determinism Explanation

A "random" bug is explained when you can say:

> "It fails when [specific condition] because [specific mechanism]"

If you can't fill in both blanks with concrete details, you haven't found the root cause yet.

---

## Phase 6: Fix and Verify

### Step 6.1: Fix at the Root Cause

Don't patch symptoms. Fix the actual root cause:

**Symptom Fix (Bad):**

```typescript
// Guard against wrong value
if (value !== expected) return;
```

**Root Cause Fix (Good):**

```typescript
// Ensure we always read fresh value
const value = getFreshValue();
```

### Step 6.2: Verify the Fix

Run the reproduction test:

- Does it pass now?
- Does it pass on ALL cases (both failing and succeeding cases)?
- Did fixing it break anything else?

### Step 6.3: Clean Up Instrumentation

Remove debug logging before committing:

```bash
git diff | grep "DEBUG" # Should show only removals
```

### Step 6.4: Document the Root Cause

In your commit message and ticket, explain:

1. What the symptom was
2. Why it was deterministic (the trigger condition)
3. What the actual root cause was
4. Why the fix addresses the root cause

---

## Common Patterns and Their Fixes

### Pattern: Stale Closure

**Symptom:** Callback uses old values even after state updated

**Detection:**

```typescript
console.log(`closure value: ${closureValue}, current: ${getCurrentValue()}`);
// Shows: closure value: X, current: Y (different!)
```

**Fix:** Read from source of truth instead of closure:

```typescript
const handleChange = useCallback(() => {
  const current = store.get(atom); // Fresh read
  // ... use current
}, []); // Can remove stale dependency
```

### Pattern: Duplicate Handler

**Symptom:** Action fires multiple times for single trigger

**Detection:**

```typescript
console.log(`[DEBUG handler] Triggered. Stack: ${new Error().stack}`);
// Shows multiple stack traces for same user action
```

**Fix:** Remove duplicate binding, or add guard:

```typescript
// Option 1: Remove duplicate registration
// Option 2: Guard against re-entry
if (handled) return;
handled = true;
```

### Pattern: Async State Overwrite

**Symptom:** Correct state briefly visible, then replaced with wrong state

**Detection:**

```typescript
console.log(`[DEBUG setState] Setting: ${newValue}`);
// Shows: Setting: correct
// Then: Setting: wrong (overwrites!)
```

**Fix:** Guard against stale updates:

```typescript
if (currentVersion !== expectedVersion) return;
// or
if (isStale(update)) return;
```

### Pattern: Effect Timing

**Symptom:** Effect runs before/after expected, or runs too often

**Detection:**

```typescript
console.log(`[DEBUG useEffect] Running. deps: ${JSON.stringify(deps)}`);
// Shows effect running at unexpected times
```

**Fix:** Correct the dependency array or add guards:

```typescript
useEffect(() => {
  if (!shouldRun) return;
  // ...
}, [correctDeps]);
```

---

## The Deep Dive Debug Checklist

### Before Starting

- [ ] Reliable reproduction exists
- [ ] Success and failure cases identified
- [ ] Initial hypothesis written down

### Instrumentation Phase

- [ ] Logging at state transitions
- [ ] Logging at decision points
- [ ] Stack traces at unexpected calls
- [ ] Browser console capture (for E2E)

### Analysis Phase

- [ ] Critical sequence extracted from logs
- [ ] Success vs failure comparison done
- [ ] "Why A fails but B succeeds" answered
- [ ] Root cause category identified

### Fix Phase

- [ ] Fix addresses root cause (not symptom)
- [ ] All cases pass (success and failure)
- [ ] Debug logging removed
- [ ] Commit message documents root cause

---

## When to Use This Skill

**Use Deep Dive Debug when:**

- Initial fix attempts fail
- Bug appears "random" but might have hidden determinism
- User feedback says your fix "isn't quite right"
- You need to understand why some cases work and others don't
- Multiple systems interact in unclear ways

**Don't use when:**

- Bug is obvious from error message
- Simple typo or missing import
- Clear stack trace points directly to issue
- Fix is straightforward

---

## Historical example from Oryoki: SHE-14 Debug Session

### The Bug

When provided a minimal repro of
doc(list(paragraph("aa"), list(paragraph("b")), list(paragraph("c")))),
we notice that the Zoom-in command works on some list items ('cc') but fails on others ('b').

### Initial (Wrong) Hypothesis

"Race condition between zoom atom and React render"

### Instrumentation Added

We traced the call flow by adding logging at key state transition points:

**1. In the zoom atom (`setPaneLocAtom`)** - where the partial editor state gets created:
```typescript
console.log(
  `[DEBUG setPaneLocAtom] Created partial state. loc: ${loc?.listId}, docSize: ${newEditorState.doc.content.size}, oldDocSize: ${pane.editorState?.doc.content.size}`,
);
```

**2. In the state update atom (`updatePaneEditorStateAtom`)** - where pane state gets written:
```typescript
console.log(
  `[DEBUG updatePaneEditorStateAtom] paneId: ${paneId}, hasLoc: ${!!pane.loc}, currentDocSize: ${pane.editorState?.doc.content.size}, newDocSize: ${editorState?.doc.content.size}`,
);
console.trace("[DEBUG updatePaneEditorStateAtom] Stack trace:");
```

**3. In the change handler (`handleOnChange`)** - the callback that processes editor transactions:
```typescript
const stack = new Error().stack;
console.log(
  `[DEBUG handleOnChange] paneId: ${paneId}, hasLoc: ${!!loc}, locListId: ${loc?.listId}, newDocSize: ${newEditorState.doc.content.size}\nStack: ${stack}`,
);
```

**4. Captured browser console in the E2E test:**
```typescript
page.on("console", (msg) => {
  if (msg.text().includes("[DEBUG")) {
    console.log(`[BROWSER] ${msg.text()}`);
  }
});
```

### Critical Observation

The logs revealed an unexpected sequence:

```
[DEBUG setPaneLocAtom] Created partial state. loc: 26w4.7-O4E04, docSize: 5, oldDocSize: 34
[DEBUG setPaneLocAtom] Setting panesAtom. loc: 26w4.7-O4E04, docSize: 5
[DEBUG setPaneLocAtom] panesAtom SET complete.
[DEBUG handleOnChange] paneId: Pane-1, hasLoc: false, locListId: undefined, newDocSize: 34  <-- WRONG!
    Stack: ...at jumpToNextSibling...at handleKeyDown...
[DEBUG updatePaneEditorStateAtom] paneId: Pane-1, hasLoc: true, currentDocSize: 5, newDocSize: 34  <-- OVERWRITE!
```

Key insights from the logs:
- `setPaneLocAtom` correctly created a partial doc (size 5)
- Immediately after, `handleOnChange` was called with `hasLoc: false` (stale closure!) and full doc (size 34)
- The stack trace revealed `jumpToNextSibling` was the trigger
- `updatePaneEditorStateAtom` showed the pane now has `loc: true` but received the wrong doc size

### The Diff Question

> "Why does it fail on 'b' but work on 'cc'?"

Answer: `jumpToNextSibling` only dispatches when a next sibling exists.

- 'b' has sibling 'cc' → dispatch → bug triggered
- 'cc' has no sibling → no dispatch → works fine

### Root Cause

Alt+] was bound to BOTH `zoomIn` AND `jumpToNextSibling`. When both handlers ran, the second one dispatched a transaction that overwrote the zoom state.

### Fix

Remove duplicate keybinding from `jumpToNextSibling`.

---

## Version History

- v1.1.0 (2025-01-25): Added E2E test utilities (`captureDebugLogs`, `setNoteState`)
- v1.0.0 (2025-01-25): Initial skill based on SHE-14 debugging session
