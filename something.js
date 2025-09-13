// Clean Authentication Modal System
(function() {
    'use strict';
    
    console.log('Clean auth modal system loading...');

    // Initialize auth bootstrap
    import('./lib/authBoot.js').catch(err => console.warn('Auth bootstrap failed:', err));

    // Check for Google sign-in redirect result on page load
    if (window.Auth && window.Auth.auth) {
        window.Auth.auth.getRedirectResult().then(function(result) {
            if (result.user) {
                console.log('Google redirect sign-in successful:', result.user);
                // Ensure user document exists for redirect sign-ins
                if (window.Auth.ensureUserDoc) {
                    window.Auth.ensureUserDoc(result.user).then(() => {
                        console.log('User document ensured after redirect');
                        window.location.reload();
                    }).catch((error) => {
                        console.error('Error ensuring user doc after redirect:', error);
                        window.location.reload(); // Still reload to reflect auth state
                    });
                } else {
                    window.location.reload();
                }
            } else {
                console.log('No redirect result found');
            }
        }).catch(function(error) {
            console.error('Redirect result error:', error);
            // Don't show error to user for redirect failures, just log them
        });

        // Also check current auth state immediately
        setTimeout(function() {
            const currentUser = window.Auth.auth.currentUser;
            console.log('Initial auth state check:', currentUser);
            if (currentUser) {
                console.log('User already signed in on page load:', {
                    uid: currentUser.uid,
                    email: currentUser.email,
                    displayName: currentUser.displayName
                });
            }
        }, 500);
    }

    // Simple test - try to access elements immediately
    setTimeout(function() {
        const loginBtn = document.getElementById('login-btn');
        const authModal = document.getElementById('auth-modal');
        console.log('Delayed element check:', {
            loginBtn: !!loginBtn,
            authModal: !!authModal,
            loginBtnElement: loginBtn,
            authModalElement: authModal
        });
    }, 1000);

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing auth handlers');
            initAuthenticationHandlers();
        });
    } else {
        console.log('DOM already ready, initializing auth handlers immediately');
        initAuthenticationHandlers();
    }

    function initAuthenticationHandlers() {
        console.log('Initializing authentication handlers...');
        
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const authModal = document.getElementById('auth-modal');
        const closeModal = authModal?.querySelector('.close-modal');
        const showRegister = document.getElementById('show-register');
        const showLogin = document.getElementById('show-login');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const loginEmailForm = document.getElementById('login-email-form');
        const registerFormInner = document.getElementById('register-form-inner');

        console.log('Elements found:', {
            loginBtn: !!loginBtn,
            registerBtn: !!registerBtn,
            authModal: !!authModal,
            closeModal: !!closeModal
        });

        // Modal opening handlers - simplified like something-clean.js
        if (loginBtn) {
            console.log('Adding click listener to login button');
            loginBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Login button clicked - opening login form');
                openModal('login');
            });
            loginBtn.hasAuthListener = true;
        } else {
            console.warn('Login button not found!');
        }

        if (registerBtn) {
            console.log('Adding click listener to register button');
            registerBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Register button clicked - opening register form');
                openModal('register');
            });
            registerBtn.hasAuthListener = true;
        } else {
            console.warn('Register button not found!');
        }

        // Modal closing handlers
        if (closeModal) {
            closeModal.addEventListener('click', closeAuthModal);
        }

        if (authModal) {
            authModal.addEventListener('click', function(e) {
                if (e.target === authModal) {
                    closeAuthModal();
                }
            });
        }

        // Switch between login and register forms
        if (showRegister) {
            showRegister.addEventListener('click', function(e) {
                e.preventDefault();
                switchToRegister();
            });
        }

        if (showLogin) {
            showLogin.addEventListener('click', function(e) {
                e.preventDefault();
                switchToLogin();
            });
        }

        // Form submission handlers
        if (loginEmailForm) {
            console.log('[Auth Modal] Login form found, attaching submit handler');
            loginEmailForm.addEventListener('submit', handleLoginSubmit);
            
            // Add debug click handler to submit button
            const submitBtn = loginEmailForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                console.log('[Auth Modal] Submit button found, adding debug click handler');
                submitBtn.addEventListener('click', function(e) {
                    console.log('[Auth Modal] Submit button clicked', e.type);
                });
            }
        } else {
            console.error('[Auth Modal] Login form not found! ID: login-email-form');
        }

        if (registerFormInner) {
            registerFormInner.addEventListener('submit', handleRegisterSubmit);
        }

        // Reset password handler
        const resetPasswordLink = document.getElementById('reset-password');
        if (resetPasswordLink) {
            resetPasswordLink.addEventListener('click', handleResetPassword);
        }

        // Google sign-in button handler
        const googleSigninBtn = document.getElementById('google-signin-btn');
        if (googleSigninBtn) {
            console.log('Adding click listener to Google sign-in button');
            googleSigninBtn.addEventListener('click', function(e) {
                console.log('Google sign-in button clicked!');
                e.preventDefault();
                e.stopPropagation();
                handleGoogleSignIn();
            });
            // Mark as having listener to prevent duplicate from fallback
            googleSigninBtn.hasAuthListener = true;
        } else {
            console.warn('Google sign-in button not found!');
        }

        // Discount eligibility handler
        const discountSelect = document.getElementById('discount-eligible');
        const discountProofGroup = document.getElementById('discount-proof-group');
        if (discountSelect && discountProofGroup) {
            discountSelect.addEventListener('change', function() {
                if (this.value === 'yes') {
                    discountProofGroup.style.display = 'block';
                } else {
                    discountProofGroup.style.display = 'none';
                }
            });
        }

        // File upload handler
        const fileUploadArea = document.getElementById('file-upload-area');
        const fileInput = document.getElementById('discount-proof');
        if (fileUploadArea && fileInput) {
            fileUploadArea.addEventListener('click', () => fileInput.click());
            
            fileUploadArea.addEventListener('dragover', function(e) {
                e.preventDefault();
                this.classList.add('dragover');
            });

            fileUploadArea.addEventListener('dragleave', function(e) {
                e.preventDefault();
                this.classList.remove('dragover');
            });

            fileUploadArea.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    fileInput.files = files;
                    updateFileDisplay(files[0]);
                }
            });

            fileInput.addEventListener('change', function() {
                if (this.files.length > 0) {
                    updateFileDisplay(this.files[0]);
                }
            });
        }
    }

    function openAuthModal(mode) {
        console.log('openAuthModal called with mode:', mode);
        const authModal = document.getElementById('auth-modal');
        
        if (!authModal) {
            console.error('Auth modal not found!');
            return;
        }

        console.log('Auth modal found, opening in mode:', mode);

        if (mode === 'login') {
            switchToLogin();
        } else if (mode === 'register') {
            switchToRegister();
        } else {
            switchToLogin();
        }

        console.log('Adding active class to modal');
        authModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        console.log('Modal should now be visible');
        
        // Focus first input
        setTimeout(() => {
            const firstInput = authModal.querySelector('input[type="email"], input[type="text"]');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }

    function closeAuthModal() {
        const authModal = document.getElementById('auth-modal');
        if (!authModal) return;

        authModal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Clear any error messages
        clearErrorMessages();
    }

    function switchToLogin() {
        console.log('switchToLogin called');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        console.log('switchToLogin - Forms found:', { 
            loginForm: !!loginForm, 
            registerForm: !!registerForm 
        });
        
        if (loginForm && registerForm) {
            console.log('Before switch - login classes:', loginForm.className);
            console.log('Before switch - register classes:', registerForm.className);
            
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            
            console.log('After switch - login classes:', loginForm.className);
            console.log('After switch - register classes:', registerForm.className);
        } else {
            console.error('switchToLogin: Could not find forms');
        }
    }

    function switchToRegister() {
        console.log('switchToRegister called');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        console.log('switchToRegister - Forms found:', { 
            loginForm: !!loginForm, 
            registerForm: !!registerForm 
        });
        
        if (loginForm && registerForm) {
            console.log('Before switch - login classes:', loginForm.className);
            console.log('Before switch - register classes:', registerForm.className);
            
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
            
            console.log('After switch - login classes:', loginForm.className);
            console.log('After switch - register classes:', registerForm.className);
        } else {
            console.error('switchToRegister: Could not find forms');
        }
    }

    // Test function for manual sign-in from console - uses real Firebase auth
    window.testSignIn = async function(email, password) {
        console.log('[testSignIn] Starting manual sign-in test...');
        console.log('[testSignIn] Parameters:', { email: email || 'lukas.yuli.uk@gmail.com', hasPassword: !!password });
        
        try {
            // Import Firebase auth directly
            const { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');
            const { auth } = await import('./lib/firebaseClient.js');
            
            console.log('[testSignIn] Firebase modules loaded, auth object:', !!auth);
            console.log('[testSignIn] Auth currentUser:', auth.currentUser?.email || 'none');
            
            // Set persistence first
            await setPersistence(auth, browserLocalPersistence);
            console.log('[testSignIn] Persistence set to local');
            
            // Attempt sign-in
            const userCredential = await signInWithEmailAndPassword(
                auth, 
                email || 'lukas.yuli.uk@gmail.com', 
                password || 'ManoRaktukasKefyras321!'
            );
            
            console.log('[testSignIn] SUCCESS - User signed in:', {
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                emailVerified: userCredential.user.emailVerified
            });
            
            return userCredential.user;
            
        } catch (error) {
            console.error('[testSignIn] FIREBASE ERROR:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    };

    // Debug function to check element availability with real selectors
    window.debugElements = function() {
        console.log('[debugElements] Checking auth modal elements...');
        
        const elements = {
            // Main modal elements
            authModal: document.getElementById('auth-modal'),
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            
            // Specific form elements
            loginEmailForm: document.getElementById('login-email-form'),
            registerFormInner: document.getElementById('register-form-inner'),
            
            // Input fields
            loginEmail: document.getElementById('login-email'),
            loginPassword: document.getElementById('login-password'),
            rememberMe: document.getElementById('remember-me'),
            
            // Buttons
            loginSubmitBtn: document.querySelector('#login-email-form button[type="submit"]'),
            googleSigninBtn: document.getElementById('google-signin-btn'),
            showRegisterLink: document.getElementById('show-register'),
            showLoginLink: document.getElementById('show-login'),
            
            // Modal controls
            loginBtn: document.getElementById('login-btn'),
            registerBtn: document.getElementById('register-btn'),
            closeModal: document.querySelector('.close-modal'),
        };
        
        console.log('[debugElements] Element availability:');
        for (const [name, element] of Object.entries(elements)) {
            console.log(`  ${name}:`, !!element, element ? `(${element.tagName})` : '');
        }
        
        // Check if login form has event listeners
        const loginEmailForm = elements.loginEmailForm;
        if (loginEmailForm) {
            console.log('[debugElements] Login form HTML preview:', loginEmailForm.outerHTML.substring(0, 200) + '...');
        }
        
        // Check current modal state
        const authModal = elements.authModal;
        if (authModal) {
            console.log('[debugElements] Modal state:', {
                display: authModal.style.display,
                visible: authModal.offsetParent !== null,
                classes: authModal.className
            });
        }
        
        return elements;
    };

    // Add openModal alias for compatibility with something-clean.js
    window.openModal = function(type) {
        console.log('openModal called with type:', type);
        return openAuthModal(type);
    };

    // Set script loaded flag
    window.__AUTH_SCRIPT_LOADED__ = true;
    console.log('[Auth Script] ✅ something.js loaded successfully - __AUTH_SCRIPT_LOADED__ = true');
    console.log('[Auth Script] Available debug functions: testSignIn(email?, password?), debugElements()');

    async function handleLoginSubmit(e) {
        console.log('[Auth Modal] handleLoginSubmit called', e.type);
        e.preventDefault();
        e.stopPropagation();
        
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        
        // Disable form to prevent double submission
        if (submitButton) submitButton.disabled = true;
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me').checked;
        
        if (!email || !password) {
            if (window.Auth?.showAuthNotice) {
                window.Auth.showAuthNotice('Please fill in all fields', 'error');
            } else {
                showAuthError('Please fill in all fields');
            }
            if (submitButton) submitButton.disabled = false;
            return;
        }

        try {
            showAuthLoading(submitButton);
            
            if (!window.Auth) {
                throw new Error('Authentication system not initialized');
            }

            console.log('[Auth Modal] Starting sign-in process...');
            console.log('[Auth Modal] Auth object available:', !!window.Auth);
            console.log('[Auth Modal] signInEmailPassword function available:', !!window.Auth?.signInEmailPassword);
            
            const user = await window.Auth.signInEmailPassword(email, password, rememberMe);
            console.log('[Auth Modal] signInEmailPassword returned:', !!user, user?.uid);
            
            if (user) {
                console.log('[Auth Modal] Sign-in successful, closing modal...');
                if (window.Auth?.showAuthNotice) {
                    window.Auth.showAuthNotice('Successfully signed in!', 'success');
                } else {
                    showAuthSuccess('Successfully signed in!');
                }
                
                // Wait a bit before closing modal and redirecting
                setTimeout(() => {
                    closeAuthModal();
                    // Allow the auth state listener to handle navigation
                    console.log('[Auth Modal] Modal closed, auth state will handle navigation');
                }, 1000);
            }
        } catch (error) {
            console.error('[Auth Modal] Login error:', error);
            
            // Use the new showAuthNotice if available, otherwise fallback
            if (window.Auth?.showAuthNotice) {
                // Error is already handled by signInEmailPassword, don't double-show
                console.log('[Auth Modal] Error already displayed by Auth system');
            } else {
                const errorMessage = window.Auth?.mapError ? window.Auth.mapError(error) : error.message;
                showAuthError(errorMessage || 'Failed to sign in. Please try again.');
            }
        } finally {
            hideAuthLoading(submitButton);
            if (submitButton) submitButton.disabled = false;
        }
    }

    async function handleRegisterSubmit(e) {
        e.preventDefault();
        
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-password-confirm').value;
        const role = document.querySelector('input[name="user-role"]:checked')?.value;
        const discountEligible = document.getElementById('discount-eligible').value;
        const termsAccepted = document.getElementById('terms-accept').checked;
        
        // Validation
        if (!name || !email || !password || !confirmPassword || !role || !discountEligible) {
            showAuthError('Please fill in all required fields');
            return;
        }

        if (password !== confirmPassword) {
            showAuthError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            showAuthError('Password must be at least 8 characters long');
            return;
        }

        if (!termsAccepted) {
            showAuthError('Please accept the Terms of Service and Privacy Policy');
            return;
        }

        try {
            showAuthLoading(e.target.querySelector('button[type="submit"]'));
            
            if (!window.Auth) {
                throw new Error('Authentication system not initialized');
            }

            const userData = {
                email,
                password,
                displayName: name,
                role,
                discountEligibility: discountEligible
            };

            const user = await window.Auth.signUpEmailPassword(userData);
            
            if (user) {
                showAuthSuccess('Account created successfully! Please check your email to verify your account.');
                setTimeout(() => {
                    closeAuthModal();
                    // Could redirect to email verification page
                }, 2000);
            }
        } catch (error) {
            console.error('Registration error:', error);
            const errorMessage = window.Auth?.mapError ? window.Auth.mapError(error) : error.message;
            showAuthError(errorMessage || 'Failed to create account. Please try again.');
        } finally {
            hideAuthLoading(e.target.querySelector('button[type="submit"]'));
        }
    }

    async function handleResetPassword(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        
        if (!email) {
            showAuthError('Please enter your email address first');
            return;
        }

        try {
            if (!window.Auth?.sendReset) {
                throw new Error('Password reset not available');
            }

            await window.Auth.sendReset(email);
            showAuthSuccess(`Password reset email sent to ${email}. Check your inbox and follow the instructions.`);
        } catch (error) {
            console.error('Password reset error:', error);
            const errorMessage = window.Auth?.mapError ? window.Auth.mapError(error) : error.message;
            showAuthError(errorMessage || 'Failed to send password reset email');
        }
    }

    function showAuthLoading(button) {
        if (!button) return;
        button.disabled = true;
        const span = button.querySelector('span');
        if (span) {
            span.textContent = 'Please wait...';
        }
    }

    function hideAuthLoading(button) {
        if (!button) return;
        button.disabled = false;
        const span = button.querySelector('span');
        if (span) {
            const isLogin = button.closest('#login-form');
            span.textContent = isLogin ? 'Sign In' : 'Create Account';
        }
    }

    function showAuthError(message) {
        // Remove existing error messages
        clearErrorMessages();
        
        // Create error message element
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error-message';
        errorDiv.style.cssText = `
            background: #fee2e2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        
        // Insert error message at the top of the active form
        const activeForm = document.querySelector('.auth-form.active .auth-form-content');
        if (activeForm) {
            activeForm.insertBefore(errorDiv, activeForm.firstChild);
        }
    }

    function showAuthSuccess(message) {
        // Remove existing messages
        clearErrorMessages();
        
        // Create success message element
        const successDiv = document.createElement('div');
        successDiv.className = 'auth-success-message';
        successDiv.style.cssText = `
            background: #dcfce7;
            border: 1px solid #bbf7d0;
            color: #16a34a;
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        
        // Insert success message at the top of the active form
        const activeForm = document.querySelector('.auth-form.active .auth-form-content');
        if (activeForm) {
            activeForm.insertBefore(successDiv, activeForm.firstChild);
        }
    }

    function clearErrorMessages() {
        const messages = document.querySelectorAll('.auth-error-message, .auth-success-message');
        messages.forEach(msg => msg.remove());
    }

    function updateFileDisplay(file) {
        const fileUploadArea = document.getElementById('file-upload-area');
        if (!fileUploadArea) return;

        fileUploadArea.innerHTML = `
            <i class="fas fa-file-check"></i>
            <p><strong>${file.name}</strong> selected</p>
            <small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>
        `;
        fileUploadArea.classList.add('file-selected');
    }

    // Password toggle function (referenced in HTML)
    window.togglePassword = function(inputId) {
        const input = document.getElementById(inputId);
        const button = input?.nextElementSibling;
        const icon = button?.querySelector('i');
        
        if (!input || !icon) return;
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    };

    // Google Sign-in handler with account linking
    async function handleGoogleSignIn() {
        try {
            console.log('Starting Google sign-in...');
            
            // Show loading state
            const googleBtn = document.getElementById('google-signin-btn');
            if (googleBtn) {
                googleBtn.disabled = true;
                const span = googleBtn.querySelector('span');
                if (span) span.textContent = 'Signing in...';
            }
            
            // Import required modules
            const { auth, signInWithGoogle } = await import('./lib/firebaseClient.js');
            const { ensureUserDoc } = await import('./lib/userService.js');
            const { go } = await import('./lib/nav.js');
            
            console.log('Calling modular signInWithGoogle...');
            const result = await signInWithGoogle();
            const profile = await ensureUserDoc(result.user);
            
            showAuthSuccess('Successfully signed in with Google!');
            closeAuthModal();
            
            setTimeout(() => {
                go("/");
            }, 1000);
            
        } catch (error) {
            console.error('Google sign-in flow failed:', error);
            
            // Handle account linking for existing email/password accounts
            if (error.code === "auth/account-exists-with-different-credential") {
                try {
                    const { fetchSignInMethodsForEmail, signInWithEmailAndPassword, linkWithCredential, GoogleAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');
                    const { auth } = await import('./lib/firebaseClient.js');
                    const { ensureUserDoc } = await import('./lib/userService.js');
                    const { go } = await import('./lib/nav.js');
                    
                    const pendingCred = GoogleAuthProvider.credentialFromError(error);
                    const email = error.customData?.email;
                    if (!email) throw error;
                    
                    const methods = await fetchSignInMethodsForEmail(auth, email);
                    if (methods.includes("password")) {
                        // Ask the user for their password (simple prompt UX)
                        const pwd = window.prompt(`An account already exists for ${email}. Enter your password to link Google to the same account:`);
                        if (!pwd) throw new Error('Password required to link accounts');
                        
                        const userCred = await signInWithEmailAndPassword(auth, email, pwd);
                        await linkWithCredential(userCred.user, pendingCred);
                        const profile = await ensureUserDoc(userCred.user);
                        
                        showAuthSuccess('Accounts linked successfully!');
                        closeAuthModal();
                        
                        setTimeout(() => {
                            go("/");
                        }, 1000);
                        return;
                    }
                } catch (linkError) {
                    console.error('Account linking failed:', linkError);
                    showAuthError(linkError.message || 'Failed to link accounts');
                    return;
                }
            }
            
            let errorMessage = 'Failed to sign in with Google';
            if (error.code === 'auth/popup-closed-by-user') {
                errorMessage = 'Sign-in was cancelled';
            } else if (error.code === 'auth/popup-blocked') {
                errorMessage = 'Please allow popups for this site and try again';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            showAuthError(errorMessage);
        } finally {
            // Reset button state
            const googleBtn = document.getElementById('google-signin-btn');
            if (googleBtn) {
                googleBtn.disabled = false;
                const span = googleBtn.querySelector('span');
                if (span) span.textContent = 'Continue with Google';
            }
        }
    }

    // Keep the old function for backwards compatibility but make it use the new handler
    window.startGoogleSignIn = handleGoogleSignIn;
    window.handleGoogle = handleGoogleSignIn;

    // Email/password sign-in handler with unified profile flow
    window.handleEmailPasswordSignIn = async function(email, password) {
        try {
            const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');
            const { auth } = await import('./lib/firebaseClient.js');
            const { ensureUserDoc } = await import('./lib/userService.js');
            const { go } = await import('./lib/nav.js');
            
            const res = await signInWithEmailAndPassword(auth, email, password);
            const profile = await ensureUserDoc(res.user);
            go("/");
        } catch (error) {
            console.error('Email/password sign-in failed:', error);
            throw error;
        }
    };

    // Test modular SDK integration
    window.testModularSDK = async function() {
        try {
            const { auth, signInWithGoogle } = await import('./lib/firebaseClient.js');
            const { ensureUserDoc, getUserProfile } = await import('./lib/userService.js');
            console.log('Modular SDK test:', {
                hasAuth: !!auth,
                hasSignInFunction: !!signInWithGoogle,
                hasUserService: !!(ensureUserDoc && getUserProfile),
                currentUser: auth.currentUser
            });
        } catch (error) {
            console.error('Modular SDK test failed:', error);
        }
    };

    // Profile modal function (referenced in HTML)
    window.openProfileModal = async function() {
        console.log('Opening profile page...');
        
        // Navigate to profile page instead of opening modal
        const { go } = await import('./lib/nav.js');
        go('/profile');
    };

    // Profile picture upload handler for click events
    document.addEventListener('change', function(e) {
        const target = e.target;
        if (target && (target.id === 'profile-picture-input' || target.id === 'avatar-input' || target.id === 'avatar-input-tutor')) {
            try { handleProfilePictureUpload(e); } catch (err) { console.error('Avatar upload handler failed:', err); }
        }
    });

    // Profile modal close function
    function closeProfileModal() {
        console.log('Modal functionality deprecated - users should use profile page');
    }

    // Make close function available globally for backwards compatibility
    window.closeProfileModal = closeProfileModal;

    // Skip the modal event handlers since we navigate to profile page
            closeBtn.addEventListener('click', closeProfileModal);
            closeBtn.hasCloseHandler = true;
        }
        
        // Add modal background click to close (click outside content)
        if (!profileModal.hasBackgroundHandler) {
            profileModal.addEventListener('click', function(e) {
                // Only close if clicking on the modal background, not the content
                if (e.target === profileModal) {
                    closeProfileModal();
                }
            });
            profileModal.hasBackgroundHandler = true;
        }

        // Add sign out handler if not already added
        const signoutBtn = document.getElementById('signout-btn');
        if (signoutBtn && !signoutBtn.hasSignoutHandler) {
            signoutBtn.addEventListener('click', handleSignOut);
            signoutBtn.hasSignoutHandler = true;
        }

        // Add edit profile handler if not already added
        const editProfileBtn = document.getElementById('edit-profile-btn');
        if (editProfileBtn && !editProfileBtn.hasEditHandler) {
            editProfileBtn.addEventListener('click', toggleEditMode);
            editProfileBtn.hasEditHandler = true;
        }

        // Add save profile handler if not already added
        const saveProfileBtn = document.getElementById('save-profile-btn');
        if (saveProfileBtn && !saveProfileBtn.hasSaveHandler) {
            saveProfileBtn.addEventListener('click', saveProfile);
            saveProfileBtn.hasSaveHandler = true;
        }

        // Add cancel edit handler if not already added
        const cancelEditBtn = document.getElementById('cancel-edit-btn');
        if (cancelEditBtn && !cancelEditBtn.hasCancelHandler) {
            cancelEditBtn.addEventListener('click', cancelEdit);
            cancelEditBtn.hasCancelHandler = true;
        }
    };

    // Ensure click binding for profile picture is attached immediately
    function ensureProfilePictureBinding() {
        const profileImg = document.getElementById('profile-picture');
        const container = profileImg ? profileImg.closest('.profile-picture-container') : null;
        const overlay = container ? container.querySelector('.profile-picture-overlay') : null;
        const fileInput = document.getElementById('profile-picture-input');

        if (container && fileInput && !container.hasProfilePictureHandler) {
            container.hasProfilePictureHandler = true;

            const triggerPicker = (e) => {
                e && e.preventDefault && e.preventDefault();
                e && e.stopPropagation && e.stopPropagation();
                fileInput.click();
            };

            container.addEventListener('click', triggerPicker);
            if (profileImg) profileImg.addEventListener('click', triggerPicker);
            if (overlay) overlay.addEventListener('click', triggerPicker);

            fileInput.addEventListener('change', handleProfilePictureUpload);
        }
    }

    // Global, resilient event delegation for profile picture editing
    // Ensures clicking anywhere on the photo area opens the file chooser,
    // even if other bindings fail or modal is re-rendered.
    document.addEventListener('click', function(e) {
        const container = e.target && e.target.closest ? e.target.closest('.profile-picture-container') : null;
        if (!container) return;
        
        // Find the appropriate input based on the container's for attribute or context
        let input = null;
        const forAttr = container.getAttribute('for');
        if (forAttr) {
            input = document.getElementById(forAttr);
        }
        
        // Fallback to finding input within the container
        if (!input) {
            input = container.querySelector('input[type="file"]');
        }
        
        // Final fallback to the original profile-picture-input
        if (!input) {
            input = document.getElementById('profile-picture-input');
        }
        
        if (!input) {
            try { showProfileError('Photo editing is not available right now. Please reload the page.'); } catch (_) {}
            return;
        }
        try {
            e.preventDefault();
            e.stopPropagation();
            // Friendly feedback so the user knows we reacted
            try { showProfileSuccess('Opening photo chooser...'); } catch (_) {}
            // Use showPicker when available for better reliability
            if (typeof input.showPicker === 'function') {
                input.showPicker();
            } else {
                input.click();
            }
        } catch (err) {
            try { showProfileError('Could not open the file chooser. Please check browser permissions and try again.'); } catch (_) {}
        }
    });

    document.addEventListener('change', function(e) {
        const target = e.target;
        if (target && (target.id === 'profile-picture-input' || target.id === 'avatar-input' || target.id === 'avatar-input-tutor')) {
            try { handleProfilePictureUpload(e); } catch (err) { console.error('Avatar upload handler failed:', err); }
        }
    });

    // Profile modal close function
    function closeProfileModal() {
        const profileModal = document.getElementById('profile-modal');
        if (!profileModal) return;

        // Reset to view mode when closing
        resetProfileToViewMode();

        // If a temp image was shown, keep it in UI until page refresh and promote if needed
        try {
            const isTemp = localStorage.getItem('yl_profilePictureIsTemp') === '1';
            const tempUrl = localStorage.getItem('yl_profilePictureURL');
            if (isTemp && tempUrl) {
                const img = document.getElementById('profile-picture');
                if (img) {
                    img.src = tempUrl;
                }
            }
        } catch (e) {}

        profileModal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Hide after transition
        setTimeout(() => {
            profileModal.style.display = 'none';
        }, 300);
        
        console.log('Profile modal closed');
    }

    // Make close function available globally
    window.closeProfileModal = closeProfileModal;

    // Load user data into profile modal
    async function loadUserDataIntoProfile() {
        try {
            if (!window.Auth?.auth) {
                console.error('Auth not available');
                return;
            }

            const user = window.Auth.auth.currentUser;
            if (!user) {
                console.error('No user signed in');
                return;
            }

            console.log('Loading user data into profile...');

            // Will hold any user document data we load (may remain null)
            let userData = null;

            // Basic user info
            const displayNameEl = document.getElementById('profile-displayName');
            const emailEl = document.getElementById('profile-email');
            const rolePillEl = document.getElementById('role-pill');
            const emailBadgeEl = document.getElementById('email-badge');
            const resendVerificationEl = document.getElementById('resend-verification');
            const memberSinceEl = document.getElementById('member-since');

            if (displayNameEl) displayNameEl.textContent = user.displayName || 'User';
            if (emailEl) emailEl.textContent = user.email || '';
            
            // Email verification status
            if (emailBadgeEl && resendVerificationEl) {
                if (user.emailVerified) {
                    emailBadgeEl.style.display = 'inline-block';
                    emailBadgeEl.textContent = 'Verified';
                    resendVerificationEl.style.display = 'none';
                } else {
                    emailBadgeEl.style.display = 'none';
                    resendVerificationEl.style.display = 'inline-block';
                }
            }

            // Try to get additional user data from Firestore
            if (window.Auth.db) {
                try {
                    const userDoc = await window.Auth.db.collection('users').doc(user.uid).get();
                    if (userDoc.exists) {
                        userData = userDoc.data();
                        
                        // Update role
                        if (rolePillEl && userData.role) {
                            rolePillEl.textContent = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
                        }
                        
                        // Member since
                        if (memberSinceEl && userData.createdAt) {
                            const date = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
                            memberSinceEl.textContent = `Member since ${date.toLocaleDateString()}`;
                        }

                        // Populate form fields
                        const displayNameInput = document.getElementById('displayName');
                        const bioInput = document.getElementById('bio');
                        const timezoneSelect = document.getElementById('timezone');
                        
                        if (displayNameInput) displayNameInput.value = userData.displayName || user.displayName || '';
                        if (bioInput) bioInput.value = userData.bio || '';
                        
                        // Populate timezone dropdown
                        if (timezoneSelect && timezoneSelect.children.length === 0) {
                            populateTimezoneSelect(timezoneSelect, userData.timezone);
                        } else if (timezoneSelect && userData.timezone) {
                            timezoneSelect.value = userData.timezone;
                        }
                        
                        // Populate languages
                        const languagesContainer = document.getElementById('languages');
                        if (languagesContainer && languagesContainer.children.length === 0) {
                            populateLanguages(languagesContainer, userData.languages || []);
                        } else if (languagesContainer && userData.languages) {
                            setSelectedLanguages(userData.languages);
                        }
                        
                        // Set user role (and enforce non-changeable roles like tutor/admin)
                        enforcedUserRole = userData.role || 'student';
                        setUserRole(enforcedUserRole);
                        
                        // (Defer profile picture binding until after data load completes)
                    }
                } catch (error) {
                    console.warn('Could not load additional user data:', error);
                }
            }

            // Ensure profile picture is loaded and click-to-edit is bound regardless of Firestore doc existence
            loadProfilePicture(user, userData);

            // Show provider info
            const providerChips = document.getElementById('provider-chips');
            if (providerChips && user.providerData) {
                providerChips.innerHTML = user.providerData.map(provider => {
                    const providerId = provider.providerId;
                    let providerName = providerId;
                    let icon = 'fas fa-user';
                    
                    if (providerId === 'google.com') {
                        providerName = 'Google';
                        icon = 'fab fa-google';
                    } else if (providerId === 'password') {
                        providerName = 'Email';
                        icon = 'fas fa-envelope';
                    }
                    
                    return `<span class="yl-chip"><i class="${icon}"></i> ${providerName}</span>`;
                }).join('');
            }

            // Scope local cache by UID to prevent cross-account bleed
            try {
                window.__yl_current_uid = user.uid;
                const cachedUrl = localStorage.getItem('yl_profilePictureURL');
                const cachedUid = localStorage.getItem('yl_profilePictureUID');
                if (cachedUrl && cachedUid && cachedUid !== user.uid) {
                    // Cached image belongs to a different user, discard it
                    localStorage.removeItem('yl_profilePictureURL');
                    localStorage.removeItem('yl_profilePictureIsTemp');
                }
            } catch (e) {}

        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // Handle sign out
    async function handleSignOut() {
        try {
            if (!window.Auth?.auth) {
                console.error('Auth not available');
                return;
            }

            console.log('Signing out...');
            await window.Auth.auth.signOut();
            
            // Clear any per-user cached data so next user doesn't inherit state
            try {
                const keys = Object.keys(localStorage);
                keys.forEach(k => {
                    if (k.startsWith('yl_')) localStorage.removeItem(k);
                });
            } catch (e) {}

            // Close profile modal
            closeProfileModal();
            
            // Reload page to reset UI state
            window.location.reload();
            
        } catch (error) {
            console.error('Sign out error:', error);
            alert('Failed to sign out. Please try again.');
        }
    }

    // Populate timezone select dropdown
    function populateTimezoneSelect(selectElement, selectedTimezone) {
        const timezones = [
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Europe/Madrid',
            'Europe/Rome',
            'Europe/Amsterdam',
            'Europe/Brussels',
            'Europe/Vienna',
            'Europe/Warsaw',
            'Europe/Prague',
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'America/Toronto',
            'America/Vancouver',
            'Australia/Sydney',
            'Australia/Melbourne',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Kolkata',
            'Asia/Dubai'
        ];

        // Clear existing options
        selectElement.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select timezone';
        selectElement.appendChild(defaultOption);

        // Add timezone options
        timezones.forEach(timezone => {
            const option = document.createElement('option');
            option.value = timezone;
            option.textContent = timezone.replace(/_/g, ' ');
            if (timezone === selectedTimezone) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });

        // If no timezone was selected, try to detect user's timezone
        if (!selectedTimezone) {
            try {
                const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (timezones.includes(userTimezone)) {
                    selectElement.value = userTimezone;
                }
            } catch (e) {
                console.warn('Could not detect user timezone:', e);
            }
        }
    }

    // Populate languages checkboxes
    function populateLanguages(container, selectedLanguages = []) {
        const languages = [
            'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
            'Dutch', 'Russian', 'Chinese (Mandarin)', 'Japanese', 'Korean',
            'Arabic', 'Hindi', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
            'Polish', 'Czech', 'Hungarian', 'Romanian', 'Greek', 'Turkish',
            'Hebrew', 'Thai', 'Vietnamese', 'Indonesian', 'Malay'
        ];

        container.innerHTML = '';

        // Add predefined languages
        languages.forEach(language => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'language-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `lang-${language.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '')}`;
            checkbox.value = language;
            checkbox.checked = selectedLanguages.includes(language);

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = language;

            optionDiv.appendChild(checkbox);
            optionDiv.appendChild(label);
            container.appendChild(optionDiv);

            // Add click handler to the entire option div
            optionDiv.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
            });
        });

        // Add "Other" option with text input
        const otherDiv = document.createElement('div');
        otherDiv.className = 'language-option language-other';

        const otherCheckbox = document.createElement('input');
        otherCheckbox.type = 'checkbox';
        otherCheckbox.id = 'lang-other';
        otherCheckbox.value = 'other';

        const otherLabel = document.createElement('label');
        otherLabel.htmlFor = 'lang-other';
        otherLabel.textContent = 'Other:';

        const otherInput = document.createElement('input');
        otherInput.type = 'text';
        otherInput.id = 'lang-other-input';
        otherInput.className = 'other-language-input';
        otherInput.placeholder = 'Type language name...';
        otherInput.disabled = true;

        // Find custom languages (those not in predefined list)
        const customLanguages = selectedLanguages.filter(lang => !languages.includes(lang));
        if (customLanguages.length > 0) {
            otherCheckbox.checked = true;
            otherInput.disabled = false;
            otherInput.value = customLanguages.join(', ');
        }

        otherDiv.appendChild(otherCheckbox);
        otherDiv.appendChild(otherLabel);
        otherDiv.appendChild(otherInput);
        container.appendChild(otherDiv);

        // Handle "Other" checkbox toggle
        otherCheckbox.addEventListener('change', () => {
            otherInput.disabled = !otherCheckbox.checked;
            if (!otherCheckbox.checked) {
                otherInput.value = '';
            } else {
                otherInput.focus();
            }
        });

        // Handle clicking on the "Other" option div
        otherDiv.addEventListener('click', (e) => {
            if (e.target !== otherCheckbox && e.target !== otherInput) {
                otherCheckbox.checked = !otherCheckbox.checked;
                otherInput.disabled = !otherCheckbox.checked;
                if (otherCheckbox.checked) {
                    otherInput.focus();
                } else {
                    otherInput.value = '';
                }
            }
        });
    }

    // Set selected languages
    function setSelectedLanguages(selectedLanguages) {
        const container = document.getElementById('languages');
        if (!container) return;

        const predefinedLanguages = [
            'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
            'Dutch', 'Russian', 'Chinese (Mandarin)', 'Japanese', 'Korean',
            'Arabic', 'Hindi', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
            'Polish', 'Czech', 'Hungarian', 'Romanian', 'Greek', 'Turkish',
            'Hebrew', 'Thai', 'Vietnamese', 'Indonesian', 'Malay'
        ];

        // Set predefined language checkboxes
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:not(#lang-other)');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectedLanguages.includes(checkbox.value);
        });

        // Handle custom "Other" languages
        const customLanguages = selectedLanguages.filter(lang => !predefinedLanguages.includes(lang));
        const otherCheckbox = container.querySelector('#lang-other');
        const otherInput = container.querySelector('#lang-other-input');

        if (otherCheckbox && otherInput) {
            if (customLanguages.length > 0) {
                otherCheckbox.checked = true;
                otherInput.disabled = false;
                otherInput.value = customLanguages.join(', ');
            } else {
                otherCheckbox.checked = false;
                otherInput.disabled = true;
                otherInput.value = '';
            }
        }
    }

    // Get selected languages
    function getSelectedLanguages() {
        const container = document.getElementById('languages');
        if (!container) return [];

        const selectedLanguages = [];
        
        // Get predefined languages
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked:not(#lang-other)');
        checkboxes.forEach(checkbox => {
            if (checkbox.value !== 'other') {
                selectedLanguages.push(checkbox.value);
            }
        });

        // Get custom "Other" languages
        const otherCheckbox = container.querySelector('#lang-other');
        const otherInput = container.querySelector('#lang-other-input');
        
        if (otherCheckbox && otherCheckbox.checked && otherInput && otherInput.value.trim()) {
            // Split by comma and clean up each language
            const customLanguages = otherInput.value.split(',')
                .map(lang => lang.trim())
                .filter(lang => lang.length > 0);
            selectedLanguages.push(...customLanguages);
        }

        return selectedLanguages;
    }

    // Toggle languages container enabled/disabled state
    function setLanguagesEnabled(enabled) {
        const container = document.getElementById('languages');
        if (!container) return;

        if (enabled) {
            container.classList.remove('disabled');
        } else {
            container.classList.add('disabled');
        }

        // Also handle the "Other" input field specifically
        const otherInput = container.querySelector('#lang-other-input');
        const otherCheckbox = container.querySelector('#lang-other');
        
        if (otherInput && otherCheckbox) {
            if (enabled) {
                // Only enable the input if the checkbox is checked
                otherInput.disabled = !otherCheckbox.checked;
            } else {
                // Always disable when languages are disabled
                otherInput.disabled = true;
            }
        }
    }

    // Role management functions
    function setUserRole(role) {
        const validRoles = ['student', 'parent', 'tutor', 'admin'];
        const roleToSet = validRoles.includes(role) ? role : 'student';
        enforcedUserRole = roleToSet;  // Ensure this is set from Firestore
        const roleRadios = document.querySelectorAll('input[name="userRole"]');
        roleRadios.forEach(radio => {
            if (roleToSet === 'admin' && (radio.value === 'student' || radio.value === 'parent')) {
                radio.parentElement.style.display = 'none';  // Hide Student and Parent for admins
            } else if (roleToSet === 'admin' || roleToSet === 'tutor') {
                radio.parentElement.style.display = 'none';  // Hide all for admins/tutors
            } else {
                radio.parentElement.style.display = '';
            }
            radio.checked = radio.value === roleToSet;
        });
        updateRoleBadge(roleToSet);
    }

    function updateRoleBadge(role) {
        const rolePill = document.getElementById('role-pill');
        if (rolePill) {
            // Capitalize the first letter
            const displayRole = role.charAt(0).toUpperCase() + role.slice(1);
            rolePill.textContent = displayRole;
            
            // Update the class - back to simple yl-chip
            rolePill.className = 'yl-chip';
            if (role === 'parent') {
                rolePill.classList.add('yl-chip-parent');
            } else if (role === 'student') {
                rolePill.classList.add('yl-chip-student');
            } else if (role === 'tutor') {
                // Use base chip styling for tutor (no special colour class required)
            } else if (role === 'admin') {
                // Base chip styling for admin
            }
        }
    }

    function getUserRole() {
        // Never allow changing away from enforced roles in save payload
        if (enforcedUserRole === 'tutor' || enforcedUserRole === 'admin') {
            return enforcedUserRole;
        }
        const selectedRole = document.querySelector('input[name="userRole"]:checked');
        return selectedRole ? selectedRole.value : 'student'; // Default to student
    }

    function setRoleEnabled(enabled) {
        const roleContainer = document.getElementById('role-selection');
        const roleRadios = document.querySelectorAll('input[name="userRole"]');
        
        // If the account is tutor or admin, the role cannot be changed in UI
        const isLockedRole = enforcedUserRole === 'tutor' || enforcedUserRole === 'admin';

        if (roleContainer) {
            const shouldEnable = enabled && !isLockedRole;
            if (shouldEnable) {
                roleContainer.classList.remove('disabled');
            } else {
                roleContainer.classList.add('disabled');
            }
        }
        
        roleRadios.forEach(radio => {
            radio.disabled = isLockedRole ? true : !enabled;
        });
    }

    // Profile Picture Management
    function loadProfilePicture(user, userData) {
        const profileImg = document.getElementById('profile-picture');
        const container = profileImg ? profileImg.closest('.profile-picture-container') : null;
        const overlay = container ? container.querySelector('.profile-picture-overlay') : null;
        const fileInput = document.getElementById('profile-picture-input');

        // Always bind click-to-upload as soon as possible
        if (container && fileInput && !container.hasProfilePictureHandler) {
            container.hasProfilePictureHandler = true;

            const triggerPicker = (e) => {
                e && e.preventDefault && e.preventDefault();
                e && e.stopPropagation && e.stopPropagation();
                fileInput.click();
            };

            container.addEventListener('click', triggerPicker);
            if (profileImg) profileImg.addEventListener('click', triggerPicker);
            if (overlay) overlay.addEventListener('click', triggerPicker);

            fileInput.addEventListener('change', handleProfilePictureUpload);
        }

        if (!profileImg) return;

        let imageUrl = null;
        
        // Priority: Custom uploaded photo > cached > Google photo > Default
        if (userData && userData.profilePictureURL) {
            imageUrl = userData.profilePictureURL;
            if (profileImg) profileImg.src = imageUrl;
            try { localStorage.setItem('yl_profilePictureURL', imageUrl); } catch (e) {}
        } else {
            try {
                const cachedUrl = localStorage.getItem('yl_profilePictureURL');
                if (cachedUrl) {
                    imageUrl = cachedUrl;
                    if (profileImg) profileImg.src = imageUrl;
                }
            } catch (e) {}
            if (!imageUrl && user && user.photoURL) {
                imageUrl = user.photoURL;
                if (profileImg) profileImg.src = imageUrl;
            } else if (!imageUrl) {
                const defaultUrl = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iMTAwIiBmaWxsPSIjQzNDNEM2Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjcwIiByPSIzMCIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNNTAgMTUwQzUwIDEyMC43OTEgNzIuOTEgMTAwIDEwMCAxMDBTMTUwIDEyMC43OTEgMTUwIDE1MEg1MFoiIGZpbGw9IiNGRkZGRkYiLz4KPC9zdmc+Cg==";
                imageUrl = defaultUrl;
                if (profileImg) profileImg.src = defaultUrl;
            }
        }
        
        // Also update the avatar div in dashboards if it exists and we have an image URL
        const avatarDiv = document.getElementById('avatar');
        if (avatarDiv && imageUrl && imageUrl !== "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iMTAwIiBmaWxsPSIjQzNDNEM2Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjcwIiByPSIzMCIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNNTAgMTUwQzUwIDEyMC43OTEgNzIuOTEgMTAwIDEwMCAxMDBTMTUwIDEyMC43OTEgMTUwIDE1MEg1MFoiIGZpbGw9IiNGRkZGRkYiLz4KPC9zdmc+Cg==") {
            avatarDiv.style.backgroundImage = `url(${imageUrl})`;
            avatarDiv.style.backgroundSize = 'cover';
            avatarDiv.style.backgroundPosition = 'center';
            avatarDiv.style.backgroundRepeat = 'no-repeat';
            avatarDiv.innerHTML = ''; // Clear any initials or loading content
        }
    }

    async function handleProfilePictureUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type (support jpeg/jpg, png, webp)
        const mimeType = (file.type || '').toLowerCase();
        const fileName = (file.name || '').toLowerCase();
        const isSupportedType = /^(image\/(jpe?g|png|webp))$/.test(mimeType) || /\.(jpe?g|png|webp)$/.test(fileName);
        if (!isSupportedType) {
            showProfileError('Please select a JPEG, PNG, or WebP image.');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            showProfileError('Image must be smaller than 10MB.');
            return;
        }

        const profileImg = document.getElementById('profile-picture');
        const user = window.Auth?.auth?.currentUser;
        
        if (!user || !profileImg) return;

        try {
            // Show loading state
            profileImg.classList.add('loading');

            // Create preview immediately and enforce full-fit inline
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                
                // Update profile picture in modal if it exists
                if (profileImg) {
                    profileImg.src = dataUrl;
                    profileImg.style.width = '100%';
                    profileImg.style.height = '100%';
                    profileImg.style.objectFit = 'cover';
                    profileImg.style.objectPosition = 'center';
                    profileImg.style.borderRadius = '50%';
                    const container = profileImg.closest('.profile-picture-container');
                    if (container) {
                        container.style.overflow = 'hidden';
                        container.style.borderRadius = '50%';
                    }
                }
                
                // Also update the avatar div in dashboards if it exists
                const avatarDiv = document.getElementById('avatar');
                if (avatarDiv) {
                    avatarDiv.style.backgroundImage = `url(${dataUrl})`;
                    avatarDiv.style.backgroundSize = 'cover';
                    avatarDiv.style.backgroundPosition = 'center';
                    avatarDiv.style.backgroundRepeat = 'no-repeat';
                    avatarDiv.innerHTML = ''; // Clear any initials or loading content
                }
                
                try {
                    localStorage.setItem('yl_profilePictureURL', dataUrl);
                    localStorage.setItem('yl_profilePictureIsTemp', '1');
                    const currentUser = window.Auth?.auth?.currentUser;
                    if (currentUser?.uid) localStorage.setItem('yl_profilePictureUID', currentUser.uid);
                } catch (e) {}
            };
            reader.readAsDataURL(file);

            // Upload to Firebase Storage
            const storageRef = (firebase?.storage ? firebase.storage().ref() : window.Auth?.storage?.ref?.());
            if (!storageRef) {
                throw new Error('Firebase Storage not available');
            }
            const safeName = (file.name || 'upload').replace(/[^a-z0-9_.-]/gi, '_');
            const profilePicRef = storageRef.child(`profilePictures/${user.uid}/${Date.now()}_${safeName}`);
            
            const uploadTask = await profilePicRef.put(file);
            const downloadURL = await uploadTask.ref.getDownloadURL();

            // Save URL to Firestore (merge to avoid wiping other fields)
            if (window.Auth.db) {
                await window.Auth.db.collection('users').doc(user.uid).set({
                    profilePictureURL: downloadURL,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            // Also update Firebase Auth profile so it's universally available
            if (typeof user.updateProfile === 'function') {
                try {
                    await user.updateProfile({ photoURL: downloadURL });
                } catch (e) {
                    console.warn('Auth photoURL update failed (non-fatal):', e);
                }
            }

            console.log('Profile picture updated successfully', { downloadURL });
            // Ensure persisted URL shows in UI and remove any accidental filters
            profileImg.src = downloadURL;
            profileImg.style.filter = 'none';
            profileImg.style.opacity = '1';
            
            // Also update the avatar div in dashboards if it exists
            const avatarDiv = document.getElementById('avatar');
            if (avatarDiv) {
                avatarDiv.style.backgroundImage = `url(${downloadURL})`;
                avatarDiv.style.backgroundSize = 'cover';
                avatarDiv.style.backgroundPosition = 'center';
                avatarDiv.style.backgroundRepeat = 'no-repeat';
                avatarDiv.innerHTML = ''; // Clear any initials or loading content
            }
            
            try {
                localStorage.setItem('yl_profilePictureURL', downloadURL);
                localStorage.setItem('yl_profilePictureIsTemp', '0');
                localStorage.setItem('yl_profilePictureUID', user.uid);
            } catch (e) {}

            // Re-read from Firestore to verify persistence (best effort, non-blocking)
            try {
                if (window.Auth.db) {
                    const verifyDoc = await window.Auth.db.collection('users').doc(user.uid).get();
                    const verifiedUrl = verifyDoc?.data()?.profilePictureURL;
                    if (!verifiedUrl) {
                        console.warn('Profile URL not found after save; retrying set');
                        await window.Auth.db.collection('users').doc(user.uid).set({
                            profilePictureURL: downloadURL,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        // try read again
                        const verifyDoc2 = await window.Auth.db.collection('users').doc(user.uid).get();
                        const verifiedUrl2 = verifyDoc2?.data()?.profilePictureURL;
                        if (!verifiedUrl2) {
                            console.warn('Second verification failed; keeping UI with uploaded URL');
                        }
                    }
                }
            } catch (e) {
                console.warn('Verification read failed (non-fatal):', e);
            }
            showProfileSuccess('Profile picture updated!');

        } catch (error) {
            console.error('Error uploading profile picture:', error);
            showProfileError('Failed to upload profile picture. Please try again.');
            
            // Revert to previous image on error
            const userData = await getUserData(user);
            loadProfilePicture(user, userData);
        } finally {
            profileImg.classList.remove('loading');
            // Clear the file input
            event.target.value = '';
        }
    }

    async function getUserData(user) {
        try {
            if (window.Auth.db) {
                const doc = await window.Auth.db.collection('users').doc(user.uid).get();
                return doc.exists ? doc.data() : {};
            }
        } catch (error) {
            console.warn('Could not load user data:', error);
        }
        return {};
    }

    // Profile editing functionality
    let isEditMode = false;
    let originalProfileData = {};
    // Role loaded from backend; used to enforce non-changeable roles like tutor/admin
    let enforcedUserRole = null;

    function resetProfileToViewMode() {
        console.log('Resetting profile to view mode');
        
        if (isEditMode) {
            // If currently in edit mode, properly exit it
            exitEditMode();
        } else {
            // Even if not in edit mode, ensure UI is in correct state
            isEditMode = false;
            
            // Disable form fields
            const displayNameInput = document.getElementById('displayName');
            const bioInput = document.getElementById('bio');
            const timezoneSelect = document.getElementById('timezone');
            
            if (displayNameInput) displayNameInput.disabled = true;
            if (bioInput) bioInput.disabled = true;
            if (timezoneSelect) timezoneSelect.disabled = true;
            setLanguagesEnabled(false);
            setRoleEnabled(false);
            
            // Reset button to edit mode
            const editBtn = document.getElementById('edit-profile-btn');
            const saveBtn = document.getElementById('save-profile-btn');
            
            if (editBtn) {
                editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit Profile';
                editBtn.classList.remove('yl-btn-secondary');
                editBtn.classList.add('yl-btn-primary');
            }
            
            if (saveBtn) saveBtn.style.display = 'none';
        }
        
        // Clear any lingering status messages
        const statusEl = document.getElementById('profile-status');
        if (statusEl) {
            statusEl.style.display = 'none';
            statusEl.textContent = '';
        }
        
        console.log('Profile reset to view mode complete');
    }

    function toggleEditMode() {
        console.log('Toggle edit mode clicked');
        
        if (isEditMode) {
            // Currently in edit mode, the button is now "Cancel", so cancel edit
            cancelEdit();
        } else {
            // Enter edit mode
            enterEditMode();
        }
    }

    function enterEditMode() {
        console.log('Entering edit mode');
        isEditMode = true;
        
        // Store original data
        const displayNameInput = document.getElementById('displayName');
        const bioInput = document.getElementById('bio');
        const timezoneSelect = document.getElementById('timezone');
        
        originalProfileData = {
            displayName: displayNameInput?.value || '',
            bio: bioInput?.value || '',
            timezone: timezoneSelect?.value || '',
            languages: getSelectedLanguages(),
            role: getUserRole()
        };
        
        // Enable form fields
        if (displayNameInput) displayNameInput.disabled = false;
        if (bioInput) bioInput.disabled = false;
        if (timezoneSelect) timezoneSelect.disabled = false;
        setLanguagesEnabled(true);
        setRoleEnabled(true);
        
        // Transform edit button into cancel button
        const editBtn = document.getElementById('edit-profile-btn');
        const saveBtn = document.getElementById('save-profile-btn');
        
        if (editBtn) {
            editBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            editBtn.classList.remove('yl-btn-primary');
            editBtn.classList.add('yl-btn-secondary');
        }
        
        if (saveBtn) {
            saveBtn.style.display = 'block';
            saveBtn.disabled = false;
        }
        
        console.log('Edit mode activated');
    }

    function exitEditMode() {
        console.log('Exiting edit mode');
        isEditMode = false;
        
        // Disable form fields
        const displayNameInput = document.getElementById('displayName');
        const bioInput = document.getElementById('bio');
        const timezoneSelect = document.getElementById('timezone');
        
        if (displayNameInput) displayNameInput.disabled = true;
        if (bioInput) bioInput.disabled = true;
        if (timezoneSelect) timezoneSelect.disabled = true;
        setLanguagesEnabled(false);
        setRoleEnabled(false);
        
        // Transform button back to edit mode
        const editBtn = document.getElementById('edit-profile-btn');
        const saveBtn = document.getElementById('save-profile-btn');
        
        if (editBtn) {
            editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit Profile';
            editBtn.classList.remove('yl-btn-secondary');
            editBtn.classList.add('yl-btn-primary');
        }
        
        if (saveBtn) saveBtn.style.display = 'none';
        
        // Clear original data when exiting edit mode
        originalProfileData = {};
        
        console.log('Edit mode deactivated');
    }

    async function saveProfile() {
        console.log('Saving profile...');
        
        try {
            const user = window.Auth?.auth?.currentUser;
            if (!user) {
                throw new Error('No user signed in');
            }

            const displayNameInput = document.getElementById('displayName');
            const bioInput = document.getElementById('bio');
            const timezoneSelect = document.getElementById('timezone');
            
            const updatedData = {
                displayName: displayNameInput?.value?.trim() || '',
                bio: bioInput?.value?.trim() || '',
                timezone: timezoneSelect?.value || '',
                languages: getSelectedLanguages(),
                role: enforcedUserRole,  // Force use of enforced role for admins
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Update Firebase Auth displayName if changed
            if (updatedData.displayName !== user.displayName) {
                await user.updateProfile({
                    displayName: updatedData.displayName
                });
            }

            // Update Firestore document
            if (window.Auth.db) {
                await window.Auth.db.collection('users').doc(user.uid).update(updatedData);
            }

            // Update UI elements
            const profileDisplayName = document.getElementById('profile-displayName');
            if (profileDisplayName) {
                profileDisplayName.textContent = updatedData.displayName || 'User';
            }

            console.log('Profile updated successfully');
            showProfileSuccess('Profile updated successfully!');
            
            // Update the role badge with the new role
            updateRoleBadge(updatedData.role);
            
            // Exit edit mode
            exitEditMode();
            
        } catch (error) {
            console.error('Error updating profile:', error);
            showProfileError('Failed to update profile. Please try again.');
        }
    }

    function cancelEdit() {
        console.log('Cancelling edit...');
        
        // Restore original values
        const displayNameInput = document.getElementById('displayName');
        const bioInput = document.getElementById('bio');
        const timezoneSelect = document.getElementById('timezone');
        
        if (displayNameInput) displayNameInput.value = originalProfileData.displayName || '';
        if (bioInput) bioInput.value = originalProfileData.bio || '';
        if (timezoneSelect) timezoneSelect.value = originalProfileData.timezone || '';
        if (originalProfileData.languages) setSelectedLanguages(originalProfileData.languages);
        if (originalProfileData.role) setUserRole(originalProfileData.role);
        
        // Clear original data
        originalProfileData = {};
        
        exitEditMode();
    }

    function showProfileSuccess(message) {
        // Create or update status message
        const statusEl = document.getElementById('profile-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'profile-message profile-success';
            statusEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #dcfce7;
                border: 1px solid #bbf7d0;
                color: #16a34a;
                padding: 12px 16px;
                border-radius: 8px;
                z-index: 1001;
                font-size: 14px;
                display: block;
            `;
            
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    function showProfileError(message) {
        // Create or update status message
        const statusEl = document.getElementById('profile-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'profile-message profile-error';
            statusEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #fee2e2;
                border: 1px solid #fecaca;
                color: #dc2626;
                padding: 12px 16px;
                border-radius: 8px;
                z-index: 1001;
                font-size: 14px;
                display: block;
            `;
            
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    // Test function to manually open auth modal from console
    window.testAuthModal = function(mode = 'login') {
        console.log('Manual test of auth modal');
        openAuthModal(mode);
    };

    // Expose openAuthModal to window for backup event handlers
    window.openAuthModal = openAuthModal;

    // Expose switch functions for debugging
    window.switchToLogin = switchToLogin;
    window.switchToRegister = switchToRegister;

    // Comprehensive diagnostic function
    window.diagnoseModal = function() {
        console.log('=== MODAL DIAGNOSIS ===');
        
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const authModal = document.getElementById('auth-modal');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        console.log('Elements found:');
        console.log('- Login button:', !!loginBtn, loginBtn?.hasAuthListener);
        console.log('- Register button:', !!registerBtn, registerBtn?.hasAuthListener);
        console.log('- Auth modal:', !!authModal);
        console.log('- Login form:', !!loginForm);
        console.log('- Register form:', !!registerForm);
        
        if (loginForm && registerForm) {
            console.log('Current form states:');
            console.log('- Login form classes:', loginForm.className);
            console.log('- Register form classes:', registerForm.className);
            console.log('- Login form display:', getComputedStyle(loginForm).display);
            console.log('- Register form display:', getComputedStyle(registerForm).display);
            
            console.log('Form content preview:');
            console.log('- Login form header:', loginForm.querySelector('h2')?.textContent);
            console.log('- Register form header:', registerForm.querySelector('h2')?.textContent);
        }
        
        console.log('Available functions:');
        console.log('- window.openAuthModal:', typeof window.openAuthModal);
        console.log('- window.switchToLogin:', typeof window.switchToLogin);
        console.log('- window.switchToRegister:', typeof window.switchToRegister);
        
        return {loginBtn, registerBtn, authModal, loginForm, registerForm};
    };

    // Debug function to check current auth state
    window.checkAuthState = function() {
        console.log('=== Current Auth State ===');
        console.log('window.Auth available:', !!window.Auth);
        console.log('firebase available:', typeof firebase !== 'undefined');
        
        if (window.Auth && window.Auth.auth) {
            const currentUser = window.Auth.auth.currentUser;
            console.log('Current user:', currentUser);
            if (currentUser) {
                console.log('User details:', {
                    uid: currentUser.uid,
                    email: currentUser.email,
                    displayName: currentUser.displayName,
                    emailVerified: currentUser.emailVerified,
                    providerData: currentUser.providerData
                });
            } else {
                console.log('No user currently signed in');
            }
        }
        
        // Check if buttons are visible
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const profileBtn = document.getElementById('profile-btn');
        
        console.log('Button visibility:', {
            loginBtn: loginBtn ? loginBtn.style.display : 'not found',
            registerBtn: registerBtn ? registerBtn.style.display : 'not found',
            profileBtn: profileBtn ? profileBtn.style.display : 'not found'
        });
        console.log('=========================');
    };

    // Debug: Log when initialization is complete
    setTimeout(function() {
        console.log('Auth handler initialization check...');
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const googleBtn = document.getElementById('google-signin-btn');
        
        console.log('Handler status:', {
            loginBtn: loginBtn ? (loginBtn.hasAuthListener ? 'has listener' : 'missing listener') : 'not found',
            registerBtn: registerBtn ? (registerBtn.hasAuthListener ? 'has listener' : 'missing listener') : 'not found',
            googleBtn: googleBtn ? (googleBtn.hasAuthListener ? 'has listener' : 'missing listener') : 'not found'
        });
    }, 1000);

})();

// Final script completion verification
console.log('[Auth Script] 🎯 something.js execution completed');
console.log('[Auth Script] Verification check - run in console: window.__AUTH_SCRIPT_LOADED__');
