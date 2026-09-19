from app.agent.graph import graph


def main():
    result = graph.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "帮我看看当前项目有哪些文件",
                }
            ]
        }
    )

    for message in result["messages"]:
        print("=" * 80)
        print(type(message).__name__)
        print(message.content)

        if getattr(message, "tool_calls", None):
            print("tool_calls:")
            print(message.tool_calls)


if __name__ == "__main__":
    main()