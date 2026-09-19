import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

def get_llm():
    return ChatOpenAI(
        model="deepseek-chat",
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com",
    )