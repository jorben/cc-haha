## Summary


## Verification

- [ ] I ran the relevant local checks, or explained why they do not apply.
- [ ] I ran `bun run quality:pr` for code changes, including the coverage gate.
- [ ] I attached or summarized the quality report path, JUnit/log artifact path, and pass/fail/skip counts.

## Risk

- [ ] This PR does not touch CLI core paths, or it has maintainer approval for `allow-cli-core-change`.
- [ ] Production code changes include matching tests, or have maintainer approval for `allow-missing-tests`.
- [ ] Coverage baseline/threshold changes have maintainer approval for `allow-coverage-baseline-change`.
- [ ] Quarantined tests still have owners, exit criteria, and unexpired review windows.
- [ ] Provider/runtime changes were covered by mock contract tests, and live smoke was run or explicitly deferred.

@dosubot review this PR for changed-area risk, missing tests, docs impact, desktop startup risk, and CLI core impact.
