# Rotina Adulto — Firestore

Base técnica copiada do [Rotina Falante](https://github.com/ananunes1807-cell/rotina-falante):
vanilla JS, Firebase (Auth + Firestore), PWA, GitHub Pages.
Diferença: sem "modo criança", uso individual, notificação push real via
Cloudflare Worker + FCM (não via Cloud Functions — não exige plano Blaze).

## Documento principal

Um documento por usuária, identificado pelo `uid` do login Google:

```txt
usuarios/{uid}
```

Campos do documento:

```js
{
  perfil: {
    nome: "Ana",
    email: "seu-email@gmail.com",
    criadoEm: "2026-07-22T00:00:00.000Z"
  },
  tarefas: [
    {
      id: "uuid",
      nome: "Escovar os dentes",
      categoria: "higiene",   // higiene | casa | trabalho | saude | outro
      horario: "08:00",       // HH:mm, 24h
      dias: [0,1,2,3,4,5,6],  // 0=domingo ... 6=sábado. [] = todo dia
      ativa: true,
      ordem: 1,
      criadoEm: "2026-07-22T00:00:00.000Z"
    }
  ],
  concluidas: {
    // chave = "AAAA-MM-DD", valor = lista de ids de tarefas concluídas naquele dia
    "2026-07-22": ["uuid-1", "uuid-2"]
  },
  pushTokens: [
    {
      token: "token-do-fcm-gerado-pelo-navegador",
      dispositivo: "chrome-pc",   // texto livre, só pra você reconhecer na lista
      criadoEm: "2026-07-22T00:00:00.000Z"
    }
  ],
  notificadas: {
    // controle interno do Cloudflare Worker: quais tarefas já foram
    // notificadas hoje, pra não mandar de novo a cada vez que o cron roda
    "2026-07-22": ["uuid-1"]
  }
}
```

### Por que `concluidas` é um mapa por data, e não um campo dentro da tarefa

Porque a tarefa é recorrente (repete todo dia). Se "feito" fosse um campo
dentro da tarefa, ela ficaria marcada como feita pra sempre depois do primeiro
check. Guardando por data, o checklist reseta sozinho todo dia — você vê o
histórico completo (quantos dias seguidos escovou os dentes, por exemplo) sem
duplicar dados.

### Por que `pushTokens` é uma lista

Porque você disse que quer notificação no celular **e** no PC. Cada aparelho
gera um token FCM diferente quando você autoriza notificação nele. A lista
permite mandar a mesma notificação pros dois ao mesmo tempo.

## Regras do Firestore

Só a dona da conta lê/escreve o próprio documento:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Quem lê esses dados fora do navegador

O Cloudflare Worker (pasta `cloudflare-worker/`) lê este documento pela
**API REST do Firestore**, autenticado com uma conta de serviço do Firebase
(não é o mesmo login seu — é uma credencial de servidor, gerada uma vez e
guardada como *secret* no Cloudflare, nunca no código).

Importante: uma conta de serviço **ignora as regras do Firestore** acima —
elas só valem pra acesso vindo do navegador com login de usuária. Por isso
a chave da conta de serviço (`SERVICE_ACCOUNT_JSON`) é o segredo mais
sensível do projeto: quem tiver ela lê e escreve tudo, de qualquer usuária.
Nunca cole no código, nunca suba pro GitHub — só como secret do Cloudflare
(ver README.md).
