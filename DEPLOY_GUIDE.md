# Guia de Deploy e Atualizacao do Bot de RPG

Este projeto usa GitHub Actions para publicar o bot automaticamente em producao sempre que houver `git push` na branch `main` do repositorio `https://github.com/Unetus/bot-ernas.git`.

## Producao Atual

- Provedor/host: servidor Linux acessado via SSH.
- Host configurado no workflow: `212.38.89.129`
- Usuario SSH configurado no workflow: `dev`
- Diretorio remoto do bot: `/home/dev/bot-ernas`
- Processo PM2: `rpg-bot`
- Workflow: `.github/workflows/deploy.yml`

> Observacao: havia documentacao antiga apontando para `137.131.222.150` com usuario `ubuntu`. O workflow ativo usa `212.38.89.129` com usuario `dev`; por isso este guia foi atualizado para refletir o deploy real.

## Como o Deploy Funciona

Ao enviar commits para `main`, o GitHub Actions:

1. Faz checkout do codigo.
2. Copia os arquivos necessarios para `/home/dev/bot-ernas`.
3. Instala dependencias de producao com `npm install --omit=dev`.
4. Reinicia o processo `rpg-bot` no PM2.
5. Se o processo ainda nao existir, inicia `index.js` com o nome `rpg-bot`.
6. Salva a configuracao do PM2 com `pm2 save`.

O deploy inclui as pastas e arquivos usados em runtime, incluindo `assets/**`, `canvas/**`, `commands/**`, `mapas-arena/**` e `utils/**`.

## Secrets Necessarios no GitHub

Configure em `Settings > Secrets and variables > Actions`:

- `SSH_PRIVATE_KEY`: chave privada que permite o acesso SSH do usuario `dev` ao host `212.38.89.129`.

Nunca envie para o GitHub arquivos locais sensiveis como `.env`, `*.key` ou `db.json`. Eles ja estao protegidos pelo `.gitignore`.

## Como Publicar uma Atualizacao

```powershell
git status --short
node test_commands.js
git add .github/workflows/deploy.yml DEPLOY_GUIDE.md COMMANDS_AND_FEATURES.md DEV_DOCUMENTATION.md canvas/renderer.js commands/painel.js assets/ui/painel-hud-medieval.png
git commit -m "feat(painel): rework player hud visual"
git push origin main
```

Depois do push, acompanhe a execucao em:

`https://github.com/Unetus/bot-ernas/actions`

## Verificacao em Producao

Quando o deploy finalizar, valide:

```bash
pm2 status
pm2 logs rpg-bot --lines 80
```

No Discord, execute:

```text
/painel
```

O retorno esperado e um painel privado com banner medieval moderno, botoes nativos do Discord e a imagem `painel-jogador.png` anexada no embed.

## Troubleshooting

- Se o GitHub Actions falhar com `Permission denied (publickey)`, atualize o secret `SSH_PRIVATE_KEY`.
- Se o bot nao aparecer no PM2, o workflow tentara criar o processo com `pm2 start index.js --name rpg-bot`.
- Se o painel aparecer sem imagem de fundo, confirme se `assets/ui/painel-hud-medieval.png` existe no servidor e se o workflow esta copiando `assets/**`.
- Se comandos novos nao aparecerem no Discord, aguarde alguns minutos ou reinicie o bot; o `index.js` registra slash commands no evento `ready`.
