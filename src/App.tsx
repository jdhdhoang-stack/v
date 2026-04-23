
import React, { useState } from 'react';
import { Logo } from '../components/Logo';
import { Settings } from '../components/Settings';
import { TextToSpeech } from '../components/TextToSpeech';
import { TextFilter } from '../components/TextFilter';
import { GoogleTTS } from '../components/GoogleTTS';
import { ChevronDown, Mic2, Languages, Cpu } from 'lucide-react';

const TabButton: React.FC<{ 
    name: string; 
    active: boolean; 
    onClick: () => void; 
    icon: React.ReactNode;
}> = ({ name, active, onClick, icon }) => {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg ${
                active 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200'
            }`}
        >
            <span className={active ? 'text-white' : 'text-gray-500'}>{icon}</span>
            <span>{name}</span>
        </button>
    );
};

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'tts' | 'google-tts' | 'filter' | 'settings'>('tts');
    const [isTtsDropdownOpen, setIsTtsDropdownOpen] = useState(false);
    
    return (
        <div className="min-h-screen flex flex-col bg-[#0A0A0A]">
            <header className="bg-[#0D0D0D] border-b border-[#262626] sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Logo className="h-8 w-8 text-blue-500" />
                        <h1 className="text-xl font-bold tracking-tight text-white">Vocalis</h1>
                        <span className="hidden sm:inline-block px-2 py-0.5 bg-[#1A1A1A] text-gray-400 text-[10px] font-bold rounded uppercase tracking-wider">Pro Suite</span>
                    </div>

                    <nav className="flex items-center gap-2">
                        <div className="relative">
                            <button
                                onMouseEnter={() => setIsTtsDropdownOpen(true)}
                                onClick={() => setIsTtsDropdownOpen(!isTtsDropdownOpen)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg ${
                                    (activeTab === 'tts' || activeTab === 'google-tts')
                                    ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' 
                                    : 'text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200'
                                }`}
                            >
                                <Mic2 size={16} />
                                <span>Tổng hợp</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${isTtsDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isTtsDropdownOpen && (
                                <div 
                                    onMouseLeave={() => setIsTtsDropdownOpen(false)}
                                    className="absolute top-full left-0 mt-2 w-48 bg-[#121212] border border-[#262626] rounded-xl shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200"
                                >
                                    <button 
                                        onClick={() => { setActiveTab('tts'); setIsTtsDropdownOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all hover:bg-[#1A1A1A] ${activeTab === 'tts' ? 'text-blue-400' : 'text-gray-400'}`}
                                    >
                                        <Cpu size={14} />
                                        Vocalis Engine
                                    </button>
                                    <button 
                                        onClick={() => { setActiveTab('google-tts'); setIsTtsDropdownOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all hover:bg-[#1A1A1A] ${activeTab === 'google-tts' ? 'text-emerald-400' : 'text-gray-400'}`}
                                    >
                                        <Languages size={14} />
                                        Google Translate
                                    </button>
                                </div>
                            )}
                        </div>

                        <TabButton 
                            name="Lọc văn bản" 
                            active={activeTab === 'filter'} 
                            onClick={() => setActiveTab('filter')} 
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>}
                        />
                        <div className="w-px h-6 bg-[#262626] mx-2"></div>
                        <TabButton 
                            name="Cài đặt" 
                            active={activeTab === 'settings'} 
                            onClick={() => setActiveTab('settings')} 
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>}
                        />
                    </nav>
                </div>
            </header>

            <main className="flex-grow container mx-auto p-6 md:p-10">
                 {activeTab === 'tts' && <TextToSpeech />}
                 {activeTab === 'google-tts' && <GoogleTTS />}
                 {activeTab === 'filter' && <TextFilter />}
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
