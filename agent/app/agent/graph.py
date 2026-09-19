from langgraph.constants import END, START
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode

from app.agent.prompt import SYSTEM_PROMPT
from app.agent.state import AgentState
from app.llm import get_llm
from app.tools.filesystem import read_file, search_files
from app.tools.terminal import run_command

tools = [
    read_file,
    search_files,
    run_command
]

llm = get_llm()
llm_with_tools = llm.bind_tools(tools)

def agent_node(state:AgentState):
    messages = state["messages"]

    from langchain_core.messages import SystemMessage
    if not messages or not isinstance(messages[0],SystemMessage):
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            *messages
        ]
    reponse = llm_with_tools.invoke(messages)

    return {
        "messages": [reponse]
    }

def should_continue(state:AgentState):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END

tool_node = ToolNode(tools)

graph_builder = StateGraph(AgentState)

graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools",tool_node)

graph_builder.add_edge(START,"agent")

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools":"tools",
        END:END,
    },
)

graph_builder.add_edge("tools","agent")

graph = graph_builder.compile()