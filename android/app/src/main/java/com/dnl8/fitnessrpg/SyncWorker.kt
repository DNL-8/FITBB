package com.dnl8.fitnessrpg

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CancellationException
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        if (HealthConnectClient.getSdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) {
            return Result.success()
        }
        return try {
            FirebaseConfig.initialize(applicationContext)
            val healthConnect = HealthConnectManager(applicationContext)
            if (FirebaseAuth.getInstance().currentUser?.isEmailVerified != true ||
                !healthConnect.canReadInBackground()) return Result.success()
            SyncRepository().sync(healthConnect)
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (_: SecurityException) {
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}
