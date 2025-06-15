const chatBox = document.getElementById("chat-box");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");

// Simulate stream response from LLM
async function streamFakeLLMResponse(onChunk) {
  const sample = "这是模型返回的一段流式回答，逐字显示效果演示...";
  for (let i = 0; i < sample.length; i++) {
    await new Promise(res => setTimeout(res, 50));
    onChunk(sample[i]);
  }
}

function addMessage(content, sender = "user", isStreaming = false) {
  const msg = document.createElement("div");
  msg.className = `message ${sender}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (isStreaming) {
    bubble.innerText = "";
  } else {
    bubble.innerText = content;
  }

  msg.appendChild(bubble);
  chatBox.appendChild(msg);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  addMessage(text, "user");

  input.value = "";

  // Add streaming bot message
  const bubble = addMessage("", "bot", true);

  // Simulate LLM streaming response
  streamFakeLLMResponse(chunk => {
    bubble.innerText += chunk;
    scrollToBottom();
  });

  // In真实场景：将 prompt 发给 VS Code 后台
  // vscode.postMessage({ command: 'askLLMStream', text });
}

// Send on button click
sendBtn.addEventListener("click", sendMessage);

// Send on Enter key
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
