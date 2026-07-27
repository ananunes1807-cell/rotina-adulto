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

  // Todo item marcável do painel — tarefa, compromisso da agenda, item de
  // "fazer depois", hábito ou item de autocuidado — vive nesta única lista,
  // diferenciado pelo campo `tipo`. Evita duplicar a lógica de dias/horário
  // e faz o mapa `concluidas` (abaixo) servir pra todos eles de uma vez.
  itens: [
    {
      id: "uuid",
      tipo: "tarefa",          // tarefa | compromisso | depois | habito | autocuidado
      nome: "Escovar os dentes",
      categoria: "higiene",    // higiene | casa | trabalho | saude | outro — tarefa e depois
      horario: "08:00",        // HH:mm, opcional em qualquer tipo agora
      horarioFim: "08:15",     // HH:mm opcional — fim do compromisso/bloco de tempo
      diaInteiro: false,        // true = ignora horario/horarioFim, evento do dia inteiro
      dias: [0,1,2,3,4,5,6],   // 0=domingo ... 6=sábado. [] = todo dia — só tarefa/compromisso controlam visibilidade por dia
      local: "",                // texto livre, só compromisso
      icone: "comprimido",      // comprimido | gota | tigela | lua | coracao — só autocuidado
      prioridade: false,        // até 3 tarefas marcadas viram "Prioridades" do dia
      lembrete: {                // opcional, em qualquer tipo
        ativo: false,
        minutosAntes: 10,        // 0 | 5 | 10 | 15 | 30 | número customizado
        falar: false             // além da notificação, usar a voz (Rotina Falante) quando o app está aberto
      },
      ativa: true,
      ordem: 1,
      criadoEm: "2026-07-22T00:00:00.000Z"
    }
  ],

  concluidas: {
    // chave = "AAAA-MM-DD", valor = lista de ids de itens concluídos naquele
    // dia — vale pra tarefa, compromisso, hábito e autocuidado, todos juntos
    "2026-07-22": ["uuid-1", "uuid-2"]
  },

  // Blocos do painel que guardam um valor por dia (chave "AAAA-MM-DD"):
  foco:     { "2026-07-22": { texto: "Terminar a proposta", feito: false } },
  mente:    { "2026-07-22": "texto livre de \"descarregar a mente\"" },
  agua:     { "2026-07-22": 5 },                                    // copos de 0 a 8
  refeicoes:{ "2026-07-22": { cafe:true, almoco:false, lanche:false, jantar:false } },
  humor:    { "2026-07-22": { humor:"calma", energia:"media" } },   // humor: calma|ok|agitada|cansada · energia: baixa|media|alta
  conquistasManuais: { "2026-07-22": [{ id: "uuid", texto: "Consegui sair da cama antes do meio-dia" }] },

  // "Não esquecer": lembretes avulsos, sem data — ficam até você apagar.
  // horario é opcional; quando presente, o lembrete aparece na Agenda do dia
  // e pode ser falado pela Rotina Falante, todo dia nesse horário.
  lembretes: [
    { id: "uuid", texto: "Levar guarda-chuva", horario: null, criadoEm: "2026-07-22T00:00:00.000Z" }
  ],

  // Preferências da Rotina Falante (voz), por usuária:
  voz: {
    ativo: false,
    volume: 1,                 // 0 a 1
    velocidade: 1,              // 0.5 a 2 (rate do SpeechSynthesis)
    vozNome: null,               // null = escolhe automaticamente (prefere pt-BR feminina)
    falarAutomatico: true,       // liga/desliga o aviso falado no horário do lembrete
    minutosAntesPadrao: 10,      // usado quando o item não define o próprio lembrete
    falarProximoItem: false,     // depois de concluir algo, fala o próximo item da agenda
    naoPerturbe: { ativo: false, inicio: "22:00", fim: "07:00" }
  },

  // Personalização do painel (modo "Personalizar painel" em Config.): ordem,
  // visibilidade, cor/ícone/título e largura de cada card. A ordem do array
  // É a ordem visual — arrastar um card reescreve esse array inteiro.
  painel: {
    blocos: [
      {
        id: "foco",              // um dos 13 ids de sistema, ou "custom-<uuid>"
        tipo: "sistema",         // sistema | personalizado
        oculto: false,           // true = escondido do painel, mas não apagado
        largura: "normal",       // normal | larga (larga ocupa a linha inteira)
        cor: null,                // null = cor padrão do card; ou um token (rosa|lilas|ceu|menta|pessego|areia|dourado)
        icone: null,              // null = ícone padrão; ou um id de símbolo (ex: "i-estrela")
        titulo: null               // null = título padrão; ou texto customizado
        // cards personalizados (tipo:"personalizado") também têm:
        // itens: [ { id:"uuid", texto:"...", feita:false, horario:null } ]
        // (horario opcional aqui também — todo dia nesse horário, sem repetição por dia da semana)
      }
    ]
  },

  pushTokens: [
    {
      token: "token-do-fcm-gerado-pelo-navegador",
      dispositivo: "chrome-pc",   // texto livre, só pra você reconhecer na lista
      criadoEm: "2026-07-22T00:00:00.000Z"
    }
  ],
  notificadas: {
    // controle interno do Cloudflare Worker: quais itens já foram
    // notificados hoje, pra não mandar de novo a cada vez que o cron roda
    "2026-07-22": ["uuid-1"]
  }
}
```

> Documentos criados antes dessa versão tinham um campo `tarefas` (sem
> `tipo`). O app migra sozinho no primeiro carregamento: copia cada tarefa
> antiga pra `itens` com `tipo: "tarefa"` e remove o campo velho. Não precisa
> fazer nada manualmente. Da mesma forma, contas sem o campo `painel` ganham
> a lista padrão dos 13 cards de sistema no primeiro carregamento.

> `horario`/`horarioFim`/`diaInteiro`/`lembrete` são opcionais em **qualquer**
> tipo de item. Só `tarefa` e `compromisso` usam `dias` pra decidir se
> aparecem hoje ou não — em `depois`, `habito` e `autocuidado` o horário é
> só informativo (mostra na Agenda e pode disparar lembrete falado), não
> muda se o item aparece no card de origem. Isso preserva o comportamento
> que já existia (hábito e autocuidado sempre visíveis, fazer-depois sempre
> na lista até apagar).

### Por que `concluidas` é um mapa por data, e não um campo dentro do item

Porque tarefas, compromissos, hábitos e itens de autocuidado são recorrentes
(repetem todo dia). Se "feito" fosse um campo dentro do item, ele ficaria
marcado como feito pra sempre depois do primeiro check. Guardando por data, o
checklist reseta sozinho todo dia — você vê o histórico completo (quantos
dias seguidos tomou a medicação, por exemplo) sem duplicar dados. Os outros
blocos diários (`foco`, `mente`, `agua`, `refeicoes`, `humor`,
`conquistasManuais`) seguem a mesma ideia, cada um com seu próprio mapa por
data.

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
