# Guia de Deploy e Atualização do Bot de RPG

Este documento serve como manual de referência rápida sobre como gerenciar, atualizar e fazer o deploy do bot de RPG na nuvem.

Atualmente, o projeto está configurado com um fluxo de **Integração e Entrega Contínuas (CI/CD) via GitHub Actions**, o que significa que as atualizações do bot acontecem de forma 100% automatizada a cada push!

---

## 🖥️ Informações do Servidor

* **Provedor:** Oracle Cloud (Always Free - AMD Micro)
* **IP Público:** `137.131.222.150`
* **Usuário SSH:** `ubuntu`
* **Chave Privada SSH:** `ssh-key-2026-05-25.key` (localizada na raiz do projeto local)
* **Diretório do Bot no Servidor:** `/home/ubuntu/bot`

---

## ⚡ Fluxo Automatizado (GitHub Actions)

A cada `git push` na branch `main` do repositório do GitHub (`https://github.com/Unetus/bot-ernas.git`), o servidor é atualizado automaticamente.

### 🔑 Configuração Inicial (Uma única vez)

Para que a automação do GitHub consiga conectar na sua VM e atualizar os arquivos, você precisa adicionar a sua chave SSH nas configurações do repositório no GitHub:

1. Abra o arquivo `ssh-key-2026-05-25.key` no seu VS Code e copie todo o conteúdo dele (incluindo as linhas `-----BEGIN RSA PRIVATE KEY-----` e `-----END RSA PRIVATE KEY-----`).
2. Acesse o seu repositório no GitHub: `https://github.com/Unetus/bot-ernas`.
3. Vá em **Settings** (Configurações) ➔ **Secrets and variables** (no menu esquerdo) ➔ **Actions**.
4. Clique no botão **New repository secret** (Novo segredo do repositório).
5. Preencha os campos exatamente assim:
   * **Name:** `SSH_PRIVATE_KEY`
   * **Secret:** Cole o conteúdo completo da chave `.key` que você copiou.
6. Clique em **Add secret**.

Pronto! Agora a automação tem permissão segura para conectar na sua VM.

---

### 🚀 Como atualizar o Bot daqui para frente

Com a chave configurada no GitHub, a atualização do bot se resume a este simples fluxo:

1. **Desenvolva** a nova função ou ajuste no seu PC.
2. **Envie para o GitHub** pelo terminal local:
   ```bash
   git add .
   git commit -m "Minha nova funcionalidade incrível"
   git push origin main
   ```
3. **Acompanhe o deploy automático:**
   * Acesse a aba **Actions** no seu repositório do GitHub.
   * Você verá o pipeline rodando e, em cerca de 15 segundos, o GitHub terá copiado os arquivos novos e reiniciado o bot no servidor sozinho!

> ⚠️ **IMPORTANTE:** O arquivo `.gitignore` local está configurado para **nunca** enviar para o GitHub seus arquivos confidenciais:
> * `.env` (contém seu token do Discord)
> * `ssh-key-2026-05-25.key` (sua chave privada)
> * `db.json` (seu banco de dados dinâmico de RPG)
> * `node_modules/` (dependências locais)
>
> Isso protege sua segurança e impede que o banco de dados do servidor seja apagado ou sobrescrito a cada atualização!

---

## 🛠️ Gerenciamento Manual (Fallback / Resolução de Problemas)

Caso precise acessar o servidor diretamente para ver logs ou gerenciar o bot manualmente:

1. **Conectar na VM:**
   ```powershell
   ssh -i .\ssh-key-2026-05-25.key ubuntu@137.131.222.150
   ```

2. **Comandos úteis do PM2 na VM:**
   * **Ver logs do bot em tempo real:** `pm2 logs rpg-bot`
   * **Parar o bot:** `pm2 stop rpg-bot`
   * **Iniciar o bot:** `pm2 start rpg-bot`
   * **Reiniciar o bot:** `pm2 restart rpg-bot`
   * **Ver consumo de memória/CPU:** `pm2 status`
