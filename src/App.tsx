
import React, { useState } from 'react';
import { Logo } from '../components/Logo';
import { Settings } from '../components/Settings';
import { TextToSpeech } from '../components/TextToSpeech';
import { TextFilter } from '../components/TextFilter';
import { VideoMerger } from '../components/VideoMerger';
import { GeminiTab } from '../components/GeminiTab';
import { useAuth } from './contexts/AuthContext';
import { LogIn, LogOut, User as UserIcon, BrainCircuit, Mic2, Filter, Video, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const TabButton: React.FC<{ 
    name: string; 
    active: boolean; 
    onClick: () => void; 
    icon: React.ReactNode;
}> = ({ name, active, onClick, icon }) => {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl relative group ${
                active 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 active:scale-95' 
                : 'text-gray-500 hover:bg-[#1A1A1A] hover:text-gray-200'
            }`}
        >
            <span className={active ? 'text-white' : 'text-gray-500 group-hover:text-blue-400'}>{icon}</span>
            <span>{name}</span>
            {active && (
                <motion.div 
                    layoutId="tab-underline"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-blue-300 rounded-full"
                />
            )}
        </button>
    );
};

import { ChunkJob } from './types';

const App: React.FC = () => {
    const { user, login, logout, loading } = useAuth();
    const [activeTab, setActiveTab] = useState<'tts' | 'filter' | 'settings' | 'video' | 'gemini'>('tts');
    const [sharedAudioUrl, setSharedAudioUrl] = useState<string | null>(null);
    const [sharedChunks, setSharedChunks] = useState<ChunkJob[]>([]);
    const [showUserMenu, setShowUserMenu] = useState(false);
    
    return (
        <div className="min-h-screen flex flex-col bg-[#0A0A0A]">
            <header className="bg-[#0D0D0D]/80 backdrop-blur-xl border-b border-[#1A1A1A] sticky top-0 z-50">
                <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <span className="text-white font-black text-xl italic tracking-tighter">V</span>
                        </div>
                        <div className="hidden lg:block">
                            <h1 className="text-xl font-black tracking-tighter text-white leading-none uppercase">Vocalis</h1>
                            <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] mt-1">AI Audio Platform</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <nav className="flex items-center gap-1.5 p-1 bg-[#121212] rounded-2xl border border-[#262626]">
                            <TabButton 
                                name="Dịch & AI" 
                                active={activeTab === 'gemini'} 
                                onClick={() => setActiveTab('gemini')} 
                                icon={<BrainCircuit size={14} />}
                            />
                            <TabButton 
                                name="Tổng hợp" 
                                active={activeTab === 'tts'} 
                                onClick={() => setActiveTab('tts')} 
                                icon={<Mic2 size={14} />}
                            />
                            <TabButton 
                                name="Lọc văn bản" 
                                active={activeTab === 'filter'} 
                                onClick={() => setActiveTab('filter')} 
                                icon={<Filter size={14} />}
                            />
                            <TabButton 
                                name="Dựng Video" 
                                active={activeTab === 'video'} 
                                onClick={() => setActiveTab('video')} 
                                icon={<Video size={14} />}
                            />
                            <div className="w-px h-6 bg-[#262626] mx-1"></div>
                            <TabButton 
                                name="Cài đặt" 
                                active={activeTab === 'settings'} 
                                onClick={() => setActiveTab('settings')} 
                                icon={<SettingsIcon size={14} />}
                            />
                        </nav>

                        <div className="relative ml-2">
                            {user ? (
                                <button 
                                    onClick={() => setShowUserMenu(!showUserMenu)}
                                    className="flex items-center gap-3 p-1.5 pl-4 bg-[#1A1A1A] border border-[#262626] rounded-full hover:border-blue-500/30 transition-all shadow-lg"
                                >
                                    <div className="text-right hidden sm:block">
                                        <p className="text-[10px] font-black text-white leading-none capitalize">{user.displayName || 'Người dùng'}</p>
                                        <p className="text-[8px] font-bold text-gray-500 mt-1">Tài khoản Google</p>
                                    </div>
                                    {user.photoURL ? (
                                        <img src={user.photoURL} alt="Avatar" className="w-9 h-9 rounded-full border-2 border-blue-600/30 object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center border-2 border-blue-500/30">
                                            <UserIcon size={16} className="text-white" />
                                        </div>
                                    )}
                                </button>
                            ) : (
                                <button 
                                    onClick={login}
                                    disabled={loading}
                                    className="px-6 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-white/5"
                                >
                                    Đăng nhập Google
                                </button>
                            )}

                            <AnimatePresence>
                                {showUserMenu && user && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-4 w-56 bg-[#181818] border border-[#262626] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50 origin-top-right backdrop-blur-xl"
                                        >
                                            <div className="p-5 border-b border-[#262626] bg-gradient-to-br from-[#1A1A1A] to-[#121212]">
                                                <p className="text-xs font-black text-white truncate">{user.displayName}</p>
                                                <p className="text-[10px] text-gray-500 truncate mt-1">{user.email}</p>
                                            </div>
                                            <div className="p-2">
                                                <button 
                                                    onClick={() => {
                                                        logout();
                                                        setShowUserMenu(false);
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-400/5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    <LogOut size={16} />
                                                    Đăng xuất
                                                </button>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-grow container mx-auto p-6 md:p-10">
                 {activeTab === 'gemini' && <GeminiTab />}
                 {activeTab === 'tts' && <TextToSpeech onAudioMerged={setSharedAudioUrl} onChunksUpdated={setSharedChunks} />}
                 {activeTab === 'filter' && <TextFilter />}
                 {activeTab === 'video' && (
                     <div className="h-full">
                         {sharedAudioUrl ? (
                             <VideoMerger audioUrl={sharedAudioUrl} chunks={sharedChunks} />
                         ) : (
                             <div className="flex flex-col items-center justify-center p-20 bg-[#121212] border border-[#262626] rounded-3xl text-center space-y-6">
                                 <div className="p-6 bg-blue-900/10 rounded-full border border-blue-900/10">
                                     <svg className="w-16 h-16 text-blue-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2-2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                 </div>
                                 <div className="space-y-2">
                                     <h2 className="text-xl font-bold text-white">Chưa có Audio</h2>
                                     <p className="text-gray-500 max-w-sm mx-auto text-sm">Vui lòng quay lại tab "Tổng hợp" để tạo file âm thanh trước khi sản xuất video.</p>
                                 </div>
                                 <button 
                                    onClick={() => setActiveTab('tts')}
                                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
                                 >
                                     Tới Tab Tổng hợp
                                 </button>
                             </div>
                         )}
                     </div>
                 )}
                 {activeTab === 'settings' && <Settings />}
            </main>

            <footer className="py-8 bg-[#0D0D0D] border-t border-[#262626]">
                <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">
                        VOCALIS AUDIO ENGINE • v1.4.0
                    </p>
                    <div className="flex gap-6">
                        <a href="#" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Tài liệu</a>
                        <a href="#" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Hỗ trợ</a>
                        <a href="#" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Bảo mật</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default App;
