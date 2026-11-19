# Releasing the operator app

A tag `operator-v<semver>` builds and publishes an auto-updating installer to every till. Treat a tag as a deploy.

## One-time GitHub setup (repo owner)

1. **Protect the tags.** Settings > Rules > Rulesets > New tag ruleset. Target `operator-v*`. Restrict creations, updates and deletions to admins (or the release managers). Nobody can move or re-create a released tag.
2. **Create the `release` environment.** Settings > Environments > New environment `release`. Add **required reviewers** (at least one person other than the tagger). Restrict deployment to tags `operator-v*` if you want.
3. **Move every secret into that environment** and delete the repo-level copies. Every release job (`prepare`, `windows`, `macos`, `publish`) runs in `release`, so each one waits for a reviewer and no other workflow can read them.

### Secrets (environment `release`)

- Always: `OPERATOR_SUPABASE_URL`, `OPERATOR_SUPABASE_ANON_KEY`, `RELEASES_GH_TOKEN` (write access to the public releases repo).
- Windows signing, one route is required:
  - Azure Trusted Signing: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
  - SSL.com eSigner: `WIN_ESIGNER_USERNAME`, `WIN_ESIGNER_PASSWORD`, `WIN_ESIGNER_CREDENTIAL_ID`, `WIN_ESIGNER_TOTP_SECRET`
  - PFX: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`
- macOS (optional, built only if all are set): `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

### Variables (environment `release`)

- `WIN_SIGN_PUBLISHER_NAME`: certificate subject CN (comma-separated to list an old and a renewed cert). **Required.**
- Azure route also: `AZURE_CODE_SIGNING_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME`.
- `WIN_SIGN_DRY_RUN=1` only to count eSigner signings. Leave unset for real releases.

## Cutting a release

1. Merge to `main` and wait for CI to go green on that commit (a push to `main`).
2. Tag that exact commit and push:
   ```
   git checkout main && git pull
   git tag operator-v0.2.0
   git push origin operator-v0.2.0
   ```
3. The `gate` job checks the commit is on `main` and CI passed there as a push to `main`. A tag on an unmerged branch commit is refused.
4. Approve the `release` environment prompts as they appear. `publish` turns the draft live only after every asset has uploaded.

## Unsigned releases are refused

Without a signature and a publisher name, electron-updater skips signature checks on the till. So the release fails (in `prepare` and again in `windows`) when there are no Windows signing credentials, or `WIN_SIGN_PUBLISHER_NAME` is unset, unless `WIN_SIGN_DRY_RUN=1`. The config also throws when `REQUIRE_SIGNED=1` and the build would be unsigned. Local `pnpm --filter @rop/operator-shell dist:dir` stays unsigned for development.

## Re-cutting

A published version cannot be re-published: delete the release and tag in the releases repo first, and have an admin remove the tag here (it is protected).
