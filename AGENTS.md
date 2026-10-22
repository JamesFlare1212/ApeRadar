# Repository Instructions

## Development Language

- Use English for new or modified code identifiers, comments, developer documentation, commit messages,
  pull request titles and descriptions, release notes, and CI workflow names, steps, and messages.
- Preserve localized application text and translation resources in their intended languages.
- Follow the existing TypeScript, React, Electron, and pnpm workspace conventions.

## UI Components

- Use shadcn/ui for new or modified application UI. Reuse the local components in
  `apps/web/src/components/ui/` and the shared wrappers in `apps/web/src/components/ui.tsx`.
- Compose existing shadcn/ui components for complex controls. When a suitable component is missing,
  add it using the existing `apps/web/components.json` configuration before building a custom control
  or introducing another UI library.
- Keep Radix primitive imports within the shadcn/ui component layer. Application code should consume
  the local shadcn/ui components and wrappers.
- Style components with the existing semantic design tokens, support light and dark themes, and
  preserve keyboard accessibility and existing interaction behavior.

## Validation

- Run checks appropriate to the change. For application changes, use `pnpm check` for type checking,
  regression tests, and design-token validation, and `pnpm build` for production builds.
- For changes affecting desktop behavior, run `pnpm smoke:desktop`.
- For changes affecting live API behavior, use `pnpm test:api:live` when `WG_APPLICATION_ID` is available.
  Keep live API checks separate from offline regression tests and use isolated test data.
- For documentation-only changes, check Markdown formatting and patch whitespace with
  `git diff --check`.
- Report only checks that actually ran, including any failures or skipped checks. Use the actual
  regression test count from the current run.

## Releases

- Write release notes in English using the `Changes`, `Downloads`, and `Validation` sections below.
- Replace every placeholder with the actual release version, changes, and validation results. Do not
  copy an old version number or test count into a new release.
- Keep the root `package.json`, every `apps/*/package.json` and `packages/*/package.json` version, and
  the stable release tag (`vX.Y.Z`) consistent. Verify them with
  `node scripts/verify-release-version.mjs vX.Y.Z` using the actual tag.
- Build Windows release artifacts with `pnpm dist:win`. Include the Windows x64 installer, portable
  executable, `latest.yml`, and installer `.blockmap` file. Match download names to the generated
  artifacts in `release/`.
- Verify release metadata, installer checksums, and companion files with `pnpm verify:updates`, then
  run `pnpm verify:package` against the generated portable executable before claiming that packaged
  validation passed.
- Distinguish update-feed checks and simulated update tests from actual version-to-version
  installation when reporting validation.
- Publishing is triggered by pushing a version tag; manually running the build workflow only
  produces build artifacts. The release destination is `JamesFlare1212/ApeRadar`.

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
