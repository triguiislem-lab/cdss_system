"""Stage split Kaggle Qwen datasets into one Transformers model directory.

Kaggle mounts each dataset as a separate read-only directory. Hugging Face
Transformers expects config/tokenizer files and weight shards under a single
model directory. This script creates /kaggle/working/cdss-qwen3-32b and symlinks
all files from the part datasets into it without modifying the source datasets.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path


PART_DIRS = [
    Path("/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-01"),
    Path("/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-02"),
    Path("/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-03"),
    Path("/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-04"),
    Path("/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-05"),
    Path("/kaggle/input/datasets/islemtrigui/cdss-qwen3-32b-part-06"),
]
OUTPUT_DIR = Path("/kaggle/working/cdss-qwen3-32b")


def iter_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file():
            yield path


def link_or_copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return
    try:
        os.symlink(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    linked = 0
    missing = []
    collisions = []
    for part in PART_DIRS:
        if not part.exists():
            missing.append(str(part))
            continue
        for src in iter_files(part):
            rel = src.relative_to(part)
            dst = OUTPUT_DIR / rel
            if dst.exists():
                # Same filename in multiple parts is fine for shared configs.
                if dst.stat().st_size != src.stat().st_size:
                    collisions.append(f"{rel}: {dst.stat().st_size} != {src.stat().st_size}")
                continue
            link_or_copy(src, dst)
            linked += 1

    print(f"staged_dir={OUTPUT_DIR}")
    print(f"files_linked={linked}")
    print(f"missing_parts={len(missing)}")
    for item in missing:
        print(f"missing={item}")
    print(f"size_collisions={len(collisions)}")
    for item in collisions[:20]:
        print(f"collision={item}")

    required_any = ["config.json", "tokenizer.json", "tokenizer_config.json"]
    for name in required_any:
        print(f"has_{name}={(OUTPUT_DIR / name).exists()}")
    index_files = list(OUTPUT_DIR.glob("*.index.json"))
    shard_files = list(OUTPUT_DIR.glob("*.safetensors")) + list(OUTPUT_DIR.glob("*.bin"))
    print(f"index_files={len(index_files)}")
    print(f"weight_files={len(shard_files)}")
    return 1 if missing or collisions else 0


if __name__ == "__main__":
    raise SystemExit(main())
