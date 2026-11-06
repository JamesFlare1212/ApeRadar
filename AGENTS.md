# Repository Instructions

## Development Language

- Use English for new or modified code identifiers, comments, developer documentation, commit messages,
  pull request titles and descriptions, release notes, and CI workflow names, steps, and messages.
- Preserve localized application text and translation resources in their intended languages.
- Follow the existing TypeScript, React, Electron, and pnpm workspace conventions.

## Version Control

- Do not commit changes unless the user explicitly requests it.

## UI Components

- Use shadcn/ui for new or modified application UI. Reuse the local components in
  `apps/web/src/components/ui/` and the shared wrappers in `apps/web/src/components/ui.tsx`.
- Compose existing shadcn/ui components for complex controls. When a suitable component is missing,
  add it using the existing `apps/web/components.json` configuration. A necessary exception to
  using shadcn/ui requires user approval before building a custom control or adding another UI library.
- Keep Radix primitive imports within the shadcn/ui component layer. Application code should consume
  the local shadcn/ui components and wrappers.
- Style components with the existing semantic design tokens, support light and dark themes, and
  preserve keyboard accessibility and existing interaction behavior.
- Use the official shadcn/ui skill in `.agents/skills/shadcn/`. From the repository root, run
  shadcn CLI commands with `pnpm dlx shadcn@latest <command> --cwd apps/web`.
- The project-scoped Codex MCP configuration is in `.codex/config.toml` and starts shadcn in
  `apps/web`. Its Windows command and absolute working directory target this local checkout;
  update them when moving the checkout or using another operating system. Codex loads project
  MCP configuration only after the project is trusted and the session is restarted.

## Validation

- Before completing a task, run checks appropriate to the change. For application changes, use
  `pnpm check` for type checking, regression tests, and design-token validation, and `pnpm build`
  for production builds.
- For changes affecting desktop behavior, run `pnpm smoke:desktop` after building.
- For changes affecting live API behavior, use `pnpm test:api:live` when an effective WG Application ID
  is available through the API configuration or `WG_APPLICATION_ID`. Keep live API checks separate
  from offline regression tests and use isolated test data.
- For documentation-only changes, check Markdown formatting and local links, and run
  `git diff --check`. Application tests and builds are not required for documentation-only changes.
- Report only checks that actually ran, including any failures or skipped checks. Use the actual
  regression test count from the current run.
- See [Verification](docs/verification.md) for validation scope and evidence handling.

## Releases

- Follow [Publishing a version](docs/application-updates.md#publishing-a-version) for version
  consistency, required checks, Windows artifacts, release tags, and publication.
- Write `docs/releases/vX.Y.Z.md` in English before tagging the release, using the template below.
  Replace every placeholder with the actual version, changes, generated download names, and
  validation results. Do not copy an old version number or test count into a new release.
- Keep release-specific results in that release note. Link historical evidence to the matching
  commit or CI run; files in `artifacts/` are overwritten by later validation runs.
- Distinguish update-feed checks and simulated update tests from actual version-to-version
  installation when reporting validation.

Use this release notes template, adjusting validation bullets to reflect the checks actually run:

```markdown
## Changes

- <Describe a user-visible change in English.>

## Downloads

- `ApeRadar-Next-Setup-<VERSION>-x64.exe`: Windows x64 installer.
- `ApeRadar-Next-<VERSION>-x64.exe`: Windows x64 portable application.
- `latest.yml` and the `.blockmap` file support application updates.

## Validation

- <Describe checks/tests that passed/failed.>
```
