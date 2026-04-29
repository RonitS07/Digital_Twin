import { auth as firebaseAuth } from "../firebase";
import { useStore } from "../store/useStore";
import { API_BASE } from "../config";

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve(token));
    failedQueue = [];
};

/**
 * Robust fetch wrapper with automatic 401 retry and request queuing.
 */
export const apiFetch = async (endpoint, options = {}) => {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // 1. Proactive check for token when user is logged in
    const authState = useStore.getState().auth;
    const user = authState?.user;
    
    // If we have a user but no token (e.g. state partially cleared/refresh in progress), 
    // we should wait or refresh instead of 401.
    let currentToken = user?.accessToken;

    if (!currentToken && user?.uid && !isRefreshing) {
        console.info("Auth token missing but user exists. Forcing a sync...");
        // This will be handled by the 401 logic below if we proceed, 
        // but let's try to attach whatever we have.
    }

    if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }

    try {
        const response = await fetch(fullUrl, { ...options, headers });

        // Handle 401 Unauthorized
        if (response.status === 401) {
            console.warn(`Auth required for: ${endpoint}`);
            
            // Standardizing: Almost all 401s in our system should trigger a refresh attempt
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(newToken => {
                    return apiFetch(endpoint, {
                        ...options,
                        headers: { ...options.headers, 'Authorization': `Bearer ${newToken}` }
                    });
                });
            }

            isRefreshing = true;
            
            try {
                const user = firebaseAuth.currentUser;
                    if (!user) throw new Error("No active firebase user session.");

                    const fbToken = await user.getIdToken(true);
                    
                    const authRes = await fetch(`${API_BASE}/auth/firebase`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            uid: user.uid,
                            email: user.email,
                            name: user.displayName
                        })
                    });

                    if (!authRes.ok) throw new Error("Session refresh unsuccessful.");
                    const authData = await authRes.json();
                    
                    useStore.getState().updateUser({
                        ...authData,
                        uid: authData.user_id || authData.uid,
                        accessToken: authData.access_token
                    });

                    processQueue(null, authData.access_token);
                    // Retry with the fresh token explicitly injected to avoid another 401 loop
                    return apiFetch(endpoint, {
                        ...options,
                        headers: { ...options.headers, 'Authorization': `Bearer ${authData.access_token}` }
                    });

                } catch (refreshErr) {
                    processQueue(refreshErr, null);
                    useStore.getState().logout();
                    return Promise.reject(refreshErr);
                } finally {
                    isRefreshing = false;
                }
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail?.message || errData.detail || "API Request Failed");
        }

        return await response.json();
    } catch (error) {
        return Promise.reject(error);
    }
};
