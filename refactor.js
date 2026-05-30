const fs = require('fs');

const indexPath = 'index.js';
let content = fs.readFileSync(indexPath, 'utf8');

// 1. Replace the axios import
content = content.replace(/const axios = require\('axios'\);/, "const apiClient = require('./apiClient');");

// 2. Replace all instances of: 
// const res = await axios.get(`${ARKANDIA_API}/path`, { headers: { 'X-API-Key': API_KEY } });
// to:
// const res = await apiClient.get(`/path`);
// We need a smart regex. Notice that some use axios.get(url, { headers }) and some use axios.get(getUrlRequisicao(interaction), { headers }).
// Let's replace the common ARKANDIA_API GET ones:
// Pattern: await axios.get(`${ARKANDIA_API}(.*?)`, \{[\s]*headers:\s*\{[\s]*'X-API-Key':\s*API_KEY[\s]*\}[\s]*\}[\s]*\)
content = content.replace(/await axios\.get\(`\$\{ARKANDIA_API\}([^`]+)`,\s*\{\s*headers:\s*\{\s*'X-API-Key':\s*API_KEY\s*\}\s*\}\)/g, 'await apiClient.get(`$1`)');

// Replace the ones using getUrlRequisicao(interaction)
// Pattern: await axios.get(getUrlRequisicao(interaction), { headers: { 'X-API-Key': API_KEY } })
content = content.replace(/await axios\.get\(getUrlRequisicao\(interaction\),\s*\{\s*headers:\s*\{\s*'X-API-Key':\s*API_KEY\s*\}\s*\}\)/g, 'await apiClient.get(getUrlRequisicao(interaction).replace(ARKANDIA_API, ""))');

// Replace POST requests (like libras creditar and inventario adicionar)
// These usually have Idempotency-Key and User-Agent.
// We can just find axios.post(`${ARKANDIA_API}...`) and replace it with apiClient.post(`...`)
// We can drop the 3rd argument entirely if it's just headers.
// Pattern for libras:
/*
                const resPost = await axios.post(
                    `${ARKANDIA_API}/personagens/${p.id}/libras/creditar`,
                    { valor: valor, descricao: motivo },
                    {
                        headers: {
                            'X-API-Key': API_KEY,
                            'Content-Type': 'application/json',
                            'Idempotency-Key': idempotencyKey,
                            'User-Agent': 'rpg-bot/1.0'
                        }
                    }
                );
*/
content = content.replace(/await axios\.post\(\s*`\$\{ARKANDIA_API\}([^`]+)`,\s*(\{[\s\S]*?\}),\s*\{\s*headers:\s*\{[\s\S]*?\}\s*\}\s*\)/g, 'await apiClient.post(`$1`, $2)');

// The Gemini API call (starts with https://generativelanguage) uses axios.post, it shouldn't be affected because it doesn't use ${ARKANDIA_API}.

// Write back
fs.writeFileSync(indexPath, content, 'utf8');
console.log('Refactoring complete!');
