import subprocess

from langchain_core.tools import tool


@tool
def run_command(command:str)->str:
    """在当前项目目录执行Shell命令，并返回执行结果"""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace"
        )

        output = result.stdout
        if result.stderr:
            output = "\n[stderr]\n"+result.stderr

        return output[:10000]
    except subprocess.TimeoutExpired:
        return "命令行执行超时"
    except Exception as e:
        return f"命令行执行失败:{e}"