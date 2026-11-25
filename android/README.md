# Fitness RPG Android / Health Connect

O aplicativo Android lê treinos, passos, frequência cardíaca e calorias do Health Connect e sincroniza os registros com `users/{uid}/healthConnectRecords` no **mesmo banco Firestore nomeado** utilizado pela aplicação web.

## Configuração obrigatória

1. No Firebase Console, registre um aplicativo Android com o pacote `com.dnl8.fitnessrpg` e configure as impressões digitais SHA-1/SHA-256 para autenticação Google.
2. Confirme o App ID Android e o ID do banco Firestore nomeado em `FirebaseConfig.kt`. O cliente web está configurado em `firebase-applet-config.json`; mantenha os IDs consistentes.
3. Ative o provedor Google em Firebase Authentication e configure um cliente OAuth Web válido usado por `MainActivity.kt`.
4. Certifique-se de que o usuário tenha o e-mail verificado: as regras atuais do Firestore exigem `email_verified == true`.
5. Abra a pasta `android/` no Android Studio, configure o JDK 17 e o SDK Android 35 e execute em um dispositivo com Health Connect.
6. Faça login, autorize os tipos de dados desejados no Health Connect e use **Sincronizar agora**.
7. Confira no console Firestore se os documentos foram criados em `users/{uid}/healthConnectRecords` no banco correto.

Na primeira sincronização, o aplicativo cria o perfil no Firestore se ele ainda não existir. A sincronização em segundo plano é opcional. Em dispositivos compatíveis, conceda a permissão específica e sincronize manualmente para iniciar os agendamentos de 6 em 6 horas. O horário efetivo depende do Android e da conectividade.

## Build de debug

Com o JDK 17 e o SDK Android 35 configurados, execute a partir da raiz do repositório:

```sh
cd android
./gradlew :app:assembleDebug
```

No Windows, use `gradlew.bat :app:assembleDebug` dentro de `android`. O APK é gerado em `android/app/build/outputs/apk/debug/app-debug.apk`. O workflow web do GitHub Actions cobre Bun e TypeScript.

## Privacidade e testes

- O backup automático Android foi desabilitado para reduzir o risco de cópias não intencionais de dados de saúde.
- As regras do Firestore restringem o acesso a usuários autenticados e verificados, e validam tipos de métricas recebidas.
- Abra **Privacidade do Health Connect** no app ou pelo link de privacidade das permissões do Health Connect para consultar os dados lidos, onde são armazenados e como revogar o acesso.
- Teste manualmente login, cancelamento do login, permissões totais, parciais e negadas, sincronização duplicada, ausência de rede e atualização de sessão. A sincronização exige login e usa apenas os tipos autorizados.

O painel usa os totais diários do Health Connect calculados pelo Android. Sincronize com a versão atual do app para gerar esses totais. Calorias totais do Health Connect são exibidas separadamente de calorias ativas.
