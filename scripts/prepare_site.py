"""Stage the static handbook and notices for a verified analytical build."""
import hashlib
import json
import shutil
from pathlib import Path

import generate_handbook


ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / 'frontend'
PUBLIC = FRONTEND / 'public'
PACKAGES = {
    '@fontsource/anton': 'Anton-OFL.txt',
    '@fontsource/archivo': 'Archivo-OFL.txt',
    'react': 'React-MIT.txt',
    'react-dom': 'React-DOM-MIT.txt',
    'scheduler': 'Scheduler-MIT.txt',
    'three': 'Three-MIT.txt',
}


def verify_asset(path: Path, expected_bytes: int, expected_sha256: str) -> None:
    data = path.read_bytes()
    if len(data) != expected_bytes or hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError(f'Unexpected size or SHA-256 for {path.name}')


def main() -> None:
    data = PUBLIC / 'data'
    bundle = json.loads((data / 'manifest.json').read_text(encoding='utf-8'))
    verify_asset(data / 'wardline_india_bundle.json', bundle['bundle_bytes'], bundle['bundle_sha256'])
    expected = {'manifest.json', 'wardline_india_bundle.json'}
    if {entry.name for entry in data.iterdir()} != expected:
        raise ValueError('Unexpected files in frontend/public/data. Keep only the public runtime manifest and bundle.')
    generate_handbook.generate()

    destination = PUBLIC / 'licenses'
    destination.mkdir(exist_ok=True)
    for package, filename in PACKAGES.items():
        shutil.copyfile(FRONTEND / 'node_modules' / package / 'LICENSE', destination / filename)
    shutil.copyfile(ROOT / 'THIRD_PARTY_NOTICES.md', destination / 'THIRD_PARTY_NOTICES.md')


if __name__ == '__main__':
    main()
