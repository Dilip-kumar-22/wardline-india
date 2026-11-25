# Architecture

`pipeline/` acquires a checksum-pinned archive, normalizes observations, reconciles source rows, computes analytical summaries and forecasts, and publishes the compact runtime JSON. `contracts/` contains the data schema. `frontend/` serves React views from that read-only JSON. A locally parsed CSV can replace selectors' active in-memory dataset. Data exports originate in the browser.

The visualizations use shared selectors, chart framing and theme tokens. Rendering a spatial view lazily loads the Three.js code and uses a 2D view when WebGL is unavailable. Regional comparison uses a separate 2D matrix of reporting-unit series. The handbook generator embeds the research inputs and interaction logic into standalone HTML, with a Markdown companion.

GitHub Pages can serve the same static output as a loopback server via relative asset URLs. The app holds view navigation in React state. Refreshing the app directory returns to the Overview and restores the theme preference. See [Three.js architecture](THREE_JS_ARCHITECTURE.md) and [visualization registry](VISUALIZATION_REGISTRY.md).
