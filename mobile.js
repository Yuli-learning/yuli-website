/* =====================================================
   MOBILE.JS - Mobile Navigation Functionality
   Handles hamburger menu and mobile-specific interactions
   ===================================================== */

document.addEventListener('DOMContentLoaded', function() {
    
    // Create mobile navigation elements
    createMobileNavigation();
    
    // Initialize mobile navigation
    initializeMobileNavigation();
    
    // Handle mobile-specific interactions
    handleMobileInteractions();
    
});

function createMobileNavigation() {
    // Check if we're on mobile
    if (window.innerWidth > 767) return;
    
    const header = document.querySelector('header .container');
    if (!header) return;
    
    // Create hamburger menu button
    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'mobile-menu-toggle';
    hamburgerBtn.innerHTML = '<i class="fas fa-bars"></i>';
    hamburgerBtn.setAttribute('aria-label', 'Open navigation menu');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    
    // Create mobile navigation overlay
    const mobileNavOverlay = document.createElement('div');
    mobileNavOverlay.className = 'mobile-nav-overlay';
    
    // Create mobile navigation menu
    const mobileNav = document.createElement('nav');
    mobileNav.className = 'mobile-nav';
    mobileNav.innerHTML = `
        <div class="mobile-nav-header">
            <a href="/" class="mobile-nav-logo">Yuli<span>.</span></a>
            <button class="mobile-nav-close" aria-label="Close navigation menu">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="mobile-nav-links">
            <a href="#subjects">Subjects</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
            <a href="pages/tutor-dashboard.html" id="mobile-dashboard-link" style="display: none;">Dashboard</a>
        </div>
    `;
    
    // Insert elements into DOM
    header.appendChild(hamburgerBtn);
    document.body.appendChild(mobileNavOverlay);
    document.body.appendChild(mobileNav);
}

function initializeMobileNavigation() {
    const hamburgerBtn = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
    const closeBtn = document.querySelector('.mobile-nav-close');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');
    
    if (!hamburgerBtn || !mobileNav || !mobileNavOverlay || !closeBtn) return;
    
    // Open mobile menu
    function openMobileMenu() {
        mobileNav.classList.add('active');
        mobileNavOverlay.classList.add('active');
        hamburgerBtn.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
        
        // Focus management
        const firstLink = mobileNav.querySelector('.mobile-nav-links a');
        if (firstLink) {
            setTimeout(() => firstLink.focus(), 300);
        }
    }
    
    // Close mobile menu
    function closeMobileMenu() {
        mobileNav.classList.remove('active');
        mobileNavOverlay.classList.remove('active');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        
        // Return focus to hamburger button
        hamburgerBtn.focus();
    }
    
    // Event listeners
    hamburgerBtn.addEventListener('click', openMobileMenu);
    closeBtn.addEventListener('click', closeMobileMenu);
    mobileNavOverlay.addEventListener('click', closeMobileMenu);
    
    // Close menu when clicking on navigation links
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Small delay to allow smooth navigation
            setTimeout(closeMobileMenu, 100);
        });
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
            closeMobileMenu();
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 767 && mobileNav.classList.contains('active')) {
            closeMobileMenu();
        }
    });
}

function handleMobileInteractions() {
    // Smooth scrolling for mobile navigation links
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a[href^="#"]');
    
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                // Close mobile menu first
                const mobileNav = document.querySelector('.mobile-nav');
                const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
                const hamburgerBtn = document.querySelector('.mobile-menu-toggle');
                
                if (mobileNav && mobileNavOverlay && hamburgerBtn) {
                    mobileNav.classList.remove('active');
                    mobileNavOverlay.classList.remove('active');
                    hamburgerBtn.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                }
                
                // Smooth scroll to target
                setTimeout(() => {
                    const headerHeight = document.querySelector('header').offsetHeight;
                    const targetPosition = targetSection.offsetTop - headerHeight - 20;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }, 300);
            }
        });
    });
    
    // Handle mobile-specific auth state changes
    handleMobileAuthState();
    
    // Mobile touch improvements
    addMobileTouchImprovements();
}

function handleMobileAuthState() {
    // Show/hide dashboard link in mobile menu based on auth state
    const mobileNav = document.querySelector('.mobile-nav');
    if (!mobileNav) return;
    
    const mobileDashboardLink = document.getElementById('mobile-dashboard-link');
    const desktopDashboardLink = document.getElementById('dashboard-link');
    
    if (mobileDashboardLink && desktopDashboardLink) {
        // Sync mobile dashboard link visibility with desktop
        const syncDashboardVisibility = () => {
            const isVisible = window.getComputedStyle(desktopDashboardLink).display !== 'none';
            mobileDashboardLink.style.display = isVisible ? 'block' : 'none';
        };
        
        // Initial sync
        syncDashboardVisibility();
        
        // Watch for changes (when user logs in/out)
        const observer = new MutationObserver(syncDashboardVisibility);
        observer.observe(desktopDashboardLink, {
            attributes: true,
            attributeFilter: ['style']
        });
    }
}

function addMobileTouchImprovements() {
    // Add touch-friendly interactions for mobile
    
    // Improve button touch targets
    const buttons = document.querySelectorAll('.cta-button, .scroll-btn, .auth-btn');
    buttons.forEach(button => {
        if (window.innerWidth <= 767) {
            button.style.minHeight = '44px';
            button.style.minWidth = '44px';
        }
    });
    
    // Add haptic feedback for supported devices
    function addHapticFeedback(element) {
        element.addEventListener('touchstart', function() {
            if ('vibrate' in navigator) {
                navigator.vibrate(10); // 10ms vibration
            }
        });
    }
    
    // Add haptic feedback to interactive elements
    const interactiveElements = document.querySelectorAll(
        '.mobile-menu-toggle, .cta-button, .scroll-btn, .mobile-nav-links a'
    );
    
    interactiveElements.forEach(addHapticFeedback);
    
    // Prevent zoom on double tap for specific elements
    const preventZoomElements = document.querySelectorAll('.auth-input, .form-input');
    preventZoomElements.forEach(element => {
        element.addEventListener('touchend', function(e) {
            e.preventDefault();
            this.focus();
        });
    });
}

// Mobile orientation change handler
window.addEventListener('orientationchange', function() {
    // Close mobile menu on orientation change
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
    const hamburgerBtn = document.querySelector('.mobile-menu-toggle');
    
    if (mobileNav && mobileNav.classList.contains('active')) {
        setTimeout(() => {
            mobileNav.classList.remove('active');
            mobileNavOverlay.classList.remove('active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }, 100);
    }
});

// Mobile performance optimizations
function optimizeForMobile() {
    if (window.innerWidth <= 767) {
        // Reduce animation complexity on mobile
        const mathSymbols = document.querySelectorAll('.math-symbol');
        mathSymbols.forEach(symbol => {
            symbol.style.willChange = 'auto';
        });
        
        // Optimize scroll performance
        let ticking = false;
        function updateScrollPosition() {
            // Throttle scroll events
            if (!ticking) {
                requestAnimationFrame(() => {
                    ticking = false;
                });
                ticking = true;
            }
        }
        
        window.addEventListener('scroll', updateScrollPosition, { passive: true });
    }
}

// Initialize mobile optimizations
document.addEventListener('DOMContentLoaded', optimizeForMobile);

// Export functions for potential external use
window.MobileNav = {
    open: () => {
        const hamburgerBtn = document.querySelector('.mobile-menu-toggle');
        if (hamburgerBtn) hamburgerBtn.click();
    },
    close: () => {
        const closeBtn = document.querySelector('.mobile-nav-close');
        if (closeBtn) closeBtn.click();
    },
    isOpen: () => {
        const mobileNav = document.querySelector('.mobile-nav');
        return mobileNav ? mobileNav.classList.contains('active') : false;
    }
};
