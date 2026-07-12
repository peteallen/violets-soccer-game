#!/usr/bin/env python3
"""Generate the stadium panorama through OpenRouter's dedicated images API."""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path


MODEL = "google/gemini-3.1-flash-lite-image"
API_URL = "https://openrouter.ai/api/v1/images"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROMPT = REPO_ROOT / "art" / "stadium-prompt.txt"
DEFAULT_OUTPUT = REPO_ROOT / "art" / "raw" / "stadium-panorama.png"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt", type=Path, default=DEFAULT_PROMPT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--resolution", choices=("1K", "2K", "4K"), default="1K")
    parser.add_argument("--seed", type=int, default=6062026)
    return parser.parse_args()


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def write_png(image_bytes: bytes, output: Path) -> str:
    """Write PNG bytes directly or losslessly transcode a provider fallback format."""
    output.parent.mkdir(parents=True, exist_ok=True)
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        output.write_bytes(image_bytes)
        return "png"

    if image_bytes.startswith(b"\xff\xd8\xff"):
        source_format = "jpeg"
    elif image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        source_format = "webp"
    else:
        fail("OpenRouter returned an unrecognized image format")

    sips = shutil.which("sips")
    if not sips:
        fail(f"OpenRouter returned {source_format}, and sips is unavailable to convert it")

    with tempfile.NamedTemporaryFile(suffix=f".{source_format}") as source:
        source.write(image_bytes)
        source.flush()
        conversion = subprocess.run(
            [sips, "-s", "format", "png", source.name, "--out", str(output)],
            capture_output=True,
            text=True,
            check=False,
        )
    if conversion.returncode != 0:
        fail(f"could not convert provider {source_format} to PNG: {conversion.stderr.strip()}")
    if not output.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
        fail("converted output is not a PNG")
    return source_format


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        fail("OPENROUTER_API_KEY is not set")

    try:
        prompt = args.prompt.read_text(encoding="utf-8").strip()
    except OSError as exc:
        fail(f"could not read prompt file: {exc}")

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "aspect_ratio": "16:9",
        "resolution": args.resolution,
        "quality": "high",
        "n": 1,
        "seed": args.seed,
        "background": "opaque",
        "output_format": "png",
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "Violet's Soccer Game",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        fail(f"OpenRouter returned HTTP {exc.code}: {details}")
    except urllib.error.URLError as exc:
        fail(f"OpenRouter request failed: {exc.reason}")

    try:
        result = json.loads(body)
        image_result = result["data"][0]
        if "b64_json" in image_result:
            image_bytes = base64.b64decode(image_result["b64_json"], validate=True)
        elif "url" in image_result:
            with urllib.request.urlopen(image_result["url"], timeout=120) as response:
                image_bytes = response.read()
        else:
            fail("OpenRouter response did not include image data")
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        fail(f"could not decode OpenRouter image response: {exc}")

    source_format = write_png(image_bytes, args.out)
    usage = result.get("usage", {})
    cost = usage.get("cost")
    cost_text = f", cost ${cost:.4f}" if isinstance(cost, (int, float)) else ""
    conversion_text = f", converted from {source_format}" if source_format != "png" else ""
    print(
        f"Generated {args.out} with {MODEL} at {args.resolution}"
        f"{conversion_text}{cost_text}"
    )


if __name__ == "__main__":
    main()
