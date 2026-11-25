package com.dnl8.fitnessrpg

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

object FirebaseConfig {
    private const val API_KEY = "AIzaSyCRvgNvat6cKKLqH3ZBVUNN-JYgnWS_MCE"
    private const val APPLICATION_ID = "1:960439871346:android:cdfb7d443f2c7895e09feb"
    private const val PROJECT_ID = "gen-lang-client-0157960220"
    // Mesmo banco nomeado utilizado pela aplicação web.
    const val FIRESTORE_DATABASE_ID = "ai-studio-b580bba9-8332-481d-ad1f-ef820c1125bb"
    private const val STORAGE_BUCKET = "gen-lang-client-0157960220.firebasestorage.app"
    private const val GCM_SENDER_ID = "960439871346"

    fun initialize(context: Context): FirebaseApp {
        return FirebaseApp.getApps(context).firstOrNull()
            ?: FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setApiKey(API_KEY)
                    .setApplicationId(APPLICATION_ID)
                    .setProjectId(PROJECT_ID)
                    .setStorageBucket(STORAGE_BUCKET)
                    .setGcmSenderId(GCM_SENDER_ID)
                    .build()
            )
            ?: error("Não foi possível inicializar o Firebase.")
    }
}
