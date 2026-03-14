<script setup lang="ts">
import { ref, nextTick, computed } from "vue";
import { getAiHistory, sendAiChatStream, type MessageItem } from "@/api/ai";
import MarkdownIt from "markdown-it";
import highlightjs from "markdown-it-highlightjs";
import "highlight.js/styles/github-dark.css";

// 1. 定义工具数据结构
interface ToolItem {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  color?: string;
}

const tools = ref<ToolItem[]>([
  {
    id: "1",
    label: "年度总结",
    icon: "📝",
    prompt: "请帮我分析一下今年的获奖情况"
  },
  {
    id: "2",
    label: "赛事推荐",
    icon: "🏆",
    prompt: "推荐一些适合我的比赛"
  }
]);

const md = new MarkdownIt({
  linkify: true,
  breaks: true,
  typographer: true
}).use(highlightjs);
const messages = ref<MessageItem[]>([]);
const nextUrl = ref<string | null>(null);
const loading = ref(false);
const isStreaming = ref(false);
const inputVal = ref("");
const chatBoxRef = ref<HTMLElement>();

const isChatMode = computed(() => messages.value.length > 0);

function scrollToBottom(behavior: ScrollBehavior = "smooth") {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTo({
        top: chatBoxRef.value.scrollHeight,
        behavior
      });
    }
  });
}

function checkAndScroll() {
  if (!chatBoxRef.value) return;
  const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.value;
  if (scrollHeight - scrollTop - clientHeight < 200) scrollToBottom("auto");
}

async function loadHistory() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await getAiHistory({ nextUrl: nextUrl.value });
    const oldMsgs = res.results.reverse();
    messages.value = [...oldMsgs, ...messages.value];
    nextUrl.value = res.next;
    if (oldMsgs.length > 0) scrollToBottom("auto");
  } finally {
    loading.value = false;
  }
}

// 2. 处理工具点击：直接填充并发送
async function handleToolClick(tool: ToolItem) {
  if (isStreaming.value) return;
  inputVal.value = tool.prompt;
  handleSend();
}

async function handleSend() {
  if (!inputVal.value.trim() || isStreaming.value) return;
  const userContent = inputVal.value;
  inputVal.value = "";

  messages.value.push({
    id: Date.now(),
    role: "user",
    content: userContent,
    created_at: new Date().toISOString()
  });

  const aiMsgIndex =
    messages.value.push({
      id: Date.now() + 1,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString()
    }) - 1;

  isStreaming.value = true;
  await nextTick();
  scrollToBottom();

  try {
    await sendAiChatStream({ message: userContent }, chunk => {
      messages.value[aiMsgIndex].content += chunk;
      checkAndScroll();
    });
  } catch (error) {
    messages.value[aiMsgIndex].content += "\n\n**[消息中断]**";
  } finally {
    isStreaming.value = false;
  }
}
</script>

<template>
  <div class="chat-container">
    <div v-if="!isChatMode" class="initial-screen">
      <div class="center-content">
        <h1 class="brand-title">小易 AI</h1>
        <p class="brand-sub-title">你的竞赛智能agent伙伴</p>
        <div class="search-box-wrapper shadow-2xl">
          <div class="tool-bar">
            <div
              v-for="tool in tools"
              :key="tool.id"
              class="tool-item"
              @click="handleToolClick(tool)"
            >
              <span class="tool-icon">{{ tool.icon }}</span>
              <span class="tool-label">{{ tool.label }}</span>
            </div>
          </div>

          <el-input
            v-model="inputVal"
            type="textarea"
            :autosize="{ minRows: 5, maxRows: 8 }"
            placeholder="有什么可以帮您？"
            class="custom-input"
            @keydown.enter.exact.prevent="handleSend"
          />
          <div class="flex justify-end p-2 border-t border-gray-50">
            <el-button
              type="primary"
              :disabled="!inputVal.trim()"
              class="send-btn-large"
              @click="handleSend"
            >
              发送消息
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <template v-else>
      <header class="chat-header">小易</header>

      <main ref="chatBoxRef" class="chat-main">
        <div
          v-if="nextUrl || messages.length < 10"
          class="flex justify-center pb-6"
        >
          <el-button :loading="loading" size="small" round @click="loadHistory">
            加载历史记录
          </el-button>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['msg-row', msg.role === 'user' ? 'user' : 'assistant']"
        >
          <div class="msg-bubble">
            <div
              v-if="msg.role === 'assistant'"
              class="markdown-body"
              v-html="md.render(msg.content || '...')"
            />
            <div v-else class="whitespace-pre-wrap">{{ msg.content }}</div>
          </div>
        </div>
      </main>

      <footer class="chat-footer">
        <div class="footer-input-wrapper flex-col !items-stretch">
          <div class="tool-bar mini">
            <div
              v-for="tool in tools"
              :key="tool.id"
              class="tool-item"
              @click="handleToolClick(tool)"
            >
              <span class="tool-label">{{ tool.label }}</span>
            </div>
          </div>

          <div class="flex items-end">
            <el-input
              v-model="inputVal"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 5 }"
              placeholder="输入内容..."
              class="custom-input"
              @keydown.enter.exact.prevent="handleSend"
            />
            <el-button
              type="primary"
              :disabled="!inputVal.trim()"
              :loading="isStreaming"
              class="send-btn-circle"
              circle
              @click="handleSend"
            >
              <template #icon>
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </template>
            </el-button>
          </div>
        </div>
      </footer>
    </template>
  </div>
</template>

<style scoped>
/* 容器和基础样式保留... */
.chat-container {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background-color: #f9fafb;
}

/* --- 工具栏样式 --- */
.tool-bar {
  display: flex;
  gap: 8px;
  padding: 12px 12px 8px;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none; /* Firefox 隐藏滚动条 */
}

.tool-bar::-webkit-scrollbar {
  display: none; /* Chrome/Safari 隐藏滚动条 */
}

.tool-item {
  display: inline-flex;
  flex-shrink: 0; /* 禁止压缩 */
  gap: 4px;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  background-color: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  transition: all 0.2s;
}

.tool-item:hover {
  background-color: #eff6ff;
  border-color: #bfdbfe;
  transform: translateY(-1px);
}

.tool-icon {
  font-size: 14px;
}

.tool-label {
  font-size: 13px;
  font-weight: 500;
  color: #4b5563;
}

/* 对话模式下的工具栏微调 */
.tool-bar.mini {
  gap: 6px;
  padding: 8px 12px 0;
}

.tool-bar.mini .tool-item {
  padding: 4px 10px;
  background-color: transparent;
  border-color: #f3f4f6;
}

/* --- 其它原有样式 --- */
.initial-screen {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.center-content {
  width: 100%;
  max-width: 720px;
}

.brand-title {
  margin-bottom: 0.5rem;
  font-size: 2.5rem;
  font-weight: 800;
  color: #1f2937;
  text-align: center;
}

.brand-sub-title {
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
  font-weight: 200;
  color: #1f2937;
  text-align: center;
}

.search-box-wrapper {
  overflow: hidden; /* 确保工具栏圆角 */
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 1.5rem;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  font-weight: 600;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.chat-main {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.msg-row {
  display: flex;
  width: 100%;
  margin-bottom: 1.5rem;
}

.msg-row.user {
  justify-content: flex-end;
}

.msg-bubble {
  max-width: 80%;
  padding: 0.75rem 1rem;
  font-size: 15px;
  border-radius: 1.25rem;
}

.user .msg-bubble {
  color: white;
  background-color: #2563eb;
  border-bottom-right-radius: 4px;
}

.assistant .msg-bubble {
  background-color: white;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}

.chat-footer {
  padding: 1rem 1.5rem 2.5rem;
}

.footer-input-wrapper {
  max-width: 48rem;
  margin: 0 auto;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 10%);
}

:deep(.custom-input .el-textarea__inner) {
  padding: 12px;
  font-size: 16px;
  resize: none !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.send-btn-circle {
  width: 40px !important;
  height: 40px !important;
  margin: 0 8px 8px 0;
}

.send-btn-large {
  height: 40px;
  padding: 0 24px;
  border-radius: 12px;
}
</style>
