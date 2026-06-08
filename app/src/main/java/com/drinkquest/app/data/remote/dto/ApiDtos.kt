package com.drinkquest.app.data.remote.dto

import com.google.gson.annotations.SerializedName

// ─── Auth ───────────────────────────────────────────────────────
data class RegisterRequest(
    val email: String,
    val password: String,
    val displayName: String,
    val role: String? = null,
    val businessName: String? = null,
)

data class LoginRequest(
    val email: String,
    val password: String,
    /** USER = cliente; BAR = negocio (alineado con backend AuthLoginIntent). */
    val intent: String,
)

data class AuthUserSummaryDto(
    val id: String,
    val email: String,
    val role: String,
    val permissions: List<String> = emptyList(),
    val accountType: String? = null,
    val isAdmin: Boolean = false,
)

data class TokenResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: String,
    /** Presente en API >= sesión enriquecida; evita decodificar JWT en mobile. */
    val user: AuthUserSummaryDto? = null,
)

data class AuthMeResponseDto(
    val id: String,
    val email: String,
    val role: String,
    val permissions: List<String> = emptyList(),
    val isAdmin: Boolean = false,
    val accountType: String? = null,
    val profile: AuthMeProfileDto,
    val barId: String? = null,
)

data class AuthMeProfileDto(
    val displayName: String,
    val bio: String? = null,
    val avatarUrl: String? = null,
    val profileVisibility: String? = null,
    val totalXp: Int = 0,
    val level: Int = 1,
    val emailVerified: Boolean = false,
)

data class RefreshRequest(val refreshToken: String)

data class ForgotPasswordRequest(val email: String)

data class ResetPasswordRequest(val token: String, val newPassword: String)

data class VerifyEmailRequest(val token: String)

data class MessageResponse(val message: String)

// ─── Users ──────────────────────────────────────────────────────
data class UserProfileDto(
    val id: String,
    val email: String? = null,
    val displayName: String,
    val bio: String? = null,
    val avatarUrl: String? = null,
    val profileVisibility: String? = null,
    val totalXp: Int = 0,
    val level: Int = 1,
    val isOnline: Boolean = false,
    val emailVerified: Boolean = true,
)

data class UpdateProfileRequest(
    val displayName: String? = null,
    val bio: String? = null,
    val profileVisibility: String? = null,
)

data class UserSearchResultDto(
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val isOnline: Boolean = false,
)

// ─── Drinks ─────────────────────────────────────────────────────
data class PaginatedDrinksDto(
    val items: List<DrinkDto>,
    val total: Int,
    val page: Int,
    val limit: Int,
)

data class DrinkDto(
    val id: String,
    val legacyId: Int? = null,
    val slug: String,
    val name: String,
    val categoryId: String? = null,
    val rarity: String,
    val imageKey: String? = null,
    val imageUrl: String? = null,
    val description: String? = null,
    val ingredients: String? = null,
    val flavorProfile: String? = null,
    val alcoholLevel: String? = null,
    val baseAlcohol: String? = null,
    val difficulty: String? = null,
    val xpReward: Int = 10,
    val countryOrigin: String? = null,
    val category: DrinkCategoryDto? = null,
)

data class DrinkCategoryDto(val id: String, val slug: String, val name: String)

data class DrinkUnlockDto(
    val id: String,
    val drinkId: String,
    val xpEarned: Int,
    val unlockedAt: String,
    val drink: DrinkDto? = null,
)

data class DrinkHistoryDto(
    val id: String,
    val drinkId: String,
    val loggedAt: String,
    val drink: DrinkDto? = null,
)

// ─── Missions ───────────────────────────────────────────────────
data class MissionBundleDto(
    val mission: MissionDto,
    val userMission: UserMissionDto? = null,
)

data class MissionDto(
    val id: String,
    val slug: String,
    val title: String,
    val description: String,
    val targetCount: Int,
    val xpReward: Int,
)

data class UserMissionDto(
    val status: String,
    val progress: Int,
)

data class AchievementDto(
    val id: String,
    val slug: String,
    val title: String,
    val description: String,
    val unlockedAt: String? = null,
    val achievement: AchievementMetaDto? = null,
)

data class AchievementMetaDto(
    val slug: String,
    val title: String,
    val description: String,
    val xpReward: Int,
)

// ─── QR ───────────────────────────────────────────────────────────
data class QrCreateRequest(
    val drinkId: String? = null,
    val legacyDrinkId: Int? = null,
)

data class QrSessionResponse(
    val sessionId: String,
    val businessId: String,
    val drinkId: String,
    val drinkName: String,
    val timestamp: Long,
    val expiresAt: Long,
    val token: String,
)

data class QrRedeemResponse(
    val drinkId: String,
    val legacyDrinkId: Int? = null,
    val drinkName: String,
    val businessId: String,
    val businessName: String,
    val xpEarned: Int,
    val rarity: String,
    val totalXp: Int,
)

data class QrAnalyticsDto(
    val unlocksToday: Int,
    val mostPopularDrink: String,
    val uniqueUsers: Int,
    val totalScans: Int,
)

data class QrHistoryItemDto(
    val id: String,
    val status: String,
    val createdAt: String,
    val usedAt: String? = null,
    val drink: DrinkNameDto? = null,
    val scannedBy: UserNameDto? = null,
)

data class DrinkNameDto(val name: String)
data class UserNameDto(val displayName: String)

// ─── Friends ────────────────────────────────────────────────────
data class FriendRequestDto(
    val id: String,
    val senderId: String? = null,
    val receiverId: String? = null,
    val status: String,
    val message: String? = null,
    val sender: UserSearchResultDto? = null,
    val receiver: UserSearchResultDto? = null,
)

data class FriendDto(
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val isOnline: Boolean = false,
    val email: String? = null,
)

data class SendFriendRequestDto(val receiverId: String, val message: String? = null)
data class BlockUserDto(val targetId: String)

// ─── Chat ─────────────────────────────────────────────────────────
data class ChatRoomDto(
    val roomId: String,
    val friend: FriendDto? = null,
    val lastMessage: ChatMessageDto? = null,
)

data class ChatMessageDto(
    val id: String,
    val roomId: String,
    val senderId: String,
    val body: String? = null,
    val imageUrl: String? = null,
    val createdAt: String,
    val sender: UserSearchResultDto? = null,
    val reads: List<MessageReadDto>? = null,
)

data class MessageReadDto(
    val messageId: String? = null,
    val userId: String,
    val readAt: String? = null,
)

data class OpenChatRoomRequest(val friendId: String)
data class SendChatMessageRequest(val body: String? = null, val imageUrl: String? = null)
data class MarkMessageReadRequest(val roomId: String? = null)

data class MessengerSummaryDto(
    val chatUnread: Int = 0,
    val pendingRequests: Int = 0,
    val notificationUnread: Int = 0,
)

data class MessengerRoomDto(
    val roomId: String,
    val peer: UserSearchResultDto? = null,
    val lastMessage: ChatMessageDto? = null,
    val unreadCount: Int = 0,
    val isOnline: Boolean = false,
    val lastMessageReadByPeer: Boolean = false,
)

data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val payload: Map<String, Any?>? = null,
    val readAt: String? = null,
    val createdAt: String? = null,
)

data class NotificationsPageDto(
    val items: List<NotificationDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 30,
    val unreadCount: Int = 0,
)

// ─── Bars ───────────────────────────────────────────────────────
data class BarProfileDto(
    val id: String,
    val businessName: String,
    val slug: String,
    val description: String? = null,
    val address: String? = null,
    val isVerified: Boolean = false,
)

data class BarMenuItemDto(
    val id: String,
    val drinkId: String,
    val active: Boolean,
    val featured: Boolean,
    val drink: DrinkDto? = null,
)

data class SetBarMenuRequest(
    val drinkId: String,
    val active: Boolean,
    val featured: Boolean = false,
)

/** GET /bars/me/access — estado SaaS autoritativo del local. */
data class BarAccessStateDto(
    val barId: String,
    val status: String,
    val plan: String,
    val qrEnabled: Boolean,
    val promoEnabled: Boolean,
    val trialEndsAt: String? = null,
    val currentPeriodEnd: String? = null,
    val access: BarAccessFlagsDto,
)

data class BarAccessFlagsDto(
    val subscriptionActive: Boolean,
    val canGenerateQr: Boolean,
    val canUsePromotions: Boolean,
    val denialReason: String? = null,
    val denialMessage: String? = null,
)

// ─── Promotions ─────────────────────────────────────────────────
data class PromotionBarSummaryDto(
    val id: String,
    val businessName: String,
    val slug: String,
    val logoUrl: String? = null,
    val city: String? = null,
)

data class BarPromotionDto(
    val id: String,
    val barId: String,
    val title: String,
    val description: String? = null,
    val imageUrl: String? = null,
    val startsAt: String,
    val endsAt: String,
    val status: String,
    val priority: Int = 0,
    val placementType: String,
    val approvalStatus: String? = null,
    val rejectionReason: String? = null,
    val moderatedByAdminId: String? = null,
    val moderatedAt: String? = null,
    val rankingScore: Double = 0.0,
    val analytics: PromotionAnalyticsSummaryDto? = null,
    val bar: PromotionBarSummaryDto? = null,
)

data class PromotionAnalyticsSummaryDto(
    val impressions: Int = 0,
    val opens: Int = 0,
    val qrScans: Int = 0,
)

data class TrackPromotionEventRequest(
    val metadata: Map<String, @JvmSuppressWildcards Any?>? = null,
)

data class PromotionFeedPageDto(
    val items: List<BarPromotionDto>,
    val page: Int,
    val limit: Int,
    val total: Int,
)

data class CreatePromotionRequest(
    val title: String,
    val description: String? = null,
    val imageUrl: String? = null,
    val startsAt: String,
    val endsAt: String,
    val placementType: String? = "STANDARD",
    val priority: Int? = 0,
)

data class UpdatePromotionRequest(
    val title: String? = null,
    val description: String? = null,
    val imageUrl: String? = null,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val placementType: String? = null,
    val priority: Int? = null,
)

// ─── Feed ───────────────────────────────────────────────────────
data class FeedPageDto(
    val items: List<FeedPostDto>,
    val total: Int,
    val page: Int,
    val limit: Int,
)

data class FeedPostDto(
    val id: String,
    val body: String? = null,
    val imageUrl: String? = null,
    val author: FeedAuthorDto? = null,
    @SerializedName("_count")
    val counts: FeedPostCountsDto? = null,
)

data class FeedAuthorDto(
    val id: String? = null,
    val displayName: String,
    val avatarUrl: String? = null,
)

data class FeedPostCountsDto(
    val likes: Int = 0,
    val comments: Int = 0,
)

data class CreateFeedPostRequest(
    val body: String? = null,
    val imageUrl: String? = null,
)

data class FeedLikeResponse(val liked: Boolean = true)

// ─── Upload ─────────────────────────────────────────────────────
data class PresignRequest(val folder: String, val contentType: String)
data class PresignResponse(val key: String, val uploadUrl: String, val publicUrl: String)
data class DirectUploadResponse(val key: String, val publicUrl: String)
