---
name: trot-n-spot-type-analysis
description: Deep analysis of TypeScript types and data structures. Verifies field usage, detects inline type duplication, checks data intentionality, and ensures types contain only necessary fields.
allowed-tools: [Read, Grep, Glob, Bash]
metadata:
  version: "1.1.0"
---

# Trot n Spot Type Analysis Skill

Read `CLAUDE.md` for repository conventions and `types/database.ts` for the existing data contracts. Trace reads across hooks, providers, offline serialization, RPC payloads, migrations, and server code before calling a field unused. The editor examples below are illustrative, not repository APIs.

This skill performs deep, systematic analysis of TypeScript types and data structures to catch issues like:
- Unused fields (stored but never read)
- Inline type duplication (anonymous types that duplicate existing types)
- Unnecessary intermediate structures
- Derivable fields that could be computed instead of stored

**When to use**: After modifying or adding TypeScript types/interfaces, or when the main code review detects type changes.

---

## Core Principle: Data Intentionality

> Think backwards from what you need, not forwards from what's available.

Every field in a type should have a clear consumer. If you can't quickly find where a field is read, it shouldn't exist.

---

## Core Principle: Verify, Don't Assume

When you identify potentially unnecessary complexity (wrapper types, two-pass patterns, unused fields, etc.) and generate a reason why it might exist:
- **That's a hypothesis, not a fact**
- Either verify it or flag for human review
- Don't accept complexity based on unverified assumptions
- Use hedging language when uncertain: "appears to", "might be", "unclear if"

**The burden of proof is on complexity to justify itself.**

When you catch yourself saying "this is necessary because..." or "this can't be simplified because...", stop and ask:
- How do I know that's true?
- Did I read the implementation?
- Did I test the alternative?
- Or am I just making an educated guess?

If you haven't verified it, don't state it as fact.

---

## Analysis Protocol

### Phase 1: Identify All Type Definitions

**Step 1.1: Find all type/interface definitions in changed files**

```bash
# Get list of changed files
git diff <commit> --name-only

# Find all type/interface definitions
grep -nE "^(export )?(type|interface) \w+" <changed-files>
```

**Step 1.2: Extract each type definition**

For each type found, note:
- Type name
- All field names
- File location (path:line)

---

### Phase 2: Field Usage Verification

**For each field in each type, verify it's actually READ (not just written):**

**Step 2.1: Search for field reads**

```bash
# For a field named "text" in type "CharJumpMatch"
grep -rn "\.text" <changed-files> <related-files>
```

**Step 2.2: Classify each match**

For each grep result, determine:
- ✅ **Read**: `console.log(match.text)`, `return item.text`, `const x = obj.text`
- ❌ **Write**: `match.text = "..."`, `{ text: "..." }`, `text: node.text`
- ⚠️ **Ambiguous**: `...match` (spreading), `JSON.stringify(match)` (serialization)

**Step 2.3: Flag unused fields**

If a field only appears in:
- Type definition
- Object literal assignments (writes)
- Destructuring that doesn't use the variable

Then it's **unused** and should be removed.

---

### Phase 3: Inline Type Duplication Detection

**Step 3.1: Find inline complex types**

```bash
# Find inline array types with object literals
grep -nE ":\s*Array<\{|:\s*\{[^}]+;[^}]+\}" <changed-files>

# Find inline tuple/union types
grep -nE ":\s*\[[^\]]+,[^\]]+\]|:\s*\w+\s*\|\s*\w+" <changed-files>
```

**Step 3.2: For each inline type, question its existence first**

Example inline type found:
```typescript
const items: Array<{ from: number; to: number; text: string }> = [];
```

**FIRST: Should this intermediate structure exist at all?**

Trace the lifecycle:
1. Where is this array created?
2. How is it populated?
3. Where is it used?
4. Is it used once and discarded, or multiple times?

**Red flags:**
- Created, populated in a loop, then immediately filtered/mapped → likely unnecessary
- Used only once between creation and final result → question if needed
- Duplicates fields from a final type → might be building wrong structure

**If the intermediate appears unnecessary:** Flag it and explain the concern. Don't prescribe the exact refactoring—just identify that it might not be needed.

```markdown
**Example flag:**
⚠️ Inline type at `file.ts:68`: `Array<{ from: number; to: number; text: string }>`

This intermediate structure is:
- Populated during document traversal (lines 73-96)
- Immediately filtered and transformed (lines 100-109)
- Used once then discarded

**Concern:** The intermediate structure might be unnecessary. Consider whether the final structure can be built directly during collection.

Note: This requires architectural analysis beyond type checking.
```

**ONLY IF intermediate structure is justified, THEN check for type duplication:**

1. Does a type already exist with these exact fields? → Consider using that type
2. Does a type exist with a superset of these fields? → Consider type utilities
3. Is this structure used in multiple places? → Consider extracting to named type

**Keep recommendations general—don't prescribe specific solutions.**

---

### Phase 4: Intermediate Structure Analysis

**Step 4.1: Trace data flow**

When you see data collected, then immediately transformed:
```typescript
const intermediate: SomeType[] = [];
// ... collection logic ...
const final = intermediate.map(x => transform(x));
```

**Ask:**
1. What fields exist in `intermediate` but not in `final`?
2. Can we build `final` directly during collection?
3. Is the intermediate structure serving a purpose, or just implementation convenience?

**Step 4.2: Single-pass opportunities**

Look for patterns like:
```typescript
// ❌ Two-pass: collect everything, then filter/transform
const all = [];
doc.descendants((node, pos) => {
  all.push({a: ..., b: ..., c: ...});
});
const filtered = all.filter(x => condition(x)).map(x => ({a: x.a, b: x.b}));
```

Recommend single-pass:
```typescript
// ✅ One-pass: filter during collection, build final structure directly
const filtered = [];
doc.descendants((node, pos) => {
  if (condition(node, pos)) {
    filtered.push({a: ..., b: ...}); // Only needed fields
  }
});
```

---

### Phase 5: Type Utility Opportunities

**Step 5.1: Check for manual type subsetting**

If you see:
```typescript
type Foo = { a: string; b: number; c: boolean };
type Bar = { a: string; b: number }; // Manually duplicates subset
```

Recommend:
```typescript
type Foo = { a: string; b: number; c: boolean };
type Bar = Omit<Foo, 'c'>; // Or Pick<Foo, 'a' | 'b'>
```

**Step 5.2: Check for optional field patterns**

If a type has fields that are sometimes not needed:
```typescript
// ❌ Two separate types with mostly same fields
type WithLabel = { from: number; to: number; label: string };
type WithoutLabel = { from: number; to: number };
```

Consider:
```typescript
// ✅ Single type with optional field (if label is truly optional)
type Match = { from: number; to: number; label?: string };

// ✅ Or use Omit if they're different semantic concepts
type UnlabeledMatch = Omit<Match, 'label'>;
```

---

## Grep Command Reference

### Finding type definitions
```bash
# All type/interface declarations
grep -rn "^(export )?(type|interface) " <path>

# Only exported types
grep -rn "^export (type|interface) " <path>
```

### Finding field usage
```bash
# Direct property access
grep -rn "\.<fieldname>" <path>

# Destructuring
grep -rn "{ *<fieldname>[ ,}]" <path>

# Both patterns combined
grep -rn "\.<fieldname>|{ *<fieldname>" <path>
```

### Finding inline types
```bash
# Inline object types
grep -rn ":\s*{[^}]*:[^}]*}" <path>

# Inline array of objects
grep -rn ":\s*Array<{" <path>

# Type annotations (general)
grep -rn ":\s*(" <path>
```

---

## Analysis Checklist

For each type definition found:

- [ ] **Field necessity**: Every field has verified read usage (not just writes)
- [ ] **Inline duplication**: No anonymous types that duplicate/nearly-duplicate existing types
- [ ] **Derivability**: No fields that could be computed from other fields/data
- [ ] **Intermediate structures**: Multi-step transformations are justified, not just convenience
- [ ] **Type utilities**: Use `Omit`, `Pick`, `Partial` instead of manual duplication
- [ ] **Semantic clarity**: Type names clearly convey purpose (e.g., `UnlabeledMatch` vs anonymous object)

---

## Red Flags (Report These)

### 🚩 Unused Field
```typescript
type Foo = {
  used: string;    // ✅ Found: console.log(foo.used)
  unused: number;  // ❌ Only found: { unused: 42 } (write, not read)
}
```

### 🚩 Inline Type Duplication
```typescript
type Match = { from: number; to: number; label: string };
// Later in the same file:
const items: Array<{ from: number; to: number; label: string }> = [];
//                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Should use Match[]
```

### 🚩 Near-Duplication (missing one field)
```typescript
type Match = { from: number; to: number; text: string; label: string };
// Later:
const temp: Array<{ from: number; to: number; text: string }> = [];
//                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Should use Omit<Match, 'label'>
```

### 🚩 Unused Intermediate Field
```typescript
// Collects 'text' but final structure doesn't use it
const temp: Array<{from: number, text: string}> = [];
// ... collect ...
const final = temp.map(t => ({from: t.from, label: getLabel()}));
// Why collect 'text' at all?
```

### 🚩 Two-Pass When One-Pass Possible
```typescript
const all = [];
collect(all); // Collects everything
const filtered = all.filter(x => visible(x)).map(x => transform(x));
// Could filter during collection, skip unused fields
```

### 🚩 Manual Type Subsetting
```typescript
type Foo = { a: string; b: number; c: boolean };
type Bar = { a: string; b: number }; // Manually copies fields
// Should use: type Bar = Omit<Foo, 'c'> or Pick<Foo, 'a' | 'b'>
```

---

## Green Flags (Good Patterns)

### ✅ All fields used
```typescript
type Match = {
  from: number;  // Used in: view.coordsAtPos(match.from)
  to: number;    // Used in: Decoration.inline(match.from, match.to)
  label: string; // Used in: pos.label.toUpperCase()
}
// Every field has clear read usage ✓
```

### ✅ Type utilities for subsetting
```typescript
type Match = { from: number; to: number; label: string };
const unlabeled: Omit<Match, 'label'>[] = []; // Clear relationship ✓
```

### ✅ Single-pass collection
```typescript
const results: FinalType[] = [];
doc.descendants((node, pos) => {
  if (isValid(node)) {
    results.push({ from: pos, to: pos + node.nodeSize }); // Only needed fields
  }
});
// Filter during collection, build final structure directly ✓
```

---

## Output Format

Structure your analysis report as:

### Summary
- X types analyzed
- Y issues found
- Priority: [High/Medium/Low]

### Issues Found

#### 1. Unused Field: `TypeName.fieldName`
**Location**: `path/to/file.ts:123`
**Evidence**:
- Found in type definition: `fieldName: string`
- Found 3 writes: `{fieldName: "value"}` (file.ts:45, 67, 89)
- Found 0 reads: No usage of `.fieldName` anywhere

**Recommendation**: Remove the `fieldName` field from `TypeName`.

#### 2. Inline Type Duplication: `file.ts:200`
**Location**: `path/to/file.ts:200`
**Code**:
```typescript
const items: Array<{ from: number; to: number }> = [];
```
**Duplicate of**: `Position` type (or `Omit<Match, 'label'>`)

**Recommendation**:
```typescript
const items: Omit<Match, 'label'>[] = [];
```

### Green Flags
- ✅ `GoodType` - all fields verified in use
- ✅ Uses `Omit<>` for type subsetting appropriately

---

## Example Analysis Session

```bash
# Step 1: Find changed files
$ git diff HEAD~1 --name-only
lib/charjump/state.ts
lib/charjump/CharJumpOverlay.tsx

# Step 2: Find type definitions
$ grep -n "^export type\|^type " lib/charjump/state.ts
14:export type CharJumpMatch = {

# Step 3: Extract type definition
CharJumpMatch {
  from: number;
  to: number;
  text: string;
  label: string;
}

# Step 4: Check field usage for 'text'
$ grep -rn "\.text" lib/charjump/
lib/charjump/state.ts:90:    text: text.slice(foundIndex, foundIndex + search.length),

# Result: Only found in assignment (write), never read
# Conclusion: 'text' field is unused

# Step 5: Check for inline types
$ grep -n "Array<{" lib/charjump/state.ts
67:  const allMatches: Array<{ from: number; to: number; text: string }> = [];

# Step 6: Compare to CharJumpMatch
CharJumpMatch: { from, to, text, label }
Inline type:   { from, to, text }
# This is CharJumpMatch minus 'label'

# Recommendation: Use Omit<CharJumpMatch, 'label'>
```

---

## Version History
- v1.1.0 (2024-12-25): Add "Verify, Don't Assume" principle and improve Phase 3 to question intermediate structure existence before suggesting type solutions
- v1.0.0 (2024-12-24): Initial type analysis skill for deep TypeScript type scrutiny
