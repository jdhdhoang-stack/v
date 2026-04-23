
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Volume2, Download, Trash2, Layers, Loader2, Music, CheckCircle2, Sparkles, FileText, Film, RefreshCcw, Play } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AudioVisualizer } from './AudioVisualizer';
import { aiService } from '../services/aiService';
import { TextProcessor } from '../services/textProcessor';
import { VideoMerger } from './VideoMerger';

interface GoogleChunk {
    id: string;
    text: string;
    timestamp?: string;
    status: 'pending' | 'processing' | 'finished' | 'error';
    audioUrl?: string;
    error?: string;
}

export const GoogleTTS: React.FC = () => {
    const [text, setText] = useState('');
    const [lang, setLang] = useState('vi');
    const [chunks, setChunks] = useState<GoogleChunk[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [retryAttempt, setRetryAttempt] = useState(0);
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const MAX_AUTO_RETRIES = 3;

    const successfulChunksCount = useMemo(() => chunks.filter(c => c.status === 'finished').length, [chunks]);
    const failedChunksCount = useMemo(() => chunks.filter(c => c.status === 'error').length, [chunks]);
    const totalChunksCount = chunks.length;

    // Split text into chunks of max 200 chars (Google Translate limit)
    const splitText = (input: string): string[] => {
        const sentences = input.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [input];
        const result: string[] = [];
        let current = '';

        sentences.forEach(s => {
            if ((current.length + s.length) <= 180) { // Safety margin
                current += s;
            } else {
                if (current) result.push(current.trim());
                current = s;
                if (current.length > 180) {
                    const words = current.split(' ');
                    current = '';
                    words.forEach(w => {
                        if ((current.length + w.length + 1) <= 180) {
                            current += (current ? ' ' : '') + w;
                        } else {
                            result.push(current.trim());
                            current = w;
                        }
                    });
                }
            }
        });
        if (current) result.push(current.trim());
        return result.filter(r => r.length > 0);
    };

    const handleAddContent = () => {
        if (!text.trim()) return;
        setRetryAttempt(0);
        const newTexts = splitText(text.trim());
        const newChunks: GoogleChunk[] = newTexts.map(t => ({
            id: uuidv4(),
            text: t,
            status: 'pending'
        }));
        setChunks(prev => [...prev, ...newChunks]);
        setText('');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRetryAttempt(0);

        try {
            const content = await TextProcessor.processFromFile(file);
            if (typeof content === 'string') {
                const newTexts = splitText(content);
                const newChunks: GoogleChunk[] = newTexts.map(t => ({
                    id: uuidv4(),
                    text: t,
                    status: 'pending'
                }));
                setChunks(prev => [...prev, ...newChunks]);
            } else {
                const newChunks: GoogleChunk[] = content.map(item => ({
                    id: uuidv4(),
                    text: item.text,
                    timestamp: item.timestamp,
                    status: 'pending'
                }));
                setChunks(prev => [...prev, ...newChunks]);
            }
        } catch (err: any) {
            alert(err.message);
        }
        e.target.value = '';
    };

    const handleOptimize = async () => {
        if (!text.trim()) return;
        setIsOptimizing(true);
        try {
            const optimized = await aiService.optimizeTextForTTS(text);
            setText(optimized);
        } catch (error) {
            console.error("AI Optimize error:", error);
        } finally {
            setIsOptimizing(false);
        }
    };

    const processQueue = useCallback(async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        const pending = chunks.filter(c => c.status === 'pending');
        
        for (const chunk of pending) {
            setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'processing', error: undefined } : c));
            
            try {
                // Safety trim for Google TTS limit
                const trimmedText = chunk.text.length > 200 ? chunk.text.substring(0, 197) + '...' : chunk.text;
                const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmedText)}&tl=${lang}&client=tw-ob`;
                
                // Fetch to verify it works (Google Translate can sometimes block rapid requests)
                const res = await fetch(url);
                if (!res.ok) throw new Error('Google Blocked');

                await new Promise(r => setTimeout(r, 600)); // Rate limiting
                setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'finished', audioUrl: url } : c));
            } catch (error) {
                setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'error', error: 'Lỗi bộ đọc Google' } : c));
            }
        }
        setIsProcessing(false);
    }, [chunks, lang, isProcessing]);

    const retryAllFailed = useCallback(() => {
        setChunks(prev => prev.map(c => c.status === 'error' ? { ...c, status: 'pending', error: undefined } : c));
    }, []);

    // Auto retry
    useEffect(() => {
        const allDone = totalChunksCount > 0 && chunks.every(c => c.status === 'finished' || c.status === 'error');
        if (!isProcessing && allDone && failedChunksCount > 0 && retryAttempt < MAX_AUTO_RETRIES) {
            const timer = setTimeout(() => {
                setRetryAttempt(prev => prev + 1);
                retryAllFailed();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [chunks, isProcessing, failedChunksCount, retryAttempt]);

    // Precise Merging (SRT Aware)
    useEffect(() => {
        const allDone = chunks.length > 0 && chunks.every(c => c.status === 'finished' || c.status === 'error');
        const hasFinished = chunks.some(c => c.status === 'finished');
        if (allDone && hasFinished && !isProcessing && !mergedAudioUrl && failedChunksCount === 0) {
            const merge = async () => {
                try {
                    const finished = chunks.filter(c => c.status === 'finished' && c.audioUrl);
                    const hasTimestamps = finished.some(c => !!c.timestamp);

                    if (!hasTimestamps) {
                        const blobs = await Promise.all(finished.map(c => fetch(c.audioUrl!).then(res => res.blob())));
                        setMergedAudioUrl(URL.createObjectURL(new Blob(blobs, { type: 'audio/mpeg' })));
                        return;
                    }

                    // SRT Logic
                    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const audioBuffers = await Promise.all(
                        finished.map(async chunk => {
                            const res = await fetch(chunk.audioUrl!);
                            const ab = await res.arrayBuffer();
                            return await audioContext.decodeAudioData(ab);
                        })
                    );

                    const parseTs = (ts: string): number => {
                        const [time, ms] = ts.split(',');
                        const [h, m, s] = time.split(':').map(Number);
                        return h * 3600 + m * 60 + s + (parseInt(ms, 10) / 1000);
                    };

                    let totalDuration = 0;
                    finished.forEach((c, i) => {
                        const start = c.timestamp ? parseTs(c.timestamp) : totalDuration;
                        const end = start + audioBuffers[i].duration;
                        if (end > totalDuration) totalDuration = end;
                    });

                    const offline = new OfflineAudioContext(1, Math.ceil(totalDuration * 44100), 44100);
                    finished.forEach((c, i) => {
                        const source = offline.createBufferSource();
                        source.buffer = audioBuffers[i];
                        const start = c.timestamp ? parseTs(c.timestamp) : 0;
                        source.connect(offline.destination);
                        source.start(start);
                    });

                    const rendered = await offline.startRendering();
                    setMergedAudioUrl(URL.createObjectURL(audioBufferToWav(rendered)));
                    await audioContext.close();
                } catch (e) {
                    console.error("Merge error", e);
                }
            };
            merge();
        }
    }, [chunks, isProcessing, mergedAudioUrl, failedChunksCount]);

    const audioBufferToWav = (buffer: AudioBuffer): Blob => {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const bufferArr = new ArrayBuffer(length);
        const view = new DataView(bufferArr);
        let pos = 0;
        const setUint16 = (d: number) => { view.setUint16(pos, d, true); pos += 2; };
        const setUint32 = (d: number) => { view.setUint32(pos, d, true); pos += 4; };

        setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
        setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
        setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);

        const channels = [];
        for (let i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));
        let offset = 0;
        while (pos < length) {
            for (let i = 0; i < numOfChan; i++) {
                let sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }
        return new Blob([bufferArr], { type: 'audio/wav' });
    };

    const handleDownloadAll = () => {
        if (!mergedAudioUrl) return;
        const a = document.createElement('a');
        a.href = mergedAudioUrl;
        a.download = `google_master_${Date.now()}.wav`;
        a.click();
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-6">
                <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-900/30 rounded-xl border border-emerald-900/20">
                                <Volume2 className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Google TTS Pro</h2>
                                <p className="text-xs text-gray-500 font-medium">Phiên bản hỗ trợ đầy đủ tính năng</p>
                            </div>
                        </div>
                        <button
                            onClick={handleOptimize}
                            disabled={!text.trim() || isOptimizing}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all ${
                                isOptimizing 
                                ? 'bg-purple-900/40 text-purple-400 border-purple-900/30' 
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-purple-500 hover:text-purple-400'
                            }`}
                        >
                            <Sparkles size={14} className={isOptimizing ? 'animate-spin' : ''} />
                            {isOptimizing ? 'Đang tối ưu...' : 'Tối ưu AI'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-400 ml-1">Ngôn ngữ</label>
                            <select
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                className="w-full bg-[#1A1A1A] border border-[#262626] rounded-xl p-3 text-sm text-gray-200 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                            >
                                <option value="vi">Tiếng Việt</option>
                                <option value="en">Tiếng Anh (US)</option>
                                <option value="ja">Tiếng Nhật</option>
                                <option value="ko">Tiếng Hàn</option>
                                <option value="zh">Tiếng Trung</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-400 ml-1">Văn bản</label>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Nhập văn bản dài hoặc tải file SRT, TXT, DOCX..."
                                rows={8}
                                className="w-full bg-[#1A1A1A] border border-[#262626] rounded-xl p-4 text-sm text-gray-200 resize-none outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium leading-relaxed"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".srt,.txt,.docx" className="hidden" />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="py-3 bg-[#1A1A1A] border border-[#262626] text-gray-400 rounded-xl font-bold uppercase tracking-wider text-[10px] hover:bg-[#262626] hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                                <FileText size={14} /> Tải tệp lên
                            </button>
                            <button
                                onClick={handleAddContent}
                                disabled={!text.trim()}
                                className="py-3 bg-emerald-600/10 border border-emerald-600/20 text-emerald-400 rounded-xl font-bold uppercase tracking-wider text-[10px] hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-20 shadow-lg"
                            >
                                Thêm hàng chờ
                            </button>
                        </div>
                        
                        <button
                            onClick={() => { setRetryAttempt(0); processQueue(); }}
                            disabled={isProcessing || chunks.filter(c => c.status === 'pending').length === 0}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase tracking-widest text-sm transition-all disabled:opacity-20 flex items-center justify-center gap-3"
                        >
                            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                            {isProcessing ? 'Đang tạo Audio...' : 'Bắt đầu tổng hợp'}
                        </button>
                    </div>
                </div>

                {mergedAudioUrl && (
                    <div className="bg-emerald-900/10 border border-emerald-900/20 rounded-2xl p-6 space-y-4 animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                <CheckCircle2 size={14} />
                                Đã kết hợp xong (Master)
                            </h3>
                            <button 
                                onClick={() => setIsVideoModalOpen(true)}
                                className="flex items-center gap-2 py-1.5 px-4 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-blue-700 transition-all"
                            >
                                <Film size={14} /> Sản xuất Video
                            </button>
                        </div>
                        <audio controls src={mergedAudioUrl} className="w-full h-10 invert brightness-200 hue-rotate-180" />
                        <button
                            onClick={handleDownloadAll}
                            className="w-full py-3 bg-[#1A1A1A] border border-[#262626] text-white rounded-xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-[#262626]"
                        >
                            <Download size={14} /> Tải xuống file .wav
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-[#121212] border border-[#262626] rounded-2xl flex flex-col h-full min-h-[600px] overflow-hidden">
                <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0d0d0d]">
                    <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Phân đoạn ({successfulChunksCount}/{totalChunksCount})</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {failedChunksCount > 0 && !isProcessing && (
                            <button 
                                onClick={() => { setRetryAttempt(0); retryAllFailed(); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/20 text-amber-500 rounded-lg text-[9px] font-bold uppercase border border-amber-900/20 hover:bg-amber-600 hover:text-white transition-all"
                            >
                                <RefreshCcw size={12} /> Thử lại ({failedChunksCount})
                            </button>
                        )}
                        <button 
                            onClick={() => { setChunks([]); setMergedAudioUrl(null); }} 
                            className="p-1.5 hover:bg-red-900/20 text-gray-500 hover:text-red-400 rounded-lg transition-all"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-3 scrollbar-hide">
                    {chunks.map((chunk, i) => (
                        <div key={chunk.id} className={`p-4 rounded-xl border border-[#262626] bg-[#1A1A1A] space-y-3 relative group transition-all ${chunk.status === 'error' ? 'border-red-900/30' : ''}`}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Đoạn {i + 1}</span>
                                    {chunk.timestamp && (
                                        <span className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded italic">
                                            {chunk.timestamp}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                                    chunk.status === 'finished' ? 'bg-emerald-900/30 text-emerald-400' :
                                    chunk.status === 'processing' ? 'bg-blue-900/30 text-blue-400 animate-pulse' :
                                    chunk.status === 'error' ? 'bg-red-900/30 text-red-500' :
                                    'bg-gray-800 text-gray-500'
                                }`}>
                                    {chunk.status === 'finished' ? 'Hoàn thành' : 
                                     chunk.status === 'processing' ? 'Đang đọc...' : 
                                     chunk.status === 'error' ? 'Thất bại' : 'Chờ'}
                                </span>
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed line-clamp-2 italic">"{chunk.text}"</p>
                            {chunk.status === 'finished' && chunk.audioUrl && (
                                <AudioVisualizer audioUrl={chunk.audioUrl} height={32} />
                            )}
                            {chunk.status === 'error' && (
                                <p className="text-[9px] text-red-500 font-bold uppercase">Sự cố kết nối với Google</p>
                            )}
                        </div>
                    ))}

                    {chunks.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-10 py-20">
                            <Layers size={64} />
                            <div className="text-center">
                                <p className="text-sm font-bold uppercase tracking-widest">Hàng chờ trống</p>
                                <p className="text-[10px] uppercase mt-1">Hãy nhập nội dung hoặc tải file để bắt đầu</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isVideoModalOpen && mergedAudioUrl && (
                <VideoMerger 
                    audioUrl={mergedAudioUrl} 
                    onClose={() => setIsVideoModalOpen(false)} 
                />
            )}
        </div>
    );
};
