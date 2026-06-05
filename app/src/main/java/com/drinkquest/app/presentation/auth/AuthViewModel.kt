package com.drinkquest.app.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drinkquest.app.domain.auth.AuthResult
import com.drinkquest.app.domain.auth.LoginIntent
import com.drinkquest.app.domain.auth.LoginMode
import com.drinkquest.app.domain.model.UserRole
import com.drinkquest.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val credentialsError: String? = null,
    val isLoading: Boolean = false,
)

data class ForgotPasswordUiState(
    val email: String = "",
    val error: String? = null,
    val successMessage: String? = null,
    val isLoading: Boolean = false,
)

data class ResetPasswordUiState(
    val token: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val error: String? = null,
    val successMessage: String? = null,
    val isLoading: Boolean = false,
)

data class VerifyEmailUiState(
    val token: String = "",
    val error: String? = null,
    val successMessage: String? = null,
    val isLoading: Boolean = false,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(LoginUiState())
    val ui: StateFlow<LoginUiState> = _ui.asStateFlow()

    private val _forgotUi = MutableStateFlow(ForgotPasswordUiState())
    val forgotUi: StateFlow<ForgotPasswordUiState> = _forgotUi.asStateFlow()

    private val _resetUi = MutableStateFlow(ResetPasswordUiState())
    val resetUi: StateFlow<ResetPasswordUiState> = _resetUi.asStateFlow()

    private val _verifyUi = MutableStateFlow(VerifyEmailUiState())
    val verifyUi: StateFlow<VerifyEmailUiState> = _verifyUi.asStateFlow()

    fun setEmail(value: String) {
        _ui.update { it.copy(email = value, emailError = null, credentialsError = null) }
    }

    fun setPassword(value: String) {
        _ui.update { it.copy(password = value, passwordError = null, credentialsError = null) }
    }

    fun attemptLogin(loginMode: LoginMode, onSuccess: () -> Unit) {
        viewModelScope.launch {
            val state = _ui.value
            val email = state.email.trim()
            val password = state.password
            val intent = LoginIntent.fromLoginMode(loginMode)
            var emailErr: String? = null
            var passErr: String? = null
            if (email.isEmpty()) emailErr = "El correo es obligatorio."
            if (password.isEmpty()) passErr = "La contraseña es obligatoria."
            if (emailErr != null || passErr != null) {
                _ui.update {
                    it.copy(emailError = emailErr, passwordError = passErr, credentialsError = null)
                }
                return@launch
            }
            _ui.update { it.copy(isLoading = true, credentialsError = null) }
            when (val r = authRepository.login(email, password, intent)) {
                is AuthResult.Success -> {
                    val role = authRepository.refreshRoleFromRemote()
                        ?: authRepository.currentRole.first()
                    if (loginMode == LoginMode.ADMIN && role != UserRole.ADMIN) {
                        authRepository.logout()
                        _ui.update {
                            it.copy(
                                isLoading = false,
                                credentialsError = "Esta cuenta no tiene acceso al panel administrativo.",
                            )
                        }
                        return@launch
                    }
                    _ui.update { it.copy(isLoading = false) }
                    onSuccess()
                }
                is AuthResult.Error -> {
                    _ui.update {
                        it.copy(isLoading = false, credentialsError = r.message)
                    }
                }
            }
        }
    }

    fun setForgotEmail(value: String) {
        _forgotUi.update { it.copy(email = value, error = null, successMessage = null) }
    }

    fun submitForgotPassword() {
        viewModelScope.launch {
            val email = _forgotUi.value.email.trim()
            if (email.isEmpty()) {
                _forgotUi.update { it.copy(error = "El correo es obligatorio.") }
                return@launch
            }
            _forgotUi.update { it.copy(isLoading = true, error = null) }
            when (val r = authRepository.forgotPassword(email)) {
                is AuthResult.Success -> {
                    _forgotUi.update {
                        it.copy(
                            isLoading = false,
                            successMessage = "Si el correo existe, recibirás instrucciones en breve.",
                        )
                    }
                }
                is AuthResult.Error -> {
                    _forgotUi.update { it.copy(isLoading = false, error = r.message) }
                }
            }
        }
    }

    fun setResetToken(value: String) {
        _resetUi.update { it.copy(token = value, error = null, successMessage = null) }
    }

    fun setResetPassword(value: String) {
        _resetUi.update { it.copy(password = value, error = null) }
    }

    fun setResetConfirmPassword(value: String) {
        _resetUi.update { it.copy(confirmPassword = value, error = null) }
    }

    fun submitResetPassword(onSuccess: () -> Unit) {
        viewModelScope.launch {
            val s = _resetUi.value
            when {
                s.token.isBlank() -> _resetUi.update { it.copy(error = "El código es obligatorio.") }
                s.password.length < 6 -> _resetUi.update { it.copy(error = "Mínimo 6 caracteres.") }
                s.password != s.confirmPassword -> _resetUi.update { it.copy(error = "Las contraseñas no coinciden.") }
                else -> {
                    _resetUi.update { it.copy(isLoading = true, error = null) }
                    when (val r = authRepository.resetPassword(s.token.trim(), s.password)) {
                        is AuthResult.Success -> {
                            _resetUi.update {
                                it.copy(isLoading = false, successMessage = "Contraseña actualizada.")
                            }
                            onSuccess()
                        }
                        is AuthResult.Error -> _resetUi.update { it.copy(isLoading = false, error = r.message) }
                    }
                }
            }
        }
    }

    fun setVerifyToken(value: String) {
        _verifyUi.update { it.copy(token = value, error = null, successMessage = null) }
    }

    fun submitVerifyEmail(onSuccess: () -> Unit) {
        viewModelScope.launch {
            val token = _verifyUi.value.token.trim()
            if (token.isBlank()) {
                _verifyUi.update { it.copy(error = "Introduce el código de verificación.") }
                return@launch
            }
            _verifyUi.update { it.copy(isLoading = true, error = null) }
            when (val r = authRepository.verifyEmail(token)) {
                is AuthResult.Success -> {
                    _verifyUi.update {
                        it.copy(isLoading = false, successMessage = "Correo verificado correctamente.")
                    }
                    onSuccess()
                }
                is AuthResult.Error -> _verifyUi.update { it.copy(isLoading = false, error = r.message) }
            }
        }
    }

    fun resendVerification() {
        viewModelScope.launch {
            _verifyUi.update { it.copy(isLoading = true, error = null) }
            when (val r = authRepository.resendVerification()) {
                is AuthResult.Success -> {
                    _verifyUi.update {
                        it.copy(
                            isLoading = false,
                            successMessage = "Correo de verificación reenviado.",
                        )
                    }
                }
                is AuthResult.Error -> _verifyUi.update { it.copy(isLoading = false, error = r.message) }
            }
        }
    }
}
