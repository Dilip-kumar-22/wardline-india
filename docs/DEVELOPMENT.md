# Development

Create a Python virtual environment with `python -m venv .venv`. Activate it with `source .venv/bin/activate` in a POSIX shell or call `.venv\Scripts\python.exe` directly on Windows. Use Node.js 24 and the checked-in npm lockfile.

Follow the [README build steps](../README.md#run-from-source). Data acquisition validate exact hashes and write only in local ignored directories. The Python requirements pin the direct research dependencies. `npm ci --no-audit --no-fund` installs the frontend dependency graph from its lock. Use `npm --prefix frontend run dev -- --host 127.0.0.1` for development after preparing the runtime assets and handbook.

Run the [regression checks](TESTING.md) before changing contracts, model code or data selection. Use the existing test fixtures for changed behavior and keep analytical definitions and attribution current.
