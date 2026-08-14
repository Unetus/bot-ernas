# Discord Activity — Homologacao

Este prototipo e isolado da cena tatica oficial. Ele existe para validar a
experiencia de uma aplicacao web executada dentro do Discord antes de qualquer
migracao do sistema atual.

## O que o teste demonstra

- Activity aberta por um botao do comando `/activity`.
- Presenca dos participantes conectados a mesma instancia.
- Tabuleiro com grade, zoom, pan e tokens arrastaveis.
- Modo livre para reposicionamento.
- Transicao simples para turnos quando o mestre fecha a cena.
- Uma acao textual por jogador; o envio avanca para o proximo turno.
- Sincronizacao temporaria entre os participantes da mesma instancia.

O estado fica somente na memoria do servidor web, expira apos duas horas e
pode ser perdido em deploy ou reinicio. Nenhuma ficha, sessao ou cena real e
alterada.

## Configuracao unica no Discord Developer Portal

Aplicacao do bot: `1502831416478797905`.

1. Abra a aplicacao do bot no Discord Developer Portal.
2. Em **Activities > Settings**, habilite **Enable Activities**.
3. Em **Activities > URL Mappings**, configure:

   - Prefix: `/`
   - Target: `www.ernas.com.br`

4. Em **Supported Platforms**, habilite Desktop e Web. Mobile pode ser
   habilitado para o teste responsivo.
5. Ative o Developer Mode na conta Discord que fara a homologacao.

O site detecta os parametros oficiais `frame_id`, `instance_id` e `platform`
na raiz e reescreve internamente a requisicao para `/discord-activity`. A home
normal do site nao e afetada.

> Activities nao distribuidas so podem ser abertas pelo proprietario da
> aplicacao ou por membros do Developer Team. Para testar com outros jogadores,
> adicione-os temporariamente ao time da aplicacao ou conclua a distribuicao de
> teste no portal.

## Como testar

1. No Discord, execute `/activity`.
2. Clique em **Abrir tabuleiro experimental**.
3. No painel Participantes, clique no seu usuario para assumir seu token.
4. Arraste o mapa, altere o zoom e mova seu token.
5. Clique em **Assumir controles de mestre**.
6. Clique em **Fechar cena e iniciar turnos**.
7. No turno do seu token, escreva uma acao e envie.
8. Abra a mesma Activity com outra conta da equipe para validar sincronizacao.

## Limitacoes intencionais

- O OAuth da Activity e o vinculo com o personagem ativo já estão validados.
- A seleção manual de token permanece apenas como contingência do protótipo.
- O papel de mestre nao e autenticado nesta fase.
- A sincronizacao usa polling e armazenamento em memoria.
- Nao ha ligacao com o banco de sessoes nem com `cenasAtivas`.

A etapa seguinte é consolidar identidade e permissões do mestre, persistir a
sala e conectar o tabuleiro à cena tática real. Assets do site usados dentro
da Activity devem preferir caminhos relativos para atravessar o URL Mapping.
