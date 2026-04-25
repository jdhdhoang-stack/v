
import { GoogleGenerativeAI } from "@google/generative-ai";

class AIService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        // The API key is provided by the environment
        const apiKey = process.env.GEMINI_API_KEY || "";
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
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
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("AI Optimization failed:", error);
            throw error;
        }
    }
}

export const aiService = new AIService();
