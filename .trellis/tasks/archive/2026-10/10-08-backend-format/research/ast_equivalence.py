"""Compare AST of two backend trees; docstrings normalized the way black/ruff reflow them."""
import ast, sys, pathlib

def _normalize_docstrings(tree: ast.AST) -> ast.AST:
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = node.body
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
                lines = body[0].value.value.expandtabs().splitlines()
                body[0].value.value = "\n".join(l.strip() for l in lines).strip()
    return tree

def dump(path: pathlib.Path, normalize: bool) -> str:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return ast.dump(_normalize_docstrings(tree) if normalize else tree)

orig, fmt = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
raw_diff, norm_diff, total = [], [], 0
for p in sorted(orig.rglob("*.py")):
    rel = p.relative_to(orig); q = fmt / rel; total += 1
    if dump(p, False) != dump(q, False): raw_diff.append(str(rel))
    if dump(p, True) != dump(q, True): norm_diff.append(str(rel))
print(f"files={total} raw_ast_diff={len(raw_diff)} normalized_ast_diff={len(norm_diff)}")
print("raw-only (docstring reflow):", raw_diff[:8], "..." if len(raw_diff) > 8 else "")
print("normalized diffs:", norm_diff)
