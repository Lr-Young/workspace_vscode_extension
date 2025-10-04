import {
	allComponents,
	provideVSCodeDesignSystem,
    Button,
    TextArea
} from "@vscode/webview-ui-toolkit";

import { marked } from 'marked';
import DOMPurify from 'dompurify';

const vscode = acquireVsCodeApi();

provideVSCodeDesignSystem().register(allComponents);

window.addEventListener('load', init);

let llmOutputBuffer: string = '';
let messageCount: number = -1;

const chatContainer = (document.getElementById('chat-container'));
const input = document.getElementById("user-input") as HTMLInputElement;
const sendButton = document.getElementById("send-button") as HTMLButtonElement;

function addMessage(role: 'user' | 'ai') {
    messageCount += 1;
    const msg = document.createElement("div");
    msg.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "🧑" : "🤖";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.id = `bubble-id-${messageCount}`;

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatContainer!.appendChild(msg);

    // 自动滚动到底部
    chatContainer!.scrollTop = chatContainer!.scrollHeight;
    return bubble;
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

    addMessage('user');

    (document.getElementById(`bubble-id-${messageCount}`))!.innerHTML = query;

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
                    case 'start': {
                        addMessage('ai');
                        break;
                    }
                    case 'token': {
                        llmOutputBuffer += message.content;
                        (document.getElementById(`bubble-id-${messageCount}`))!.innerHTML = DOMPurify.sanitize(marked.parse(llmOutputBuffer, {async: false}));
                        break;
                    }
                    case 'end': {
                        llmOutputBuffer = '';
                        sendButton.disabled = false;
                        break;
                    }
                    case 'error': {
                        llmOutputBuffer = '';
                        sendButton.disabled = false;
                        break;
                    }
                }
            }
        }
    });
}
