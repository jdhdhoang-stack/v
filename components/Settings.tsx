
import React, { useState, useEffect } from 'react';
import { keyManager } from '../services/keyManager';

export const Settings: React.FC = () => {
    const [keysInput, setKeysInput] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => { setKeysInput(keyManager.getKeysRaw()); }, []);

    const handleSave = () => {
        keyManager.saveKeys(keysInput);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="max-w-4xl mx-auto bg-[#121212] p-8 md:p-12 rounded-3xl shadow-sm border border-[#262626] animate-in fade-in slide-in-from-bottom-4 duration-700 text-gray-200">
            <div className="flex items-center gap-6 border-b border-[#262626] pb-8 mb-8">
                <div className="p-4 bg-blue-900/30 rounded-2xl border border-blue-900/20 text-blue-400">
                    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Cấu hình Hệ thống</h2>
                    <p className="text-sm font-medium text-gray-400 mt-1">Quản lý API & Truy cập Engine</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                    <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-[#262626] space-y-4">
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Thông tin Kích hoạt</h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-[#0D0D0D] border border-[#262626] rounded-xl flex justify-between items-center">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase">Mã Truy cập Hiện tại</p>
                                    <p className="text-xl font-mono text-blue-400 font-bold tracking-widest">{keysInput.split('\n')[0]}</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        keyManager.regenerateKey();
                                        setKeysInput(keyManager.getKeysRaw());
                                        setSaved(true);
                                        setTimeout(() => setSaved(false), 2000);
                                    }}
                                    className="p-2 hover:bg-[#262626] rounded-lg transition-colors text-gray-400 hover:text-white"
                                    title="Tạo mã mới"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                            </div>
                        </div>
                        <ul className="text-sm text-gray-300 space-y-3 font-medium">
                            <li className="flex items-start gap-3">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span>
                                <div>
                                    Hệ thống đã tự động cấp mã số định danh cho thiết bị của bạn.
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span>
                                <div>
                                    Mã này được sử dụng để xác thực với Engine Vocalis.
                                </div>
                            </li>
                        </ul>
                    </div>
                    
                    <button 
                        disabled
                        className="w-full py-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all bg-[#1A1A1A] text-gray-600 border border-[#262626] opacity-50 cursor-not-allowed"
                    >
                        Trạng thái: Đã Kích hoạt
                    </button>
                    
                    <div className="pt-6 border-t border-[#262626] flex justify-between items-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                         <span>Vocalis Engine v1.4.0</span>
                         <span>Tự động Quản lý Khóa</span>
                    </div>
                </div>

                <div className="space-y-4 flex flex-col justify-center text-center p-8 bg-[#1A1A1A] rounded-2xl border border-[#262626] border-dashed">
                    <div className="mx-auto p-4 bg-gray-900/50 rounded-full text-gray-600 mb-2">
                        <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h4 className="text-white font-bold">Cấu hình Đã ẩn</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">
                        Chế độ quản lý khóa thủ công đã bị vô hiệu hóa. <br/>
                        Mã số truy cập của bạn đang được quản lý tự động bởi hệ thống để đảm bảo bảo mật.
                    </p>
                </div>
            </div>
        </div>
    );
};
