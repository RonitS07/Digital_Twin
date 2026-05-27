import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
    persist(
        (set) => ({
            // Auth State
            auth: {
                isLoggedIn: false,
                user: null,
            },
            authInitialized: false,
            setAuthInitialized: (val) => set({ authInitialized: !!val }),
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
                    whatsappSync: false,
                    notifications: false,
                    memoryRetention: true,
                    emailSummary: false,
                    actionAlerts: true,
                },
                integrations: {
                    gmail: false,
                    calendar: false,
                    slack: false,
                    telegram: false,
                    whatsapp: false,
                    lastFetched: null,
                },
                tasks: [],
                whatsappReady: null,
                // Clear session-specific state on logout
                unreadTwinChats: [],
                twinChatActiveSessionId: null,
            }),

            // Navigation State
            currentScreen: 'login',
            setCurrentScreen: (screen) => set({ currentScreen: screen }),

            view: 'home',
            setView: (view) => set({ view }),

            // Theme State ('light', 'dark', 'system')
            theme: 'system',
            setTheme: (theme) => set({ theme }),

            // Preferences — ALL persisted, source of truth for Settings page
            preferences: {
                autonomousMode: false,
                gmailSync: false,
                calendarSync: false,
                telegramSync: false,
                slackSync: false,
                whatsappSync: false,
                notifications: false,
                memoryRetention: true,
                emailSummary: false,
                actionAlerts: true,
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

            // Integration status cache — persisted with TTL
            integrations: {
                gmail: false,
                calendar: false,
                slack: false,
                telegram: false,
                whatsapp: false,
                lastFetched: null,
            },
            setIntegration: (key, value) => set((state) => ({
                integrations: {
                    ...state.integrations,
                    [key]: value,
                    lastFetched: Date.now(),
                }
            })),
            setAllIntegrations: (data) => set((state) => ({
                integrations: {
                    ...state.integrations,
                    ...data,
                    // Preserve lastFetched unless explicitly overridden (e.g. null to invalidate)
                    lastFetched: 'lastFetched' in data ? data.lastFetched : Date.now(),
                }
            })),
            invalidateIntegrationCache: () => set((state) => ({
                integrations: { ...state.integrations, lastFetched: null }
            })),

            // Tasks — capped at 200 to prevent localStorage bloat
            tasks: [],
            addTask: (task) => set((state) => ({
                tasks: [{ id: Date.now().toString(), createdAt: new Date().toISOString(), ...task }, ...state.tasks].slice(0, 200)
            })),
            removeTask: (id) => set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) })),

            // Detailed Navigation / Spotlight
            highlightedActivityId: null,
            setHighlightedActivityId: (id) => set({ highlightedActivityId: id }),
            activityFilter: 'All Activity',
            setActivityFilter: (filter) => set({ activityFilter: filter }),

            // Twin Chat Navigation
            twinChatActiveSessionId: null,
            setTwinChatActiveSessionId: (id) => set({ twinChatActiveSessionId: id }),
            unreadTwinChats: [],
            addUnreadTwinChat: (msg) => set(state => {
                if (state.unreadTwinChats.some(m => m.id === msg.id)) return state;
                // Cap at 50 to prevent unbounded localStorage growth
                const next = [...state.unreadTwinChats, msg];
                return { unreadTwinChats: next.length > 50 ? next.slice(-50) : next };
            }),
            removeUnreadTwinChat: (sessionId) => set(state => ({
                unreadTwinChats: state.unreadTwinChats.filter(m => m.session_id !== sessionId)
            })),

            // WhatsApp live status (driven by WebSocket push from backend)
            whatsappReady: null,
            setWhatsappReady: (ready) => set({ whatsappReady: !!ready }),
        }),
        {
            name: 'ai-twin-storage',
            partialize: (state) => ({
                auth: state.auth,
                isAdmin: state.isAdmin,
                theme: state.theme,
                preferences: state.preferences,
                integrations: state.integrations,
                tasks: state.tasks,
                // Persist unread notifications (capped above at 50)
                unreadTwinChats: state.unreadTwinChats,
                twinChatActiveSessionId: state.twinChatActiveSessionId,
                // NOTE: whatsappReady is intentionally NOT persisted — it's a live WebSocket
                // status value. On page reload the WS will update it within seconds anyway.
                // Persisting it causes a stale "Connected" badge when the bridge is actually offline.
            }),
        }
    )
)
