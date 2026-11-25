# User guide

Open the application in a recent browser. Use the indicator and geography selectors to inspect a series. Compare seasonal patterns, view regional reporting, open the 3D Spatial Lab, or inspect the historical model benchmark in Forecast Lab. The methodology view explains visual encodings. Presentation Mode guides a walkthrough. The Complete handbook link opens the standalone guide with search, observation explorer, mathematics demonstrations and study questions.

Use Data & methods to load a CSV following the import template. Processing is local in browser memory. Restoring official data changes the active dataset back to the supplied HMIS derivative. Use chart downloads or the active-slice CSV to export results.

For a runnable ZIP, extract to a new directory and run `python -m http.server 4173 --bind 127.0.0.1 --directory app` from the extracted root, then open `http://127.0.0.1:4173/`. On Windows, the supplied launcher starts the loopback server on a free port. Open `app/handbook.html` directly for the offline handbook. The application itself needs a static HTTP origin.
