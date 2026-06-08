"""
AST-based Python linter — reads code from stdin, outputs JSON errors to stdout.
Called by Node.js linter.ts via child_process.
"""
import ast, sys, json

def lint(code: str) -> list:
    errors = []
    if not code.strip():
        return errors

    # 1. Syntax check
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        line = e.lineno or 1
        msg = e.msg or "语法错误"
        if "unexpected EOF" in msg:
            msg = "代码不完整，可能少了括号或冒号"
        elif "invalid syntax" in msg:
            msg = f"语法错误: 检查第{line}行附近的符号"
        elif "EOL while scanning" in msg:
            msg = "字符串没有闭合引号"
        return [{"line": line, "col": e.offset or 0, "msg": msg, "severity": "error"}]

    # 2. Undefined variable check
    defined = set(dir(__builtins__)) | {
        "np", "numpy", "self", "True", "False", "None",
        "List", "Optional", "Dict", "Tuple", "Set",
    }
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                defined.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom):
            for alias in (node.names or []):
                defined.add(alias.asname or alias.name)
        elif isinstance(node, ast.FunctionDef):
            defined.add(node.name)
            for arg in node.args.args:
                defined.add(arg.arg)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    defined.add(target.id)
        elif isinstance(node, ast.For):
            if isinstance(node.target, ast.Name):
                defined.add(node.target.id)

    skip_names = {
        "range", "len", "print", "enumerate", "zip", "map", "filter",
        "sorted", "reversed", "set", "dict", "list", "tuple", "str",
        "int", "float", "bool", "abs", "max", "min", "sum", "round",
        "type", "isinstance", "input", "open", "super", "property",
        "classmethod", "staticmethod", "hasattr", "getattr", "setattr",
        "AssertionError", "Exception", "ValueError", "TypeError",
        "KeyError", "IndexError", "NameError", "RuntimeError",
        "NotImplementedError", "StopIteration", "AttributeError",
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            name = node.id
            if name not in defined and not name.startswith('_') and name not in skip_names:
                errors.append({
                    "line": node.lineno, "col": node.col_offset,
                    "msg": f"'{name}' 可能未定义，检查拼写或 import",
                    "severity": "warning"
                })

    # 3. Common typos
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            attr = node.attr
            if attr in ("zero", "one"):
                errors.append({"line": node.lineno, "col": node.col_offset,
                    "msg": f"'{attr}' 拼写错误？应该是 '{attr}s'", "severity": "warning"})
            elif attr in ("lenght", "legnth"):
                errors.append({"line": node.lineno, "col": node.col_offset,
                    "msg": "拼写错误: 应该是 'length'", "severity": "warning"})
            elif attr in ("indicies", "indeces"):
                errors.append({"line": node.lineno, "col": node.col_offset,
                    "msg": "拼写错误: 应该是 'indices'", "severity": "warning"})

    return errors[:20]


if __name__ == "__main__":
    code = sys.stdin.read()
    result = lint(code)
    print(json.dumps(result, ensure_ascii=False))
