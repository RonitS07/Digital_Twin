import React, { useState, useEffect } from 'react'
import { API_BASE } from './config'
import { AnimatePresence, motion } from 'framer-motion'


import { Login, Signup, ForgotPassword } from './components/Auth'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
    Welcome,
    ChooseRole,
    ConnectTools,
    ControlPreferences,
    PrivacyPermissions,
    ConnectProtocol,
    Initializing
} from './components/Onboarding'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Chat from './components/Chat'
import Activity from './components/Activity'
import Workspace from './components/Workspace'
import Settings from './components/Settings'
import AgentInbox from './components/AgentInbox'
import Files from './components/Files'
import TwinChat from './components/TwinChat'
import AdminDashboard from './components/AdminDashboard'


export { useStore } from './store/useStore'
import { useStore } from './store/useStore'

function App() {
    const { currentScreen, setCurrentScreen, view, setView, theme, auth: storeAuth, login, logout, updateUser, setIsAdmin, isAdmin } = useStore()
    const [initializing, setInitializing] = useState(true);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Setup global auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // User is authenticated — Auth.jsx already handles login() + navigation.
                // Here we just ensure the store token is always fresh on tab/reload.
                try {
                    const existingUser = useStore.getState().auth.user
                    // Only re-hydrate if the store is empty (e.g. hard refresh with Firebase session persisted)
                    if (!existingUser || existingUser.uid !== firebaseUser.uid) {
                        const idToken = await firebaseUser.getIdToken()
                        // Try to get a backend JWT, sending idToken for optional server-side verification
                        const backendRes = await fetch(`${API_BASE}/auth/firebase`, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'X-Firebase-Token': idToken,
                            },
                            body: JSON.stringify({
                                uid:   firebaseUser.uid,
                                email: firebaseUser.email   || '',
                                name:  firebaseUser.displayName || '',
                            }),
                        }).catch(() => null)

                        const backendData = backendRes?.ok ? await backendRes.json() : {}

                        login({
                            uid:         firebaseUser.uid,
                            email:       firebaseUser.email || '',
                            name:        firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                            photoURL:    firebaseUser.photoURL || '',
                            accessToken: backendData.access_token || idToken,
                            is_admin:    !!(backendData?.user?.is_admin ?? backendData?.is_admin),
                        }, backendData.preferences)
                        setIsAdmin(!!(backendData?.user?.is_admin ?? backendData?.is_admin))
                        setCurrentScreen('main')
                    }
                } catch (err) {
                    console.warn('onAuthStateChanged rehydration error:', err)
                }
            } else {
                // User signed out — clean up store
                logout()
            }
            setInitializing(false)
        })

        // Proactive token refresh every 45 minutes (Firebase tokens expire at 60min)
        const refreshInterval = setInterval(async () => {
            if (auth.currentUser) {
                try {
                    const newToken = await auth.currentUser.getIdToken(true)
                    // Refresh backend JWT too
                    const backendRes = await fetch(`${API_BASE}/auth/firebase`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Firebase-Token': newToken,
                        },
                        body: JSON.stringify({
                            uid:   auth.currentUser.uid,
                            email: auth.currentUser.email   || '',
                            name:  auth.currentUser.displayName || '',
                        }),
                    }).catch(() => null)
                    const backendData = backendRes?.ok ? await backendRes.json() : {}
                    const serverIsAdmin = !!(backendData?.user?.is_admin ?? backendData?.is_admin)
                    updateUser({
                        accessToken: backendData.access_token || newToken,
                        is_admin: serverIsAdmin,
                    })
                    setIsAdmin(serverIsAdmin)
                } catch (err) {
                    console.warn('Token refresh error:', err)
                }
            }
        }, 45 * 60 * 1000)

        return () => {
            unsubscribe()
            clearInterval(refreshInterval)
        }
    }, [login, logout, setCurrentScreen, updateUser, setIsAdmin])

    useEffect(() => {
        const syncAdminPath = () => {
            const path = window.location.pathname;
            if (path === '/admin') {
                if (isAdmin) {
                    setView('admin');
                } else {
                    setView('home');
                    window.history.replaceState({}, '', '/home');
                    showToast('Access denied.');
                }
            }
        };
        syncAdminPath();
    }, [isAdmin, setView]);

    useEffect(() => {
        if (view === 'admin') {
            window.history.replaceState({}, '', '/admin');
            return;
        }
        if (window.location.pathname === '/admin' && !isAdmin) {
            window.history.replaceState({}, '', '/home');
        }
    }, [view, isAdmin]);

    // Theme effect
    useEffect(() => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')

        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            root.classList.add(systemTheme)
        } else {
            root.classList.add(theme)
        }
    }, [theme])

    const handleFlow = (screen) => {
        setCurrentScreen(screen)
        if (screen === 'main') {
            updateUser({ onboardingCompleted: true })
        }
    }

    return (
        <div className="bg-surface-base min-h-screen text-on-surface selection:bg-primary/30 antialiased">
            {toast && (
                <div className={`fixed top-5 right-5 z-[200] px-4 py-2 rounded-xl text-sm font-semibold border ${
                    toast.type === 'error'
                        ? 'bg-red-500/90 text-white border-red-400/40'
                        : 'bg-primary/90 text-white border-primary/40'
                }`}>
                    {toast.msg}
                </div>
            )}
            <AnimatePresence mode="wait">
                {/* Authentication */}
                {currentScreen === 'login' && (
                    <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Login
                            onSignup={() => handleFlow('signup')}
                            onForgotPassword={() => handleFlow('forgot-password')}
                        />
                    </motion.div>
                )}
                {currentScreen === 'forgot-password' && (
                    <motion.div key="forgot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <ForgotPassword onBack={() => handleFlow('login')} />
                    </motion.div>
                )}
                {currentScreen === 'signup' && (
                    <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Signup onBack={() => handleFlow('login')} />
                    </motion.div>
                )}

                {/* Onboarding Journey */}
                {currentScreen === 'welcome' && (
                    <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Welcome onNext={() => handleFlow('role')} />
                    </motion.div>
                )}
                {currentScreen === 'role' && (
                    <motion.div key="role" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <ChooseRole onNext={() => handleFlow('tools')} />
                    </motion.div>
                )}
                {currentScreen === 'tools' && (
                    <motion.div key="tools" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <ConnectTools onNext={() => handleFlow('protocol')} />
                    </motion.div>
                )}
                {currentScreen === 'protocol' && (
                    <motion.div key="protocol" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <ConnectProtocol onNext={() => handleFlow('preferences')} />
                    </motion.div>
                )}
                {currentScreen === 'preferences' && (
                    <motion.div key="pref" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <ControlPreferences onNext={() => handleFlow('privacy')} />
                    </motion.div>
                )}
                {currentScreen === 'privacy' && (
                    <motion.div key="privacy" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <PrivacyPermissions onNext={() => handleFlow('initializing')} />
                    </motion.div>
                )}
                {currentScreen === 'initializing' && (
                    <motion.div key="init" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Initializing onComplete={() => handleFlow('main')} />
                    </motion.div>
                )}

                {/* Unified Dashboard */}
                {currentScreen === 'main' && (
                    <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-screen w-full overflow-hidden">
                        <Layout currentView={view} setView={setView}>
                            <>
                                {/* Keep Dashboard always mounted but hide visually so it persists data and polls seamlessly */}
                                <div className={`h-full ${view === 'home' ? 'block' : 'hidden'}`}>
                                    <Dashboard />
                                </div>
                                <AnimatePresence mode="wait">
                                    {view !== 'home' && (
                                        <motion.div
                                            key={view}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.3 }}
                                            className="h-full"
                                        >
                                            {view === 'chat' && <Chat />}
                                            {view === 'files' && <Files />}
                                            {view === 'workspace' && <Workspace />}
                                            {view === 'activity' && <Activity />}
                                            {view === 'settings' && <Settings />}
                                            {view === 'agents' && <AgentInbox />}
                                            {view === 'twin-chat' && <TwinChat />}
                                            {view === 'admin' && (isAdmin ? <AdminDashboard /> : <Dashboard />)}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </>
                        </Layout>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default App
