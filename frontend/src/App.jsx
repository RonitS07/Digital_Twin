import React, { useEffect } from 'react'
import { API_BASE } from './config'
import { AnimatePresence, motion } from 'framer-motion'


import { Login, Signup, ForgotPassword } from './components/Auth'
import { auth, db } from './firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import {
    Welcome,
    ChooseRole,
    ConnectTools,
    ControlPreferences,
    PrivacyPermissions,
    Initializing,
    Success
} from './components/Onboarding'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Chat from './components/Chat'
import Activity from './components/Activity'
import Workspace from './components/Workspace'
import Settings from './components/Settings'


export { useStore } from './store/useStore'
import { useStore } from './store/useStore'

function App() {
    const { currentScreen, setCurrentScreen, view, setView, theme, auth: storeAuth, login, logout, updateUser, setPreference } = useStore()
    const [initializing, setInitializing] = React.useState(true);

    // Setup global auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Preserve onboardingCompleted from persisted local store (same user)
                const existingAuth = useStore.getState().auth;
                const isSameUser = existingAuth.user?.uid === firebaseUser.uid;
                const locallyOnboarded = isSameUser ? (existingAuth.user?.onboardingCompleted ?? false) : false;

                const profileInfo = {
                    uid: firebaseUser.uid,
                    name: firebaseUser.displayName || 'User',
                    email: firebaseUser.email || '',
                    photoURL: firebaseUser.photoURL || '',
                    role: isSameUser ? (existingAuth.user?.role || 'Executive') : 'Executive',
                    company: isSameUser ? (existingAuth.user?.company || '') : '',
                    onboardingCompleted: locallyOnboarded,
                    accessToken: isSameUser ? (existingAuth.user?.accessToken || '') : ''
                };

                // --- Navigate instantly using local knowledge ---
                login(profileInfo);
                const latestScreen = useStore.getState().currentScreen;
                
                // If we have a cached positive signal, skip onboarding.
                // Otherwise, we wait for the Firestore sync in the next block.
                if (['login', 'signup', 'forgot-password'].includes(latestScreen) || initializing) {
                    if (locallyOnboarded) {
                        setCurrentScreen('main');
                    } else if (initializing) {
                        // Stay on initializing or go to welcome briefly
                        setCurrentScreen('welcome');
                    }
                }

                // --- Handle OAuth Redirects ---
                const params = new URLSearchParams(window.location.search)
                if (params.get('google') === 'connected') {
                    // Force navigation to workspace to see the result
                    setView('workspace');
                    setCurrentScreen('main');
                }

                setInitializing(false);

                // --- Sync Firestore in background ---
                ; (async () => {
                    // Mint/refresh backend JWT
                    try {
                        const res = await fetch(`${API_BASE}/auth/firebase`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                uid: firebaseUser.uid,
                                email: firebaseUser.email || '',
                                name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Twin User'),
                            }),
                        })
                        if (res.ok) {
                            const data = await res.json()
                            if (data?.access_token) {
                                updateUser({ accessToken: data.access_token })

                                // Now that we have the backend token, if we just came from OAuth, refresh sync status
                                if (params.get('google') === 'connected') {
                                    fetch(`${API_BASE}/integrations/google/status`, {
                                        headers: { Authorization: `Bearer ${data.access_token}` },
                                    })
                                        .then(r => r.json())
                                        .then(statusData => {
                                            if (statusData?.connected) {
                                                setPreference('gmailSync', true)
                                                setPreference('calendarSync', true)
                                                window.history.replaceState({}, document.title, window.location.pathname)
                                            }
                                        })
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        const userRef = doc(db, 'users', firebaseUser.uid);
                        const userSnap = await getDoc(userRef);
                        if (userSnap.exists()) {
                            const firestoreData = userSnap.data();
                            login({ ...useStore.getState().auth.user, ...firestoreData });
                            // Force redirect if they are already onboarded, even if previous logic chose 'welcome'
                            if (firestoreData.onboardingCompleted && useStore.getState().currentScreen !== 'main') {
                                setCurrentScreen('main');
                            }
                        }
                    } catch (e) { }
                })();
            } else {
                if (!initializing) {
                    logout();
                }
                setInitializing(false);
            }
        });
        return () => unsubscribe();
    }, [login, logout, setCurrentScreen, initializing, setView]);

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

    const handleFlow = async (screen) => {
        setCurrentScreen(screen)
        if (screen === 'main') {
            updateUser({ onboardingCompleted: true })
            if (storeAuth.user?.uid) {
                await setDoc(doc(db, 'users', storeAuth.user.uid), {
                    onboardingCompleted: true
                }, { merge: true })
            }
        }
    }

    return (
        <div className="bg-surface-base min-h-screen text-on-surface selection:bg-primary/30 antialiased">
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
                        <ConnectTools onNext={() => handleFlow('preferences')} />
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
                        <Initializing onComplete={() => handleFlow('success')} />
                    </motion.div>
                )}
                {currentScreen === 'success' && (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <Success onFinish={() => handleFlow('main')} />
                    </motion.div>
                )}

                {/* Unified Dashboard */}
                {currentScreen === 'main' && (
                    <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-screen w-full overflow-hidden">
                        <Layout currentView={view} setView={setView}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={view}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="h-full"
                                >
                                    {view === 'home' && <Dashboard />}
                                    {view === 'chat' && <Chat />}
                                    {view === 'workspace' && <Workspace />}
                                    {view === 'activity' && <Activity />}
                                    {view === 'settings' && <Settings />}
                                </motion.div>
                            </AnimatePresence>
                        </Layout>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default App
