import { http } from "@/utils/http";
import { getToken } from "@/utils/auth";

/** 聊天记录单条类型 */
export type MessageItem = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/** 聊天记录分页响应类型 */
export type HistoryResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: MessageItem[];
};

/** 1. 获取聊天历史记录 (分页) */
export const getAiHistory = (params?: {
  page?: number;
  [key: string]: any;
}) => {
  // 如果后端返回的是完整 URL (data.next)，我们可以灵活处理
  const url = params?.nextUrl || "/ai/history/";
  return http.request<HistoryResponse>("get", url, { params });
};

/** 2. AI 对话流式接口 (特殊处理)
 * 由于 Axios 对流支持较复杂，这里封装一个符合你习惯的 fetch 工具
 */
export const sendAiChatStream = async (
  data: { message: string },
  onChunk: (text: string) => void
) => {
  // 从本地获取当前有效的 accessToken
  const tokenData = getToken();
  const accessToken = tokenData?.accessToken;

  const response = await fetch("/ai/chat/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken ? `Bearer ${accessToken}` : ""
    },
    body: JSON.stringify(data)
  });

  if (!response.body) throw new Error("ReadableStream not supported");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 留下最后一行不完整的
    buffer = lines.pop() || "";

    for (const line of lines) {
      // 1. 不要在这里用 trim()，保留原始空格
      if (!line.startsWith("data:")) continue;

      // 2. 提取 data: 之后的内容
      const rawData = line.slice(5).trim(); // 只去掉 data: 和内容之间的那个空格
      if (!rawData || rawData === "[DONE]") continue;

      try {
        // 3. 解析 JSON 获取真正的文本块
        const parsed = JSON.parse(rawData);
        if (parsed.content) {
          onChunk(parsed.content);
        }
      } catch (e) {
        console.error("解析 SSE 数据失败", e);
      }
    }
  }
};
