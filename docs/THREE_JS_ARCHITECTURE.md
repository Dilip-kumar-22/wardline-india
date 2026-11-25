# Three.js architecture

The Spatial Lab lazy-loads `SeasonalTerrain3D.tsx` with React Suspense. It renders the calendar month by year matrix using exactly the active count or calendar-day rate. Its 2D heatmap uses the same values. Observed zero and missing cells have distinct markers. Perspective and orthographic views, orbit controls, zoom, and a top view support inspection.

WebGL2 is checked before rendering. Initialization failure or browser context loss switches the view to the 2D equivalent. The scene uses demand-driven rendering, honors reduced motion, and releases native resources on unmount. CSV and PNG exports preserve units and provenance. SVG is available in 2D.

The regional comparison matrix uses aligned monthly small multiples with search, pinning, and shared or independent scales. Its rows are HMIS reporting units or the user's imported series. It requires no boundary data or WebGL.
