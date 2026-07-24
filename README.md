# Rotina Adulto

App pessoal de rotina: trilha do dia, notificação real (mesmo com o app
fechado, sem precisar de cartão de crédito cadastrado) e um chat de apoio
por tarefa, que te ajuda a destravar sem fazer por você.

Base copiada do [Rotina Falante](https://github.com/ananunes1807-cell/rotina-falante):
vanilla JS, Firebase, PWA, GitHub Pages. Projeto e banco de dados são
**novos e separados** — nada se mistura com o app das crianças.

Como funciona, em uma frase: **Firebase** guarda os dados e faz login;
**Cloudflare Worker** (grátis, sem cartão) fica de olho no relógio e manda
a notificação; **Claude API** responde no chat quando você pede ajuda numa
tarefa.

---

## Passo a passo

### 1. Criar o projeto no Firebase
1. [console.firebase.google.com](https://console.firebase.google.com) → **Criar projeto** → nome `rotina-adulto`.
2. Não precisa habilitar faturamento nem plano Blaze — o plano gratuito (Spark) basta.

### 2. Ativar os serviços dentro do projeto
No menu lateral:
- **Build → Firestore Database** → Criar banco → modo produção → região `southamerica-east1`.
- **Build → Authentication** → Sign-in method → ativar **Google**.
- **Engage → Cloud Messaging** → aba **Web configuration** → **Gerar par de chaves** → guarda essa chave, é o `VAPID_KEY`.

### 3. Pegar as credenciais do app web
Configurações do projeto (ícone de engrenagem) → role até "Seus apps" → ícone `</>` → registra um app chamado `rotina-adulto-web`.
Ele mostra um objeto `firebaseConfig`. Copia inteiro.

### 4. Criar a conta de serviço (pro Cloudflare Worker acessar o Firestore)
Configurações do projeto → aba **Contas de serviço** → **Gerar nova chave privada** → baixa o arquivo `.json`.
Guarda esse arquivo num lugar seguro fora da pasta do projeto — ele **não** vai pro GitHub.

### 5. Preencher `app.js`
Abre `app.js` na raiz e substitui:
```js
const FIREBASE_CONFIG = { ...cola aqui o objeto do passo 3... };
const VAPID_KEY = 'cola aqui a chave do passo 2';
```

### 6. Publicar as regras do Firestore
No seu PC, uma vez só:
```bash
npm install -g firebase-tools
firebase login
```
Dentro da pasta `rotina-adulto`:
```bash
firebase use --add
# escolhe o projeto rotina-adulto quando aparecer
firebase deploy --only firestore:rules
```

### 7. Publicar o site no GitHub Pages
```bash
git init
git add .
git commit -m "primeira versão do rotina adulto"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/rotina-adulto.git
git push -u origin main
```
GitHub → repositório → **Settings → Pages** → Source: branch `main`, pasta `/ (root)`.

⚠️ Antes do primeiro `git add .`, confira que o arquivo `.json` da conta de
serviço (passo 4) **não está** dentro da pasta do projeto. Se por engano
estiver, apaga ele daqui antes de commitar.

### 8. Configurar o Cloudflare Worker
No seu PC:
```bash
cd cloudflare-worker
npm install -g wrangler
wrangler login
```
Depois, dentro de `cloudflare-worker/`:
```bash
wrangler secret put SERVICE_ACCOUNT_JSON
# cola o CONTEÚDO INTEIRO do arquivo .json baixado no passo 4, aperta enter

wrangler secret put ANTHROPIC_API_KEY
# cola sua chave da API da Anthropic (console.anthropic.com → API Keys)

wrangler deploy
```
O comando final mostra uma URL tipo `https://rotina-adulto-worker.SEU-SUBDOMINIO.workers.dev`.

### 9. Ligar o chat ao Worker
Volta no `app.js` da raiz e substitui:
```js
const WORKER_CHAT_URL = 'https://rotina-adulto-worker.SEU-SUBDOMINIO.workers.dev/chat';
```
Sobe essa mudança pro GitHub de novo (`git add . && git commit -m "liga o chat" && git push`).

---

## Como testar se a notificação real está funcionando
1. Abre o app publicado (a URL do GitHub Pages), faz login.
2. Menu (⋯) → **Ativar notificações neste aparelho** → aceita a permissão do navegador.
3. Cria uma tarefa com horário pra 2 minutos à frente.
4. **Fecha a aba** (ou minimiza o navegador). Espera.
5. Se não chegar: `wrangler tail` (dentro de `cloudflare-worker/`) mostra os logs do Worker em tempo real — dá pra ver se ele achou a tarefa e se a chamada ao FCM deu erro.

## O que falta pra ficar redondo (não precisa agora)
- Trocar os ícones (`icon-192.png`, `icon-512.png`) — hoje são os do Rotina Falante, só pra não quebrar o manifest.
- Editar/excluir tarefa pela interface (hoje só cria e marca feita — dá pra adicionar depois, sem mexer no resto).
- Um botão "esqueci de marcar ontem" (editar `concluidas` de dias passados).

Se decidir expandir uma dessas ideias grandes numa conversa, salva um
resumo em PDF ou nota antes de fechar — você costuma perder a ideia depois.
