"""Count McCabe decision points in selected export-service functions using stdlib AST."""

from __future__ import annotations

import argparse
import ast
from pathlib import Path

TARGETS = (
    "_add_forms_content",
    "_add_field_row",
    "_add_inline_table",
    "_add_log_row",
    "_add_label_row",
)


class DecisionCounter(ast.NodeVisitor):
    """Count McCabe branch points: branches, boolean operators, and comprehensions."""

    def __init__(self) -> None:
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

    def count(self, root: ast.FunctionDef | ast.AsyncFunctionDef) -> int:
        self.root = root
        self.visit(root)
        return self.decisions + 1


def find_functions(tree: ast.Module) -> dict[str, ast.FunctionDef | ast.AsyncFunctionDef]:
    return {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in TARGETS
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="export_service.py path")
    source = parser.parse_args().source
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    functions = find_functions(tree)
    missing = [name for name in TARGETS if name not in functions]
    if missing:
        raise SystemExit(f"missing functions: {', '.join(missing)}")
    for name in TARGETS:
        complexity = DecisionCounter().count(functions[name])
        print(f"{name}: {complexity}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
