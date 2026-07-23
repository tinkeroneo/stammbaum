# Smoke tests

Run all browser smoke tests from the repository root:

```powershell
npm test
```

The Playwright configuration starts a local HTTP server automatically and uses the installed Chrome browser in headless mode. The test intercepts `Bodensteiner.json` and supplies the isolated fixture from `tests/fixtures/smoke-tree.cjs`; the production JSON is hash-checked before and after the run. Browser storage is created only inside Playwright's temporary context and is explicitly cleared after the test.
