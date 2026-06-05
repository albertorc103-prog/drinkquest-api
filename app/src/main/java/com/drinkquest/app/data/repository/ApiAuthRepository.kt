package com.drinkquest.app.data.repository

import android.database.sqlite.SQLiteConstraintException
import androidx.room.withTransaction
import com.drinkquest.app.data.auth.PasswordHasher
import com.drinkquest.app.data.local.DrinkQuestDatabase
import com.drinkquest.app.data.local.entity.UserEntity
import com.drinkquest.app.data.local.entity.UserStatsEntity
import com.drinkquest.app.data.remote.ApiException
import com.drinkquest.app.data.remote.DrinkQuestApi
import com.drinkquest.app.data.remote.SafeApiCaller
import com.drinkquest.app.data.remote.TokenStore
import com.drinkquest.app.data.remote.dto.ForgotPasswordRequest
import com.drinkquest.app.data.remote.dto.LoginRequest
import com.drinkquest.app.data.remote.dto.RefreshRequest
import com.drinkquest.app.data.remote.dto.RegisterRequest
import com.drinkquest.app.data.remote.dto.ResetPasswordRequest
import com.drinkquest.app.data.remote.dto.TokenResponse
import com.drinkquest.app.data.remote.dto.VerifyEmailRequest
import com.drinkquest.app.data.session.SessionManager
import com.drinkquest.app.domain.auth.AuthResult
import com.drinkquest.app.domain.auth.LoginIntent
import com.drinkquest.app.domain.auth.RegisterAccountParams
import com.drinkquest.app.domain.model.UserRole
import com.drinkquest.app.domain.repository.AuthRepository
import com.drinkquest.app.domain.repository.SubscriptionRepository
import com.drinkquest.app.domain.repository.SyncRepository
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject

@Singleton
class ApiAuthRepository @Inject constructor(
    private val api: DrinkQuestApi,
    private val tokenStore: TokenStore,
    private val safeApi: SafeApiCaller,
    private val database: DrinkQuestDatabase,
    private val sessionManager: SessionManager,
    private val syncRepository: SyncRepository,
    private val subscriptionRepository: SubscriptionRepository,
) : AuthRepository {

    private val userDao get() = database.userDao()
    private val statsDao get() = database.userStatsDao()

    override val currentRole: Flow<UserRole?> =
        sessionManager.session.map { s -> s.role.takeIf { s.isLoggedIn } }

    override suspend fun login(email: String, password: String, intent: LoginIntent): AuthResult =
        safeApi.call {
            val tokens = api.login(
                LoginRequest(
                    email = email.trim().lowercase(),
                    password = password,
                    intent = intent.apiValue,
                ),
            )
            persistSession(email, password, tokens)
        }.fold(
            onSuccess = { it },
            onFailure = { AuthResult.Error(it.message ?: "Error de login") },
        )

    override suspend fun tryRestoreSession(): AuthResult {
        val refresh = tokenStore.refreshToken() ?: return AuthResult.Error("Sin sesión")
        return safeApi.call {
            val tokens = api.refresh(RefreshRequest(refresh))
            val email = sessionManager.getStoredEmailOrNull()
                ?: return@call AuthResult.Error("Sesión incompleta")
            persistSession(email, "", tokens, linkOnly = true)
        }.fold(
            onSuccess = { it },
            onFailure = { AuthResult.Error(it.message ?: "No se pudo restaurar sesión") },
        )
    }

    override suspend fun forgotPassword(email: String): AuthResult =
        safeApi.call {
            api.forgotPassword(ForgotPasswordRequest(email.trim().lowercase()))
        }.fold(
            onSuccess = { AuthResult.Success },
            onFailure = { AuthResult.Error(it.message ?: "Error") },
        )

    override suspend fun resetPassword(token: String, newPassword: String): AuthResult =
        safeApi.call {
            api.resetPassword(ResetPasswordRequest(token, newPassword))
        }.fold(
            onSuccess = { AuthResult.Success },
            onFailure = { AuthResult.Error(it.message ?: "Error") },
        )

    override suspend fun verifyEmail(token: String): AuthResult =
        safeApi.call {
            api.verifyEmail(VerifyEmailRequest(token))
        }.fold(
            onSuccess = { AuthResult.Success },
            onFailure = { AuthResult.Error(it.message ?: "Error") },
        )

    override suspend fun resendVerification(): AuthResult =
        safeApi.call { api.resendVerification() }.fold(
            onSuccess = { AuthResult.Success },
            onFailure = { AuthResult.Error(it.message ?: "Error") },
        )

    override suspend fun register(params: RegisterAccountParams): AuthResult {
        return try {
            val roleStr = when (params.role) {
                UserRole.BUSINESS -> "BAR"
                else -> "USER"
            }
            val tokens = api.register(
                RegisterRequest(
                    email = params.email.trim().lowercase(),
                    password = params.password,
                    displayName = params.username,
                    role = roleStr,
                    businessName = params.businessName,
                ),
            )
            val apiUserId = resolveUserId(tokens) ?: return AuthResult.Error("Token inválido")
            val role = resolveAppRole(tokens) ?: params.role
            tokenStore.save(tokens.accessToken, tokens.refreshToken, apiUserId)
            if (role == UserRole.BUSINESS) {
                subscriptionRepository.cacheFromJwt(tokens.accessToken)
                runCatching { subscriptionRepository.refreshAccessState() }
            }
            val localId = insertLocalUser(params, apiUserId, role)
            sessionManager.setLoggedIn(
                userId = localId,
                email = params.email.trim().lowercase(),
                role = role,
                firebaseUid = apiUserId,
            )
            syncRepository.syncAfterAuth()
            if (role == UserRole.BUSINESS) {
                runCatching { api.seedBarMenu() }
            }
            AuthResult.Success
        } catch (_: SQLiteConstraintException) {
            AuthResult.Error("Este correo ya está registrado.")
        } catch (e: Exception) {
            AuthResult.Error(e.message ?: "No se pudo registrar")
        }
    }

    override suspend fun logout() {
        tokenStore.clear()
        subscriptionRepository.clear()
        sessionManager.clearSession()
    }

    override suspend fun isEmailAvailable(email: String): Boolean =
        userDao.getByEmail(email.trim().lowercase()) == null

    override suspend fun refreshRoleFromRemote(): UserRole? {
        val token = tokenStore.accessToken() ?: return null
        safeApi.call { api.authMe() }.getOrNull()?.let { me ->
            val role = resolveAppRole(me.role, me.isAdmin)
            sessionManager.updateRole(role)
            val localId = sessionManager.getLoggedUserIdOrNull() ?: return role
            userDao.getUserById(localId)?.let { user ->
                userDao.update(user.copy(role = role.firestoreValue))
            }
            return role
        }
        val role = decodeRole(token) ?: return null
        sessionManager.updateRole(role)
        val localId = sessionManager.getLoggedUserIdOrNull() ?: return role
        userDao.getUserById(localId)?.let { user ->
            userDao.update(user.copy(role = role.firestoreValue))
        }
        return role
    }

    private suspend fun linkLocalUser(
        email: String,
        password: String,
        role: UserRole,
        apiUserId: String,
    ): Long {
        val normalized = email.trim().lowercase()
        val existing = userDao.getByEmail(normalized)
        if (existing != null) {
            userDao.update(existing.copy(firebaseUid = apiUserId, role = role.firestoreValue))
            return existing.id
        }
        return insertLocalUser(
            RegisterAccountParams(
                role = role,
                username = normalized.substringBefore('@'),
                email = normalized,
                password = password,
                birthDateEpochDay = 0L,
                city = "",
                avatarUri = null,
                favoriteDrink = null,
            ),
            apiUserId,
            role,
        )
    }

    private suspend fun insertLocalUser(
        params: RegisterAccountParams,
        apiUserId: String,
        role: UserRole,
    ): Long = database.withTransaction {
        val id = userDao.insert(
            UserEntity(
                username = params.username.trim(),
                email = params.email.trim().lowercase(),
                passwordHash = PasswordHasher.sha256(params.password),
                birthDateEpochDay = params.birthDateEpochDay,
                city = params.city.trim(),
                avatarUri = params.avatarUri,
                favoriteDrink = params.favoriteDrink?.trim()?.takeIf { it.isNotEmpty() },
                level = 1,
                xp = 0,
                rankPosition = 220,
                totalDrinks = 0,
                totalBarsVisited = 0,
                createdAt = System.currentTimeMillis(),
                firebaseUid = apiUserId,
                role = role.firestoreValue,
            ),
        )
        statsDao.insert(
            UserStatsEntity(
                userId = id,
                drinksLogged = 0,
                uniqueDrinks = 0,
                barsVisited = 0,
                averageRating = 0.0,
                rarityScorePercent = 0,
            ),
        )
        id
    }

    private fun decodeSub(jwt: String): String? =
        decodeJwtPayload(jwt)?.optString("sub")?.takeIf { it.isNotBlank() }

    private fun decodeRole(jwt: String): UserRole? {
        val payload = decodeJwtPayload(jwt) ?: return null
        val role = payload.optString("role").takeIf { it.isNotBlank() } ?: return null
        val isAdmin = payload.optBoolean("isAdmin", false)
        return resolveAppRole(role, isAdmin)
    }

    private fun resolveAppRole(apiRole: String, isAdmin: Boolean = false): UserRole {
        val normalized = apiRole.uppercase()
        return when {
            isAdmin || normalized == "ADMIN" || normalized == "SUPER_ADMIN" -> UserRole.ADMIN
            normalized == "BAR" -> UserRole.BUSINESS
            else -> UserRole.USER
        }
    }

    private fun resolveAppRole(tokens: TokenResponse): UserRole? =
        tokens.user?.let { resolveAppRole(it.role, it.isAdmin) }
            ?: decodeRole(tokens.accessToken)

    private fun resolveUserId(tokens: TokenResponse): String? =
        tokens.user?.id ?: decodeSub(tokens.accessToken)

    private fun decodeJwtPayload(jwt: String): JSONObject? {
        val parts = jwt.split('.')
        if (parts.size < 2) return null
        val json = String(Base64.getUrlDecoder().decode(parts[1]))
        return runCatching { JSONObject(json) }.getOrNull()
    }

    private suspend fun persistSession(
        email: String,
        password: String,
        tokens: TokenResponse,
        linkOnly: Boolean = false,
    ): AuthResult {
        val apiUserId = resolveUserId(tokens) ?: return AuthResult.Error("Token inválido")
        val role = resolveAppRole(tokens) ?: UserRole.USER
        tokenStore.save(tokens.accessToken, tokens.refreshToken, apiUserId)
        if (role == UserRole.BUSINESS) {
            subscriptionRepository.cacheFromJwt(tokens.accessToken)
            runCatching { subscriptionRepository.refreshAccessState() }
        }
        val localId = if (linkOnly) {
            val existing = userDao.getByEmail(email.trim().lowercase())
            existing?.id ?: return AuthResult.Error("Usuario local no encontrado")
        } else {
            linkLocalUser(email, password, role, apiUserId)
        }
        sessionManager.setLoggedIn(
            userId = localId,
            email = email.trim().lowercase(),
            role = role,
            firebaseUid = apiUserId,
        )
        syncRepository.syncAfterAuth()
        if (!linkOnly && role == UserRole.BUSINESS) {
            runCatching { api.seedBarMenu() }
        }
        return AuthResult.Success
    }

    private fun Throwable.message(): String = when (this) {
        is ApiException -> message ?: "Error"
        else -> message ?: "Error"
    }
}
