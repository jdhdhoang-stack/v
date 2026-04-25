import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, signInWithPopup, signOut, doc, getDoc, setDoc, serverTimestamp, updateDoc } from '../lib/firebase';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
    user: FirebaseUser | null;
    loading: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    userSettings: any;
    saveSettings: (settings: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [userSettings, setUserSettings] = useState<any>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            setUser(u);
            if (u) {
                // Sync/Fetch user profile
                const userRef = doc(db, 'users', u.uid);
                const userSnap = await getDoc(userRef);
                
                if (!userSnap.exists()) {
                    const initialData = {
                        uid: u.uid,
                        email: u.email,
                        displayName: u.displayName,
                        photoURL: u.photoURL,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    };
                    await setDoc(userRef, initialData);
                    setUserSettings(initialData);
                } else {
                    setUserSettings(userSnap.data());
                }
            } else {
                setUserSettings(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed:", error);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    const saveSettings = async (settings: any) => {
        if (!user) return;
        const userRef = doc(db, 'users', user.uid);
        try {
            await updateDoc(userRef, {
                ...settings,
                updatedAt: serverTimestamp()
            });
            setUserSettings((prev: any) => ({ ...prev, ...settings }));
        } catch (error) {
            console.error("Failed to save settings:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, userSettings, saveSettings }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
