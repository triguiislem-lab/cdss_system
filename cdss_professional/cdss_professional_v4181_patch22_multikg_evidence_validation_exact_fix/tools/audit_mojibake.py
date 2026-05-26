#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

MOJIBAKE_MARKERS = ["Ã", "Â", "â€", "â€™", "â€œ", "â€\u009d", "ï¿½"]
DEFAULT_EXTENSIONS = {".py", ".json", ".yaml", ".yml", ".txt", ".md", ".csv"}
ALLOWLIST_RELATIVE = {
    "docs/DATA_INTEGRITY_AUDIT.md",
    "libs/utils/medical_text.py",
    "tools/audit_mojibake.py",
}


def scan(root: Path, *, include_docs: bool = False) -> list[dict]:
    findings = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in DEFAULT_EXTENSIONS:
            continue
        rel = path.relative_to(root).as_posix()
        if rel in ALLOWLIST_RELATIVE:
            continue
        if not include_docs and rel.startswith("docs/"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            findings.append({"path": rel, "line": 0, "marker": "UnicodeDecodeError", "excerpt": str(exc)})
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for marker in MOJIBAKE_MARKERS:
                if marker in line:
                    findings.append({"path": rel, "line": lineno, "marker": marker, "excerpt": line.strip()[:180]})
                    break
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit likely UTF-8 mojibake in source/config files.")
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--include-docs", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    findings = scan(Path(args.root), include_docs=args.include_docs)
    if args.json:
        print(json.dumps({"finding_count": len(findings), "findings": findings}, ensure_ascii=False, indent=2))
    else:
        for f in findings:
            print(f"{f['path']}:{f['line']} [{f['marker']}] {f['excerpt']}")
        print(f"finding_count={len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
