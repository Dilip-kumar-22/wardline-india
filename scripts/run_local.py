"""Serve the extracted runnable edition on IPv4 loopback until interrupted."""
import argparse
import functools
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class WardlineHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".md": "text/plain; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".js": "text/javascript",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).with_name("app"))
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not (directory / "index.html").is_file():
        parser.error(f"No built application found in {directory}")

    handle = functools.partial(WardlineHandler, directory=str(directory))
    with ThreadingHTTPServer(("127.0.0.1", 0), handle) as server:
        url = f"http://127.0.0.1:{server.server_port}/"
        print(f"Open {url} in your browser. Press Ctrl+C to stop.", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
