# GitHub Pages deployment

Vite uses a relative base. Serve the contents of `frontend/dist/` from the target project directory. There are no nested client-side URL routes. Set GitHub Pages source to GitHub Actions and use the protected `github-pages` environment after approving the release assets and data use.

The separate Pages workflow is a manual run on `main`. It requires `WARDLINE_PAGES_APPROVED=true` and verifies the assembled site before sending an artifact. The deployment job has Pages and OIDC rights. The verification job uses read-only access. Review checked-in action pins against their upstream releases before updates.

To simulate the same project layout locally, run `node frontend/scripts/pages_acceptance.mjs assets browser spatial` after building. On deployment, verify the returned URL in a browser, especially the bundle, spatial chunks and handbook under the project path. Roll back by rebuilding and deploying the previous approved source revision. [GitHub Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
