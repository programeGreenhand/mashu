from app.llm import get_llm


def main():
    llm = get_llm()
    response = llm.invoke("hello world")
    print(response)


if __name__ == "__main__":
    main()