CI workflow
=============

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs the test suite.

Triggers
- Pull requests targeting `main` or `dev` (pull_request)
- Manual runs via the **Workflow dispatch** button in the GitHub UI

What it does
- Checks out the repository
- Installs Node.js (tested on Node `24` and `10.19.0`) with npm caching
- Installs dependencies using `npm ci`
- Runs `npm test` (the job fails if the test command exits non-zero)

Notes
- The workflow sets `CI=true` for deterministic behaviour in some test runners.
- To run the tests locally: `npm ci && npm test`