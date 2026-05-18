import dotenv from 'dotenv'

dotenv.config({ path: 'tests/e2e/.env.test' })

export const TEST_CONFIG = {
    baseUrl: process.env.TEST_BASE_URL!,
    apiBase: process.env.TEST_API_BASE!,
    email: process.env.TEST_EMAIL!,
    password: process.env.TEST_PASSWORD!,

    // Timeouts
    shortTimeout: 5000,
    mediumTimeout: 15000,
    longTimeout: 90000,
    aiTimeout: 120000,
}
