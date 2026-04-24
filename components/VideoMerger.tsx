
import React, { useState, useRef, useEffect } from 'react';
import { Video, Image as ImageIcon, Download, Loader2, X, Play, Pause, Film } from 'lucide-react';

interface VideoMergerProps {
    audioUrl: string;
    onClose?: () => void;
}

export const VideoMerger: React.FC<VideoMergerProps> = ({ audioUrl, onClose }) => {
    const [bgType, setBgType] = useState<'image' | 'video' | 'color'>('color');
    const [bgSource, setBgSource] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [progress, setProgress] = useState(0);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);
    const requestRef = useRef<number>();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (file.type.startsWith('image/')) {
            setBgType('image');
            const url = URL.createObjectURL(file);
            setBgSource(url);
            const img = new Image();
            img.src = url;
            bgImageRef.current = img;
        } else if (file.type.startsWith('video/')) {
            setBgType('video');
            setBgSource(URL.createObjectURL(file));
        }
    };

    const render = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Background
        if (bgType === 'image' && bgImageRef.current) {
            ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
        } else if (bgType === 'video' && videoRef.current && bgSource) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }

        // Draw Visualizer overlay
        const audio = audioRef.current;
        if (audio && !audio.paused) {
            // Simple visualizer simulation since we might not have AnalyzerNode yet
            const time = Date.now() / 1000;
            ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
            for (let i = 0; i < 50; i++) {
                const h = Math.sin(time * 5 + i * 0.2) * 50 + 60;
                ctx.fillRect(i * 20 + 20, canvas.height - h - 50, 15, h);
            }
        }

        // Draw text overlay (optional branding)
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Inter';
        ctx.fillText('Vocalis Audio Engine', 40, 60);

        requestRef.current = requestAnimationFrame(render);
    };

    const startRendering = async () => {
        const canvas = canvasRef.current;
        const audio = audioRef.current;
        if (!canvas || !audio) return;

        setIsRendering(true);
        setProgress(0);

        // Setup MediaRecorder
        const stream = canvas.captureStream(30);
        
        // Combine audio
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
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'vocalis_video.webm';
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
    }, [bgSource, bgType]);

    return (
        <div className={onClose ? "fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" : "w-full"}>
            <div className={`bg-[#121212] border border-[#262626] rounded-3xl w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl mx-auto ${onClose ? "max-h-[90vh]" : ""}`}>
                <div className="p-6 border-b border-[#262626] flex justify-between items-center bg-[#0d0d0d]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-900/30 rounded-lg border border-blue-900/20">
                            <Film className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Sản xuất Video</h2>
                            <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Gộp Audio & Hình ảnh/Video nền</p>
                        </div>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-2 hover:bg-[#262626] rounded-full transition-colors text-gray-400">
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bước 1: Chọn Nền</label>
                            <div className="grid grid-cols-2 gap-4">
                                <label className="cursor-pointer group">
                                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                    <div className="h-24 bg-[#1A1A1A] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-blue-500 transition-all">
                                        <ImageIcon size={24} className="text-gray-600 group-hover:text-blue-400" />
                                        <span className="text-[10px] font-bold uppercase text-gray-500 group-hover:text-white">Ảnh Nền</span>
                                    </div>
                                </label>
                                <label className="cursor-pointer group">
                                    <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                                    <div className="h-24 bg-[#1A1A1A] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-blue-500 transition-all">
                                        <Video size={24} className="text-gray-600 group-hover:text-blue-400" />
                                        <span className="text-[10px] font-bold uppercase text-gray-500 group-hover:text-white">Video Nền</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-900/10 border border-amber-900/20 rounded-2xl">
                            <p className="text-[11px] text-amber-500/80 leading-relaxed font-medium">
                                <strong>Lưu ý:</strong> Quá trình render video sẽ diễn ra ngay trên trình duyệt của bạn (Client-side). Vui lòng không đóng tab hoặc chuyển tab khi quá trình đang diễn ra để đảm bảo chất lượng.
                            </p>
                        </div>

                        <button 
                            onClick={startRendering}
                            disabled={isRendering || !bgSource}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-20 text-white rounded-2xl font-bold uppercase tracking-widest text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
                        >
                            {isRendering ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            {isRendering ? `Đang xuất video (${Math.round(progress)}%)...` : 'Bắt đầu Xuất Video'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Xem trước Preview</label>
                        <div className="aspect-video w-full bg-black rounded-3xl border border-[#262626] overflow-hidden relative shadow-2xl">
                            <canvas 
                                ref={canvasRef} 
                                width={1280} 
                                height={720} 
                                className="w-full h-full object-contain"
                            />
                            {isRendering && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <div className="text-center space-y-4">
                                        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                        <p className="text-white font-bold text-sm tracking-widest uppercase">Rendering...</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="hidden">
                             <audio ref={audioRef} src={audioUrl} />
                             {bgType === 'video' && <video ref={videoRef} src={bgSource || ''} loop muted />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
