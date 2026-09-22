---
description: "Browser-safe decision-register table grammar, architecture-diagram extraction, diagram fingerprints, and bounded workspace text reads."
kind: "package-library"
---

# dsh-util-project-register

English | [中文](README.zh.md)

## Summary

Browser-safe project register helpers shared by the project tabs and the milestone recorder. The package parses and appends the `DECISIONS.md` decision-register table (`ID | Date | Kind | Title | Status | Diagram`), extracts the current Mermaid diagram from `ARCHITECTURE.md`, fingerprints diagram sources, derives live diagram freshness against the latest milestone row, and reads one complete UTF-8 workspace file as text over the `workspaceFiles` Remote. It has no Cordis service or runtime state.

## Table of Contents

- [Register grammar](#register-grammar)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="register-grammar"></a>
## Register grammar

A register row is one Markdown table line with six cells. `ID` is `D<n>` for a decision or `M<n>` for a milestone; `Date` is `YYYY-MM-DD`; `Kind` is `decision` or `milestone`; `Status` is `proposed`, `accepted`, `superseded`, or `done`; `Diagram` is `—` on a decision row, or `<flag>` / `<flag>@<fingerprint>` on a milestone row with `flag` one of `updated`, `stale`, `absent`. `parseRegister` keeps well-formed rows in file order and skips any other line, including rows carrying an unknown kind, status, or Diagram cell. `nextRegisterId` scans raw table lines, so an existing identity is never reissued even when its row is malformed. `formatRegisterRow` cuts a title at 200 characters, collapses its whitespace, and turns its `|` characters into `/`; `appendRegisterRow` places a row after the table's last register row and creates the standard heading and table when the document holds none. `diagramSource` returns the first closed non-empty ` ```mermaid ` block's source. `diagramFingerprint` is an 8-hex-digit FNV-1a hash used only to detect content change, and `diagramFreshness` reports `absent` without a diagram, `stale` while an unchanged diagram is the one a milestone recorded as stale, and `current` otherwise.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One diagram per document** — `diagramSource` reads the first Mermaid block only; later blocks are ignored.
- **Register titles cannot hold `|`** — the formatter rewrites the character instead of escaping it, so a rendered title differs from a title containing it.
- **Fingerprints detect change, not identity** — the FNV-1a hash is not collision-resistant and must not authenticate content.
- **One complete file per read** — `readWorkspaceText` reads through `readBytes` under the Host's complete-file cap and does not page larger documents.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This utility owns no mutable runtime relationship.
