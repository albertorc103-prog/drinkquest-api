package com.drinkquest.app.data.upload

/** Carpetas permitidas por POST /uploads/direct (backend → R2/S3). */
object UploadFolder {
    const val AVATARS = "avatars"
    const val CHAT = "chat"
    const val FEED = "feed"
    const val DRINKS = "drinks"
    const val PROMOTIONS = FEED
}
