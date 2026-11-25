# Fitness RPG & Saúde

Aplicativo web full-stack que transforma treinos físicos, metas diárias e telemetria real de saúde em um sistema de progressão RPG inspirado em Caçadores (Mundo Real) e Reinos Marciais (Murim). Um aplicativo Android complementar sincroniza dados do Health Connect com a mesma conta.

[Abrir o Fitness RPG](https://app-fitness-rm9t.vercel.app/)

[Como usar](#como-usar-o-app) · [Instalação local](#configuração-e-execução-local) · [Testes](#testes-e-ci) · [API REST](#segurança--endpoints-principais) · [Solução de problemas](#solução-de-problemas)

---

## Visão Geral

O **Fitness RPG & Saúde** combina planejamento e execução de treinos com mecânicas de evolução contínua, batalhas contra chefes, economia de arsenal, monitoramento cardíaco e análise de recuperação. Todas as integrações sensíveis (Gemini IA, Strava OAuth 2.0 e API v1 autenticada) passam por servidor Hono dedicado com verificação via Firebase Auth. Algumas rotas de consulta, como o catálogo do Arsenal e a documentação OpenAPI, são públicas.

---

## Principais Funcionalidades

- **Progressão Dual (Caçador & Murim — Escala de 30 dias)**
  - **Ranks de Caçador (`F` → `S`)** e **Níveis (1–25)** calibrados para avançar ~1 rank completo a cada **30 dias** de consistência (`4–5 treinos/semana + missões diárias`).
  - **Reinos Murim (8 estágios)** evoluídos tanto por atividades/consistência (treinos, chefes derrotados, streak, minutos) quanto recalculados diretamente pelo XP total (`calculateHeroRankByXp`, `calculateMurimQiByXp`, `calculateMurimRealmByXp`).
- **Treinos Guiados & Chefes de Masmorra**
  - Inclui a trilha inicial **Despertar do Guerreiro — Treino A e B (Rank F)** para iniciantes, **Calistenia Híbrida (Rank E)** e treinos personalizados.
  - Execução cronometrada com descanso automático, demonstrações anatômicas procedurais por exercício que funcionam offline e batalha proporcional contra Chefes de Masmorra por Rank.
- **Arsenal, Votos Diários & Missões**
  - **52 equipamentos e 10 conjuntos** distribuídos em 4 slots (`elmo`, `armadura`, `capa`, `arma`) e 4 raridades (`Comum`, `Raro`, `Épico`, `Lendário`), com bônus de XP, Moedas, dano em Chefe e sinergias de conjunto (`2/4` e `4/4`).
  - Compromissos diários (Votos) e missões automáticas integradas às métricas de saúde do dia.
  - O **Extrato de XP e moedas**, no Arsenal, mostra compras, treinos, atividades, missões e votos com data, valor e saldo final. Ele registra as movimentações novas após a publicação das regras do Firestore.
- **Saúde, Zonas Cardíacas & Recuperação**
  - Conexão oficial via **Strava OAuth 2.0** (com cookies criptografados em AES-256-GCM e suporte a streams de FC).
  - Importação de arquivos **Apple Health (`.xml`)**, **Samsung Health**, **GPX** e **CSV** com deduplicação determinística.
  - Cálculo de zonas cardíacas **Z1–Z5**, carga aguda vs. crônica (**ACWR**), score de prontidão, registro de peso e backup opcional no Google Drive.
- **Coach Oráculo (IA)**
  - Assistente integrado via `@google/genai` no backend, contextualizado com histórico de treinos, estagnação de carga, recuperação e perfil do herói.
- **API REST v1 & OpenAPI**
  - Endpoints RESTful sob `/api/v1/*` protegidos por Bearer Token do Firebase Auth, com especificação OpenAPI em `/api/v1/openapi.json` e console interativo dentro do próprio aplicativo.

## Como usar o app

1. Entre com uma conta Google com e-mail verificado. Se for o primeiro acesso, crie seu perfil de herói para abrir o painel.
2. Em **Treinar**, comece pela trilha **Despertar do Guerreiro** ou escolha um treino pelo tipo, dificuldade e rank. Abra **Ver exercícios** para conferir a prescrição antes da sessão.
3. Toque no ícone de informação de um exercício para abrir o **Guia Técnico**. A demonstração usa um modelo anatômico desenhado em SVG, com destaque muscular, dicas por fase e reprodução em velocidade normal ou reduzida. Depois que o app carrega, o guia pode funcionar offline. Na sessão em andamento, o botão **Concluir exercício** registra a conclusão e volta ao treino.
4. Ao finalizar a sessão, confira o XP e as moedas obtidos. Abra **Arsenal → Extrato** para acompanhar lançamentos recentes. Em **Arsenal → Equipamentos**, use a busca e os filtros ou ordene por preço, poder ou nome. A aba **Conjuntos** mostra as peças e os bônus por combinação.
5. Abra **Relatórios** para acompanhar atividades, evolução e dados de saúde. Em **Sincronização**, importe um arquivo de saúde, conecte o Strava ou autorize o Google Drive para importar arquivos e gerenciar backups.

### Origens dos dados de saúde

| Origem | Como os dados chegam ao app | O que você precisa |
| --- | --- | --- |
| **Treinos do app** | A confirmação da sessão grava o histórico e suas recompensas. | Uma sessão autenticada. |
| **Health Connect** | O app Android lê os tipos autorizados e grava os registros no Firestore. A web lê os registros e os totais diários. | Android com Health Connect habilitado, permissões concedidas e a mesma conta Google usada na web. |
| **Strava** | O servidor importa atividades por OAuth e consulta dados de frequência cardíaca quando disponíveis. | Configuração do Strava no servidor e autorização da conta pelo app. |
| **Arquivos de saúde** | A interface faz a leitura local de exportações Apple Health, Samsung Health, GPX ou CSV e usa deduplicação ao importar. | Um arquivo compatível. A aba **Sincronização** oferece um modelo CSV. |
| **Google Drive** | A interface importa arquivos que estão no Drive e permite criar backups. | Conexão separada com a mesma conta usada no Fitness RPG. |

No Android, use **Sincronizar agora** depois de conceder as permissões. Os relatórios podem mostrar dados parciais se você autorizar apenas alguns tipos. Os totais de calorias do Health Connect aparecem separadamente das calorias ativas. [Configuração do Android](android/README.md)

---

## Stack Tecnológica

| Camada | Tecnologias |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Motion (`motion/react`), Recharts, Phosphor Icons e Radix UI |
| **Backend** | Node.js 24, Hono, `tsx` e Zod |
| **Dados & Auth** | Firebase Authentication, Cloud Firestore (`firestore.rules` + REST bridge em `src/server/firebaseRest.ts`) |
| **IA & Integrações** | Google Gemini (`@google/genai`), Strava OAuth 2.0 API, Google Drive Client |
| **Android** | Kotlin, Jetpack Compose, Health Connect, WorkManager e Firebase |
| **Testes e entrega** | Bun, Node Test Runner, Playwright, emulador do Firestore, GitHub Actions e Vercel |

---

## Arquitetura

- **Web.** O React abre a tela de login pelo Firebase Authentication e carrega a área autenticada, incluindo o SDK do Firestore, depois que a sessão é verificada. As telas maiores são carregadas sob demanda.
- **API.** O processo local e a função da Vercel compartilham o servidor Hono. As rotas privadas validam o Firebase ID Token e usam os esquemas Zod de entrada. Conclusão de treino, compra de equipamento e resgate de missões passam pela API.
- **Persistência.** A web e o Android compartilham o banco Firestore nomeado. As regras protegem os documentos por UID e exigem e-mail verificado. O backend usa o token da conta nas chamadas REST ao Firestore. A web acompanha perfil e atributos em tempo real, e o histórico de sessões é carregado pela API.
- **Guia Técnico.** `exerciseMotion.ts` define as poses e a interpolação de cada tipo de movimento. `athleticAnatomy.ts` gera a silhueta e os destaques musculares que o `ExerciseDemoPlayer.tsx` desenha e anima.

## Estrutura do Projeto

```text
.
├── server.ts                   # Entrada Node para Hono e Vite
├── api/index.ts                # Entrada da função Vercel
├── src/
│   ├── App.tsx                 # Coordenação das telas e ações do usuário
│   ├── features/               # Navegação, sincronização do workspace e importação de saúde
│   ├── components/             # Treinos, Arsenal, Relatórios, Oráculo, Painel e Perfil
│   ├── services/api.ts          # Cliente HTTP e renovação de sessão
│   ├── server/                 # Aplicação Hono, contratos REST, Firebase e integrações
│   ├── types/                  # Contratos TypeScript do domínio
│   └── utils/                  # Progressão F–S e Murim, regras RPG e parsers de saúde
├── android/                     # Aplicativo complementar do Health Connect
├── scripts/                    # Verificações da API, do navegador e do deploy
├── tests/                       # Suítes unitárias, de API e regras do Firestore
├── firestore.rules              # Regras de acesso e persistência
├── firestore.indexes.json       # Índices usados por consultas cronológicas
└── .env.example                 # Modelo de configuração do servidor
```

---

## Operação em produção

- A Vercel publica o frontend e a função Hono da branch principal. Configure `APP_URL` com o domínio público usado pelo navegador e pelo callback do Strava. O comando `bun run test:entry` carrega a entrada real com Node 24.
- Para publicar as regras e os índices no banco nomeado, use `firebase deploy --only firestore --project <projectId>` com uma conta autorizada. O `projectId` está em `firebase-applet-config.json`, e o banco de destino está em `firebase.json`. Algumas consultas usam ordenação por ID enquanto os índices cronológicos são construídos.
- O Strava exige `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e um `SESSION_SECRET` aleatório. Trocar `SESSION_SECRET` invalida as conexões Strava existentes. O callback é `/auth/strava/callback` na origem registrada.
- Configure `GEMINI_API_KEY` para usar a IA. Para compartilhar o limite de uso entre instâncias da Vercel, configure `AI_RATE_LIMIT_REDIS_URL` e `AI_RATE_LIMIT_REDIS_TOKEN` de um Redis com API REST. `AI_ALLOWED_UID` pode restringir a IA à sua conta Firebase.
- O Firebase autentica a conta Google. Em iPhone e iPad, o app usa redirecionamento quando o domínio de autenticação coincide com o da aplicação. As demais configurações usam popup. Para usar o Drive, abra **Relatórios → Sincronização → Configurar Google Drive** e escolha a mesma conta. O acesso de leitura permite localizar e importar arquivos existentes. A gravação é restrita aos arquivos autorizados para o app. O token do Drive fica em memória até você desconectar, sair ou recarregar a página.

### Login no Safari com redirecionamento

O login Google no iPhone e no iPad usa redirecionamento automaticamente em `app-fitness-rm9t.vercel.app`. Para habilitar o mesmo fluxo em outro domínio:

1. Em **Firebase Authentication → Settings → Authorized domains**, autorize o domínio onde o app roda.
2. No cliente OAuth 2.0 **Web** usado pelo provedor Google no Google Cloud, acrescente `https://<domínio>/__/auth/handler` às URIs de redirecionamento autorizadas. Mantenha as demais URIs do cliente.
3. Na Vercel, defina `VITE_FIREBASE_AUTH_DOMAIN` com o domínio da sua instalação, sem protocolo, e faça um novo deploy.
4. Abra o app no Safari, use **Entrar com Google** e confira se o navegador retorna ao app após selecionar a conta.

O `vercel.json` encaminha os helpers do Firebase para o projeto de autenticação. Quando o domínio configurado coincide com a página, o navegador acessa os helpers e o armazenamento de login pela mesma origem. Se sua instalação usa outro projeto Firebase, ajuste também os destinos de `/__/auth` e `/__/firebase/init.json` em `vercel.json`. [Guia de redirecionamento do Firebase](https://firebase.google.com/docs/auth/web/redirect-best-practices?hl=pt-BR)

## Configuração e Execução Local

### 1. Instalar dependências

Use Node.js 24 e Bun. O build Android usa JDK 17 e SDK Android 35. O emulador do Firestore usa Java 21.

```bash
git clone https://github.com/DNL-8/App-fitness.git
cd App-fitness
bun install --frozen-lockfile
```

### 2. Configurar variáveis de ambiente

Copie [`.env.example`](.env.example) para `.env` e preencha as variáveis das integrações que usa.

```bash
cp .env.example .env
```

No Windows PowerShell, use `Copy-Item .env.example .env`. Guarde chaves e tokens no ambiente do servidor. Para uma instalação em outro projeto Firebase, confira o projeto e o banco nomeado em [firebase-applet-config.json](firebase-applet-config.json) e [firebase.json](firebase.json). Ative o login Google e autorize o domínio usado para abrir a aplicação.

| Variável | Descrição |
| :--- | :--- |
| `GEMINI_API_KEY` | Chave da API Gemini usada exclusivamente no servidor para o Coach Oráculo. |
| `GEMINI_MODEL` | Modelo usado pela API Gemini (padrão: `gemini-3.6-flash`). |
| `APP_URL` | URL base da aplicação (ex.: `http://localhost:3000`) para callbacks OAuth e CORS. |
| `STRAVA_CLIENT_ID` | Client ID do aplicativo Strava OAuth 2.0. |
| `STRAVA_CLIENT_SECRET` | Client Secret do aplicativo Strava OAuth 2.0. |
| `SESSION_SECRET` | Chave secreta usada para cifrar sessões e estado CSRF do Strava (AES-256-GCM). |
| `ALLOWED_ORIGINS` | Lista opcional de origens extras permitidas no CORS (separadas por vírgula). |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domínio alternativo do app, sem protocolo. Configure após autorizar a URI OAuth. O padrão é `app-fitness-rm9t.vercel.app`. |
| `PORT` | Porta do servidor Node local. O padrão é `3000`. |
| `APP_TIME_ZONE` | Fuso IANA usado pela API para determinar o dia. |
| `AI_ALLOWED_UID` | UID Firebase autorizado a chamar o Gemini em instalações pessoais. |
| `AI_RATE_LIMIT_REDIS_URL` e `AI_RATE_LIMIT_REDIS_TOKEN` | Compartilham a cota entre instâncias do backend. Configure o par. |
| `ENABLE_DEBUG_GRANT` | Mantenha `"false"` em produção; habilita endpoints de ajuste de XP em desenvolvimento. |

### 3. Iniciar o servidor

```bash
bun run dev
```

Abra [http://localhost:3000](http://localhost:3000) com a configuração padrão. O servidor local atende o frontend e a API pela mesma origem. Para servir uma compilação local de produção, execute `bun run build` e depois `NODE_ENV=production bun run start`. No PowerShell, defina `$env:NODE_ENV = "production"` antes de executar `bun run start`.

## Testes e CI

| Comando | O que verifica |
| --- | --- |
| `bun run lint` | Verificação estática de tipos com TypeScript. |
| `bun run test` | Testes unitários e de integração da API, incluindo regras RPG, deduplicação e concorrência de compras. |
| `bun run test:entry` | Carregamento da entrada da função e respostas HTTP básicas. |
| `bun run build` | Verificação de tipos e geração dos arquivos de produção em `dist/`. |
| `bun run test:browser` | Abre o build e testa fluxos em Chrome ou Chromium. Execute o build antes. |
| `bun run test:rules` | Exercita as regras do Firestore com contas de teste no emulador. |

O teste de navegador usa fixtures isoladas para verificar login, navegação, filtros do Arsenal, relatórios e a abertura offline do Guia Técnico. Use `CHROME_BIN` se precisar indicar o caminho do Chrome ou Chromium.

Para testar as regras e os fluxos de gravação no emulador local, use:

```bash
npx --yes firebase-tools@15.37.0 emulators:exec --only firestore --project demo-app-fitness "bun run test:rules"
```

O [workflow do GitHub Actions](.github/workflows/ci.yml) verifica dependências, tipos, testes, build, navegador, regras do Firestore e compilação Android em PRs para a branch principal. Após um push na `main`, o workflow verifica a revisão publicada pela Vercel. O deploy do Firestore usa uma conta autorizada e ocorre separadamente.

[Configuração Android](android/README.md) · [Auditoria do refactor v2](docs/auditoria-v2.md)

## Segurança & Endpoints Principais

- **Segurança no servidor**: Cabeçalhos HTTP pelo middleware `secureHeaders` do Hono, validação de origens CORS, limitação de requisições de IA, tokens Strava armazenados em cookies `HttpOnly` cifrados e validação de identidade via Firebase ID Token.
- **Rotas públicas úteis**:
  - `GET /api/v1/health` — status do serviço e configuração.
  - `GET /api/v1/openapi.json` — documentação OpenAPI da API v1.
  - `GET /api/v1/armory/catalog` — catálogo público dos itens e conjuntos do Arsenal.
- Para concluir um treino, envie `Idempotency-Key` no cabeçalho ou `idempotencyKey` no JSON. Ao repetir o envio da mesma sessão, reutilize a chave e os dados da primeira tentativa. Use uma chave nova para cada sessão.
- Em `GET /api/v1/workouts/logs`, envie um `limit` inteiro entre 1 e 200. Use o `nextCursor` recebido como parâmetro `cursor` da página seguinte até receber `null`.

- Envie corpos com `Content-Type: application/json`. O contrato OpenAPI usa os mesmos esquemas de entrada das rotas REST.

| Rota | Uso |
| --- | --- |
| `GET /api/health` | Verifica se o servidor responde e informa a revisão publicada na Vercel. |
| `GET /api/v1/workouts` | Lista os treinos disponíveis para a conta. |
| `POST /api/v1/workouts/{id}/complete` | Conclui um treino e retorna resumo de recompensas. |
| `GET /api/v1/armory/state` | Consulta saldo, inventário e equipamentos da conta. |
| `GET /api/v1/stats/ledger` | Retorna até 30 lançamentos de XP e moedas por página. |
| `GET /api/v1/health-data/summary` | Consolida dados de saúde e indica a disponibilidade do Health Connect. |
| `POST /api/v1/oracle/ask` | Envia uma pergunta ao Oráculo com contexto da conta. |

Nas rotas privadas, envie `Authorization: Bearer <Firebase ID Token>`. Os recursos retornam, em geral, `{ "ok": true, "data": ... }`. Erros estruturados trazem `ok: false`, uma mensagem e um `code` estável. O cabeçalho `X-Request-Id` ajuda a localizar a mesma requisição nos logs do servidor.

Para conferir o servidor local e o contrato da API, use:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/v1/openapi.json
```

## Solução de problemas

| Sintoma | O que conferir |
| --- | --- |
| O popup de login fecha ou é bloqueado | Permita popups para o domínio do app e confira se o domínio está autorizado no Firebase Authentication. |
| O Android mostra erro 10 no Google Sign-In | Use `./gradlew :app:signingReport` a partir de `android/` e confira se o Firebase tem o pacote e o SHA-1 do APK instalado. |
| O Gradle informa que o SDK não foi encontrado | Instale o SDK Android 35 no Android Studio e aponte `ANDROID_HOME` ou `sdk.dir` em `android/local.properties` para a pasta do SDK. |
| O Android sincroniza, mas os dados não aparecem na web | Confira se ambos os apps usam o mesmo projeto, o mesmo banco nomeado e a mesma conta, e se o Health Connect concedeu as permissões para os tipos esperados. |
| O Extrato indica indisponibilidade | Confira se as regras que incluem `progressLedger` foram publicadas no banco Firestore usado pelo app. |
| O Strava não conecta | Confira a origem em `APP_URL`, o callback registrado e as três variáveis do Strava e de sessão. |
| O Oráculo indica indisponibilidade | Confira a chave e o modelo Gemini, o UID permitido e o par de variáveis do Redis, se configurado. |
