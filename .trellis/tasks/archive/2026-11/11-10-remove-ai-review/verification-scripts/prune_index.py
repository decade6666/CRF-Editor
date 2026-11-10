import json, io, sys

p = '.claude/index.json'
d = json.load(io.open(p, encoding='utf-8'))
remove = {
    'backend/src/services/ai_review_service.py',
    'backend/tests/test_ai_review_service.py',
    'backend/tests/test_settings_ai_test.py',
    'frontend/src/composables/docxAiSuggestionOverrides.js',
    'frontend/tests/docxAiSuggestionAcceptance.test.js',
}

def prune(node):
    if isinstance(node, dict):
        for v in node.values():
            prune(v)
    elif isinstance(node, list):
        node[:] = [x for x in node if not (isinstance(x, str) and x in remove)]
        for v in node:
            prune(v)

prune(d)
io.open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

d2 = json.load(io.open(p, encoding='utf-8'))
found = []

def walk(node):
    if isinstance(node, dict):
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for v in node:
            walk(v)
    elif isinstance(node, str) and node in remove:
        found.append(node)

walk(d2)
print('pruned; remaining AI file entries:', found)
