import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Eye, EyeOff, ArrowLeft, CheckCircle2,
    Mail, Lock, User, AlertCircle, Loader2
} from 'lucide-react'
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    sendPasswordResetEmail,
    updateProfile,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import { useStore } from '../store/useStore'
import { API_BASE } from '../config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const firebaseErrorMessage = (code) => {
    const map = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Try again.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/popup-blocked': 'Pop-up blocked. Please allow pop-ups and try again.',
        'auth/cancelled-popup-request': 'Another sign-in is already in progress.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
        'auth/user-disabled': 'This account has been disabled.',
        // ngrok / custom domain specific
        'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in. Ask the admin to add it in Firebase Console → Authentication → Authorized domains.',
        'auth/invalid-action-code': 'This sign-in link is invalid or expired. Please try again.',
    }
    return map[code] || 'Something went wrong. Please try again.'
}

const passwordStrength = (pw) => {
    if (!pw) return null
    if (pw.length < 6) return { level: 'weak', label: 'Too short', color: 'bg-red-500', width: '25%' }
    if (pw.length < 8 || !/[A-Z]/.test(pw) || !/\d/.test(pw))
        return { level: 'fair', label: 'Fair', color: 'bg-amber-400', width: '50%' }
    if (!/[^A-Za-z0-9]/.test(pw))
        return { level: 'good', label: 'Good', color: 'bg-blue-400', width: '75%' }
    return { level: 'strong', label: 'Strong', color: 'bg-emerald-500', width: '100%' }
}

/**
 * After any successful Firebase auth, sync with backend and store the backend JWT.
 * Returns the backend access_token or null on failure.
 */
const syncWithBackend = async (firebaseUser, updateUser) => {
    try {
        const idToken = await firebaseUser.getIdToken(true)
        const res = await fetch(`${API_BASE}/auth/firebase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Firebase-Token': idToken,
            },
            body: JSON.stringify({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: firebaseUser.displayName || '',
            }),
        })
        if (!res.ok) throw new Error('Backend sync failed')
        const data = await res.json()
        // Store both Firebase idToken AND backend JWT
        updateUser({
            uid: data.user_id || firebaseUser.uid,
            email: data.email || firebaseUser.email,
            name: data.name || firebaseUser.displayName,
            accessToken: data.access_token,   // ← backend JWT used for all API calls
            photoURL: firebaseUser.photoURL || '',
            is_admin: !!(data?.user?.is_admin ?? data?.is_admin),
        })
        return data.access_token
    } catch (err) {
        console.warn('Backend sync failed (non-fatal):', err)
        return null
    }
}

// ─── Shared Primitives ────────────────────────────────────────────────────────

const GoogleIcon = () => (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
)

const FormField = ({ label, icon: Icon, type = 'text', placeholder, value, onChange, error, rightElement, autoComplete }) => (
    <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant/70 pl-1">
            {label}
        </label>
        <div className={`relative flex items-center rounded-xl border transition-all duration-200 bg-surface-container
            ${error
                ? 'border-red-500/50 ring-1 ring-red-500/20'
                : 'border-outline-variant/40 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20'
            }`}>
            {Icon && (
                <div className="pl-4 pointer-events-none">
                    <Icon size={16} className={error ? 'text-red-400' : 'text-neutral'} />
                </div>
            )}
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                autoComplete={autoComplete}
                className="flex-1 bg-transparent px-3 py-3.5 text-sm text-on-surface placeholder:text-neutral/40 focus:outline-none"
            />
            {rightElement && <div className="pr-3">{rightElement}</div>}
        </div>
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-1.5 text-xs text-red-400 pl-1"
                >
                    <AlertCircle size={12} /> {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
)

const PrimaryButton = ({ children, loading, disabled, type = 'submit', onClick, className = '' }) => (
    <button
        type={type}
        disabled={loading || disabled}
        onClick={onClick}
        className={`w-full relative flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm
            bg-gradient-to-r from-primary to-secondary text-white
            shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:brightness-105
            active:scale-[0.99] transition-all duration-200
            disabled:opacity-60 disabled:pointer-events-none ${className}`}
    >
        {loading ? <Loader2 size={18} className="animate-spin" /> : children}
    </button>
)

const GoogleButton = ({ onClick, loading, label = 'Continue with Google' }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl border border-outline-variant/50
            bg-surface-container hover:bg-surface-container-high font-semibold text-sm text-on-surface
            transition-all duration-200 active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none"
    >
        {loading ? <Loader2 size={18} className="animate-spin text-primary" /> : <GoogleIcon />}
        {label}
    </button>
)

const Divider = ({ text = 'or' }) => (
    <div className="relative flex items-center">
        <div className="flex-1 border-t border-outline-variant/30" />
        <span className="mx-4 text-[11px] font-bold uppercase tracking-widest text-neutral/60">{text}</span>
        <div className="flex-1 border-t border-outline-variant/30" />
    </div>
)

const GlobalError = ({ message }) => (
    <AnimatePresence>
        {message && (
            <motion.div
                key="global-err"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-start gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
            >
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{message}</span>
            </motion.div>
        )}
    </AnimatePresence>
)

// ─── Brand Panel ─────────────────────────────────────────────────────────────

const BrandPanel = ({ quote, author }) => (
    <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] flex-col justify-between p-12 xl:p-16 relative overflow-hidden
        bg-gradient-to-br from-surface-container via-surface-container-low to-surface-base
        border-r border-outline-variant/20">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-secondary/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-primary/30">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
                <p className="font-manrope font-extrabold tracking-tighter text-lg text-on-surface leading-none">AI Twin</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral/70 mt-0.5">Executive Assistant</p>
            </div>
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center flex-1 py-16">
            <div className="relative">
                <div className="w-40 h-40 rounded-full border border-primary/20 flex items-center justify-center animate-[spin_20s_linear_infinite]">
                    <div className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_#6760fd]" />
                </div>
                <div className="absolute inset-4 rounded-full border border-primary/10 flex items-center justify-center animate-[spin_15s_linear_infinite_reverse]">
                    <div className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-secondary/70" />
                </div>
                <div className="absolute inset-10 rounded-full flex items-center justify-center overflow-hidden shadow-[0_0_50px_rgba(103,96,253,0.4)]">
                    <img src="/logo.png" alt="AI Twin" className="w-full h-full object-cover scale-150" />
                </div>
            </div>
            <div className="mt-12 text-center max-w-xs space-y-2">
                <p className="text-lg font-manrope font-bold text-on-surface leading-snug">
                    Your digital executive<br />working while you sleep.
                </p>
                <p className="text-sm text-on-surface-variant/70">
                    AI Twin handles emails, meetings, and tasks autonomously — with your approval.
                </p>
            </div>
        </div>

        {quote && (
            <div className="relative z-10 bg-[#F7F5F2] rounded-xl p-5 border border-[#E8E4DE] shadow-sm">
                <p className="text-sm font-dm text-[#7A7065] italic leading-relaxed">"{quote}"</p>
                {author && <p className="font-mono-ji text-[10px] text-[#A09488] uppercase tracking-widest mt-2">{author}</p>}
            </div>
        )}
    </div>
)

// ─── Auth Shell ───────────────────────────────────────────────────────────────

const AuthShell = ({ children, title, subtitle, branding }) => (
    <div className="min-h-screen flex bg-surface-base">
        <BrandPanel {...(branding || {})} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto">
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-2 mb-10">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                </div>
                <span className="font-manrope font-extrabold tracking-tighter text-on-surface">AI Twin</span>
            </div>

            <div className="w-full max-w-[400px] space-y-7">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-manrope font-extrabold text-on-surface tracking-tight">{title}</h1>
                    {subtitle && <p className="text-sm text-on-surface-variant mt-1.5">{subtitle}</p>}
                </div>
                {children}
                <p className="text-center text-[11px] text-neutral/50 font-medium">
                    © 2026 AI Twin · <a href="#" className="hover:text-primary transition-colors">Privacy</a> · <a href="#" className="hover:text-primary transition-colors">Terms</a>
                </p>
            </div>
        </div>
    </div>
)

// ─── LOGIN ────────────────────────────────────────────────────────────────────

export const Login = ({ onSignup, onForgotPassword }) => {
    const { login, updateUser, setCurrentScreen } = useStore()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)
    const [errors, setErrors] = useState({})
    const [globalError, setGlobalError] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)

    const validate = () => {
        const e = {}
        if (!email) e.email = 'Email is required'
        else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email'
        if (!password) e.password = 'Password is required'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    /** Shared post-auth handler: sync backend, update store, navigate */
    const finishAuth = async (firebaseUser) => {
        let onboardingCompleted = false;
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../firebase');
            const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userSnap.exists()) {
                onboardingCompleted = !!userSnap.data()?.onboardingCompleted;
            }
        } catch (e) {
            console.warn("Failed to check onboarding status on login", e);
        }

        // Optimistic login with Firebase profile
        login({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            photoURL: firebaseUser.photoURL || '',
            accessToken: await firebaseUser.getIdToken(),
            is_admin: false,
        })
        // Navigate immediately — don't block on backend
        setCurrentScreen(onboardingCompleted ? 'main' : 'welcome')
        // Background backend sync — updates accessToken with real JWT
        syncWithBackend(firebaseUser, updateUser)
    }

    const handleEmailLogin = async (ev) => {
        ev.preventDefault()
        setGlobalError('')
        if (!validate()) return
        setLoading(true)
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password)
            await finishAuth(cred.user)
        } catch (err) {
            setGlobalError(firebaseErrorMessage(err.code))
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setGoogleLoading(true)
        setGlobalError('')
        try {
            const result = await signInWithPopup(auth, googleProvider)
            await finishAuth(result.user)
        } catch (err) {
            // Don't show error if user just closed the popup
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                setGlobalError(firebaseErrorMessage(err.code))
            }
        } finally {
            setGoogleLoading(false)
        }
    }

    return (
        <AuthShell
            title="Welcome back"
            subtitle="Sign in to your AI Twin workspace."
            branding={{ quote: "The bottleneck is always time. AI Twin reclaims it.", author: "AI Twin Product Team" }}
        >
            <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} />

            <Divider text="or sign in with email" />

            <form onSubmit={handleEmailLogin} className="space-y-4" noValidate>
                <GlobalError message={globalError} />

                <FormField
                    label="Email address"
                    icon={Mail}
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
                    error={errors.email}
                    autoComplete="email"
                />

                <FormField
                    label="Password"
                    icon={Lock}
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
                    error={errors.password}
                    autoComplete="current-password"
                    rightElement={
                        <button type="button" onClick={() => setShowPw(v => !v)}
                            className="text-neutral hover:text-on-surface transition-colors p-1">
                            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    }
                />

                <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <div
                            onClick={() => setRememberMe(v => !v)}
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer
                                ${rememberMe ? 'bg-primary border-primary' : 'border-outline-variant/50 hover:border-primary/50'}`}
                        >
                            {rememberMe && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span className="text-sm text-on-surface-variant">Remember me</span>
                    </label>
                    <button type="button" onClick={onForgotPassword}
                        className="text-sm text-primary font-semibold hover:underline underline-offset-4 transition-colors">
                        Forgot password?
                    </button>
                </div>

                <div className="pt-1">
                    <PrimaryButton loading={loading}>Sign In</PrimaryButton>
                </div>
            </form>

            <p className="text-center text-sm text-on-surface-variant">
                Don't have an account?{' '}
                <button onClick={onSignup} className="font-semibold text-primary hover:underline underline-offset-4 transition-colors">
                    Create account
                </button>
            </p>
        </AuthShell>
    )
}

// ─── SIGN UP ──────────────────────────────────────────────────────────────────

export const Signup = ({ onBack }) => {
    const { login, updateUser, setCurrentScreen } = useStore()
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPw, setConfirmPw] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [agreed, setAgreed] = useState(false)
    const [errors, setErrors] = useState({})
    const [globalError, setGlobalError] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)

    const strength = passwordStrength(password)

    const validate = () => {
        const e = {}
        if (!name.trim()) e.name = 'Full name is required'
        if (!email) e.email = 'Email is required'
        else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email'
        if (!password) e.password = 'Password is required'
        else if (password.length < 6) e.password = 'Minimum 6 characters'
        if (!confirmPw) e.confirmPw = 'Please confirm your password'
        else if (password !== confirmPw) e.confirmPw = 'Passwords do not match'
        if (!agreed) e.terms = 'You must agree to the terms to continue'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    /** Shared post-auth handler */
    const finishAuth = async (firebaseUser) => {
        login({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || name.trim() || firebaseUser.email?.split('@')[0] || 'User',
            photoURL: firebaseUser.photoURL || '',
            accessToken: await firebaseUser.getIdToken(),
            is_admin: false,
        })
        setCurrentScreen('welcome')
        syncWithBackend(firebaseUser, updateUser)
    }

    const handleSignup = async (ev) => {
        ev.preventDefault()
        setGlobalError('')
        if (!validate()) return
        setLoading(true)
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password)
            // Set display name before backend sync so it propagates correctly
            await updateProfile(cred.user, { displayName: name.trim() })
            await finishAuth(cred.user)
        } catch (err) {
            setGlobalError(firebaseErrorMessage(err.code))
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleSignup = async () => {
        setGoogleLoading(true)
        setGlobalError('')
        try {
            const result = await signInWithPopup(auth, googleProvider)
            await finishAuth(result.user)
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                setGlobalError(firebaseErrorMessage(err.code))
            }
        } finally {
            setGoogleLoading(false)
        }
    }

    return (
        <AuthShell
            title="Create your account"
            subtitle="Start your AI Twin journey today."
            branding={{ quote: "Delegate confidently. Your twin mirrors your judgement.", author: "AI Twin Product Team" }}
        >
            <GoogleButton onClick={handleGoogleSignup} loading={googleLoading} label="Sign up with Google" />

            <Divider text="or sign up with email" />

            <form onSubmit={handleSignup} className="space-y-4" noValidate>
                <GlobalError message={globalError} />

                <FormField
                    label="Full name"
                    icon={User}
                    placeholder="Alex Johnson"
                    value={name}
                    onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
                    error={errors.name}
                    autoComplete="name"
                />

                <FormField
                    label="Work email"
                    icon={Mail}
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
                    error={errors.email}
                    autoComplete="email"
                />

                <div className="space-y-1.5">
                    <FormField
                        label="Password"
                        icon={Lock}
                        type={showPw ? 'text' : 'password'}
                        placeholder="Min. 6 characters"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
                        error={errors.password}
                        autoComplete="new-password"
                        rightElement={
                            <button type="button" onClick={() => setShowPw(v => !v)}
                                className="text-neutral hover:text-on-surface transition-colors p-1">
                                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        }
                    />
                    {/* Password strength bar */}
                    {password && strength && (
                        <div className="space-y-1 pl-1">
                            <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: strength.width }}
                                    className={`h-full ${strength.color} rounded-full transition-all duration-500`}
                                />
                            </div>
                            <p className={`text-[11px] font-semibold ${strength.level === 'strong' ? 'text-emerald-400' :
                                    strength.level === 'good' ? 'text-blue-400' :
                                        strength.level === 'fair' ? 'text-amber-400' : 'text-red-400'
                                }`}>{strength.label}</p>
                        </div>
                    )}
                </div>

                <FormField
                    label="Confirm password"
                    icon={Lock}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    value={confirmPw}
                    onChange={e => { setConfirmPw(e.target.value); setErrors(p => ({ ...p, confirmPw: '' })) }}
                    error={errors.confirmPw}
                    autoComplete="new-password"
                    rightElement={
                        <button type="button" onClick={() => setShowConfirm(v => !v)}
                            className="text-neutral hover:text-on-surface transition-colors p-1">
                            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    }
                />

                {/* Terms */}
                <div className="space-y-1">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <div
                            onClick={() => { setAgreed(v => !v); setErrors(p => ({ ...p, terms: '' })) }}
                            className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer
                                ${agreed ? 'bg-primary border-primary' : errors.terms ? 'border-red-500/60' : 'border-outline-variant/50 hover:border-primary/50'}`}
                        >
                            {agreed && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span className="text-sm text-on-surface-variant leading-relaxed">
                            I agree to the{' '}
                            <a href="#" className="text-primary font-semibold hover:underline">Terms of Service</a>
                            {' '}and{' '}
                            <a href="#" className="text-primary font-semibold hover:underline">Privacy Policy</a>
                        </span>
                    </label>
                    <AnimatePresence>
                        {errors.terms && (
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex items-center gap-1.5 text-xs text-red-400 pl-1">
                                <AlertCircle size={12} /> {errors.terms}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>

                <div className="pt-1">
                    <PrimaryButton loading={loading}>Create Account</PrimaryButton>
                </div>
            </form>

            <p className="text-center text-sm text-on-surface-variant">
                Already have an account?{' '}
                <button onClick={onBack} className="font-semibold text-primary hover:underline underline-offset-4 transition-colors">
                    Sign in
                </button>
            </p>
        </AuthShell>
    )
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

export const ForgotPassword = ({ onBack }) => {
    const [email, setEmail] = useState('')
    const [emailError, setEmailError] = useState('')
    const [globalError, setGlobalError] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSubmit = async (ev) => {
        ev.preventDefault()
        setGlobalError('')
        setEmailError('')
        if (!email) { setEmailError('Email is required'); return }
        if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Enter a valid email'); return }

        setLoading(true)
        try {
            await sendPasswordResetEmail(auth, email)
            setSent(true)
        } catch (err) {
            // Firebase returns user-not-found but for security we still show success
            if (err.code === 'auth/user-not-found') {
                setSent(true) // Don't reveal whether email exists
            } else {
                setGlobalError(firebaseErrorMessage(err.code))
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthShell
            title={sent ? 'Check your inbox' : 'Reset your password'}
            subtitle={sent ? `We sent a reset link to ${email}` : "Enter your email and we'll send you a reset link."}
            branding={{}}
        >
            {sent ? (
                <div className="space-y-6">
                    <div className="flex flex-col items-center py-8 space-y-4">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 200 }}
                            className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"
                        >
                            <CheckCircle2 size={40} className="text-emerald-400" />
                        </motion.div>
                        <div className="text-center space-y-1">
                            <p className="text-sm text-on-surface font-semibold">Password reset email sent</p>
                            <p className="text-sm text-on-surface-variant">
                                Didn't receive it? Check your spam folder or{' '}
                                <button onClick={() => setSent(false)} className="text-primary font-semibold hover:underline">
                                    try again
                                </button>.
                            </p>
                        </div>
                    </div>
                    <PrimaryButton type="button" onClick={onBack}>Back to Sign In</PrimaryButton>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    <GlobalError message={globalError} />

                    <FormField
                        label="Email address"
                        icon={Mail}
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setEmailError('') }}
                        error={emailError}
                        autoComplete="email"
                    />

                    <PrimaryButton loading={loading}>Send Reset Link</PrimaryButton>

                    <button
                        type="button"
                        onClick={onBack}
                        className="w-full flex items-center justify-center gap-2 py-3 text-sm text-on-surface-variant hover:text-on-surface transition-colors font-medium"
                    >
                        <ArrowLeft size={16} /> Back to Sign In
                    </button>
                </form>
            )}
        </AuthShell>
    )
}
