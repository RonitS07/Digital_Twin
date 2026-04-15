import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Components
import { Login, Signup, ForgotPassword } from './components/Auth'
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

const SettingsPanel = () => (
    <div className="p-12 max-w-4xl mx-auto space-y-12">
        <div>
            <h2 className="text-4xl font-manrope font-extrabold text-white mb-4">Twin Settings</h2>
            <p className="text-on-surface-variant">Configure how your digital double interacts with your workspace.</p>
        </div>
        <div className="grid grid-cols-1 gap-6">
            <div className="p-8 rounded-3xl bg-surface-container border border-neutral/10 flex justify-between items-center group hover:border-primary/20 transition-all">
                <div>
                    <h3 className="text-lg font-bold text-white mb-1">Autonomous Mode</h3>
                    <p className="text-sm text-on-surface-variant opacity-70">Allow the Twin to draft responses automatically without prompting.</p>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative p-1 cursor-pointer">
                    <div className="w-4 h-4 bg-surface-base rounded-full absolute right-1"></div>
                </div>
            </div>
            <div className="p-8 rounded-3xl bg-surface-container border border-neutral/10 flex justify-between items-center group hover:border-primary/20 transition-all">
                <div>
                    <h3 className="text-lg font-bold text-white mb-1">Gmail Synchronization</h3>
                    <p className="text-sm text-on-surface-variant opacity-70">Automated monitoring and instant push notifications.</p>
                </div>
                <span className="text-primary font-bold text-xs uppercase tracking-widest bg-primary/10 px-4 py-2 rounded-full border border-primary/20">Connected</span>
            </div>
        </div>
    </div>
)

function App() {
    const [currentScreen, setCurrentScreen] = useState('login')
    const [view, setView] = useState('home')

    const handleFlow = (next) => setCurrentScreen(next)

    return (
        <div className="bg-surface-base min-h-screen text-on-surface selection:bg-primary/30 antialiased overflow-hidden">
            <AnimatePresence mode="wait">
                {/* Authentication */}
                {currentScreen === 'login' && (
                    <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Login
                            onLogin={() => handleFlow('welcome')}
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
                        <Signup onBack={() => handleFlow('login')} onComplete={() => handleFlow('welcome')} />
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
                    <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-screen w-full">
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
                                    {view === 'activity' && <Activity />}
                                    {view === 'settings' && <SettingsPanel />}
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
