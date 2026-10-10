"""Count McCabe decision points in backend-dedup target functions using stdlib AST.

Usage:
    python3 complexity.py <source.py> name1 [name2 ...]
    python3 complexity.py <source.py> --class OrderService method1 method2 ...
"""

from __future__ import annotations

import argparse
import ast
from pathlib import Path


class DecisionCounter(ast.NodeVisitor):
    """Count McCabe branch points: branches, boolean operators, and comprehensions."""

    def __init__(self, root: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        self.root = root
        self.decisions = 0

    def visit_If(self, node: ast.If) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_While(self, node: ast.While) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:
        self.decisions += len(node.values) - 1
        self.generic_visit(node)

    def visit_IfExp(self, node: ast.IfExp) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_comprehension(self, node: ast.comprehension) -> None:
        self.decisions += 1 + len(node.ifs)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if node is self.root:
            self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        if node is self.root:
            self.generic_visit(node)

    def count(self) -> tuple[int, int]:
        self.visit(self.root)
        return self.decisions + 1, (self.root.end_lineno or self.root.lineno) - self.root.lineno + 1


def collect(
    tree: ast.Module, targets: list[str], class_name: str | None = None
) -> dict[str, ast.FunctionDef | ast.AsyncFunctionDef]:
    found: dict[str, ast.FunctionDef | ast.AsyncFunctionDef] = {}

    def walk(body: list[ast.stmt]) -> None:
        for node in body:
            if isinstance(node, ast.ClassDef):
                if class_name is None or node.name == class_name:
                    walk(node.body)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in targets:
                previous = found.get(node.name)
                if previous is None or node.lineno > previous.lineno:
                    found[node.name] = node

    walk(tree.body)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--class-name", default=None)
    parser.add_argument("names", nargs="+")
    args = parser.parse_args()
    tree = ast.parse(args.source.read_text(encoding="utf-8"), filename=str(args.source))
    functions = collect(tree, args.names, args.class_name)
    missing = [name for name in args.names if name not in functions]
    if missing:
        raise SystemExit(f"missing functions: {', '.join(missing)}")
    for name in args.names:
        complexity, lines = DecisionCounter(functions[name]).count()
        print(f"{name}: cx={complexity} lines={lines}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
