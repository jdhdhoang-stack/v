
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Volume2, Download, Trash2, Layers, Loader2, Music, CheckCircle2, Sparkles, FileText, Film, RefreshCcw, Play, History, Globe } from 'lucide-react';
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

const LANGUAGES = [
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'en', name: 'English (United States)' },
    { code: 'en-uk', name: 'English (United Kingdom)' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'es', name: 'Spanish' },
    { code: 'ru', name: 'Russian' },
    { code: 'th', name: 'Thai' },
    { code: 'id', name: 'Indonesian' },
];

export const GoogleTTS: React.FC = () => {
    const [text, setText] = useState('');
    const [lang, setLang] = useState('vi');
    const [chunks, setChunks] = useState<GoogleChunk[]>(() => {
        const saved = localStorage.getItem('vocalis_google_history');
        return saved ? JSON.parse(saved) : [];
    });
    const [isProcessing, setIsProcessing] = useState(false);

    // Save to localStorage whenever chunks change
    useEffect(() => {
        localStorage.setItem('vocalis_google_history', JSON.stringify(chunks));
    }, [chunks]);
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
        setChunks(prev => [...newChunks, ...prev]); // Prepend for better "latest" view
        setText('');
        // Auto process if it's the first set of chunks
        if (chunks.length === 0) {
           setTimeout(() => processQueue(), 100);
        }
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
                setChunks(prev => [...newChunks, ...prev]);
            } else {
                const newChunks: GoogleChunk[] = content.map(item => ({
                    id: uuidv4(),
                    text: item.text,
                    timestamp: item.timestamp,
                    status: 'pending'
                }));
                setChunks(prev => [...newChunks, ...prev]);
            }
            setTimeout(() => processQueue(), 100);
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
                // Use local proxy with cache-busting to avoid stale errors
                const proxyUrl = `/api/proxy/google-tts?text=${encodeURIComponent(chunk.text)}&lang=${lang}&v=${Date.now()}`;
                
                // Fetch to verify and get the actual data
                const res = await fetch(proxyUrl);
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText);
                }

                await new Promise(r => setTimeout(r, 1200)); // Increased rate limiting delay
                setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'finished', audioUrl: proxyUrl } : c));
            } catch (error: any) {
                console.error("Google TTS Proxy Error:", error);
                setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'error', error: error.message || 'Sự cố kết nối' } : c));
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
                processQueue();
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
        <div className="max-w-4xl mx-auto space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header section inspired by Sound of Text */}
            <div className="text-center space-y-4">
                <h2 className="text-4xl font-black text-white tracking-tight flex items-center justify-center gap-4">
                   <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg rotate-3">
                       <Volume2 className="w-8 h-8 text-black" strokeWidth={3} />
                   </div>
                   Vocalis Google <span className="text-emerald-500">TTS</span>
                </h2>
                <p className="text-gray-500 font-medium max-w-md mx-auto text-sm leading-relaxed">
                    Tạo giọng đọc từ Google Translate với khả năng chia nhỏ văn bản dài và gộp audio tự động.
                </p>
            </div>

            {/* Input Card */}
            <div className="bg-[#121212] border border-[#262626] rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 opacity-20"></div>
                
                <div className="space-y-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                             <div className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase tracking-widest mb-1 ml-1">
                                <Globe size={14} className="text-emerald-500" /> Ngôn ngữ
                             </div>
                             <select
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                className="w-full bg-[#1A1A1A] border-2 border-[#262626] rounded-2xl p-4 text-sm font-bold text-gray-200 outline-none focus:border-emerald-500 transition-all cursor-pointer hover:bg-[#202020] appearance-none"
                            >
                                {LANGUAGES.map(l => (
                                    <option key={l.code} value={l.code}>{l.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-end gap-3 pb-0.5">
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".srt,.txt,.docx" className="hidden" />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 py-4 px-6 bg-[#1A1A1A] border-2 border-[#262626] rounded-2xl text-xs font-black uppercase text-gray-400 hover:border-blue-500/50 hover:text-blue-400 transition-all flex items-center justify-center gap-3"
                            >
                                <FileText size={18} /> File SRT / TXT
                            </button>
                            <button
                                onClick={handleOptimize}
                                disabled={!text.trim() || isOptimizing}
                                className="p-4 bg-purple-500/10 border-2 border-purple-500/20 rounded-2xl text-purple-400 hover:bg-purple-500 hover:text-white transition-all disabled:opacity-10"
                                title="Tối ưu nội dung"
                            >
                                <Sparkles size={20} className={isOptimizing ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                         <div className="flex justify-between items-center px-1">
                             <div className="text-xs font-black text-gray-500 uppercase tracking-widest">Nội dung</div>
                             <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{text.length} ký tự</div>
                         </div>
                         <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Nhập nội dung cần chuyển sang giọng nói..."
                            className="w-full bg-[#1A1A1A] border-2 border-[#262626] rounded-3xl p-6 text-sm font-medium text-gray-200 min-h-[150px] resize-none outline-none focus:border-emerald-500 transition-all focus:ring-4 focus:ring-emerald-500/5"
                        />
                    </div>

                    <button
                        onClick={handleAddContent}
                        disabled={!text.trim() || isProcessing}
                        className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-black rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-[0_8px_0_rgb(5,150,105)] disabled:opacity-20 disabled:shadow-none translate-y-[-4px] active:translate-y-0 active:shadow-none"
                    >
                        {isProcessing ? 'Đang đọc văn bản...' : 'Submit'}
                    </button>
                </div>
            </div>

            {/* Global Actions for Merged Audio */}
            {mergedAudioUrl && (
                <div className="bg-[#059669] rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-in zoom-in duration-500">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-white/20 rounded-2xl border border-white/10">
                            <CheckCircle2 className="w-8 h-8 text-white" />
                        </div>
                        <div className="text-white text-left">
                            <h3 className="text-lg font-black uppercase tracking-wide">Audio Master Sẵn sàng</h3>
                            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">Gộp từ {successfulChunksCount} phân đoạn</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <audio controls src={mergedAudioUrl} className="h-10 opacity-60 hover:opacity-100 transition-opacity flex-grow brightness-150 saturate-0 contrast-125" />
                        <button 
                            onClick={handleDownloadAll}
                            className="p-3 bg-white text-emerald-600 rounded-xl hover:scale-110 transition-transform shadow-xl"
                            title="Tải xuống Master"
                        >
                            <Download size={20} strokeWidth={3} />
                        </button>
                        <button 
                            onClick={() => setIsVideoModalOpen(true)}
                            className="p-3 bg-blue-500 text-white rounded-xl hover:scale-110 transition-transform shadow-xl"
                            title="Tạo Video"
                        >
                            <Film size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
            )}

            {/* Results Section */}
            <div className="space-y-6">
                <div className="flex justify-between items-center px-4">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <History size={16} /> Lịch sử phân đoạn ({successfulChunksCount}/{totalChunksCount})
                    </h3>
                    <div className="flex items-center gap-4">
                         {failedChunksCount > 0 && (
                            <button 
                                onClick={() => { setRetryAttempt(0); retryAllFailed(); processQueue(); }}
                                className="text-[10px] font-black text-amber-500 uppercase flex items-center gap-1 hover:text-amber-400 transition-colors"
                            >
                                <RefreshCcw size={12} /> Thử lại {failedChunksCount} lỗi
                            </button>
                         )}
                         <button 
                            onClick={() => { setChunks([]); setMergedAudioUrl(null); }}
                            className="text-[10px] font-black text-gray-600 uppercase flex items-center gap-1 hover:text-red-500 transition-colors"
                         >
                            <Trash2 size={12} /> Xóa hết
                         </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {chunks.map((chunk, i) => (
                        <div key={chunk.id} className="bg-[#121212] border border-[#262626] rounded-3xl p-6 transition-all hover:bg-[#151515] hover:border-[#363636] group animate-in slide-in-from-left-4 duration-300">
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-grow space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center text-[10px] font-black text-emerald-500 border border-[#262626]">
                                            {(totalChunksCount - i).toString().padStart(2, '0')}
                                        </div>
                                        <div className="flex-grow">
                                            <p className="text-sm font-medium text-gray-300 leading-relaxed italic line-clamp-2">
                                                "{chunk.text}"
                                            </p>
                                        </div>
                                    </div>
                                    {chunk.timestamp && (
                                        <div className="inline-block px-3 py-1 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold rounded-lg border border-emerald-500/10">
                                            Timeline: {chunk.timestamp}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-[#262626] pt-4 md:pt-0 md:pl-6 min-w-[200px] justify-between md:justify-end">
                                    {chunk.status === 'processing' && (
                                        <div className="flex items-center gap-2 text-blue-500 text-[10px] font-black uppercase">
                                            <Loader2 size={14} className="animate-spin" /> Đang đọc...
                                        </div>
                                    )}
                                    {chunk.status === 'error' && (
                                        <div className="text-red-500 text-[10px] font-black uppercase">Lỗi kết nối</div>
                                    )}
                                    {chunk.status === 'finished' && chunk.audioUrl && (
                                        <div className="flex items-center gap-3 w-full">
                                             <AudioVisualizer audioUrl={chunk.audioUrl} height={30} />
                                             <a 
                                                href={chunk.audioUrl} 
                                                download={`vocalis_gg_${i}.mp3`}
                                                className="p-3 bg-[#1A1A1A] text-gray-400 rounded-xl hover:text-emerald-500 transition-colors"
                                            >
                                                <Download size={16} />
                                             </a>
                                        </div>
                                    )}
                                    {chunk.status === 'pending' && (
                                         <div className="text-gray-600 text-[10px] font-black uppercase tracking-widest">Đang chờ...</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {chunks.length === 0 && (
                        <div className="py-20 text-center flex flex-col items-center justify-center space-y-4 opacity-10">
                            <Layers size={64} strokeWidth={1} />
                            <p className="text-sm font-black uppercase tracking-widest">Chưa có bản ghi nào</p>
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
