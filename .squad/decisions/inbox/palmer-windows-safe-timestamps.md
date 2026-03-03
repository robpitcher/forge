### 2026-03-03: Squad log filenames must use Windows-safe timestamps

**By:** Palmer (DevOps Specialist)

**What:**
All squad log files (`.squad/log/` and `.squad/orchestration-log/`) must use Windows-safe ISO 8601 timestamps. Colons in the time portion must be replaced with hyphens.
- Valid: `2026-02-27T14-39-00Z` (Windows-safe)
- Invalid: `2026-02-27T14:39:00Z` (contains colons — invalid on Windows)

**Why:**
Windows filenames cannot contain colons (reserved for drive letters). Squad logs generated with ISO 8601 timestamps caused Windows clones to fail with "invalid path" errors. This affects all squad members developing on Windows.

**Decision:**
1. ✅ Renamed all 51 existing log files (17 in `.squad/log/`, 34 in `.squad/orchestration-log/`)
2. ✅ Updated `.squad-templates/orchestration-log.md` with Windows-safe format guidance
3. ✅ Updated `.squad-templates/scribe-charter.md` with timestamp format clarification
4. ✅ Updated `.github/agents/squad.agent.md` to instruct Scribe to use Windows-safe timestamps
5. ✅ Verified zero tracked files contain colons (`git ls-files | grep ":"` → no results)

**Affected Parties:**
- Scribe agent — must use Windows-safe timestamps when writing logs
- All squad members — Windows clones now work without path errors
- Future log generation — templates now enforce Windows-safe format

**Commit:** 9e12441 (`fix(squad): rename log files to Windows-safe paths`)
