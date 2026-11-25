package com.dnl8.fitnessrpg

import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import java.time.Instant
import kotlinx.coroutines.tasks.await

class SyncRepository {
    private val auth = FirebaseAuth.getInstance()
    private val firestore = FirebaseFirestore.getInstance(
        FirebaseApp.getInstance(),
        FirebaseConfig.FIRESTORE_DATABASE_ID,
    )

    suspend fun sync(healthConnect: HealthConnectManager): Int {
        val user = auth.currentUser ?: error("Faça login com Google antes de sincronizar.")
        check(user.isEmailVerified) { "Verifique seu e-mail antes de sincronizar." }
        val records = healthConnect.readRecentRecords()
        val userProfile = firestore.collection("users").document(user.uid)
        val recordsCollection = userProfile.collection("healthConnectRecords")
        val now = Instant.now().toString()
        val displayName = user.displayName?.trim().orEmpty().ifBlank { "Jogador" }.take(80)

        firestore.runTransaction<Unit> { transaction ->
            if (!transaction.get(userProfile).exists()) {
                transaction.set(
                    userProfile,
                    mapOf(
                        "userId" to user.uid,
                        "email" to user.email,
                        "displayName" to displayName,
                        "createdAt" to now,
                        "lastLoginAt" to now,
                    ),
                )
            }
        }.await()

        for (chunk in records.chunked(8)) {
            val batch = firestore.batch()
            val updatedAt = System.currentTimeMillis()
            for (record in chunk) {
                batch.set(recordsCollection.document(record.id), mapOf(
                    "userId" to user.uid,
                    "recordId" to record.id,
                    "type" to record.type,
                    "startTime" to record.startTime.toString(),
                    "endTime" to record.endTime.toString(),
                    "values" to record.values,
                    "updatedAt" to updatedAt,
                ))
            }
            batch.commit().await()
        }
        return records.size
    }
}
