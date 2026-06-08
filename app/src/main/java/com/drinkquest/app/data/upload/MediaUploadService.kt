package com.drinkquest.app.data.upload

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.drinkquest.app.data.remote.DrinkQuestApi
import com.drinkquest.app.data.remote.SafeApiCaller
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream

@Singleton
class MediaUploadService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: DrinkQuestApi,
    private val safeApi: SafeApiCaller,
) {
    suspend fun uploadFromUri(localUri: String, folder: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val uri = Uri.parse(localUri)
            val bytes = readCompressedImageBytes(uri)
            val mime = "image/jpeg"
            val folderBody = folder.toRequestBody("text/plain".toMediaType())
            val filePart = MultipartBody.Part.createFormData(
                "file",
                "image.jpg",
                bytes.toRequestBody(mime.toMediaType()),
            )
            val uploaded = safeApi.call {
                api.uploadDirect(folderBody, filePart)
            }.getOrElse { return@withContext Result.failure(it) }
            Result.success(uploaded.publicUrl)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Evita OOM en fotos de cámara/galería (p. ej. S24 Ultra). */
    private fun readCompressedImageBytes(uri: Uri, maxSide: Int = 1920, quality: Int = 82): ByteArray {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val sampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, maxSide)
        val decodeOpts = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, decodeOpts)
        } ?: throw IllegalArgumentException("No se pudo leer la imagen")
        val scaled = scaleDownIfNeeded(bitmap, maxSide)
        return ByteArrayOutputStream().use { out ->
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
            if (scaled !== bitmap) scaled.recycle()
            bitmap.recycle()
            out.toByteArray()
        }
    }

    private fun calculateInSampleSize(width: Int, height: Int, maxSide: Int): Int {
        if (width <= 0 || height <= 0) return 1
        var sample = 1
        val longest = maxOf(width, height)
        while (longest / sample > maxSide * 2) sample *= 2
        return sample
    }

    private fun scaleDownIfNeeded(source: Bitmap, maxSide: Int): Bitmap {
        val w = source.width
        val h = source.height
        val longest = maxOf(w, h)
        if (longest <= maxSide) return source
        val scale = maxSide.toFloat() / longest
        val nw = (w * scale).toInt().coerceAtLeast(1)
        val nh = (h * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, nw, nh, true)
    }
}
