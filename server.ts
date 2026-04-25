
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini Setup
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

  // API Routes
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      const chatSession = model.startChat({ history });
      const result = await chatSession.sendMessage(message);
      const response = await result.response;
      res.json({ text: response.text() });
    } catch (error: any) {
      console.error("Chat Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/translate", async (req, res) => {
    try {
      const { text, targetLang } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Hãy dịch văn bản sau đây sang ${targetLang}. Yêu cầu: Dịch sát nghĩa, văn phong tự nhiên. Chỉ trả về bản dịch. Văn bản: "${text}"`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      res.json({ text: response.text().trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/optimize", async (req, res) => {
    try {
      const { text } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Bạn là một chuyên gia biên tập cho Audio (TTS). Sửa lỗi chính tả, ngữ pháp, các từ viết tắt trong văn bản này để đọc mượt nhất. Trả về CHỈ văn bản đã được tối ưu. Văn bản: "${text}"`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      res.json({ text: response.text().trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/generate-script", async (req, res) => {
    try {
      const { topic, length } = req.body;
      const lengthDesc = { short: 'khoảng 100-200 từ', medium: 'khoảng 300-500 từ', long: 'khoảng 800-1000 từ' };
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Hãy viết kịch bản audio về chủ đề: "${topic}". Độ dài: ${lengthDesc[length as keyof typeof lengthDesc]}. Ngôn ngữ: Tiếng Việt. Chỉ trả về nội dung kịch bản.`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      res.json({ text: response.text().trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
