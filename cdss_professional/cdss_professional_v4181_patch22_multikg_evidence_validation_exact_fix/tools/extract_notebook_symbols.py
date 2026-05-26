"""Utility to inspect a notebook and print top-level function/class definitions.

Usage:
    python tools/extract_notebook_symbols.py /path/to/notebook.ipynb
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path


def extract_symbols(nb_path: Path) -> list[tuple[str, str, int]]:
    notebook = json.loads(nb_path.read_text(encoding="utf-8"))
    results: list[tuple[str, str, int]] = []
    for idx, cell in enumerate(notebook.get("cells", []), start=1):
        if cell.get("cell_type") != "code":
            continue
        source = "".join(cell.get("source", []))
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                results.append(("function", node.name, idx))
            elif isinstance(node, ast.ClassDef):
                results.append(("class", node.name, idx))
    return results


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python tools/extract_notebook_symbols.py <notebook.ipynb>")
        return 1
    nb_path = Path(sys.argv[1])
    symbols = extract_symbols(nb_path)
    for kind, name, cell_idx in symbols:
        print(f"cell {cell_idx:03d} | {kind:8s} | {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
