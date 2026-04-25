
import React, { useState, useRef, useEffect } from 'react';
import { Video, Image as ImageIcon, Download, Loader2, X, Play, Pause, Film, Settings, Maximize2, Type } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BlurConfig {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    amount: number;
}

interface SubtitleConfig {
    fontSize: number;
    bottomMargin: number;
    color: string;
    shadow: boolean;
    enabled: boolean;
}

import { ChunkJob } from '../src/types';

interface VideoMergerProps {
    audioUrl: string;
    chunks?: ChunkJob[];
    onClose?: () => void;
}

const STORAGE_KEY_BLUR = 'vocalis_blur_config';
const STORAGE_KEY_SUBTITLE = 'vocalis_subtitle_config';

export const VideoMerger: React.FC<VideoMergerProps> = ({ audioUrl, chunks, onClose }) => {
    const [bgType, setBgType] = useState<'image' | 'video' | 'color'>('color');
    const [bgSource, setBgSource] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [progress, setProgress] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    
    // Blur Settings
    const [blurConfig, setBlurConfig] = useState<BlurConfig>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_BLUR);
        return saved ? JSON.parse(saved) : { enabled: false, x: 10, y: 10, width: 20, height: 10, amount: 15 };
    });

    // Subtitle Settings
    const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_SUBTITLE);
        return saved ? JSON.parse(saved) : { fontSize: 48, bottomMargin: 100, color: '#ffffff', shadow: true, enabled: true };
    });

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);
    const requestRef = useRef<number>();

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_BLUR, JSON.stringify(blurConfig));
    }, [blurConfig]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SUBTITLE, JSON.stringify(subtitleConfig));
    }, [subtitleConfig]);

    useEffect(() => {
        if (bgType === 'video' && bgSource && videoRef.current) {
            videoRef.current.src = bgSource;
            videoRef.current.load();
            videoRef.current.currentTime = 0.1;
            videoRef.current.onseeked = () => {
                render();
            };
        }
    }, [bgSource, bgType]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        if (file.type.startsWith('image/')) {
            setBgType('image');
            setBgSource(url);
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
                render();
            };
            img.src = url;
        } else if (file.type.startsWith('video/')) {
            setBgType('video');
            setBgSource(url);
        }
    };

    const render = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Background
        if (bgType === 'image' && bgImageRef.current) {
            ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
        } else if (bgType === 'video' && videoRef.current && bgSource) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }

        // Apply Blur
        if (blurConfig.enabled) {
            const bx = (blurConfig.x / 100) * canvas.width;
            const by = (blurConfig.y / 100) * canvas.height;
            const bw = (blurConfig.width / 100) * canvas.width;
            const bh = (blurConfig.height / 100) * canvas.height;

            // Draw blurred version of what's already on canvas
            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, by, bw, bh);
            ctx.clip();
            
            // Standard approach to blur a region:
            // Draw current canvas content onto itself with a filter
            ctx.filter = `blur(${blurConfig.amount}px)`;
            if (bgType === 'image' && bgImageRef.current) {
                ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
            } else if (bgType === 'video' && videoRef.current && bgSource) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            }
            ctx.restore();
            ctx.filter = 'none';
        }

        // Draw Visualizer overlay
        const audio = audioRef.current;
        if (audio && !audio.paused) {
            const time = Date.now() / 1000;
            ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
            for (let i = 0; i < 64; i++) {
                const h = Math.sin(time * 6 + i * 0.15) * 40 + 50;
                ctx.fillRect(i * 18 + 60, canvas.height - h - 140, 14, h);
            }
        }

        // Draw Subtitles (Real implementation)
        if (subtitleConfig.enabled) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.font = `bold ${subtitleConfig.fontSize}px Inter`;
            
            if (subtitleConfig.shadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
            }
            
            ctx.fillStyle = subtitleConfig.color;
            
            let textToDraw = '';
            if (audio) {
                const currentTime = audio.currentTime;
                // Find active chunk
                const activeChunk = chunks?.find(c => 
                    c.startTime !== undefined && 
                    c.endTime !== undefined && 
                    currentTime >= c.startTime && 
                    currentTime <= c.endTime
                );
                
                if (activeChunk) {
                    textToDraw = activeChunk.text;
                } else if (chunks && chunks.length > 0 && !audio.paused && audio.duration > 0) {
                    // Fallback: If not in specific time, maybe show "active" chunk based on index if not timed
                    const approxIndex = Math.floor((currentTime / audio.duration) * chunks.length);
                    const chunk = chunks[approxIndex];
                    if (chunk && chunk.status === 'finished') textToDraw = chunk.text;
                } else if (!bgSource) {
                    textToDraw = 'Vui lòng chọn ảnh/video nền...';
                }
            }

            if (textToDraw) {
                // Handle long lines by splitting if needed, but for now simple wrap or single line
                ctx.fillText(textToDraw, canvas.width / 2, canvas.height - subtitleConfig.bottomMargin);
            }
            ctx.restore();
        }

        requestRef.current = requestAnimationFrame(render);
    };

    const startRendering = async () => {
        const canvas = canvasRef.current;
        const audio = audioRef.current;
        if (!canvas || !audio) return;

        setIsRendering(true);
        setProgress(0);

        const stream = canvas.captureStream(30);
        const audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();
        const source = audioContext.createMediaElementSource(audio);
        source.connect(dest);
        source.connect(audioContext.destination);
        
        const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9' });
        const recordedChunks: Blob[] = [];

        recorder.ondataavailable = (e) => recordedChunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vocalis_video_${Date.now()}.webm`;
            a.click();
            setIsRendering(false);
        };

        audio.currentTime = 0;
        await audio.play();
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            await videoRef.current.play();
        }
        recorder.start();

        const updateProgress = () => {
            if (audio.duration) {
                const p = (audio.currentTime / audio.duration) * 100;
                setProgress(p);
                if (audio.ended) {
                    recorder.stop();
                    if (videoRef.current) videoRef.current.pause();
                    return;
                }
            }
            requestAnimationFrame(updateProgress);
        };
        updateProgress();
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(render);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [bgSource, bgType, blurConfig, subtitleConfig]);

    return (
        <div className={onClose ? "fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4" : "w-full"}>
            <div className={`bg-[#0F0F0F] border border-[#262626] rounded-3xl w-full max-w-6xl overflow-hidden flex flex-col shadow-3xl mx-auto ${onClose ? "max-h-[95vh]" : ""}`}>
                <div className="px-8 py-6 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-900/20 rounded-xl border border-blue-900/20">
                            <Film className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Sản xuất Video Pro</h2>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-[0.2em]">Cấu hình nâng cao • Hỗ trợ Làm mờ & Subtitles</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {onClose && (
                            <button onClick={onClose} className="p-2 hover:bg-[#262626] rounded-full transition-colors text-gray-500">
                                <X size={24} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-10 grid grid-cols-1 xl:grid-cols-12 gap-12">
                    <div className="xl:col-span-4 space-y-8">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">1. Tài nguyên đầu vào</label>
                            <div className="grid grid-cols-1 gap-4">
                                <label className="cursor-pointer group relative overflow-hidden h-32 bg-[#141414] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                    <div className="p-3 bg-blue-950/20 rounded-full group-hover:scale-110 transition-transform">
                                        <ImageIcon size={28} className="text-gray-600 group-hover:text-blue-400" />
                                    </div>
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest">Ảnh Nền</span>
                                    {bgType === 'image' && bgSource && <div className="absolute right-4 top-4 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>}
                                </label>
                                <label className="cursor-pointer group relative overflow-hidden h-32 bg-[#141414] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                                    <div className="p-3 bg-purple-950/20 rounded-full group-hover:scale-110 transition-transform">
                                        <Video size={28} className="text-gray-600 group-hover:text-purple-400" />
                                    </div>
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest">Video Nền</span>
                                    {bgType === 'video' && bgSource && <div className="absolute right-4 top-4 w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>}
                                </label>
                            </div>
                            <button 
                                onClick={() => setShowSettings(true)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-[#1A1A1A] hover:bg-[#262626] text-white rounded-2xl text-xs font-black uppercase tracking-widest border border-[#333] transition-all hover:border-blue-500/30"
                            >
                                <Settings size={16} className="text-blue-400" />
                                Cấu hình Vùng mờ & Phụ đề
                            </button>
                        </div>

                        <div className="p-6 bg-blue-900/5 border border-blue-900/10 rounded-2xl space-y-3">
                            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Thông tin hệ thống</h4>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                Đang sử dụng bộ giải mã <span className="text-white font-bold">VP9 High Performance</span>. Video sẽ được xuất với độ phân giải <span className="text-white font-bold">1280x720</span> ở tốc độ 30 FPS.
                            </p>
                        </div>

                        <button 
                            onClick={startRendering}
                            disabled={isRendering || !bgSource}
                            className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-20 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-blue-900/20 active:scale-[0.98] flex items-center justify-center gap-4"
                        >
                            {isRendering ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            {isRendering ? `Đang xuất video (${Math.round(progress)}%)...` : 'Bắt đầu sản xuất video'}
                        </button>
                    </div>

                    <div className="xl:col-span-8 space-y-6">
                        <div className="flex justify-between items-end">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Xem trước Preview (Real-time)</label>
                            <div className="flex gap-4">
                                {blurConfig.enabled && <span className="px-2 py-0.5 bg-amber-900/20 text-amber-500 text-[10px] font-bold rounded uppercase tracking-tighter border border-amber-900/30 self-center">Blur Active</span>}
                                {subtitleConfig.enabled && <span className="px-2 py-0.5 bg-blue-900/20 text-blue-500 text-[10px] font-bold rounded uppercase tracking-tighter border border-blue-900/30 self-center">Subs Active</span>}
                            </div>
                        </div>
                        <div className="aspect-video w-full bg-black rounded-[2.5rem] border border-[#222] overflow-hidden relative shadow-inner group">
                            <canvas 
                                ref={canvasRef} 
                                width={1280} 
                                height={720} 
                                className="w-full h-full object-contain"
                            />
                            
                            {/* Draggable Blur Selection logic in modal, but visual indicator here could be nice too */}
                            
                            {isRendering && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center animate-in fade-in duration-500">
                                    <div className="relative h-24 w-24 mb-6">
                                        <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                                        <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-blue-500 font-black text-xs">
                                            {Math.round(progress)}%
                                        </div>
                                    </div>
                                    <p className="text-white font-black text-[10px] tracking-[0.3em] uppercase">Sản xuất nội dung...</p>
                                    <p className="text-gray-500 text-[10px] mt-2 underline cursor-not-allowed">Vui lòng không đóng trình duyệt</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-[#141414] border border-[#262626] rounded-2xl">
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Trạng thái Audio</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                    <span className="text-[10px] font-bold text-gray-300 uppercase">Sẵn sàng</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Bộ nhớ đệm</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase">128MB Global</span>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Độ phân giải</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase">1280x720 HD</span>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Mã hóa</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase">Hardware Accel</span>
                            </div>
                        </div>

                        <div className="hidden">
                             <audio ref={audioRef} src={audioUrl} />
                             {bgType === 'video' && <video ref={videoRef} src={bgSource || ''} loop muted playsInline />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSettings(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        ></motion.div>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-[#121212] border border-[#333] rounded-[2rem] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-[#262626] flex justify-between items-center bg-[#0d0d0d]">
                                <div className="flex items-center gap-3">
                                    <Settings className="w-5 h-5 text-blue-500" />
                                    <h3 className="font-black text-white uppercase tracking-widest text-sm">Cấu hình vùng mờ & Phụ đề</h3>
                                </div>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#262626] rounded-full text-gray-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
                                {/* Left: Preview with draggable area */}
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Vùng làm mờ (Draggable)</h4>
                                        <p className="text-[10px] text-gray-500">Giữ và kéo khung mờ bên dưới để xác định vị trí nhạy cảm cần che.</p>
                                    </div>
                                    
                                    <div className="aspect-video bg-black rounded-2xl overflow-hidden relative border border-[#333] group cursor-crosshair select-none"
                                        onMouseDown={(e) => {
                                            if (!blurConfig.enabled) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const startX = ((e.clientX - rect.left) / rect.width) * 100;
                                            const startY = ((e.clientY - rect.top) / rect.height) * 100;
                                            
                                            // Simple move logic
                                            const handleMouseMove = (mmE: MouseEvent) => {
                                                const currentX = ((mmE.clientX - rect.left) / rect.width) * 100;
                                                const currentY = ((mmE.clientY - rect.top) / rect.height) * 100;
                                                
                                                setBlurConfig(prev => ({
                                                    ...prev,
                                                    x: Math.min(Math.max(0, currentX - prev.width / 2), 100 - prev.width),
                                                    y: Math.min(Math.max(0, currentY - prev.height / 2), 100 - prev.height)
                                                }));
                                            };
                                            
                                            const handleMouseUp = () => {
                                                window.removeEventListener('mousemove', handleMouseMove);
                                                window.removeEventListener('mouseup', handleMouseUp);
                                            };
                                            
                                            window.addEventListener('mousemove', handleMouseMove);
                                            window.addEventListener('mouseup', handleMouseUp);
                                        }}
                                    >
                                        {/* Video/Image Preview in settings */}
                                        {bgType === 'image' && bgSource && <img src={bgSource} className="w-full h-full object-cover opacity-60" />}
                                        {bgType === 'video' && bgSource && <video src={bgSource} className="w-full h-full object-cover opacity-60" muted playsInline autoPlay loop />}
                                        {!bgSource && <div className="w-full h-full flex items-center justify-center text-gray-800 font-black uppercase text-[10px] tracking-widest">Vui lòng chọn nền trước</div>}

                                        {blurConfig.enabled && (
                                            <div 
                                                className="absolute border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.3)] group-hover:border-white transition-colors"
                                                style={{
                                                    left: `${blurConfig.x}%`,
                                                    top: `${blurConfig.y}%`,
                                                    width: `${blurConfig.width}%`,
                                                    height: `${blurConfig.height}%`
                                                }}
                                            >
                                                <div className="absolute inset-0 backdrop-blur-md"></div>
                                                <div className="absolute right-0 bottom-0 w-4 h-4 bg-white cursor-se-resize flex items-center justify-center"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                                                        if (!rect) return;

                                                        const handleMouseMove = (mmE: MouseEvent) => {
                                                            const currentX = ((mmE.clientX - rect.left) / rect.width) * 100;
                                                            const currentY = ((mmE.clientY - rect.top) / rect.height) * 100;
                                                            
                                                            setBlurConfig(prev => ({
                                                                ...prev,
                                                                width: Math.min(Math.max(5, currentX), 100 - prev.x),
                                                                height: Math.min(Math.max(5, currentY), 100 - prev.y)
                                                            }));
                                                        };
                                                        
                                                        const handleMouseUp = () => {
                                                            window.removeEventListener('mousemove', handleMouseMove);
                                                            window.removeEventListener('mouseup', handleMouseUp);
                                                        };
                                                        
                                                        window.addEventListener('mousemove', handleMouseMove);
                                                        window.addEventListener('mouseup', handleMouseUp);
                                                    }}
                                                >
                                                    <Maximize2 size={8} className="text-black" />
                                                </div>
                                                <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded">BLUR AREA</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-[#1A1A1A] rounded-2xl border border-[#262626]">
                                            <label className="flex items-center justify-between cursor-pointer">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kích hoạt làm mờ</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={blurConfig.enabled} 
                                                    onChange={(e) => setBlurConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600"
                                                />
                                            </label>
                                        </div>
                                        <div className="p-4 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Độ mờ: {blurConfig.amount}px</span>
                                            </div>
                                            <input 
                                                type="range" min="0" max="100" 
                                                value={blurConfig.amount} 
                                                onChange={(e) => setBlurConfig(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                                                className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Subtitle Settings */}
                                <div className="space-y-8">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-2">
                                            <Type size={16} className="text-blue-400" />
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Cấu hình chữ & Phụ đề</h4>
                                        </div>

                                        <div className="p-6 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-6">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Cỡ chữ (Px): {subtitleConfig.fontSize}</span>
                                                </div>
                                                <input 
                                                    type="range" min="12" max="120" 
                                                    value={subtitleConfig.fontSize} 
                                                    onChange={(e) => setSubtitleConfig(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                                                    className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                />
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Lề dưới (Offset): {subtitleConfig.bottomMargin}</span>
                                                </div>
                                                <input 
                                                    type="range" min="20" max="400" 
                                                    value={subtitleConfig.bottomMargin} 
                                                    onChange={(e) => setSubtitleConfig(prev => ({ ...prev, bottomMargin: parseInt(e.target.value) }))}
                                                    className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                />
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Màu sắc</span>
                                                <div className="flex gap-2">
                                                    {['#ffffff', '#facc15', '#ef4444', '#3b82f6'].map(color => (
                                                        <button 
                                                            key={color}
                                                            onClick={() => setSubtitleConfig(prev => ({ ...prev, color }))}
                                                            className={`w-6 h-6 rounded-full border-2 transition-all ${subtitleConfig.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                            style={{ backgroundColor: color }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <label className="flex items-center justify-between cursor-pointer pt-2">
                                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Đổ bóng (Text Shadow)</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={subtitleConfig.shadow} 
                                                    onChange={(e) => setSubtitleConfig(prev => ({ ...prev, shadow: e.target.checked }))}
                                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600"
                                                />
                                            </label>
                                        </div>

                                        <button 
                                            onClick={() => setShowSettings(false)}
                                            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                                        >
                                            Lưu thay đổi & Quay lại
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
