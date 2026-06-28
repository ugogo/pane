# Docs

Planning and spike documents for Pane. Filenames are prefixed with the creation
date (`YYYY-MM-DD-…`) so a directory listing sorts chronologically.

## Frontmatter

Every doc carries YAML frontmatter:

| field     | meaning                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------- |
| `title`   | Human title.                                                                                   |
| `type`    | `plan` or `spike`.                                                                             |
| `status`  | Lifecycle: `proposed` → `in-progress` → `shipped` → `superseded`.                              |
| `created` | Authored date (matches the filename prefix).                                                   |
| `updated` | Last **content** revision — the chronological sort key. Don't bump it for metadata-only edits. |

## Index (newest first)

- 2026-06-28 — [Windows Expo and React Native Removal](2026-06-28-windows-remove-expo-react-native-plan.md) · shipped
- 2026-06-06 — [Capture Annotation Plan](2026-06-06-capture-annotation-plan.md) · in-progress
- 2026-06-06 — [Light Control Presets Plan](2026-06-06-light-presets-plan.md) · shipped
- 2026-06-04 — [Code Quality Audit & Refactor](2026-06-04-code-quality-audit.md) · shipped
- 2026-06-02 — [Monorepo Restructure & Shared Protocol](2026-06-02-monorepo-restructure-plan.md) · shipped
- 2026-06-01 — [iPhone Companion Plan](2026-06-01-mobile-companion-plan.md) · shipped
- 2026-05-29 — [Security Hardening Plan](2026-05-29-security-hardening-plan.md) · shipped
- 2026-05-27 — [Tauri Migration Feasibility Spike](2026-05-27-tauri-migration-spike.md) · shipped
