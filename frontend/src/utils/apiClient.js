import { auth as firebaseAuth } from "../firebase";
import { useStore } from "../store/useStore";
import { API_BASE } from "../config";

let isRefreshing = false;
let failedQueue = [];
let refreshCooldownUntil = 0;

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve(token));
    failedQueue = [];
};

// Retry a fetch up to maxAttempts times on transient connection errors (ECONNREFUSED etc.)
const fetchWithRetry = async (url, options, maxAttempts = 3) => {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fetch(url, options);
        } catch (err) {
            const isConnectionErr = (
                err instanceof TypeError &&
                (err.message.includes('Failed to fetch') ||
                 err.message.includes('NetworkError') ||
                 err.message.includes('Load failed'))
            );
            if (!isConnectionErr || attempt === maxAttempts - 1) throw err;
            lastErr = err;
            // Exponential backoff: 500ms, 1000ms, 2000ms
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
    }
    throw lastErr;
};

const GOOGLE_INTEGRATION_ENDPOINTS = [
    '/gmail/',
    '/calendar/',
    '/auth/gmail/status',
    '/integrations/google/',
    '/oauth/google/',
];

const shouldSkipTokenRefresh = (endpoint, errData = {}) => {
    if (GOOGLE_INTEGRATION_ENDPOINTS.some(prefix => endpoint.startsWith(prefix))) {
        return true;
    }
    const detail = errData?.detail;
    const detailCode = typeof detail === 'object' ? detail?.code : null;
    return ["GOOGLE_AUTH", "GOOGLE_PERMISSION_DENIED", "BAD_DATETIME"].includes(detailCode);
};

/**
 * Robust fetch wrapper with automatic 401 retry and request queuing.
 */
export const apiFetch = async (endpoint, options = {}) => {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const headers = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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
        const response = await fetchWithRetry(fullUrl, { ...options, headers });

        // Handle 401 Unauthorized
        if (response.status === 401) {
            const errData = await response.clone().json().catch(() => ({}));
            if (shouldSkipTokenRefresh(endpoint, errData)) {
                throw new Error(errData?.detail?.message || errData?.detail || "Google integration required");
            }

            console.warn(`Auth required for: ${endpoint}`);

            if (Date.now() < refreshCooldownUntil) {
                throw new Error("Session refresh temporarily throttled. Please retry in a few seconds.");
            }
            
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
                    
                    const authRes = await fetchWithRetry(`${API_BASE}/auth/firebase`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Firebase-Token': fbToken,
                        },
                        body: JSON.stringify({
                            uid: user.uid,
                            email: user.email,
                            name: user.displayName
                        })
                    });

                    if (!authRes.ok) {
                        if (authRes.status === 429) {
                            refreshCooldownUntil = Date.now() + 20000;
                        }
                        throw new Error("Session refresh unsuccessful.");
                    }
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
                    if (!String(refreshErr?.message || "").includes("throttled")) {
                        useStore.getState().logout();
                    }
                    return Promise.reject(refreshErr);
                } finally {
                    isRefreshing = false;
                }
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail?.message || errData.detail || "API Request Failed");
        }

        // Defensive JSON parsing logic here as required
        const text = await response.text();
        if (text.includes('<!DOCTYPE html>') || text.trim().startsWith('<')) {
            throw new Error(`Endpoint returned HTML: ${text.substring(0, 50)}...`);
        }
        
        return text ? JSON.parse(text) : {};
    } catch (error) {
        return Promise.reject(error);
    }
};
