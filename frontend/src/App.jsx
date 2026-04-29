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


export { useStore } from './store/useStore'
import { useStore } from './store/useStore'

function App() {
    const { currentScreen, setCurrentScreen, view, setView, theme, auth: storeAuth, login, logout, updateUser, setPreference } = useStore()
    const [initializing, setInitializing] = useState(true);

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
                        })
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
                    updateUser({ accessToken: backendData.access_token || newToken })
                } catch (err) {
                    console.warn('Token refresh error:', err)
                }
            }
        }, 45 * 60 * 1000)

        return () => {
            unsubscribe()
            clearInterval(refreshInterval)
        }
    }, [login, logout, setCurrentScreen, updateUser])

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
                                            {view === 'workspace' && <Workspace />}
                                            {view === 'activity' && <Activity />}
                                            {view === 'settings' && <Settings />}
                                            {view === 'agents' && <AgentInbox />}
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
