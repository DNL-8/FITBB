# Auditoria técnica do App-fitness v2

O trabalho parte da `main` e está organizado na branch `refactor/app-fitness-v2`. A referência para a migração do backend é o commit `86e7571`, que substituiu Express por Hono. A comparação dos pontos de entrada e das rotas confirmou que as rotas Express antigas já tinham equivalentes no Hono. `server.ts` inicializa a execução local e `api/index.ts` adapta a aplicação para a Vercel. Ambos usam `src/server/index.ts`.

## Problemas encontrados e correções

| Área | Problema encontrado | Mudança e arquivos principais |
| --- | --- | --- |
| Backend | README ainda descrevia Express. A API v1 e as demais rotas tratavam erros separadamente. O OpenAPI podia derivar a origem de cabeçalhos recebidos. | Aplicação Hono compartilhada, respostas padronizadas e logs por rota cadastrada. Origem do OpenAPI e do OAuth vem da configuração HTTP válida. `src/server/index.ts`, `shared.ts`, `apiV1.ts` e `firebaseRest.ts`. |
| Privacidade | Exportações antigas de código e JSON estavam sob `public/`. Erros do Firestore podiam imprimir o caminho e detalhes do provedor. | Remoção das duas exportações sem referências. Respostas e logs usam códigos e contexto da operação. `public/assets/aistudio/`, `src/firebase.ts` e `src/server/shared.ts`. |
| Firebase Auth e Firestore | Verificação JWT permitia formatos pouco estritos. Alguns documentos podiam nascer com ID incompatível com o caminho. O cliente tratava ausência em cache como ausência confirmada em parte da inicialização. | Validação do emissor, audiência, assinatura, tempos, UID e e-mail verificado. UI orienta a verificar o e-mail. Regras reforçam proprietário, documento pai, IDs, slots e tipo dos registros Health Connect. `firebaseRest.ts`, `AppEntry.tsx`, `firestore.rules` e `tests/firestore.rules.mts`. |
| Strava | O callback usava múltiplos trechos de HTML e aceitava parâmetros sem validação de cardinalidade. A sessão podia ser criada sem conferir a resposta do provedor. | Validação do estado, dos parâmetros e dos tokens. Permissão limitada a atividades. CSP com nonce, referrer desabilitado no callback, cookies vinculados à conta e redirecionamentos do provedor bloqueados. `src/server/routes/strava.ts`. |
| Gemini | As chamadas estavam espalhadas e a resposta do provedor não tinha um limite comum. O contexto do Oráculo incluía o nome do herói. | Cliente compartilhado, timeout, teto de saída e validação dos exercícios retornados. As telas enviam os campos usados na análise. Opções de cota distribuída e conta autorizada documentadas. `src/server/gemini.ts`, `src/server/routes/ai.ts`, `OracleCoachView.tsx` e `WorkoutsListView.tsx`. |
| API REST | O orquestrador e rotas diretas aceitavam alguns tipos implícitos. A documentação dos corpos era independente. | Esquemas Zod nos corpos e parâmetros de operações. O contrato OpenAPI reutiliza os esquemas. A API aplica a mesma validação a rotas diretas e ações equivalentes. `src/server/input.ts`, `apiV1.ts`, `apiV1/openapi.ts` e `tests/apiReliability.test.ts`. |
| RPG e persistência | Importações simultâneas podiam registrar duas vezes uma atividade com o mesmo ID externo e IDs internos diferentes. O equipamento legado podia ocupar um slot incompatível. | Identidade por fonte e ID externo, commit condicionado à versão do progresso e deduplicação ao repetir. O arsenal valida o slot real e migra IDs legados. Curvas F–S e Murim, chefes e conquistas continuam com a lógica compartilhada. `src/server/apiV1/domain.ts`, `firebaseRest.ts`, `src/utils/rpgLogic.ts` e `firestore.rules`. |
| Frontend e desempenho | `App.tsx` concentrava navegação, assinaturas e importação. Alterar uma carga reenviava o treino inteiro. Relatórios carregava a biblioteca do gráfico antes de abrir Evolução. | Extração para `src/features/` e atualização de carga pelo endpoint com controle de concorrência. Health Connect conecta os listeners ao abrir Relatórios. Gráfico de XP sob demanda e chunk separado do Firestore. Menu mobile com área segura e layout de tablet. `src/App.tsx`, `src/services/api.ts`, `src/components/XpEvolutionChart.tsx` e `vite.config.ts`. |
| Entrega | A verificação do navegador importava apenas o módulo, sem passar pelos fluxos autenticados. Regras e Android não rodavam no CI. | GitHub Actions com auditoria de dependências, emulador, build Android e testes de interface em três larguras. Mantida a verificação da revisão publicada pela Vercel após push em `main`. `.github/workflows/ci.yml`, `scripts/check-app-flows.mjs`, `README.md` e `.env.example`. |

O build reduziu o módulo de Relatórios de cerca de 565 kB para 155 kB antes da compressão. Cerca de 410 kB ficam no módulo do gráfico e são carregados quando se abre Evolução. A comparação mede o bundle, sem medir a rede de um dispositivo real.

## Validação

- Executados `bun run test`, `bun run lint`, `bun run build` e `bun run test:entry` em cada etapa.
- A suíte de regras usa um emulador. Cobre isolamento entre contas, e-mail não verificado, treino e conquista, inventário e presets, além de criação e atualização de Health Connect.
- O teste de interface usa fixtures só no build de teste. Verifica o fluxo de verificação de e-mail, renovação do token, Arsenal, navegação e Relatórios com carregamento sob demanda. A compilação Android foi verificada com Gradle, JDK 17 e SDK 35.
- A auditoria do Bun não encontrou avisos altos ou críticos nas dependências de produção.

## Riscos pendentes e operação

- **Credenciais do usuário no Firestore.** O servidor usa o Firebase ID Token do usuário para aplicar as mesmas regras que o cliente no plano atual. As regras limitam alterações, mas o dono da conta continua com permissões diretas necessárias para os fluxos web e Android. Tornar recompensas estritamente exclusivas do backend exige migrar a autoridade de gravação e os fluxos de onboarding e reset.
- **Publicação do Firestore.** As regras e os índices deste PR precisam ser publicados no banco nomeado indicado em `firebase.json`. As consultas com índice novo têm fallback. A suíte automatizada roda em um banco isolado no emulador.
- **Provedores e dispositivo real.** Login Google, troca de token Strava, chamadas Gemini e Health Connect completo precisam de verificação no ambiente de destino com conta e configuração reais. Os testes automatizados exercitam os contratos sem usar credenciais externas. O APK de debug compila com JDK 17 e SDK 35.
- **Cota da IA.** Sem Redis configurado, a cota é por instância. Em instalações pessoais, `AI_ALLOWED_UID` restringe as chamadas à conta indicada. A configuração de Redis e do Gemini fica no servidor.
- **Reset de volume alto.** O reset existente limpa subcoleções em lotes por causa dos limites do Firestore. Uma interrupção pode demandar nova execução para concluir a limpeza.
- **Dependência de desenvolvimento.** A auditoria apontou um aviso moderado de `minimatch` em ferramentas de desenvolvimento. A correção depende de versões compatíveis dos consumidores de `minimatch` 10.x.
