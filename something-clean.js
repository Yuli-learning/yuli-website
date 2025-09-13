// Clean Authentication Modal System
(function() {
    'use strict';
    
    console.log('Clean auth modal system loading...');

    // Robust, accessible password visibility toggle
    (function initPasswordToggle() {
        const ROOT = document.querySelector('#auth-modal') || document;
        if (ROOT.__pwToggleBound) return; // prevent duplicates
        ROOT.__pwToggleBound = true;

        ROOT.addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-password');
            if (!btn) return;

            const targetSel = btn.getAttribute('data-target');
            if (!targetSel) return;

            const input = ROOT.querySelector(targetSel);
            if (!input) return;

            try {
                const wasType = input.type;
                const start = input.selectionStart;
                const end = input.selectionEnd;

                const show = wasType === 'password';
                input.setAttribute('type', show ? 'text' : 'password');

                // restore caret if possible
                if (typeof start === 'number' && typeof end === 'number') {
                    input.setSelectionRange(start, end);
                }
                input.focus({ preventScroll: true });

                // update aria + icon
                btn.setAttribute('aria-pressed', String(show));
                btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
                btn.classList.toggle('is-visible', show);
                
                const icon = btn.querySelector('.icon-eye');
                if (icon) {
                    if (show) {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                    } else {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                    }
                }

                console.info('Password toggle', { targetSel, show });

            } catch (err) {
                console.error('Password toggle failed', err);
            }
        });
    })();

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing clean auth modal...');
        setupAuthButtons();
        setupModalHandlers();
        setupFormSwitching();
    }

    function setupAuthButtons() {
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const googleSigninBtn = document.getElementById('google-signin-btn');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Login button clicked - opening login form');
                openModal('login');
            });
        }
        
        if (registerBtn) {
            registerBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Register button clicked - opening register form');
                openModal('register');
            });
        }
        
        if (googleSigninBtn) {
            googleSigninBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Google sign-in button clicked');
                handleGoogleSignIn();
            });
        }
    }

    function setupModalHandlers() {
        const authModal = document.getElementById('auth-modal');
        const closeBtn = authModal?.querySelector('.close-modal');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        
        if (authModal) {
            authModal.addEventListener('click', function(e) {
                if (e.target === authModal) {
                    closeModal();
                }
            });
        }
    }

    function setupFormSwitching() {
        const showRegister = document.getElementById('show-register');
        const showLogin = document.getElementById('show-login');
        
        if (showRegister) {
            showRegister.addEventListener('click', function(e) {
                e.preventDefault();
                switchForms('register');
            });
        }
        
        if (showLogin) {
            showLogin.addEventListener('click', function(e) {
                e.preventDefault();
                switchForms('login');
            });
        }
        
        // Set up form submission handler
        const registerForm = document.getElementById('register-form-inner');
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegisterSubmit);
        }
    }

    function handleRegisterSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const accountType = formData.get('user-role');
        
        if (accountType === 'tutor') {
            // Show tutor approval banner
            showTutorApprovalBanner();
        } else {
            // Handle normal student/parent registration
            console.log('Processing student/parent registration...');
            // Add your normal registration logic here
        }
    }

    function showTutorApprovalBanner() {
        // Close the modal first
        closeModal();
        
        // Create and show approval banner
        const banner = document.createElement('div');
        banner.className = 'tutor-approval-banner';
        banner.innerHTML = `
            <div class="banner-content">
                <div class="banner-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="banner-text">
                    <h3>Your tutor application has been sent for approval.</h3>
                    <p>You will be notified once approved.</p>
                </div>
                <button class="banner-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Add banner to top of page
        document.body.insertBefore(banner, document.body.firstChild);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (banner.parentNode) {
                banner.remove();
            }
        }, 10000);
    }

    // Google Sign-in handler
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
            
            console.log('Calling Google sign-in...');
            const result = await signInWithGoogle();
            console.log('Google sign-in successful:', result.user);
            
            // Close modal and redirect
            closeModal();
            console.log('Redirecting to dashboard...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
            
        } catch (error) {
            console.error('Google sign-in failed:', error);
            
            // Reset button state
            const googleBtn = document.getElementById('google-signin-btn');
            if (googleBtn) {
                googleBtn.disabled = false;
                const span = googleBtn.querySelector('span');
                if (span) span.textContent = 'Continue with Google';
            }
            
            // Show error message
            alert('Sign-in failed. Please try again.');
        }
    }

    function openModal(type) {
        console.log('Opening modal with type:', type);
        
        const authModal = document.getElementById('auth-modal');
        if (!authModal) {
            console.error('Auth modal not found');
            return;
        }
        
        // Switch to the correct form first
        switchForms(type);
        
        // Show the modal
        authModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus first input
        setTimeout(() => {
            const firstInput = authModal.querySelector('input[type="email"], input[type="text"]');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }

    function closeModal() {
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function switchForms(type) {
        console.log('Switching to form type:', type);
        
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        if (!loginForm || !registerForm) {
            console.error('Forms not found:', {loginForm: !!loginForm, registerForm: !!registerForm});
            return;
        }
        
        if (type === 'login') {
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            console.log('Switched to login form');
        } else if (type === 'register') {
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
            console.log('Switched to register form');
        }
    }

    // Password toggle is handled by the delegated listener at the top of the file

    // Expose functions globally for debugging
    window.openAuthModal = openModal;
    window.switchAuthForms = switchForms;
    window.closeAuthModal = closeModal;

})();
