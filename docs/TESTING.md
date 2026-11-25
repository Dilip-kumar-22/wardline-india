# Testing

After acquiring and building the application, run from the repository root.

```sh
python -m unittest discover -s tests -v
python scripts/verify_research.py
npm --prefix frontend run typecheck
npm --prefix frontend run verify:logic
node --test frontend/scripts/runtime_bundle.test.mjs
npm --prefix frontend exec -- playwright install chromium
node frontend/scripts/pages_acceptance.mjs assets browser spatial
node frontend/scripts/handbook_acceptance.mjs
```

Use `WARDLINE_EVIDENCE` to place logs and screenshots outside the source tree. Browser checks validate the served JSON media type, schema and checksum, HTML/CSS/JS/font and lazy chunk loads under the Pages project path, navigation, responsive layouts, keyboard/focus, import/export, regional matrix, WebGL terrain/fallback and offline handbook behavior. The controlled import observations are synthetic test fixtures. Frontend lint has no configured command. The latest technical report should name the actual browser and renderer and distinguish automated checks from assistive technology and hardware coverage.
