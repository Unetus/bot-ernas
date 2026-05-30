/**
 * apiClient.js — Gateway HTTP centralizado entre o Bot e a API Arkandia.
 * 
 * Responsabilidades:
 * - Injeção automática de X-API-Key e User-Agent
 * - Geração automática de Idempotency-Key para POSTs
 * - Retry automático em caso de Rate Limit (HTTP 429)
 * 
 * O cache de catálogos é gerenciado pelo módulo catalogCache.js.
 */

const axios = require('axios');
const { randomUUID } = require('crypto');
require('dotenv').config();

const API_KEY = process.env.ARKANDIA_API_KEY;
const BASE_URL = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 10000, // 10s timeout (recomendação da API)
    headers: {
        'X-API-Key': API_KEY,
        'User-Agent': 'rpg-bot/2.0'
    }
});

// Interceptor de Request: Idempotency-Key automática para POSTs
apiClient.interceptors.request.use((config) => {
    if (config.method === 'post' || config.method === 'put' || config.method === 'patch') {
        if (!config.headers['Idempotency-Key']) {
            config.headers['Idempotency-Key'] = randomUUID();
        }
    }
    return config;
}, (error) => Promise.reject(error));

// Interceptor de Response: Rate Limit 429 → retry com backoff
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // 429 Too Many Requests → retry com Retry-After
        if (error.response && error.response.status === 429 && !originalRequest._retry) {
            originalRequest._retry = true;
            const retryAfterStr = error.response.headers['retry-after'];
            let retryAfterMs = retryAfterStr ? parseInt(retryAfterStr) * 1000 : 10000;
            if (retryAfterMs > 15000) retryAfterMs = 15000;

            console.warn(`[apiClient] Rate limit em ${originalRequest.url}. Retry em ${retryAfterMs}ms...`);
            await sleep(retryAfterMs);

            return apiClient(originalRequest);
        }

        return Promise.reject(error);
    }
);

module.exports = apiClient;
