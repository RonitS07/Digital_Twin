import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, ShieldCheck, Zap, UserPlus, Check, Eye } from 'lucide-react'

const AuthLayout = ({ children, title, subtitle, isLogin = true, onSwitch }) => (
    <div className="min-h-screen flex items-stretch bg-surface-base selection:bg-primary/30">
        {/* Left Side: Branding */}
        <section className="hidden lg:flex w-1/2 flex-col justify-between p-16 relative overflow-hidden bg-surface-container-lowest border-r border-neutral/5">
            <div className="absolute inset-0 bg-neutral/5 pointer-events-none"></div>
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary-container/10 blur-[120px] rounded-full"></div>

            <div className="relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
                        <Sparkles size={24} className="text-white" fill="currentColor" />
                    </div>
                    <h1 className="text-2xl font-manrope font-extrabold tracking-tighter text-white uppercase">AI Twin</h1>
                </div>
            </div>

            <div className="relative z-10 max-w-lg">
                <h2 className="text-6xl font-manrope font-bold text-white leading-tight mb-6 tracking-tight">
                    {isLogin ? "Welcome back." : "Start your journey."}
                </h2>
                <p className="text-xl text-on-surface-variant font-inter leading-relaxed mb-12">
                    Your digital twin is ready to brief, automate, and assist. Experience the future of executive productivity.
                </p>

                <div className="space-y-8">
                    {[
                        { icon: ShieldCheck, title: "Enterprise-grade security", desc: "Military-grade encryption for your data." },
                        { icon: Zap, title: "Smart automation", desc: "Delegate complex tasks to your digital double." },
                        { icon: UserPlus, title: "Full user control", desc: "You remain the architect of your twin's logic." }
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-4 group">
                            <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center border border-neutral/10 group-hover:border-primary/50 transition-colors">
                                <item.icon size={20} className="text-primary" />
                            </div>
                            <div>
                                <p className="font-manrope font-semibold text-white">{item.title}</p>
                                <p className="text-sm text-on-surface-variant">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative z-10">
                <div className="p-1 rounded-full w-fit bg-gradient-to-r from-primary/20 to-tertiary/20">
                    <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#6760fd]"></div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-neutral">Twin Status: Active</span>
                    </div>
                </div>
            </div>
        </section>

        {/* Right Side: Form */}
        <section className="flex-1 flex flex-col justify-center items-center p-8 bg-surface-container-low">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center lg:text-left">
                    <h3 className="text-3xl font-manrope font-bold text-white mb-2">{title}</h3>
                    <p className="text-on-surface-variant font-inter">{subtitle}</p>
                </div>

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <button className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-container-high border border-neutral/10 hover:border-neutral/30 transition-all font-medium text-sm">
                            <span>Google</span>
                        </button>
                        <button className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-container-high border border-neutral/10 hover:border-neutral/30 transition-all font-medium text-sm">
                            <span>Microsoft</span>
                        </button>
                    </div>

                    <div className="relative flex items-center">
                        <div className="flex-grow border-t border-neutral/10"></div>
                        <span className="mx-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral">or email</span>
                        <div className="flex-grow border-t border-neutral/10"></div>
                    </div>

                    {children}
                </div>

                <div className="pt-8 text-center">
                    <p className="text-on-surface-variant text-sm">
                        {isLogin ? "New here?" : "Already have an account?"}{' '}
                        <button
                            onClick={onSwitch}
                            className="text-primary font-semibold underline underline-offset-4 hover:text-white transition-all"
                        >
                            {isLogin ? "Create account" : "Sign in"}
                        </button>
                    </p>
                </div>
            </div>

            <footer className="mt-auto pt-16 w-full flex justify-between items-center text-[10px] uppercase tracking-widest font-bold text-neutral opacity-60 px-8 pb-8">
                <div className="hidden lg:block">© 2024 AI Twin Enterprise.</div>
                <div className="flex gap-6">
                    <a href="#">Privacy</a>
                    <a href="#">Terms</a>
                </div>
            </footer>
        </section>
    </div>
)

const InputField = ({ label, type = "text", placeholder, extra }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center px-1">
            <label className="text-[10px] uppercase tracking-widest font-bold text-neutral ml-1">{label}</label>
            {extra}
        </div>
        <div className="relative">
            <input
                type={type}
                className="w-full bg-surface-container border-none rounded-xl px-4 py-3.5 text-on-surface placeholder:text-neutral/40 focus:ring-1 focus:ring-primary/40 transition-all outline-none"
                placeholder={placeholder}
            />
            {type === "password" && (
                <button className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral hover:text-white transition-colors">
                    <Eye size={18} />
                </button>
            )}
        </div>
    </div>
)

export const Login = ({ onLogin, onSignup, onForgotPassword }) => (
    <AuthLayout
        title="Sign in to your account"
        subtitle="Access your executive suite and twin settings."
        onSwitch={onSignup}
    >
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
            <InputField label="Work Email" placeholder="name@company.com" />
            <InputField
                label="Password"
                type="password"
                placeholder="••••••••"
                extra={<button type="button" onClick={onForgotPassword} className="text-[10px] uppercase tracking-widest font-bold text-primary">Forgot?</button>}
            />
            <div className="flex items-center px-1">
                <input type="checkbox" className="rounded bg-surface-container border-neutral/20 text-primary focus:ring-0 mr-3" />
                <span className="text-sm text-on-surface-variant">Remember me for 30 days</span>
            </div>
            <button
                type="submit"
                className="w-full py-4 bg-primary text-surface-base font-manrope font-bold rounded-xl shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
                Sign In
            </button>
        </form>
    </AuthLayout>
)

export const Signup = ({ onBack, onComplete }) => (
    <AuthLayout
        isLogin={false}
        title="Create your account"
        subtitle="Begin your executive digital transformation."
        onSwitch={onBack}
    >
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onComplete(); }}>
            <div className="grid grid-cols-2 gap-4">
                <InputField label="First Name" placeholder="Alex" />
                <InputField label="Last Name" placeholder="Smith" />
            </div>
            <InputField label="Work Email" placeholder="name@company.com" />
            <InputField label="New Password" type="password" placeholder="••••••••" />
            <button
                type="submit"
                className="w-full py-4 bg-primary text-surface-base font-manrope font-bold rounded-xl shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
                Create Account
            </button>
        </form>
    </AuthLayout>
)
export const ForgotPassword = ({ onBack }) => (
    <AuthLayout
        title="Reset your password"
        subtitle="Enter your email and we'll send you instructions."
        onSwitch={onBack}
    >
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); }}>
            <InputField label="Work Email" placeholder="name@company.com" />
            <button
                type="submit"
                className="w-full py-4 bg-primary text-surface-base font-manrope font-bold rounded-xl shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
                Send Instructions
            </button>
        </form>
    </AuthLayout>
)
