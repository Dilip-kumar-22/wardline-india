"""Verified acquisition of the Zenodo MoHFW HMIS archive with SHA-256 verification."""
import hashlib
import urllib.request
from pathlib import Path

from .config import EXPECTED_RAW_SHA256, RAW_ZIP_PATH

ZENODO_DOWNLOAD_URL = "https://zenodo.org/api/records/23657569/files/hssling/elnino-hmis-services-india-v1.0.1.zip/content"
EXPECTED_BYTES = 3460316
USER_AGENT = "WARDLINE-INDIA/1.2.0 (CSE276 Academic Healthcare Analytics; https://doi.org/10.5281/zenodo.23657569)"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def acquire_raw_archive(dest: Path = RAW_ZIP_PATH, force: bool = False) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        actual = sha256_file(dest)
        if actual == EXPECTED_RAW_SHA256:
            return {
                "status": "verified_existing",
                "path": str(dest),
                "bytes": dest.stat().st_size,
                "sha256": actual,
            }
        raise ValueError(f"Existing archive checksum mismatch: expected {EXPECTED_RAW_SHA256}, got {actual}")

    tmp_dest = dest.with_suffix(".zip.part")
    req = urllib.request.Request(ZENODO_DOWNLOAD_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Unexpected HTTP status {resp.status} downloading {ZENODO_DOWNLOAD_URL}")
        data = resp.read()

    if len(data) != EXPECTED_BYTES:
        raise ValueError(f"Downloaded size mismatch: expected {EXPECTED_BYTES} bytes, got {len(data)}")

    actual_sha = hashlib.sha256(data).hexdigest()
    if actual_sha != EXPECTED_RAW_SHA256:
        raise ValueError(f"Downloaded SHA-256 mismatch: expected {EXPECTED_RAW_SHA256}, got {actual_sha}")

    tmp_dest.write_bytes(data)
    tmp_dest.replace(dest)
    return {
        "status": "downloaded_and_verified",
        "url": ZENODO_DOWNLOAD_URL,
        "path": str(dest),
        "bytes": len(data),
        "sha256": actual_sha,
    }
