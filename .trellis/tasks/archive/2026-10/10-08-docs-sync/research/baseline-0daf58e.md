# Baseline evidence — `main` @ `0daf58e` (S0)

Worktree: `/home/decade/CRF-Editor-docs-sync`, branch `docs/docs-sync`, base `0daf58e`.
Everything below was run from the worktree root on 2026-10-13 (CST).

## Sizes (chars / bytes)

| File | chars (`wc -m`) | bytes (`wc -c`) |
|---|---:|---:|
| `.claude/CLAUDE.md` | 36,164 | 40,921 |
| `.claude/index.json` | 20,668 | 20,668 |
| `backend/.claude/CLAUDE.md` | 72,982 | 76,951 |
| `frontend/.claude/CLAUDE.md` | 106,153 | 118,735 |
| `README.md` | 17,438 | 30,534 |
| `README.en.md` | 33,020 | 33,324 |
| `.context/history/archives/claudemd-changelog.md` | 84,089 | 127,067 |

Root `.claude/CLAUDE.md` is already **over its own 40k rule** under the byte reading (`wc -c` = 40,921)
and at 90% under the char reading. AC4 is asserted on bytes: post-edit `wc -c` must be < 40000.

## Validity / cleanliness

```
python3 -m json.tool .claude/index.json > /dev/null   -> OK (valid JSON)
git diff --check                                       -> clean
git status --porcelain                                 -> (empty)
```

## Probes

```
node --test frontend/tests/portDefaults.test.js        -> 4 pass / 0 fail   (no npm ci needed; plain node ESM)
```

`portDefaults.test.js` is the only test that reads `README.md` / `README.en.md`; it asserts the
8888 port contract only, not the sentences S4 rewrites.

## RED evidence (before any edit)

| Probe | Result |
|---|---|
| `reconcile_index.py` | **FAIL** — 5 lists short by the `__init__.py` package markers (`api_routes` 14/15, `services` 33/34, `models` 11/12, `schemas` 11/12, `repositories` 4/5) + 5 marker rows |
| `scan_order.py` | **FAIL** — 2 violations: `modules[0].services` (`export_service.py` at 6, `database_export_service.py` at 7), `modules[3].important_paths` (`crf-editor.service.template` before `crf-editor.env.example`) |
| `check_doc_paths.py` (5 docs, normative sections) | **PASS** (678 in-scope tokens, 1 allowlisted) |
| `check_doc_paths.py --spec` | **FAIL (expected)** — `cross-stack-contracts.md:62` lacks `§13` (D8) |
| `readme_parity.py` | **PASS** — line count, 24/24 code blocks, heading structure; numeric-token scan reports only intentional prose differences (see below) |

Raw RED output: `/tmp/docsync-scan/reconcile.red.txt`, `/tmp/docsync-scan/paths.red.txt`,
`/tmp/docsync-scan/paths.historical.txt`.

Notes on the probe design (recorded so the numbers are reproducible):

- `reconcile_index.py` globs **one directory level** per list (`*` does not cross `/`);
  `__init__.py` markers are asserted as a separate row set because they are the deliberate D2 additions.
- `check_doc_paths.py` is deliberately narrow — extension-only shorthands (`.py`), URL fragments
  (`/api/...`), symbolic lists (`day/month/year`) and directory mentions are out of scope; lines
  under a `## Change Log` heading are skipped unless `--include-changelog` (historical narrative).
- `readme_parity.py`'s numeric-token comparison reports 5 lines where the Chinese original writes a
  number the English text drops or spells out (`方式一` vs `Option 1`, `0 关闭保护，默认 24` vs
  `0 disables`). These are translation differences, not drift; the authoritative parity evidence is
  the line-count + code-block + heading comparison.
