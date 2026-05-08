import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
    persist(
        (set) => ({
            // Auth State
            auth: {
                isLoggedIn: false,
                user: null, // Holds basic user profile
            },
            isAdmin: false,
            setIsAdmin: (val) => set({ isAdmin: !!val }),
            login: (user, preferences = null) => set((state) => ({ 
                auth: { isLoggedIn: true, user },
                isAdmin: !!(user?.is_admin ?? user?.isAdmin ?? false),
                preferences: preferences || state.preferences
            })),
            updateUser: (updates) => set((state) => ({ 
                auth: { ...state.auth, user: { ...state.auth.user, ...updates } },
                isAdmin: updates?.is_admin !== undefined ? !!updates.is_admin : state.isAdmin,
            })),
            logout: () => set({ 
                auth: { isLoggedIn: false, user: null }, 
                isAdmin: false,
                currentScreen: 'login', 
                view: 'home',
                preferences: {
                    autonomousMode: false,
                    gmailSync: false,
                    calendarSync: false,
                    telegramSync: false,
                    slackSync: false,
                },
                tasks: []
            }),

            // Navigation State
            currentScreen: 'login', // Tracks onboarding / main app
            setCurrentScreen: (screen) => set({ currentScreen: screen }),
            
            view: 'home', // Tracks dashboard tabs (home, chat, workspace, activity, settings)
            setView: (view) => set({ view }),

            // Theme State ('light', 'dark', 'system')
            theme: 'system',
            setTheme: (theme) => set({ theme }),

            // Preferences
            preferences: {
                autonomousMode: false,
                gmailSync: false,
                calendarSync: false,
                telegramSync: false,
                slackSync: false,
            },
            setPreferences: (newPrefs) => set({ preferences: newPrefs }),
            setPreference: (key, value) => set((state) => ({
                preferences: { ...state.preferences, [key]: value }
            })),
            togglePreference: (key) => set((state) => ({
                preferences: {
                    ...state.preferences,
                    [key]: !state.preferences[key]
                }
            })),

            // Tasks
            tasks: [],
            addTask: (task) => set((state) => ({ tasks: [{id: Date.now().toString(), createdAt: new Date().toISOString(), ...task}, ...state.tasks] })),
            removeTask: (id) => set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) })),

            // Detailed Navigation / Spotlight
            highlightedActivityId: null,
            setHighlightedActivityId: (id) => set({ highlightedActivityId: id }),
            activityFilter: 'All Activity',
            setActivityFilter: (filter) => set({ activityFilter: filter }),
        }),
        {
            name: 'ai-twin-storage', // key in localStorage
            partialize: (state) => ({ 
                auth: state.auth, 
                isAdmin: state.isAdmin,
                theme: state.theme, 
                preferences: state.preferences,
                currentScreen: state.currentScreen,
                tasks: state.tasks,
            }),
        }
    )
)
