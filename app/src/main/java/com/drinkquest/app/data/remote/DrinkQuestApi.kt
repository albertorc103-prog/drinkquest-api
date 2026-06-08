package com.drinkquest.app.data.remote

import com.drinkquest.app.data.remote.dto.*
import com.drinkquest.app.domain.qr.QrSessionPayload
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface DrinkQuestApi {

    @GET("health")
    suspend fun health(): Map<String, Any?>

    // Auth
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): TokenResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): TokenResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenResponse

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): MessageResponse

    @POST("auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): MessageResponse

    @POST("auth/verify-email")
    suspend fun verifyEmail(@Body body: VerifyEmailRequest): MessageResponse

    @POST("auth/resend-verification")
    suspend fun resendVerification(): MessageResponse

    @GET("auth/me")
    suspend fun authMe(): AuthMeResponseDto

    // Users
    @GET("users/me")
    suspend fun getMe(): UserProfileDto

    @PATCH("users/me")
    suspend fun updateMe(@Body body: UpdateProfileRequest): UserProfileDto

    @GET("users/search")
    suspend fun searchUsers(@Query("q") query: String): List<UserSearchResultDto>

    @GET("users/{id}")
    suspend fun getUser(@Path("id") id: String): UserProfileDto

    // Drinks
    @GET("drinks")
    suspend fun getDrinks(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): PaginatedDrinksDto

    @GET("drinks/categories")
    suspend fun getDrinkCategories(): List<DrinkCategoryDto>

    @GET("drinks/me/unlocks")
    suspend fun getMyUnlocks(): List<DrinkUnlockDto>

    @GET("drinks/me/history")
    suspend fun getMyHistory(@Query("page") page: Int = 1): Map<String, Any?>

    // Missions
    @GET("missions")
    suspend fun getMissions(): List<MissionBundleDto>

    @GET("missions/achievements")
    suspend fun getAchievements(): List<AchievementDto>

    @POST("missions/{id}/claim")
    suspend fun claimMission(@Path("id") id: String): Map<String, Any?>

    // QR
    @POST("qr/sessions")
    suspend fun createQrSession(@Body body: QrCreateRequest): QrSessionResponse

    @POST("qr/redeem")
    suspend fun redeemQr(@Body body: QrSessionPayload): QrRedeemResponse

    @GET("qr/history")
    suspend fun getQrHistory(): List<QrHistoryItemDto>

    @GET("qr/analytics")
    suspend fun getQrAnalytics(): QrAnalyticsDto

    // Friends
    @GET("friends")
    suspend fun getFriends(): List<FriendDto>

    @GET("friends/requests")
    suspend fun getFriendRequests(): List<FriendRequestDto>

    @POST("friends/requests")
    suspend fun sendFriendRequest(@Body body: SendFriendRequestDto): FriendRequestDto

    @POST("friends/requests/{id}/accept")
    suspend fun acceptFriendRequest(@Path("id") id: String)

    @POST("friends/requests/{id}/reject")
    suspend fun rejectFriendRequest(@Path("id") id: String)

    @POST("friends/requests/{id}/cancel")
    suspend fun cancelFriendRequest(@Path("id") id: String)

    @GET("friends/requests/sent")
    suspend fun getSentFriendRequests(): List<FriendRequestDto>

    @POST("friends/block")
    suspend fun blockUser(@Body body: BlockUserDto): Map<String, Any?>

    // Chat / Messenger
    @GET("chat/summary")
    suspend fun getMessengerSummary(): MessengerSummaryDto

    @GET("chat/rooms")
    suspend fun getChatRooms(): List<MessengerRoomDto>

    @POST("chat/rooms")
    suspend fun openChatRoom(@Body body: OpenChatRoomRequest): ChatRoomOpenDto

    @GET("chat/rooms/{roomId}/messages")
    suspend fun getChatMessages(
        @Path("roomId") roomId: String,
        @Query("cursor") cursor: String? = null,
    ): List<ChatMessageDto>

    @POST("chat/rooms/{roomId}/messages")
    suspend fun sendChatMessage(
        @Path("roomId") roomId: String,
        @Body body: SendChatMessageRequest,
    ): ChatMessageDto

    @POST("chat/rooms/{roomId}/read")
    suspend fun markChatRoomRead(@Path("roomId") roomId: String)

    @POST("chat/messages/{messageId}/read")
    suspend fun markMessageRead(
        @Path("messageId") messageId: String,
        @Body body: MarkMessageReadRequest,
    )

    // Notifications
    @GET("notifications")
    suspend fun getNotifications(@Query("page") page: Int = 1): NotificationsPageDto

    @PATCH("notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: String)

    @POST("notifications/read-all")
    suspend fun markAllNotificationsRead()

    // Bars
    @GET("bars/me")
    suspend fun getMyBar(): BarWithMenuDto

    @GET("bars/me/access")
    suspend fun getBarAccessState(): BarAccessStateDto

    @GET("promotions/feed")
    suspend fun getPromotionFeed(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("sort") sort: String = "ranking",
    ): PromotionFeedPageDto

    @POST("promotions/{id}/impression")
    suspend fun trackPromotionImpression(
        @Path("id") promotionId: String,
        @Body body: TrackPromotionEventRequest = TrackPromotionEventRequest(),
    ): Map<String, Any?>

    @POST("promotions/{id}/open")
    suspend fun trackPromotionOpen(
        @Path("id") promotionId: String,
        @Body body: TrackPromotionEventRequest = TrackPromotionEventRequest(),
    ): Map<String, Any?>

    @POST("promotions/{id}/qr-scan")
    suspend fun trackPromotionQrScan(
        @Path("id") promotionId: String,
        @Body body: TrackPromotionEventRequest = TrackPromotionEventRequest(),
    ): Map<String, Any?>

    @GET("bars/promotions")
    suspend fun listBarPromotions(): List<BarPromotionDto>

    @POST("bars/promotions")
    suspend fun createBarPromotion(@Body body: CreatePromotionRequest): BarPromotionDto

    @PATCH("bars/promotions/{id}")
    suspend fun updateBarPromotion(
        @Path("id") id: String,
        @Body body: UpdatePromotionRequest,
    ): BarPromotionDto

    @PATCH("bars/promotions/{id}/activate")
    suspend fun activateBarPromotion(@Path("id") id: String): BarPromotionDto

    @PATCH("bars/promotions/{id}/pause")
    suspend fun pauseBarPromotion(@Path("id") id: String): BarPromotionDto

    @PATCH("bars/promotions/{id}/resubmit")
    suspend fun resubmitBarPromotion(@Path("id") id: String): BarPromotionDto

    @DELETE("bars/promotions/{id}")
    suspend fun deleteBarPromotion(@Path("id") id: String): Map<String, Any?>

    @GET("bars/dashboard")
    suspend fun getBarDashboard(): Map<String, Any?>

    @POST("bars/menu/seed-default")
    suspend fun seedBarMenu(): Map<String, Any?>

    @POST("bars/menu")
    suspend fun setBarMenuItem(@Body body: SetBarMenuRequest): Map<String, Any?>

    // Feed
    @GET("feed")
    suspend fun getFeed(@Query("page") page: Int = 1): FeedPageDto

    @POST("feed/posts")
    suspend fun createFeedPost(@Body body: CreateFeedPostRequest): FeedPostDto

    @POST("feed/posts/{id}/like")
    suspend fun likeFeedPost(@Path("id") id: String): FeedLikeResponse

    // Upload (multipart → R2 vía API; no presign)
    @Multipart
    @POST("uploads/direct")
    suspend fun uploadDirect(
        @Part("folder") folder: RequestBody,
        @Part file: MultipartBody.Part,
    ): DirectUploadResponse

    // Admin
    @GET("admin/analytics")
    suspend fun adminAnalytics(): AdminAnalyticsDto

    @GET("admin/users")
    suspend fun adminUsers(@Query("page") page: Int = 1): List<AdminUserRowDto>

    @GET("admin/bars")
    suspend fun adminBars(): List<AdminBarRowDto>

    @GET("admin/reports")
    suspend fun adminReports(@Query("status") status: String? = null): List<AdminReportRowDto>

    @PATCH("admin/reports/{id}")
    suspend fun adminResolveReport(
        @Path("id") id: String,
        @Body body: ResolveReportRequest,
    ): Map<String, Any?>

    @PATCH("admin/users/{id}/role")
    suspend fun adminSetUserRole(
        @Path("id") id: String,
        @Body body: SetUserRoleRequest,
    ): Map<String, Any?>

    @GET("admin/promotions/pending")
    suspend fun adminPendingPromotions(@Query("limit") limit: Int = 50): List<AdminPromotionRowDto>

    @PATCH("admin/promotions/{id}/approve")
    suspend fun adminApprovePromotion(@Path("id") id: String): AdminPromotionRowDto

    @PATCH("admin/promotions/{id}/reject")
    suspend fun adminRejectPromotion(
        @Path("id") id: String,
        @Body body: RejectPromotionRequest,
    ): AdminPromotionRowDto
}

/** Respuesta real del listado de salas (participante + room anidado). */
data class ChatParticipantRoomDto(
    val roomId: String,
    val room: ChatRoomNestedDto? = null,
)

data class ChatRoomNestedDto(
    val id: String,
    val participants: List<ChatParticipantUserDto>? = null,
    val messages: List<ChatMessageDto>? = null,
)

data class ChatParticipantUserDto(
    val userId: String,
    val user: UserSearchResultDto? = null,
)

data class ChatRoomOpenDto(
    val id: String,
    val participants: List<ChatParticipantUserDto>? = null,
)

data class BarWithMenuDto(
    val id: String,
    val businessName: String,
    val slug: String,
    val menuItems: List<BarMenuItemDto>? = null,
)
