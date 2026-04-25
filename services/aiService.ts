
class AIService {
    public async optimizeTextForTTS(text: string): Promise<string> {
        const response = await fetch("/api/ai/optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to optimize text");
        return data.text;
    }

    public async generateScript(topic: string, length: 'short' | 'medium' | 'long' = 'medium'): Promise<string> {
        const response = await fetch("/api/ai/generate-script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, length })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to generate script");
        return data.text;
    }

    public async translateText(text: string, targetLang: string): Promise<string> {
        const response = await fetch("/api/ai/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, targetLang })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to translate text");
        return data.text;
    }

    public async chat(message: string, history: any[]): Promise<string> {
        const response = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, history })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to chat with AI");
        return data.text;
    }
}

export const aiService = new AIService();
