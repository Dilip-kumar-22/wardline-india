# WARDLINE INDIA — Visualization Registry (v1.3.0)

| ID | Visualization | Location | Technology | Data Source | 2D / Accessibility Fallback | Export |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **V01** | Seasonal Terrain (3D) | `07 / 3D Spatial Lab` | Lazy Three.js + OrbitControls | Active dataset (`buildTerrainMatrix`) | Instant toggle & auto WebGL fallback to 2D Heatmap (`V06`) | CSV |
| **V02** | Regional Comparison Matrix | 3D Spatial Lab | Aligned monthly small multiples | Active reporting series | Works without WebGL | Interactive comparison |
| **V04** | Radial Seasonal Clock | `02 / Seasonal Atlas` | Custom SVG + IMD Season Arcs | Active dataset (`buildTerrainMatrix`) | Built-in toggle to 2D Calendar Matrix (`V06`) | CSV, SVG, PNG |
| **V05** | Regional Comparison Wall | `03 / Regional Explorer` | Coordinated Small-Multiple SVGs | Active dataset (`states`) | Search, sort, shared/independent Y-scale, pinning, SR text | Table parity |
| **V06** | Calendar Rhythm Matrix | `02 / Seasonal Atlas` | Custom SVG Heatmap (`SvgHeatmap`) | Active dataset (`monthly`) | Full tabular inspection & hatched missing-data gaps | CSV, SVG, PNG |
| **V07** | Seasonal Distribution Explorer | `02 / Seasonal Atlas` | Custom SVG IQR Box-Whisker | Active dataset (`monthly`) | Auto dot-plot mode when `n < 4`; displays `n` & outliers | CSV, SVG, PNG |
| **V08** | Historical Growth Explorer | `02 / Seasonal Atlas` | Custom SVG Diverging Bar / Line | Active dataset (`buildGrowthSeries`) | Zero-denominator guard & gap breaks | CSV, SVG, PNG |
| **V09** | Reporting Coverage Observatory | `03 / Regional Explorer` | Interactive Unit × Year Matrix | Active dataset (`buildCoverageMatrix`) | Fixed-cohort vs variable-coverage narrative + withheld IPD notice | Table parity |
| **XAI** | Forecast Explainer Timeline | `05 / Forecast Lab` | Interactive SVG Walkthrough + Error Bars | Active dataset (`forecasts`) | Step-by-step buttons, respects `prefers-reduced-motion` | Benchmark table |
| **D01–D08** | Research Methodology Diagrams | `08 / Methodology` | 8 Custom Interactive SVGs | Live pipeline metrics + explicitly labeled Educational Fixtures | Interactive toggles & full text descriptions | Inline SVG |
| **PRES** | Guided CA1 Presentation Mode | Fullscreen Modal View | 12-Chapter Live-Data Deck | Live active dataset (all charts interactive) | 5-min CA1 route (6 chapters) + keyboard nav + presenter notes | Fullscreen |
