const fs = require('fs');
const path = require('path');

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`--- Iniciando verificação de carga dos comandos ---`);
let failed = 0;

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            console.log(`✓ [${file}] Carregado com sucesso. Nome do comando: /${command.data.name}`);
        } else {
            console.warn(`⚠ [${file}] Carregado, mas faltam propriedades obrigatórias "data" ou "execute".`);
        }
    } catch (error) {
        console.error(`✗ [${file}] Falha ao carregar!`);
        console.error(error);
        failed++;
    }
}

console.log(`\n--- Iniciando verificação de carga dos módulos principais ---`);
const coreFiles = [
    './apiClient.js',
    './catalogCache.js',
    './cooldown.js',
    './renderQueue.js',
    './canvas/renderer.js',
    './utils/helpers.js',
    './utils/profileCache.js',
    './utils/state.js'
];

for (const coreFile of coreFiles) {
    try {
        require(coreFile);
        console.log(`✓ [${coreFile}] Carregado com sucesso.`);
    } catch (error) {
        console.error(`✗ [${coreFile}] Falha ao carregar!`);
        console.error(error);
        failed++;
    }
}

console.log(`\n--- Verificação concluída ---`);
console.log(`Total de arquivos verificados: ${commandFiles.length + coreFiles.length}`);
console.log(`Sucessos: ${(commandFiles.length + coreFiles.length) - failed}`);
console.log(`Falhas: ${failed}`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

