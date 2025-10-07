import {
	allComponents,
	provideVSCodeDesignSystem,
    Button,
    TextArea
} from "@vscode/webview-ui-toolkit";

import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { getOrderWord } from '../utils';

const vscode = acquireVsCodeApi();

provideVSCodeDesignSystem().register(allComponents);

window.addEventListener('load', init);

let llmOutputBuffer: string = '';
let bubbleCount: number = -1;
let aiGroupCount: number = -1;

const chatContainer = (document.getElementById('chat-container'));
const input = document.getElementById("user-input") as HTMLInputElement;
const sendButton = document.getElementById("send-button") as HTMLButtonElement;

function currentBubbleId(): string {
    return `bubble-id-${aiGroupCount}-${bubbleCount}`;
}

// 自动滚动到底部
function scrollToBottom() {
    chatContainer!.scrollTop = chatContainer!.scrollHeight;
}

// 添加用户消息
function addUserMessage(query: string) {
    const msg = document.createElement("div");
    msg.className = `message user`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "🧑";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = query.trim();

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatContainer!.appendChild(msg);

    scrollToBottom();
    return bubble;
}

// 创建一个 AI group：一个头像 + 右侧 ai-content（后续往 ai-content 插入多个 bubble）
function addAIGroup() {
    aiGroupCount++;
    bubbleCount = -1;
    const wrapper = document.createElement("div");
    wrapper.className = "message ai-group";
    wrapper.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="ai-content" id="ai-content-${aiGroupCount}"></div>
    `;
    chatContainer!.appendChild(wrapper);
    scrollToBottom();
}

// 在 aiContent 中加入一个 bubble，type: "thinking" | "tool" | "answer"
function addAIBubble(type: 'thinking' | 'tool' | 'answer') {
    bubbleCount++;
    const bubble = document.createElement("div");
    bubble.className = `bubble ${type}`;
    bubble.id = currentBubbleId();
    (document.getElementById(`ai-content-${aiGroupCount}`))!.appendChild(bubble);
    scrollToBottom();
}

/* ---------- 折叠 / 展开 辅助 ---------- */
/**
 * setCollapsed(bubble, { expandable: boolean, collapsedLabel?: string })
 * - thinking: expandable=true -> 点击可切换展开/折叠（保留全文，CSS 实现视觉折叠）
 * - tool: expandable=false -> 初始折叠并显示 collapsedLabel（不绑定展开）
 */
function setCollapsed(bubbleId: string, collapsedLabel: string) {
    const bubble = document.getElementById(bubbleId) as HTMLDivElement;
    bubble.dataset.full = bubble.innerHTML || "";
    bubble.innerHTML = collapsedLabel;
    // 添加折叠样式（视觉上只占一行）
    bubble.classList.add("collapsed");
    if (!bubble.dataset._expandBound) {
    bubble.addEventListener("click", () => {
        bubble.classList.toggle("collapsed");
        bubble.classList.toggle("collapsable");

        const tmp: string = bubble.dataset.full || "";
        bubble.dataset.full = bubble.innerHTML;
        bubble.innerHTML = tmp;
    });
    bubble.dataset._expandBound = 'true';
    }
}

function setFinalAnswer() {
    (document.getElementById(currentBubbleId()))?.classList.replace('thinking', 'answer');
}

function sendMessage() {
    const query = input.value.trim();

    if (!query) {
        vscode.postMessage({
            command: 'warn',
            content: '请输入内容',
        });

        return;
    }

    addUserMessage(query);

    input.value = '';

    vscode.postMessage({
        command: 'query',
        query: query,
    });

    sendButton.disabled = true;

}

function init() {

    sendButton.onclick = sendMessage;

    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    window.addEventListener('message', async event => {
        const message = event.data;
        switch (message.command) {
            case 'LLM': {
                switch (message.type) {
                    case 'token': {
                        llmOutputBuffer += message.content;
                        (document.getElementById(currentBubbleId()))!.innerHTML = DOMPurify.sanitize(marked.parse(llmOutputBuffer, {async: false}));
                        break;
                    }
                    case 'end': {
                        llmOutputBuffer = '';
                        break;
                    }
                    case 'error': {
                        llmOutputBuffer += message.content;
                        (document.getElementById(currentBubbleId()))!.innerHTML = DOMPurify.sanitize(marked.parse(llmOutputBuffer, {async: false}));
                        sendButton.disabled = false;
                        break;
                    }
                }
                break;
            }
            case 'Agent': {
                switch (message.type) {
                    case 'start': {
                        addAIGroup();
                        break;
                    }
                    case 'think start': {
                        addAIBubble('thinking');
                        break;
                    }
                    case 'think done': {
                        setCollapsed(currentBubbleId(), `The ${getOrderWord(Math.trunc(bubbleCount / 2) + 1)} round thinking`);
                        break;
                    }
                    case 'think retry': {

                        break;
                    }
                    case 'tool': {
                        addAIBubble('tool');
                        (document.getElementById(currentBubbleId()))!.innerHTML = message.content;
                        setCollapsed(currentBubbleId(), `The ${getOrderWord(Math.trunc(bubbleCount / 2) + 1)} round tool call`);
                        break;
                    }
                    case 'done': {
                        setFinalAnswer();
                        sendButton.disabled = false;
                        break;
                    }
                }
                break;
            }
        }
    });
}
