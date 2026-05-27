import React, { useState, useEffect } from 'react'
import { API_BASE } from './config'
import { AnimatePresence, motion } from 'framer-motion'
import { Analytics } from "@vercel/analytics/react"


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
const Layout = React.lazy(() => import('./components/Layout'))
const Dashboard = React.lazy(() => import('./components/Dashboard'))
const Chat = React.lazy(() => import('./components/Chat'))
const Activity = React.lazy(() => import('./components/Activity'))
const Workspace = React.lazy(() => import('./components/Workspace'))
const Settings = React.lazy(() => import('./components/Settings'))
const AgentInbox = React.lazy(() => import('./components/AgentInbox'))
const Files = React.lazy(() => import('./components/Files'))
const TwinChat = React.lazy(() => import('./components/TwinChat'))
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'))

const LoadingFallback = () => (
    <div className="bg-[#13121b] min-h-screen flex flex-col items-center justify-center text-on-surface antialiased select-none w-full h-full">
        <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/40"
            />
            <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-primary/60 flex items-center justify-center shadow-[0_0_30px_rgba(103,96,253,0.35)] z-10 border border-white/10"
            >
                <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            </motion.div>
        </div>
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary animate-pulse italic">Loading Workspace Module...</p>
    </div>
);


export { useStore } from './store/useStore'
import { useStore } from './store/useStore'

function App() {
    const { currentScreen, setCurrentScreen, view, setView, theme, auth: storeAuth, login, logout, updateUser, setIsAdmin, isAdmin, authInitialized, setAuthInitialized } = useStore()
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
                    
                    let onboardingCompleted = !!existingUser?.onboardingCompleted;
                    try {
                        const { doc, getDoc } = await import('firebase/firestore');
                        const { db } = await import('./firebase');
                        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
                        if (userSnap.exists()) {
                            onboardingCompleted = !!userSnap.data()?.onboardingCompleted;
                        }
                    } catch (e) {
                        console.warn("Failed to check onboarding status on load", e);
                    }

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
                            onboardingCompleted,
                        }, backendData.preferences)
                        setIsAdmin(!!(backendData?.user?.is_admin ?? backendData?.is_admin))
                    }
                    
                    // Always route authenticated users correctly on page load/refresh
                    const currentSavedScreen = useStore.getState().currentScreen
                    const onboardingScreens = ['welcome', 'role', 'tools', 'protocol', 'preferences', 'privacy', 'initializing']

                    if (onboardingCompleted) {
                        setCurrentScreen('main')
                    } else {
                        if (onboardingScreens.includes(currentSavedScreen)) {
                            setCurrentScreen(currentSavedScreen)
                        } else {
                            setCurrentScreen('welcome')
                        }
                    }
                } catch (err) {
                    console.warn('onAuthStateChanged rehydration error:', err)
                }
            } else {
                // User signed out — clean up store
                logout()
            }
            setInitializing(false)
            setAuthInitialized(true)
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

    if (!authInitialized) {
        return (
            <div className="bg-surface-base min-h-screen flex flex-col items-center justify-center text-on-surface antialiased select-none">
                <div className="relative w-48 h-48 mb-8 flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20"
                    />
                    <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-primary/60 flex items-center justify-center shadow-[0_0_50px_rgba(103,96,253,0.35)] z-10 border border-white/10"
                    >
                        <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
                    </motion.div>
                </div>
                <div className="w-48 h-1 bg-surface-container-high rounded-full overflow-hidden mb-4 relative">
                    <motion.div
                        animate={{ left: ['-100%', '100%'] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="h-full bg-primary rounded-full absolute w-1/2"
                    />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse italic">Establishing Secure Sync</p>
                <p className="text-[9px] text-neutral mt-2 opacity-50 font-bold uppercase tracking-widest">Verifying Central Command Handshake...</p>
            </div>
        );
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
                        <React.Suspense fallback={<LoadingFallback />}>
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
                                                {view === 'integrations' && <Workspace />}
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
                        </React.Suspense>
                    </motion.div>
                )}
            </AnimatePresence>
            <Analytics />
        </div>
    )
}

export default App
