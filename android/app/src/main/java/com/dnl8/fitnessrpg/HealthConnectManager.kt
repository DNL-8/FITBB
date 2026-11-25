package com.dnl8.fitnessrpg

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.time.temporal.ChronoUnit

data class HealthRecord(
    val id: String,
    val type: String,
    val startTime: Instant,
    val endTime: Instant,
    val values: Map<String, Any>,
)

class HealthConnectManager(context: Context) {
    private val client = HealthConnectClient.getOrCreate(context)

    val supportsBackgroundRead: Boolean
        get() = client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    suspend fun canReadInBackground(): Boolean {
        if (!supportsBackgroundRead) return false
        val granted = client.permissionController.getGrantedPermissions()
        return backgroundPermission in granted && permissions.any { it in granted }
    }

    companion object {
        val backgroundPermission = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

        val permissions = setOf(
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        )
    }

    suspend fun readRecentRecords(): List<HealthRecord> {
        val grantedPermissions = client.permissionController.getGrantedPermissions()
        check(permissions.any { it in grantedPermissions }) {
            "Conceda acesso a pelo menos um tipo de dado no Health Connect antes de sincronizar."
        }
        val start = Instant.now().minus(30, ChronoUnit.DAYS)
        val range = TimeRangeFilter.after(start)
        val records = mutableListOf<HealthRecord>()

        readPermittedRecords<ExerciseSessionRecord>(grantedPermissions, range).forEach {
            records += HealthRecord(
                it.metadata.id,
                "exercise",
                it.startTime,
                it.endTime,
                mapOf("exerciseType" to it.exerciseType, "title" to (it.title ?: "")),
            )
        }
        readPermittedRecords<StepsRecord>(grantedPermissions, range).forEach {
            records += HealthRecord(
                it.metadata.id,
                "steps",
                it.startTime,
                it.endTime,
                mapOf("count" to it.count),
            )
        }
        readPermittedRecords<HeartRateRecord>(grantedPermissions, range).forEach { record ->
            record.samples.chunked(4000).forEachIndexed { index, samples ->
                val id = if (index == 0) record.metadata.id else "${record.metadata.id}_$index"
                records += HealthRecord(
                    id, "heart_rate", record.startTime, record.endTime,
                    mapOf("samples" to samples.map { sample ->
                        mapOf("beatsPerMinute" to sample.beatsPerMinute, "time" to sample.time.toString())
                    }),
                )
            }
        }
        readPermittedRecords<TotalCaloriesBurnedRecord>(grantedPermissions, range).forEach {
            records += HealthRecord(
                it.metadata.id,
                "calories",
                it.startTime,
                it.endTime,
                mapOf("kilocalories" to it.energy.inKilocalories),
            )
        }
        records += readDailyTotals(grantedPermissions)
        return records
    }

    private suspend fun readDailyTotals(grantedPermissions: Set<String>): List<HealthRecord> {
        val metrics = mutableSetOf<AggregateMetric<*>>()
        if (HealthPermission.getReadPermission(StepsRecord::class) in grantedPermissions) {
            metrics += StepsRecord.COUNT_TOTAL
        }
        if (HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class) in grantedPermissions) {
            metrics += TotalCaloriesBurnedRecord.ENERGY_TOTAL
        }
        if (metrics.isEmpty()) return emptyList()

        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val groups = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics,
                TimeRangeFilter.between(today.minusDays(29).atStartOfDay(), today.plusDays(1).atStartOfDay()),
                Period.ofDays(1),
            )
        )
        return buildList {
            for (group in groups) {
                val day = group.startTime.toLocalDate()
                val from = group.startTime.atZone(zone).toInstant()
                val to = group.endTime.atZone(zone).toInstant()
                if (StepsRecord.COUNT_TOTAL in metrics) {
                    val steps = group.result[StepsRecord.COUNT_TOTAL] ?: 0L
                    add(HealthRecord("hc_daily_${day}_steps", "steps", from, to,
                        mapOf("count" to steps.coerceIn(0L, 200000L))))
                }
                if (TotalCaloriesBurnedRecord.ENERGY_TOTAL in metrics) {
                    val calories = group.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0
                    add(HealthRecord("hc_daily_${day}_calories", "calories", from, to,
                        mapOf("kilocalories" to calories.coerceIn(0.0, 20000.0))))
                }
            }
        }
    }

    private suspend inline fun <reified T : Record> readPermittedRecords(
        grantedPermissions: Set<String>,
        range: TimeRangeFilter,
    ): List<T> {
        if (HealthPermission.getReadPermission(T::class) !in grantedPermissions) {
            return emptyList()
        }
        val records = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val page = client.readRecords(ReadRecordsRequest(T::class, range, pageToken = pageToken))
            records += page.records
            pageToken = page.pageToken
        } while (pageToken != null)
        return records
    }
}
