
import React, { useState, useRef, useEffect } from 'react';
import { BrainCircuit, Send, Languages, Sparkles, Loader2, User, Bot, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { aiService } from '../services/aiService';

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
}

export const GeminiTab: React.FC = () => {
    const [subTab, setSubTab] = useState<'chat' | 'translate'>('chat');
    
    // Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Translate State
    const [sourceText, setSourceText] = useState('');
    const [targetText, setTargetText] = useState('');
    const [targetLang, setTargetLang] = useState('Tiếng Anh');
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSendMessage = async () => {
        if (!input.trim() || isTyping) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const history = messages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));
            const response = await aiService.chat(input, history);
            const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: response };
            setMessages(prev => [...prev, botMsg]);
        } catch (error) {
            setMessages(prev => [...prev, { id: 'error', role: 'model', text: 'Xin lỗi, có lỗi xảy ra khi kết nối với Gemini. Vui lòng thử lại.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleTranslate = async () => {
        if (!sourceText.trim() || isTranslating) return;
        setIsTranslating(true);
        try {
            const result = await aiService.translateText(sourceText, targetLang);
            setTargetText(result);
        } catch (error) {
            alert("Dịch thất bại. Vui lòng thử lại.");
        } finally {
            setIsTranslating(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <BrainCircuit className="text-purple-500" size={28} />
                        Gemini AI Assistant
                    </h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Trợ lý thông minh đã tích hợp sẵn</p>
                </div>
                <div className="flex bg-[#121212] p-1 rounded-xl border border-[#262626]">
                    <button 
                        onClick={() => setSubTab('chat')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${subTab === 'chat' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Trò chuyện
                    </button>
                    <button 
                        onClick={() => setSubTab('translate')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${subTab === 'translate' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Dịch thuật
                    </button>
                </div>
            </div>

            <div className="flex-grow bg-[#121212] border border-[#262626] rounded-3xl overflow-hidden flex flex-col shadow-2xl relative">
                <AnimatePresence mode="wait">
                    {subTab === 'chat' ? (
                        <motion.div 
                            key="chat"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex-grow flex flex-col h-[500px]"
                        >
                            <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={scrollRef}>
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                                        <div className="p-6 bg-purple-900/10 rounded-full border border-purple-900/10">
                                            <Sparkles size={48} className="text-purple-500" />
                                        </div>
                                        <div>
                                            <p className="text-white font-bold uppercase text-sm tracking-widest">Bắt đầu cuộc hội thoại</p>
                                            <p className="text-[10px] text-gray-500 mt-2 max-w-[250px]">Gemini có thể giúp bạn viết kịch bản, trả lời câu hỏi hoặc lên ý tưởng cho nội dung của mình.</p>
                                        </div>
                                    </div>
                                )}
                                {messages.map((m) => (
                                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`flex gap-3 max-w-[80%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                                                {m.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                                            </div>
                                            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-blue-600/10 text-blue-100 border border-blue-500/20' : 'bg-white/5 text-gray-200 border border-white/5'}`}>
                                                {m.text}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {isTyping && (
                                    <div className="flex justify-start">
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                                                <Bot size={16} className="text-white" />
                                            </div>
                                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                                <Loader2 size={16} className="animate-spin text-purple-400" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-[#0A0A0A] border-t border-[#262626]">
                                <div className="flex gap-3">
                                    <input 
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        placeholder="Gửi tin nhắn cho Gemini..."
                                        className="flex-grow bg-[#1A1A1A] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500 outline-none transition-all placeholder:text-gray-600"
                                    />
                                    <button 
                                        onClick={handleSendMessage}
                                        disabled={isTyping || !input.trim()}
                                        className="p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all disabled:opacity-20 active:scale-95"
                                    >
                                        <Send size={20} />
                                    </button>
                                    <button 
                                        onClick={() => setMessages([])}
                                        className="p-3 bg-[#1A1A1A] border border-[#262626] text-gray-500 hover:text-red-400 rounded-xl transition-all"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="translate"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="p-8 space-y-8"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[400px]">
                                <div className="flex flex-col space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Văn bản gốc (Tiếng Việt)</label>
                                    <textarea 
                                        value={sourceText}
                                        onChange={(e) => setSourceText(e.target.value)}
                                        placeholder="Nhập nội dung cần dịch..."
                                        className="flex-grow bg-[#0A0A0A] border border-[#262626] rounded-2xl p-6 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all resize-none shadow-inner"
                                    />
                                </div>
                                <div className="flex flex-col space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bản dịch</label>
                                        <select 
                                            value={targetLang}
                                            onChange={(e) => setTargetLang(e.target.value)}
                                            className="bg-[#1A1A1A] border border-[#262626] text-[10px] font-bold text-gray-400 rounded-lg px-3 py-1 outline-none"
                                        >
                                            <option>Tiếng Anh</option>
                                            <option>Tiếng Nhật</option>
                                            <option>Tiếng Trung</option>
                                            <option>Tiếng Hàn</option>
                                            <option>Tiếng Pháp</option>
                                        </select>
                                    </div>
                                    <div className="flex-grow bg-purple-900/5 border border-purple-900/10 rounded-2xl p-6 text-sm text-purple-200 shadow-inner overflow-y-auto whitespace-pre-wrap">
                                        {isTranslating ? (
                                            <div className="h-full flex items-center justify-center">
                                                <Loader2 size={32} className="animate-spin text-purple-500 opacity-50" />
                                            </div>
                                        ) : targetText || <span className="opacity-20 italic">Kết quả dịch sẽ hiện ở đây...</span>}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleTranslate}
                                disabled={isTranslating || !sourceText.trim()}
                                className="w-full py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-4 transition-all disabled:opacity-20 active:scale-[0.98] shadow-2xl shadow-purple-900/20"
                            >
                                {isTranslating ? <Loader2 size={20} className="animate-spin" /> : <Languages size={20} />}
                                {isTranslating ? 'Đang dịch thuật...' : 'Tiến hành dịch bằng Gemini AI'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
