
import React, { useState, memo } from 'react';
import type { SpeakerGroup } from '../src/types';
import { FileUpload } from './FileUpload';
import { Settings2, Wand2, Sparkles, Loader2, BrainCircuit, X, MessageSquarePlus } from 'lucide-react';
import { aiService } from '../services/aiService';
import { motion, AnimatePresence } from 'motion/react';

interface ConfigurationProps {
    speaker: string;
    setSpeaker: (speakerId: string) => void;
    selectedCountry: string;
    onCountryChange: (country: string) => void;
    speakerGroups: SpeakerGroup[];
    isProcessing: boolean;
    onProcessQueue: () => void;
    onAddContent: (content: string | Array<{ text: string; startTime: number; endTime: number; timestamp: string }>) => void;
    pendingChunksCount: number;
    maxChars: number;
    setMaxChars: (value: number) => void;
    minCharsToMerge: number;
    setMinCharsToMerge: (value: number) => void;
    concurrentThreads: number;
    setConcurrentThreads: (value: number) => void;
    requestDelay: number;
    setRequestDelay: (value: number) => void;
}

export const Configuration: React.FC<ConfigurationProps> = memo(({
    speaker, setSpeaker, selectedCountry, onCountryChange, speakerGroups, isProcessing,
    onProcessQueue, onAddContent, pendingChunksCount,
    maxChars, setMaxChars, minCharsToMerge, setMinCharsToMerge,
    concurrentThreads, setConcurrentThreads, requestDelay, setRequestDelay
}) => {
    const [textToAdd, setTextToAdd] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiLength, setAiLength] = useState<'short' | 'medium' | 'long'>('medium');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleAddTextJob = () => {
        if (!textToAdd.trim()) return;
        onAddContent(textToAdd.trim());
        setTextToAdd('');
    };

    const handleOptimize = async () => {
        if (!textToAdd.trim() || isOptimizing) return;
        setIsOptimizing(true);
        try {
            const optimized = await aiService.optimizeTextForTTS(textToAdd);
            setTextToAdd(optimized);
        } catch (error) {
            alert("Tối ưu hóa AI thất bại. Vui lòng kiểm tra cấu hình Gemini.");
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleGenerateScript = async () => {
        if (!aiTopic.trim() || isGenerating) return;
        setIsGenerating(true);
        try {
            const script = await aiService.generateScript(aiTopic, aiLength);
            setTextToAdd(script);
            setShowAiModal(false);
            setAiTopic('');
        } catch (error) {
            alert("Tạo kịch bản AI thất bại. Vui lòng thử lại.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFileAdded = (content: string | Array<{ text: string; startTime: number; endTime: number; timestamp: string }>) => {
        onAddContent(content);
    };
    
    const availableSpeakers = speakerGroups.find(g => g.country === selectedCountry)?.speakers || [];

    return (
        <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm h-fit flex flex-col overflow-hidden">
            <div className="p-6 space-y-6">
                <div className="border-b border-[#262626] pb-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-900/30 rounded-lg border border-blue-900/20">
                                <Settings2 className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Cấu hình Tổng hợp</h2>
                                <p className="text-xs text-gray-500 font-medium">Tùy chỉnh các tham số giọng nói neural</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-400 ml-1">Ngôn ngữ</label>
                        <select
                            value={selectedCountry}
                            onChange={(e) => onCountryChange(e.target.value)}
                            className="w-full bg-[#1A1A1A] border border-[#262626] rounded-lg p-2.5 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        >
                            {speakerGroups.map(group => (
                                <option key={group.country} value={group.country}>{group.country}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-400 ml-1">Hồ sơ Giọng nói</label>
                        <select
                            value={speaker}
                            onChange={(e) => setSpeaker(e.target.value)}
                            className="w-full bg-[#1A1A1A] border border-[#262626] rounded-lg p-2.5 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                            disabled={availableSpeakers.length === 0}
                        >
                            {availableSpeakers.map(spk => (
                                <option key={spk.id} value={spk.id}>{spk.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <button 
                        onClick={() => setShowAdvanced(!showAdvanced)} 
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-[#1A1A1A] border border-[#262626] hover:bg-[#222222] transition-all group"
                    >
                        <span className="flex items-center gap-2 text-gray-300 font-semibold text-xs">
                             <Settings2 size={14} className="text-gray-500" />
                            Tham số Nâng cao
                        </span>
                        <svg className={`h-4 w-4 text-gray-500 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    
                    {showAdvanced && (
                        <div className="mt-4 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider ml-1">Luồng</label>
                                <input 
                                    type="number" value={isNaN(concurrentThreads) ? '' : concurrentThreads} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setConcurrentThreads(isNaN(val) ? 0 : Math.min(100, val));
                                    }}
                                    className="w-full bg-[#0D0D0D] border border-[#262626] rounded-lg p-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider ml-1">Độ trễ (ms)</label>
                                <input 
                                    type="number" value={isNaN(requestDelay) ? '' : requestDelay} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setRequestDelay(isNaN(val) ? 0 : val);
                                    }}
                                    className="w-full bg-[#0D0D0D] border border-[#262626] rounded-lg p-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider ml-1">Ký tự tối đa</label>
                                <input 
                                    type="number" value={isNaN(maxChars) ? '' : maxChars} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setMaxChars(isNaN(val) ? 0 : val);
                                    }}
                                    className="w-full bg-[#0D0D0D] border border-[#262626] rounded-lg p-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider ml-1">Gộp tối thiểu</label>
                                <input 
                                    type="number" value={isNaN(minCharsToMerge) ? '' : minCharsToMerge} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setMinCharsToMerge(isNaN(val) ? 0 : val);
                                    }}
                                    className="w-full bg-[#0D0D0D] border border-[#262626] rounded-lg p-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4 pt-4 border-t border-[#262626]">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Nội dung văn bản</label>
                        <button
                            onClick={() => setShowAiModal(true)}
                            className="flex items-center gap-2 text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors bg-purple-900/10 px-2.5 py-1 rounded-full border border-purple-900/20"
                        >
                            <BrainCircuit size={12} />
                            Trợ lý Kịch bản AI
                        </button>
                    </div>

                    <div className="bg-[#1A1A1A] border border-[#262626] rounded-xl overflow-hidden focus-within:border-blue-500/50 transition-all relative">
                        <textarea
                            value={textToAdd}
                            onChange={(e) => setTextToAdd(e.target.value)}
                            placeholder="Nhập hoặc dán nội dung văn bản tại đây..."
                            rows={6}
                            className="w-full border-0 resize-none p-4 text-sm bg-transparent text-gray-200 placeholder-gray-500 focus:ring-0 leading-relaxed font-medium"
                        />
                        
                        <div className="absolute right-4 top-4">
                            <button
                                onClick={handleOptimize}
                                disabled={isOptimizing || !textToAdd.trim()}
                                className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-900/20 border border-blue-900/40 hover:bg-blue-900/40 transition-all disabled:opacity-50"
                                title="Sửa lỗi & Tối ưu bằng AI"
                            >
                                {isOptimizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                {isOptimizing ? 'Đang tối ưu...' : 'Tối ưu AI'}
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-[#121212] border-t border-[#262626]">
                            <FileUpload onFileProcessed={handleFileAdded} />
                            <button
                                onClick={handleAddTextJob}
                                disabled={!textToAdd.trim()}
                                className="flex items-center gap-2 py-2 px-6 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-20 active:scale-95"
                            >
                                Thêm vào Hàng chờ
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    onClick={onProcessQueue}
                    disabled={isProcessing || pendingChunksCount === 0}
                    className="w-full py-4 rounded-xl text-sm font-bold uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-10 shadow-lg shadow-blue-900/20"
                >
                    {isProcessing ? 'Đang xử lý...' : `Bắt đầu Tổng hợp (${pendingChunksCount})`}
                </button>
            </div>

            {/* AI Modal */}
            <AnimatePresence>
                {showAiModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowAiModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg bg-[#121212] border border-[#262626] rounded-3xl overflow-hidden shadow-2xl"
                        >
                            <div className="p-6 border-b border-[#262626] flex justify-between items-center bg-[#181818]">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-900/30 rounded-lg border border-purple-900/20">
                                        <BrainCircuit size={20} className="text-purple-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white leading-none">Trợ lý Kịch bản AI</h3>
                                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">Powered by Gemini 3 Flash</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAiModal(false)}
                                    className="p-2 hover:bg-[#262626] rounded-full text-gray-500 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Bạn muốn viết về chủ đề gì?</label>
                                    <textarea
                                        value={aiTopic}
                                        onChange={(e) => setAiTopic(e.target.value)}
                                        placeholder="Ví dụ: Giới thiệu về lợi ích của việc đọc sách mỗi ngày, hay hướng dẫn nấu món phở gà..."
                                        rows={3}
                                        className="w-full bg-[#1A1A1A] border border-[#262626] rounded-xl p-3 text-sm text-gray-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all resize-none"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Độ dài kịch bản</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['short', 'medium', 'long'] as const).map((l) => (
                                            <button
                                                key={l}
                                                onClick={() => setAiLength(l)}
                                                className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                    aiLength === l 
                                                    ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20' 
                                                    : 'bg-[#1A1A1A] border-[#262626] text-gray-500 hover:border-purple-500/50 hover:text-gray-300'
                                                }`}
                                            >
                                                {l === 'short' ? 'Ngắn' : l === 'medium' ? 'Vừa' : 'Dài'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={handleGenerateScript}
                                    disabled={isGenerating || !aiTopic.trim()}
                                    className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all disabled:opacity-20 shadow-xl shadow-purple-900/20 active:scale-[0.98]"
                                >
                                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />}
                                    {isGenerating ? 'Đang sáng tạo nội dung...' : 'Bắt đầu tạo kịch bản'}
                                </button>
                                
                                <p className="text-[9px] text-center text-gray-600 leading-relaxed px-4">
                                    AI sẽ tạo ra một kịch bản hoàn chỉnh dựa trên chủ đề của bạn. Bạn có thể chỉnh sửa lại trước khi đưa vào hàng chờ tổng hợp.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
});

Configuration.displayName = 'Configuration';


