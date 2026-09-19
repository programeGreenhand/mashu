from pathlib import Path

from langchain_core.tools import tool


@tool
def read_file(file_path:str)->str:
    """读取指定文件的内容。file_path可以是绝对路径，也可以是相对当前工作区的路径"""
    path = Path(file_path)
    if not path.is_file():
        return f"不是文件:{file_path}"

    if not path.exists():
        return f"文件不存在:{file_path}"

    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"无法读取:{file_path}"
    except Exception as e:
        return f"读取失败:{e}"

@tool
def search_files(keyword:str,directory:str = ".")->str:
    """在指定目录下搜索包含关键词的文本文件，并返回匹配的具体位置"""
    root = Path(directory)

    if not root.exists():
        return f"目录不存在:{directory}"

    result = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue

            # 先排除常见的非代码目录
        if any(part in {".git", ".venv", "node_modules", "__pycache__"} for part in path.parts):
                continue

        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        for line_number,line in enumerate(text.splitlines(),start=1):
            if keyword in line:
                result.append(
                    f"{line_number}:{path.name}:{line}"
                )

    if not result:
        return f"not found:{keyword}"

    return "\n".join(result)