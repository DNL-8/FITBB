package com.dnl8.fitnessrpg

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
    private var healthConnectStatus by mutableIntStateOf(HealthConnectClient.SDK_UNAVAILABLE)
    private val auth by lazy { FirebaseAuth.getInstance() }

    override fun onResume() {
        super.onResume()
        healthConnectStatus = HealthConnectClient.getSdkStatus(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseConfig.initialize(this)

        setContent {
            var message by remember { mutableStateOf("Pronto para sincronizar.") }
            val healthConnectAvailable = healthConnectStatus == HealthConnectClient.SDK_AVAILABLE
            val scope = rememberCoroutineScope()
            val permissionsLauncher = rememberLauncherForActivityResult(
                PermissionController.createRequestPermissionResultContract(),
            ) { granted ->
                val grantedCount = HealthConnectManager.permissions.count { it in granted }
                message = when (grantedCount) {
                    0 -> "Nenhuma permissão do Health Connect foi concedida nesta solicitação."
                    HealthConnectManager.permissions.size -> "Permissões concedidas. Toque em sincronizar."
                    else -> "Permissões parciais. Somente os dados autorizados serão sincronizados."
                }
            }
            val healthConnect = remember(healthConnectAvailable) {
                if (healthConnectAvailable) HealthConnectManager(this@MainActivity) else null
            }
            val backgroundLauncher = rememberLauncherForActivityResult(
                PermissionController.createRequestPermissionResultContract(),
            ) { granted ->
                if (HealthConnectManager.backgroundPermission in granted) {
                    message = "Permissão em segundo plano concedida. Faça uma sincronização manual para ativá-la."
                } else {
                    message = "A sincronização em segundo plano está desativada."
                }
            }
            val googleLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.StartActivityForResult(),
            ) { result ->
                if (result.resultCode == Activity.RESULT_CANCELED && result.data == null) {
                    message = "Login com Google cancelado."
                    return@rememberLauncherForActivityResult
                }
                GoogleSignIn.getSignedInAccountFromIntent(result.data)
                    .addOnSuccessListener { account ->
                        val idToken = account.idToken
                        if (idToken.isNullOrBlank()) {
                            message = "Não foi possível obter o token do Google."
                        } else {
                            val credential = GoogleAuthProvider.getCredential(idToken, null)
                            auth.signInWithCredential(credential)
                                .addOnSuccessListener { message = "Login concluído." }
                                .addOnFailureListener { error ->
                                    message = "Falha na autenticação Firebase: ${error.message}"
                                }
                        }
                    }
                    .addOnFailureListener { error ->
                        message = when ((error as? ApiException)?.statusCode) {
                            CommonStatusCodes.CANCELED,
                            GoogleSignInStatusCodes.SIGN_IN_CANCELLED -> "Login com Google cancelado."
                            else -> "Falha no login com Google: ${error.message}"
                        }
                    }
            }

            MaterialTheme {
                Column(
                    modifier = Modifier.fillMaxSize().safeDrawingPadding()
                        .verticalScroll(rememberScrollState()).padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Fitness RPG", style = MaterialTheme.typography.headlineMedium)
                    Text(message)
                    when (healthConnectStatus) {
                        HealthConnectClient.SDK_UNAVAILABLE ->
                            Text("O Health Connect está indisponível neste dispositivo.")
                        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                            Text("Instale ou atualize o Health Connect para sincronizar seus dados.")
                    }
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                                .requestIdToken("960439871346-baadt3rgnv8cb2p9u821bvc9t8a5h7bv.apps.googleusercontent.com")
                                .requestEmail()
                                .build()
                            googleLauncher.launch(GoogleSignIn.getClient(this@MainActivity, options).signInIntent)
                        },
                    ) {
                        Text("Entrar com Google")
                    }
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        enabled = healthConnectAvailable,
                        onClick = {
                            permissionsLauncher.launch(HealthConnectManager.permissions)
                        },
                    ) {
                        Text("Permitir Health Connect")
                    }
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        enabled = healthConnectAvailable,
                        onClick = {
                            scope.launch {
                                runCatching {
                                    val manager = checkNotNull(healthConnect)
                                    val count = SyncRepository().sync(manager)
                                    if (manager.canReadInBackground()) {
                                        scheduleBackgroundSync()
                                    } else {
                                        WorkManager.getInstance(this@MainActivity)
                                            .cancelUniqueWork("health-connect-sync")
                                    }
                                    "Sincronizados: $count registros."
                                }.onSuccess { message = it }
                                    .onFailure { message = "Falha na sincronização: ${it.message}" }
                            }
                        },
                    ) {
                        Text("Sincronizar agora")
                    }
                    if (healthConnect?.supportsBackgroundRead == true) {
                        TextButton(onClick = {
                            backgroundLauncher.launch(setOf(HealthConnectManager.backgroundPermission))
                        }) {
                            Text("Permitir sincronização em segundo plano")
                        }
                    }
                    TextButton(onClick = {
                        startActivity(Intent(this@MainActivity, PermissionsRationaleActivity::class.java))
                    }) {
                        Text(stringResource(R.string.health_connect_privacy_title))
                    }
                }
            }
        }
    }

    private fun scheduleBackgroundSync() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "health-connect-sync",
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }
}
