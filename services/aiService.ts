
import { GoogleGenAI } from "@google/genai";

class AIService {
    private ai: GoogleGenAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY || "";
        this.ai = new GoogleGenAI(apiKey);
    }

    public async optimizeTextForTTS(text: string): Promise<string> {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Gemini API key is not configured.");
        }

        const prompt = `
            Bạn là một chuyên gia biên tập nội dung cho Audio (TTS). 
            Nhiệm vụ: Sửa lỗi chính tả, ngữ pháp, các từ viết tắt và lỗi đánh máy trong văn bản dưới đây để khi đọc lên (TTS) sẽ mượt mà và tự nhiên nhất.
            
            Quy tắc:
            1. KHÔNG thay đổi nội dung, ý nghĩa của câu.
            2. Chuyển đổi các từ viết tắt thông dụng sang dạng đầy đủ (vd: "vn" -> "Việt Nam", "tp" -> "thành phố", "ko" -> "không").
            3. Đảm bảo các dấu câu được đặt đúng chỗ để bộ đọc TTS ngắt nghỉ tự nhiên.
            4. Trả về CHỈ văn bản đã được tối ưu, không kèm theo lời giải thích nào khác.

            Văn bản cần xử lý:
            "${text}"
        `;

        try {
            const model = this.ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("AI Optimization failed:", error);
            throw error;
        }
    }

    public async generateScript(topic: string, length: 'short' | 'medium' | 'long' = 'medium'): Promise<string> {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Gemini API key is not configured.");
        }

        const lengthDesc = {
            'short': 'khoảng 100-200 từ',
            'medium': 'khoảng 300-500 từ',
            'long': 'khoảng 800-1000 từ'
        };

        const prompt = `
            Hãy viết một kịch bản audio (script) về chủ đề: "${topic}".
            Độ dài yêu cầu: ${lengthDesc[length]}.
            Ngôn ngữ: Tiếng Việt.
            Phong cách: Tự nhiên, lôi cuốn, phù hợp để đọc bằng công cụ Text-to-Speech.
            Cấu trúc: Có mở đầu, nội dung chính và kết thúc rõ ràng.
            Lưu ý: Chỉ trả về nội dung kịch bản, không kèm theo bất kỳ lời dẫn nhập hay kết luận nào từ phía AI.
        `;

        try {
            const model = this.ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("AI Script Generation failed:", error);
            throw error;
        }
    }

    public async translateText(text: string, targetLang: string): Promise<string> {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Gemini API key is not configured.");
        }

        const prompt = `
            Hãy dịch văn bản sau đây sang ${targetLang}. 
            Yêu cầu: Dịch sát nghĩa, văn phong tự nhiên, giữ nguyên các định dạng nếu có.
            Chỉ trả về bản dịch, không thêm lời dẫn.

            Văn bản:
            "${text}"
        `;

        try {
            const model = this.ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("AI Translation failed:", error);
            throw error;
        }
    }

    public async chat(message: string, history: any[]): Promise<string> {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Gemini API key is not configured.");
        }

        try {
            const model = this.ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const chat = model.startChat({
                history: history,
            });
            const result = await chat.sendMessage(message);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("AI Chat failed:", error);
            throw error;
        }
    }
}

export const aiService = new AIService();
