// SpiritualShaadi - Core Application Script

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    connections: "spiritualShaadi.connections.v2",
    adminSettings: "spiritualShaadi.adminSettings.v1",
    authSession: "spiritualShaadi.authSession.v2",
    accounts: "spiritualShaadi.accounts.v1"
  };

  const DEFAULT_CONNECTIONS = {
    matched: [],
    incoming: [],
    sent: []
  };

  const DEFAULT_ADMIN_SETTINGS = {
    content: {
      brandName: "SpiritualShaadi",
      heroTagline: "Where Consciousness Meets Companionship",
      heroTitle: "Find Your |Spiritual Mirror| & Evolve Together",
      heroDescription: "The premium matchmaking destination for seekers aligned on faiths, values, deities, and sacred organizations in India.",
      feature1Title: "Verified Spiritual Profiles",
      feature1Body: "Review serious profiles with faith, community, lifestyle, diet, and sadhana details before sending a request.",
      feature2Title: "Request First, Chat Later",
      feature2Body: "Send a connection request first. Private chat opens only after the other member accepts and it becomes a match.",
      feature3Title: "Focused Match Search",
      feature3Body: "Search by religion, spiritual path, diet, caste or community, and compatibility score to shortlist relevant members.",
      premiumTitle: "Premium Membership Plans",
      premiumDescription: "Upgrade to reach more relevant profiles, unlock advanced filters, and receive assisted matchmaking support.",
      footerDescription: "A specialized matrimonial space built for conscious seekers who want a life partner aligned on dharma, devotion, meditation, and family values."
    },
    payment: {
      provider: "Razorpay",
      mode: "test",
      publicKey: "",
      secretKey: "",
      webhookSecret: "",
      currency: "INR",
      checkoutNote: "Membership payment for SpiritualShaadi premium plan."
    },
    plans: {
      silver: { name: "Silver Seeker", price: "Rs. 1,500", period: "/ 3 Months" },
      gold: { name: "Gold Devotee", price: "Rs. 3,500", period: "/ 6 Months" },
      platinum: { name: "Platinum Soulmate", price: "Rs. 6,000", period: "/ 1 Year" }
    }
  };

  function readJsonFromStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Unable to read ${key} from localStorage`, error);
      return fallback;
    }
  }

  function writeJsonToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Unable to save ${key} to localStorage`, error);
    }
  }

  function isHttpRuntime() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
  }

  function removeJsonFromStorage(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn(`Unable to remove ${key} from browser storage`, error);
    }
  }

  function deepMerge(defaults, override = {}) {
    const merged = Array.isArray(defaults) ? [...defaults] : { ...defaults };
    Object.keys(override || {}).forEach(key => {
      if (
        override[key] &&
        typeof override[key] === "object" &&
        !Array.isArray(override[key]) &&
        defaults[key] &&
        typeof defaults[key] === "object" &&
        !Array.isArray(defaults[key])
      ) {
        merged[key] = deepMerge(defaults[key], override[key]);
      } else {
        merged[key] = override[key];
      }
    });
    return merged;
  }

  function buildConnectionState() {
    const saved = readJsonFromStorage(STORAGE_KEYS.connections, DEFAULT_CONNECTIONS);
    const merged = deepMerge(DEFAULT_CONNECTIONS, saved);
    return {
      matched: new Set(merged.matched || []),
      incoming: new Set(merged.incoming || []),
      sent: new Set(merged.sent || [])
    };
  }

  function loadAccounts() {
    const saved = readJsonFromStorage(STORAGE_KEYS.accounts, []);
    if (!Array.isArray(saved)) return [];

    return saved.map(account => ({
      id: account.id,
      profileId: account.profileId,
      name: account.name || "",
      mobile: account.mobile || "",
      mobileVerified: Boolean(account.mobileVerified),
      mobileVerifiedAt: account.mobileVerifiedAt || null,
      email: account.email || "",
      passwordHash: account.passwordHash || "",
      createdAt: account.createdAt || new Date().toISOString(),
      profile: account.profile || null
    })).filter(account => account.id && account.profileId && account.passwordHash);
  }

  function readAuthSession() {
    const localSession = readJsonFromStorage(STORAGE_KEYS.authSession, {});
    if (localSession.accountId) return localSession;

    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.authSession);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.warn("Unable to read auth session from sessionStorage", error);
      return {};
    }
  }

  function buildAuthState() {
    const saved = readAuthSession();
    return {
      accountId: saved.accountId || null,
      mode: "signin",
      signupOtp: {
        mobile: null,
        code: null,
        verified: false
      }
    };
  }

  // --- STATE ---
  const state = {
    userProfile: null, // Set during onboarding
    profiles: [...mockProfiles], // Loaded from profiles.js
    filters: {
      gender: "all",
      religion: "all",
      path: "all",
      diet: "all",
      caste: "all"
    },
    weights: {
      diet: 35,
      path: 45,
      practice: 20
    },
    likedProfiles: new Set(),
    connections: buildConnectionState(),
    accounts: loadAccounts(),
    auth: buildAuthState(),
    activeChatUserId: null,
    conversations: {}, // Store messages by profile id
    onboardingStep: 1,
    activeChatTab: "matches",
    adminSettings: deepMerge(
      DEFAULT_ADMIN_SETTINGS,
      readJsonFromStorage(STORAGE_KEYS.adminSettings, {})
    )
  };

  // Default fallback user profile (prior to registration)
  const defaultUserProfile = {
    name: "Independent Seeker",
    gender: "Female",
    age: 26,
    religion: "Hinduism",
    sect: "Vaishnavism",
    caste: "Brahmin",
    subcaste: "Saraswat",
    spiritualPath: "ISKCON (Krishna Consciousness)",
    deity: "Lord Krishna",
    diet: "Strict Sattvic Vegetarian (No Onion/Garlic/Mushroom)",
    sadhana: "Daily chanting, reading Gita, temple service",
    hobbies: "Chanting, reading, meditation"
  };

  function persistConnections() {
    writeJsonToStorage(STORAGE_KEYS.connections, {
      matched: [...state.connections.matched],
      incoming: [...state.connections.incoming],
      sent: [...state.connections.sent]
    });
  }

  function getConnectionStatus(profileId) {
    if (state.connections.matched.has(profileId)) return "matched";
    if (state.connections.incoming.has(profileId)) return "incoming";
    if (state.connections.sent.has(profileId)) return "sent";
    return "none";
  }

  function getConnectionMeta(profileId) {
    const status = getConnectionStatus(profileId);
    const metaByStatus = {
      matched: {
        label: "Chat",
        icon: "fa-comments",
        className: "btn-card-primary",
        disabled: false
      },
      incoming: {
        label: "Review Request",
        icon: "fa-user-check",
        className: "btn-card-secondary",
        disabled: false
      },
      sent: {
        label: "Request Sent",
        icon: "fa-hourglass-half",
        className: "btn-card-secondary",
        disabled: true
      },
      none: {
        label: "Send Request",
        icon: "fa-user-plus",
        className: "btn-card-secondary",
        disabled: false
      }
    };
    return metaByStatus[status];
  }

  function getConnectionBadgeLabel(status) {
    const labels = {
      matched: "Matched",
      incoming: "Request Received",
      sent: "Request Sent",
      none: "Request Required"
    };
    return labels[status] || labels.none;
  }

  function updateJourneyStats() {
    setText(statTotalProfiles, state.profiles.length);
    setText(statReceivedRequests, state.connections.incoming.size);
    setText(statSentRequests, state.connections.sent.size);
    setText(statMatchedChats, state.connections.matched.size);
  }

  function ensureConversation(profileId) {
    if (!state.conversations[profileId]) {
      const candidate = state.profiles.find(p => p.id === profileId);
      if (!candidate) return;
      state.conversations[profileId] = [
        { sender: "them", text: candidate.chatGreeting, time: "Just now" }
      ];
    }
  }

  function clearActiveChat() {
    state.activeChatUserId = null;
    chatTypingIndicator.style.display = "none";
    chatMessageStream.innerHTML = "";
    activeChatPane.classList.remove("active");
    chatPlaceholderView.style.display = "flex";
  }

  // --- INITIALIZE CONVERSATIONS ---
  state.profiles.forEach(p => {
    if (state.connections.matched.has(p.id)) {
      ensureConversation(p.id);
    }
  });

  // --- DOM ELEMENTS ---
  const views = document.querySelectorAll(".view-section");
  const navLinks = document.querySelectorAll(".nav-link");
  const footerLinks = document.querySelectorAll(".footer-nav-link");
  const logoBtn = document.getElementById("btn-logo");
  const navRegisterLink = document.getElementById("nav-register");
  const cardContainer = document.getElementById("profile-card-container");
  const matchCountLabel = document.getElementById("match-count-label");

  // Onboarding elements
  const wizardProgressSteps = document.querySelectorAll(".progress-step");
  const wizardProgressBar = document.getElementById("wizard-progress-bar");
  const wizardSteps = document.querySelectorAll(".wizard-step");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");

  // Filter elements
  const filtGender = document.getElementById("filt-gender");
  const filtReligion = document.getElementById("filt-religion");
  const filtPath = document.getElementById("filt-path");
  const filtDiet = document.getElementById("filt-diet");
  const filtCaste = document.getElementById("filt-caste");
  const btnResetFilters = document.getElementById("btn-reset-filters");

  // Weights elements
  const weightDiet = document.getElementById("weight-diet");
  const weightPath = document.getElementById("weight-path");
  const weightPractice = document.getElementById("weight-practice");
  const labelWDiet = document.getElementById("label-w-diet");
  const labelWPath = document.getElementById("label-w-path");
  const labelWPractice = document.getElementById("label-w-practice");

  // Quick search elements
  const quickGender = document.getElementById("quick-gender");
  const quickReligion = document.getElementById("quick-religion");
  const quickPath = document.getElementById("quick-path");
  const quickDiet = document.getElementById("quick-diet");
  const btnQuickSearch = document.getElementById("btn-quick-search");

  // Auth elements
  const authGate = document.getElementById("auth-gate");
  const onboardingWizardWrapper = document.getElementById("onboarding-wizard-wrapper");
  const authModeButtons = document.querySelectorAll("[data-auth-mode]");
  const authForms = document.querySelectorAll(".auth-form");
  const authSigninForm = document.getElementById("auth-signin-form");
  const authSignupForm = document.getElementById("auth-signup-form");
  const signinIdentifierInput = document.getElementById("signin-identifier");
  const signinPasswordInput = document.getElementById("signin-password");
  const signinRememberInput = document.getElementById("signin-remember");
  const signupNameInput = document.getElementById("signup-name");
  const signupMobileInput = document.getElementById("signup-mobile");
  const signupOtpInput = document.getElementById("signup-otp");
  const signupEmailInput = document.getElementById("signup-email");
  const signupPasswordInput = document.getElementById("signup-password");
  const signupConfirmPasswordInput = document.getElementById("signup-confirm-password");
  const signupTermsInput = document.getElementById("signup-terms");
  const btnSendSignupOtp = document.getElementById("btn-send-signup-otp");
  const btnAuthForgot = document.getElementById("btn-auth-forgot");
  const btnAuthLogout = document.getElementById("btn-auth-logout");
  const authStatus = document.getElementById("auth-status");
  const authMemberLabel = document.getElementById("auth-member-label");
  const authProfileLabel = document.getElementById("auth-profile-label");

  // Chat elements
  const inboxUserList = document.getElementById("inbox-user-list");
  const incomingRequestList = document.getElementById("incoming-request-list");
  const sentRequestList = document.getElementById("sent-request-list");
  const chatPlaceholderView = document.getElementById("chat-placeholder-view");
  const activeChatPane = document.getElementById("active-chat-pane");
  const activeChatAvatar = document.getElementById("active-chat-avatar");
  const activeChatName = document.getElementById("active-chat-name");
  const activeChatStatus = document.getElementById("active-chat-status");
  const chatMessageStream = document.getElementById("chat-message-stream");
  const chatUserTextbox = document.getElementById("chat-user-textbox");
  const btnSendChat = document.getElementById("btn-send-chat");
  const chatTypingIndicator = document.getElementById("chat-typing-indicator");

  // Modal elements
  const profileDetailModal = document.getElementById("profile-detail-modal");
  const btnModalClose = document.getElementById("btn-modal-close");
  const modalHeroBanner = document.getElementById("modal-hero-banner");
  const modalAvatarElement = document.getElementById("modal-avatar-element");
  const modalNameText = document.getElementById("modal-name-text");
  const modalPathText = document.getElementById("modal-path-text");
  const modalCompatibilityText = document.getElementById("modal-compatibility-text");
  const modalBioText = document.getElementById("modal-bio-text");
  const modalReligionText = document.getElementById("modal-religion-text");
  const modalSectText = document.getElementById("modal-sect-text");
  const modalCasteText = document.getElementById("modal-caste-text");
  const modalSubcasteText = document.getElementById("modal-subcaste-text");
  const modalDietText = document.getElementById("modal-diet-text");
  const modalDeityText = document.getElementById("modal-deity-text");
  const modalSadhanaText = document.getElementById("modal-sadhana-text");
  const modalHobbiesContainer = document.getElementById("modal-hobbies-container");
  const modalBtnChat = document.getElementById("modal-btn-chat");
  const modalBtnLike = document.getElementById("modal-btn-like");

  // Content setting targets
  const siteLogoText = document.getElementById("site-logo-text");
  const contentHeroTagline = document.getElementById("content-hero-tagline");
  const contentHeroTitle = document.getElementById("content-hero-title");
  const contentHeroDescription = document.getElementById("content-hero-description");
  const contentFeature1Title = document.getElementById("content-feature-1-title");
  const contentFeature1Body = document.getElementById("content-feature-1-body");
  const contentFeature2Title = document.getElementById("content-feature-2-title");
  const contentFeature2Body = document.getElementById("content-feature-2-body");
  const contentFeature3Title = document.getElementById("content-feature-3-title");
  const contentFeature3Body = document.getElementById("content-feature-3-body");
  const contentPremiumTitle = document.getElementById("content-premium-title");
  const contentPremiumDescription = document.getElementById("content-premium-description");
  const contentFooterBrand = document.getElementById("content-footer-brand");
  const contentFooterDescription = document.getElementById("content-footer-description");
  const contentFooterBottom = document.getElementById("content-footer-bottom");
  const statTotalProfiles = document.getElementById("stat-total-profiles");
  const statReceivedRequests = document.getElementById("stat-received-requests");
  const statSentRequests = document.getElementById("stat-sent-requests");
  const statMatchedChats = document.getElementById("stat-matched-chats");

  // Mobile menu
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const navMenu = document.querySelector(".nav-menu");

  // --- VIEW NAVIGATION ENGINE ---
  function switchView(viewId) {
    views.forEach(section => {
      section.classList.remove("active");
      if (section.id === viewId) {
        section.classList.add("active");
      }
    });

    // Update Nav bar highlighting
    navLinks.forEach(link => {
      link.classList.remove("active");
      if (link.getAttribute("data-view") === viewId) {
        link.classList.add("active");
      }
    });

    // Reset mobile navigation if open
    navMenu.classList.remove("mobile-open");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Handle view specific initializations
    if (viewId === "view-dashboard") {
      renderProfileFeed();
    } else if (viewId === "view-requests") {
      renderConnectionRequests();
    } else if (viewId === "view-chat") {
      renderChatSidebar();
      openFirstMatchedChatIfNeeded();
    } else if (viewId === "view-register") {
      updateAuthUI();
    }
  }

  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.getAttribute("data-view");
      switchView(targetView);
    });
  });

  footerLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.getAttribute("data-view");
      switchView(targetView);
    });
  });

  document.querySelectorAll("[data-view-shortcut]").forEach(button => {
    button.addEventListener("click", () => {
      switchView(button.getAttribute("data-view-shortcut"));
    });
  });

  logoBtn.addEventListener("click", () => switchView("view-landing"));

  // Mobile hamburger toggle
  mobileMenuBtn.addEventListener("click", () => {
    navMenu.classList.toggle("mobile-open");
    // Simple visual responsive transition logic
    if (navMenu.classList.contains("mobile-open")) {
      navMenu.style.display = "flex";
      navMenu.style.flexDirection = "column";
      navMenu.style.position = "absolute";
      navMenu.style.top = "4.5rem";
      navMenu.style.left = "0";
      navMenu.style.right = "0";
      navMenu.style.background = "var(--bg-primary)";
      navMenu.style.padding = "2rem";
      navMenu.style.borderBottom = "1px solid var(--border-gold)";
      navMenu.style.gap = "1rem";
    } else {
      navMenu.removeAttribute("style");
    }
  });

  function normalizeMobile(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeIdentifier(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
  }

  function isValidPassword(value) {
    return String(value || "").length >= 8;
  }

  function makeAccountId() {
    return `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createProfileId() {
    let profileId = "";
    do {
      profileId = `SS${Math.floor(100000 + Math.random() * 900000)}`;
    } while (state.accounts.some(account => account.profileId === profileId));
    return profileId;
  }

  function hashPassword(password, salt) {
    // Static demo only. Production auth must hash and verify passwords on a server.
    const input = `${salt}:${password}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `local-fnv1a:${(hash >>> 0).toString(16)}`;
  }

  function persistAccounts() {
    writeJsonToStorage(STORAGE_KEYS.accounts, state.accounts);
  }

  function getAccountById(accountId) {
    return state.accounts.find(account => account.id === accountId) || null;
  }

  function getActiveAccount() {
    return getAccountById(state.auth.accountId);
  }

  function findAccountByIdentifier(identifier) {
    const normalized = normalizeIdentifier(identifier);
    const mobile = normalizeMobile(identifier);
    if (!normalized && !mobile) return null;

    return state.accounts.find(account => {
      const accountMobile = normalizeMobile(account.mobile);
      const accountEmail = normalizeEmail(account.email);
      const accountProfileId = normalizeIdentifier(account.profileId);

      return (
        (mobile && accountMobile === mobile) ||
        (normalized && accountEmail === normalized) ||
        (normalized && accountProfileId === normalized)
      );
    }) || null;
  }

  function getAccountDisplayName(account) {
    return account?.profile?.name || account?.name || account?.email || account?.mobile || "Member";
  }

  function persistAuthSession(remember = true) {
    const session = { accountId: state.auth.accountId };
    try {
      if (remember) {
        localStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session));
        sessionStorage.removeItem(STORAGE_KEYS.authSession);
      } else {
        sessionStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session));
        localStorage.removeItem(STORAGE_KEYS.authSession);
      }
    } catch (error) {
      console.warn("Unable to save auth session", error);
    }
  }

  function showAuthStatus(message, type = "info") {
    authStatus.textContent = message;
    authStatus.classList.remove("error", "success");
    if (type !== "info") authStatus.classList.add(type);
  }

  function setAuthMode(mode) {
    state.auth.mode = mode;
    authModeButtons.forEach(button => {
      button.classList.toggle("active", button.getAttribute("data-auth-mode") === mode);
    });
    authForms.forEach(form => {
      form.classList.toggle("active", form.id === `auth-${mode}-form`);
    });
    clearAuthFieldErrors();
    showAuthStatus(
      mode === "signin"
        ? "Enter your mobile, email, or profile ID with your password."
        : "Create your member account first. You will complete the detailed profile next."
    );
  }

  function setFieldError(field, hasError) {
    if (!field) return;
    field.classList.toggle("field-error", hasError);
  }

  function clearAuthFieldErrors() {
    [
      signinIdentifierInput,
      signinPasswordInput,
      signupNameInput,
      signupMobileInput,
      signupOtpInput,
      signupEmailInput,
      signupPasswordInput,
      signupConfirmPasswordInput
    ].forEach(field => setFieldError(field, false));
  }

  function hydrateSessionAccount() {
    const account = getActiveAccount();
    if (!account) {
      state.auth.accountId = null;
      state.userProfile = null;
      removeJsonFromStorage(STORAGE_KEYS.authSession);
      return;
    }

    state.userProfile = account.profile || null;
    if (account.profile) {
      populateOnboardingForm(account.profile);
    } else {
      prefillAccountBasics(account);
    }
  }

  function signInAccount(account, remember = true) {
    state.auth.accountId = account.id;
    state.userProfile = account.profile || null;
    persistAuthSession(remember);
    hydrateSessionAccount();
    updateAuthUI();
  }

  function clearAuthSession() {
    state.auth.accountId = null;
    state.userProfile = null;
    removeJsonFromStorage(STORAGE_KEYS.authSession);
    signinIdentifierInput.value = "";
    signinPasswordInput.value = "";
    setAuthMode("signin");
    updateAuthUI();
  }

  function updateAuthUI() {
    const account = getActiveAccount();
    const isSignedIn = Boolean(account);

    authGate.style.display = isSignedIn ? "none" : "block";
    onboardingWizardWrapper.classList.toggle("auth-locked", !isSignedIn);
    authMemberLabel.textContent = isSignedIn ? getAccountDisplayName(account) : "";
    authProfileLabel.textContent = isSignedIn ? `Profile ID: ${account.profileId}` : "";
    if (navRegisterLink) {
      navRegisterLink.innerHTML = isSignedIn
        ? `<i class="fa-solid fa-id-card"></i> My Profile`
        : `<i class="fa-solid fa-right-to-bracket"></i> Member Login`;
    }

    if (isSignedIn) {
      prefillAccountBasics(account);
      if (account.profile) populateOnboardingForm(account.profile);
    }
  }

  function handleSignin(event) {
    event.preventDefault();
    clearAuthFieldErrors();

    const identifier = signinIdentifierInput.value;
    const password = signinPasswordInput.value;
    let hasError = false;

    if (!normalizeIdentifier(identifier)) {
      setFieldError(signinIdentifierInput, true);
      hasError = true;
    }
    if (!password) {
      setFieldError(signinPasswordInput, true);
      hasError = true;
    }
    if (hasError) {
      showAuthStatus("Enter your login ID and password.", "error");
      return;
    }

    const account = findAccountByIdentifier(identifier);
    if (!account || account.passwordHash !== hashPassword(password, account.id)) {
      setFieldError(signinIdentifierInput, true);
      setFieldError(signinPasswordInput, true);
      showAuthStatus("Login failed. Check your mobile/email/profile ID and password.", "error");
      return;
    }

    signInAccount(account, signinRememberInput.checked);
    if (account.profile) {
      switchView("view-dashboard");
    } else {
      showAuthStatus(`Welcome ${getAccountDisplayName(account)}. Complete your profile to start matching.`, "success");
    }
  }

  function handleSignup(event) {
    event.preventDefault();
    clearAuthFieldErrors();

    const name = signupNameInput.value.trim();
    const mobile = normalizeMobile(signupMobileInput.value);
    const otp = signupOtpInput.value.trim();
    const email = normalizeEmail(signupEmailInput.value);
    const password = signupPasswordInput.value;
    const confirmPassword = signupConfirmPasswordInput.value;
    let hasError = false;

    if (name.length < 2) {
      setFieldError(signupNameInput, true);
      hasError = true;
    }
    if (mobile.length < 10 || mobile.length > 15) {
      setFieldError(signupMobileInput, true);
      hasError = true;
    }
    if (!state.auth.signupOtp.verified || state.auth.signupOtp.mobile !== mobile || otp !== state.auth.signupOtp.code) {
      setFieldError(signupOtpInput, true);
      hasError = true;
    }
    if (!isValidEmail(email)) {
      setFieldError(signupEmailInput, true);
      hasError = true;
    }
    if (!isValidPassword(password)) {
      setFieldError(signupPasswordInput, true);
      hasError = true;
    }
    if (password !== confirmPassword) {
      setFieldError(signupConfirmPasswordInput, true);
      hasError = true;
    }
    if (!signupTermsInput.checked) {
      hasError = true;
    }
    if (hasError) {
      showAuthStatus("Complete all signup fields, verify the mobile OTP, and set an 8 character password.", "error");
      return;
    }

    const duplicate = state.accounts.find(account =>
      normalizeMobile(account.mobile) === mobile || normalizeEmail(account.email) === email
    );
    if (duplicate) {
      setFieldError(signupMobileInput, normalizeMobile(duplicate.mobile) === mobile);
      setFieldError(signupEmailInput, normalizeEmail(duplicate.email) === email);
      showAuthStatus("An account already exists for this mobile number or email. Please sign in.", "error");
      return;
    }

    const account = {
      id: makeAccountId(),
      profileId: createProfileId(),
      name,
      mobile,
      mobileVerified: true,
      mobileVerifiedAt: new Date().toISOString(),
      email,
      passwordHash: "",
      createdAt: new Date().toISOString(),
      profile: null
    };
    account.passwordHash = hashPassword(password, account.id);

    state.accounts.push(account);
    persistAccounts();
    resetSignupOtp();
    signInAccount(account, true);
    showAuthStatus(`Account created. Your Profile ID is ${account.profileId}. Complete onboarding to publish your profile.`, "success");
  }

  function sendSignupOtp() {
    clearAuthFieldErrors();
    const mobile = normalizeMobile(signupMobileInput.value);
    if (mobile.length < 10 || mobile.length > 15) {
      setFieldError(signupMobileInput, true);
      showAuthStatus("Enter a valid mobile number before sending OTP.", "error");
      return;
    }

    const duplicate = state.accounts.find(account => normalizeMobile(account.mobile) === mobile);
    if (duplicate) {
      setFieldError(signupMobileInput, true);
      showAuthStatus("This mobile number is already registered. Please sign in.", "error");
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    state.auth.signupOtp = {
      mobile,
      code: otp,
      verified: false
    };
    signupOtpInput.disabled = false;
    signupOtpInput.value = "";
    signupOtpInput.focus();
    showAuthStatus(`Demo OTP sent to ${mobile}: ${otp}`, "success");
  }

  function verifySignupOtpInput() {
    const mobile = normalizeMobile(signupMobileInput.value);
    const otp = signupOtpInput.value.trim();
    const otpState = state.auth.signupOtp;

    if (otpState.mobile === mobile && otpState.code && otp === otpState.code) {
      otpState.verified = true;
      setFieldError(signupOtpInput, false);
      showAuthStatus("Mobile number verified. You can create your account now.", "success");
      return;
    }

    otpState.verified = false;
    if (otp.length >= 6) {
      setFieldError(signupOtpInput, true);
      showAuthStatus("Invalid OTP. Please check and try again.", "error");
    }
  }

  function resetSignupOtp() {
    state.auth.signupOtp = {
      mobile: null,
      code: null,
      verified: false
    };
    signupOtpInput.value = "";
    signupOtpInput.disabled = true;
    setFieldError(signupOtpInput, false);
  }

  function handleForgotPassword() {
    clearAuthFieldErrors();
    const account = findAccountByIdentifier(signinIdentifierInput.value);
    if (!account) {
      setFieldError(signinIdentifierInput, true);
      showAuthStatus("Enter your registered mobile, email, or profile ID first. Password reset needs admin verification in this static build.", "error");
      return;
    }
    showAuthStatus(`Profile ${account.profileId} found. For production, send a secure reset link by email or SMS from the server.`, "success");
  }

  function togglePasswordVisibility(button) {
    const input = document.getElementById(button.getAttribute("data-password-toggle"));
    if (!input) return;
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
    const icon = button.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-eye", !shouldShow);
      icon.classList.toggle("fa-eye-slash", shouldShow);
    }
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) element.value = value;
  }

  function prefillAccountBasics(account) {
    const nameInput = document.getElementById("reg-name");
    if (nameInput && !nameInput.value) nameInput.value = account.name || "";
  }

  function populateOnboardingForm(profile) {
    if (!profile) return;
    setValue("reg-name", profile.name);
    setValue("reg-gender", profile.gender);
    setValue("reg-age", profile.age);
    setValue("reg-height", profile.height);
    setValue("reg-location", profile.location);
    setValue("reg-profession", profile.profession);
    setValue("reg-religion", profile.religion);
    setValue("reg-sect", profile.sect);
    setValue("reg-caste", profile.caste);
    setValue("reg-subcaste", profile.subcaste === "N/A" ? "" : profile.subcaste);
    setValue("reg-deity", profile.deity);
    setValue("reg-path", profile.spiritualPath);
    setValue("reg-diet", profile.diet);
    setValue("reg-sadhana", profile.sadhana);
    setValue("reg-bio", profile.bio);
    setValue("reg-theme", profile.avatarColor);
    setValue("reg-hobbies", Array.isArray(profile.hobbies) ? profile.hobbies.join(", ") : profile.hobbies);
  }

  authModeButtons.forEach(button => {
    button.addEventListener("click", () => setAuthMode(button.getAttribute("data-auth-mode")));
  });
  document.querySelectorAll("[data-password-toggle]").forEach(button => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  authSigninForm.addEventListener("submit", handleSignin);
  authSignupForm.addEventListener("submit", handleSignup);
  btnSendSignupOtp.addEventListener("click", sendSignupOtp);
  signupOtpInput.addEventListener("input", verifySignupOtpInput);
  signupMobileInput.addEventListener("input", () => {
    const mobile = normalizeMobile(signupMobileInput.value);
    if (state.auth.signupOtp.mobile && state.auth.signupOtp.mobile !== mobile) {
      resetSignupOtp();
    }
  });
  btnAuthForgot.addEventListener("click", handleForgotPassword);
  btnAuthLogout.addEventListener("click", clearAuthSession);

  // --- SPIRITUAL COMPATIBILITY ENGINE ---
  function computeCompatibilityScore(candidate) {
    const user = state.userProfile || defaultUserProfile;

    // 1. Dietary Harmony
    let dietScore = 0;
    const userDiet = user.diet.toLowerCase();
    const candDiet = candidate.diet.toLowerCase();

    if (userDiet === candDiet) {
      dietScore = 100;
    } else if (
      (userDiet.includes("sattvic") && candDiet.includes("jain")) ||
      (userDiet.includes("jain") && candDiet.includes("sattvic")) ||
      (userDiet.includes("vegetarian") && candDiet.includes("sattvic")) ||
      (userDiet.includes("vegetarian") && candDiet.includes("jain"))
    ) {
      dietScore = 80; // High alignment
    } else if (
      (userDiet.includes("non-vegetarian") && !candDiet.includes("non-vegetarian")) ||
      (!userDiet.includes("non-vegetarian") && candDiet.includes("non-vegetarian"))
    ) {
      dietScore = 20; // Lower compatibility if meat vows differ
    } else {
      dietScore = 60; // Moderate
    }

    // 2. Organization / Path Unity
    let pathScore = 0;
    const userPath = user.spiritualPath.toLowerCase();
    const candPath = candidate.spiritualPath.toLowerCase();

    // Check if same organization
    let userOrg = "none";
    let candOrg = "none";
    const orgs = ["iskcon", "isha", "vipassana", "art of living", "brahmakumaris", "sufi", "rajchandra", "swaminarayan", "charismatic"];
    
    orgs.forEach(org => {
      if (userPath.includes(org)) userOrg = org;
      if (candPath.includes(org)) candOrg = org;
    });

    if (userOrg !== "none" && userOrg === candOrg) {
      pathScore = 100;
    } else if (user.religion === candidate.religion) {
      pathScore = 60; // Same base religion, different specific organizations
    } else {
      pathScore = 10; // Different spiritual groups entirely
    }

    // 3. Sadhana Congruence (Shared meditation/prayer keywords)
    let practiceScore = 70; // Base baseline
    const userSadhana = user.sadhana.toLowerCase();
    const candSadhana = candidate.sadhana.toLowerCase();

    const sharedKeywords = ["meditation", "chanting", "yoga", "seva", "rosary", "prayers", "gita", "bible", "dhikr", "namaz"];
    let overlapCount = 0;
    sharedKeywords.forEach(kw => {
      if (userSadhana.includes(kw) && candSadhana.includes(kw)) overlapCount++;
    });

    practiceScore += overlapCount * 10;
    if (practiceScore > 100) practiceScore = 100;

    // Weighted Synthesis
    const finalScore = Math.round(
      (dietScore * (state.weights.diet / 100)) +
      (pathScore * (state.weights.path / 100)) +
      (practiceScore * (state.weights.practice / 100))
    );

    return finalScore;
  }

  // --- ONBOARDING WIZARD ENGINE ---
  function updateWizardSteps() {
    // Update progress steps visual
    wizardProgressSteps.forEach(step => {
      const stepNum = parseInt(step.getAttribute("data-step"));
      step.classList.remove("active", "completed");
      if (stepNum === state.onboardingStep) {
        step.classList.add("active");
      } else if (stepNum < state.onboardingStep) {
        step.classList.add("completed");
      }
    });

    // Update progress bar length
    const percent = ((state.onboardingStep - 1) / (wizardProgressSteps.length - 1)) * 100;
    wizardProgressBar.style.width = `${percent}%`;

    // Show current step panel
    wizardSteps.forEach(step => {
      step.classList.remove("active");
      if (parseInt(step.getAttribute("data-step")) === state.onboardingStep) {
        step.classList.add("active");
      }
    });

    // Manage Buttons disabled/enabled states
    if (state.onboardingStep === 1) {
      btnPrev.disabled = true;
    } else {
      btnPrev.disabled = false;
    }

    if (state.onboardingStep === 4) {
      const account = getActiveAccount();
      btnNext.innerHTML = `${account?.profile ? "Save Profile" : "Submit Profile"} <i class="fa-solid fa-hands-praying"></i>`;
    } else {
      btnNext.innerHTML = `Next <i class="fa-solid fa-arrow-right"></i>`;
    }
  }

  btnPrev.addEventListener("click", () => {
    if (state.onboardingStep > 1) {
      state.onboardingStep--;
      updateWizardSteps();
    }
  });

  btnNext.addEventListener("click", () => {
    if (!getActiveAccount()) {
      alert("Please sign in or create an account before onboarding.");
      updateAuthUI();
      return;
    }

    // Form fields validation for each step
    const currentStepFields = document.querySelectorAll(`.wizard-step[data-step="${state.onboardingStep}"] input, .wizard-step[data-step="${state.onboardingStep}"] textarea, .wizard-step[data-step="${state.onboardingStep}"] select`);
    let isValid = true;
    currentStepFields.forEach(field => {
      let fieldValid = true;
      const value = field.value.trim();

      if (field.hasAttribute("required") && !value) {
        fieldValid = false;
      }

      if (field.type === "number" && value) {
        const numericValue = Number(value);
        const min = field.min ? Number(field.min) : null;
        const max = field.max ? Number(field.max) : null;
        if (!Number.isFinite(numericValue) || (min !== null && numericValue < min) || (max !== null && numericValue > max)) {
          fieldValid = false;
        }
      }

      field.classList.toggle("field-error", !fieldValid);
      if (!fieldValid) isValid = false;
    });

    if (!isValid) {
      alert("Please complete the required fields with your spiritual details before proceeding.");
      return;
    }

    if (state.onboardingStep < 4) {
      state.onboardingStep++;
      updateWizardSteps();
    } else {
      // Step 4 Complete: Save and register profile!
      registerUserProfile();
    }
  });

  function registerUserProfile() {
    const account = getActiveAccount();
    if (!account) {
      alert("Please sign in again before saving your profile.");
      updateAuthUI();
      return;
    }

    const regHobbies = document.getElementById("reg-hobbies").value.split(",").map(h => h.trim()).filter(h => h);
    
    state.userProfile = {
      id: `user-${account.profileId.toLowerCase()}`,
      profileId: account.profileId,
      mobile: account.mobile,
      email: account.email,
      name: document.getElementById("reg-name").value,
      gender: document.getElementById("reg-gender").value,
      age: parseInt(document.getElementById("reg-age").value),
      height: document.getElementById("reg-height").value,
      location: document.getElementById("reg-location").value,
      profession: document.getElementById("reg-profession").value,
      religion: document.getElementById("reg-religion").value,
      sect: document.getElementById("reg-sect").value,
      caste: document.getElementById("reg-caste").value,
      subcaste: document.getElementById("reg-subcaste").value || "N/A",
      deity: document.getElementById("reg-deity").value,
      spiritualPath: document.getElementById("reg-path").value,
      diet: document.getElementById("reg-diet").value,
      sadhana: document.getElementById("reg-sadhana").value,
      bio: document.getElementById("reg-bio").value,
      avatarColor: document.getElementById("reg-theme").value,
      hobbies: regHobbies.length ? regHobbies : ["Meditation", "Reading scriptures", "Seva"]
    };

    account.name = state.userProfile.name;
    account.profile = state.userProfile;
    persistAccounts();
    persistAuthSession(true);
    updateAuthUI();
    updateWizardSteps();

    alert(`Your profile "${state.userProfile.name}" has been saved successfully. Use Profile ID ${account.profileId}, mobile, or email with your password for your next login.`);
    
    // Switch to Dashboard automatically
    switchView("view-dashboard");
  }

  // --- FILTERING & RENDER ENGINE ---
  function renderProfileFeed() {
    cardContainer.innerHTML = "";

    // Apply Filter State logic
    const filteredProfiles = state.profiles.filter(p => {
      // 1. Gender check (Seeking gender is opposite by default or user selected)
      if (state.filters.gender !== "all" && p.gender !== state.filters.gender) {
        return false;
      }
      // 2. Religion check
      if (state.filters.religion !== "all" && p.religion !== state.filters.religion) {
        return false;
      }
      // 3. Organization check
      if (state.filters.path !== "all") {
        if (!p.spiritualPath.toLowerCase().includes(state.filters.path.toLowerCase())) {
          return false;
        }
      }
      // 4. Diet check
      if (state.filters.diet !== "all") {
        const dietKey = state.filters.diet.toLowerCase();
        if (!p.diet.toLowerCase().includes(dietKey)) {
          return false;
        }
      }
      // 5. Caste check
      if (state.filters.caste !== "all") {
        if (!p.caste.toLowerCase().includes(state.filters.caste.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    // Update match count badge
    matchCountLabel.innerText = `Showing ${filteredProfiles.length} potential conscious candidates`;

    if (filteredProfiles.length === 0) {
      cardContainer.innerHTML = `
        <div class="empty-feed">
          <div class="empty-feed-icon"><i class="fa-solid fa-dove"></i></div>
          <h3>No Seekers Aligned Under Selected Vows</h3>
          <p>Try clearing some criteria or expanding your filter bounds to discover complementary souls.</p>
        </div>
      `;
      return;
    }

    // Sort profiles by Compatibility Score descending
    const profilesWithScore = filteredProfiles.map(p => ({
      ...p,
      compatibility: computeCompatibilityScore(p)
    })).sort((a, b) => b.compatibility - a.compatibility);

    // Build Cards
    profilesWithScore.forEach(p => {
      const isLiked = state.likedProfiles.has(p.id);
      const connectionStatus = getConnectionStatus(p.id);
      const connectionMeta = getConnectionMeta(p.id);
      const disabledAttribute = connectionMeta.disabled ? "disabled" : "";
      const firstLetter = p.name.charAt(0);
      
      const card = document.createElement("div");
      card.className = "profile-card";
      card.innerHTML = `
        <div class="compatibility-badge">
          <i class="fa-solid fa-heart"></i> ${p.compatibility}% Match
        </div>
        <div class="card-header">
          <div class="avatar-wrapper bg-gradient-to-br ${p.avatarColor}">
            ${firstLetter}
          </div>
          <div class="candidate-basics">
            <span class="candidate-name">${p.name}</span>
            <div class="candidate-meta">
              <span>${p.age} Yrs • ${p.height}</span>
              <span><i class="fa-solid fa-location-dot"></i> ${p.location}</span>
            </div>
          </div>
        </div>
        <div class="connection-status ${connectionStatus}">
          <i class="fa-solid ${connectionMeta.icon}"></i> ${getConnectionBadgeLabel(connectionStatus)}
        </div>
        <div class="candidate-path">
          <div class="path-detail">
            <strong>Divine Focus:</strong>
            <span>${p.deity}</span>
          </div>
          <div class="path-detail">
            <strong>Spiritual Org:</strong>
            <span>${p.spiritualPath}</span>
          </div>
          <div class="path-detail">
            <strong>Caste / Community:</strong>
            <span>${p.caste} (${p.subcaste})</span>
          </div>
        </div>
        <p class="candidate-bio">"${p.bio}"</p>
        <div class="card-actions">
          <button class="btn-card btn-card-primary btn-view-details" data-id="${p.id}"><i class="fa-solid fa-eye"></i> View Profile</button>
          <button class="btn-card ${connectionMeta.className} btn-connection-action" data-id="${p.id}" ${disabledAttribute}>
            <i class="fa-solid ${connectionMeta.icon}"></i> ${connectionMeta.label}
          </button>
          <button class="btn-card-like btn-like-action ${isLiked ? 'liked' : ''}" data-id="${p.id}">
            <i class="fa-solid fa-heart"></i>
          </button>
        </div>
      `;
      cardContainer.appendChild(card);
    });

    // Add Action Bindings
    document.querySelectorAll(".btn-view-details").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openProfileModal(id);
      });
    });

    document.querySelectorAll(".btn-connection-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        handleConnectionAction(id);
      });
    });

    document.querySelectorAll(".btn-like-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        toggleShortlist(id, btn);
      });
    });
  }

  // --- FILTER BINDINGS ---
  function applyFiltersFromSidebar() {
    state.filters.gender = filtGender.value;
    state.filters.religion = filtReligion.value;
    state.filters.path = filtPath.value;
    state.filters.diet = filtDiet.value;
    state.filters.caste = filtCaste.value;
    renderProfileFeed();
  }

  filtGender.addEventListener("change", applyFiltersFromSidebar);
  filtReligion.addEventListener("change", applyFiltersFromSidebar);
  filtPath.addEventListener("change", applyFiltersFromSidebar);
  filtDiet.addEventListener("change", applyFiltersFromSidebar);
  filtCaste.addEventListener("change", applyFiltersFromSidebar);

  btnResetFilters.addEventListener("click", () => {
    filtGender.value = "all";
    filtReligion.value = "all";
    filtPath.value = "all";
    filtDiet.value = "all";
    filtCaste.value = "all";
    applyFiltersFromSidebar();
  });

  // --- DIVINE WEIGHTS INPUT ADJUSTMENTS ---
  function handleWeightSliderChange() {
    const valDiet = parseInt(weightDiet.value);
    const valPath = parseInt(weightPath.value);
    const valPractice = parseInt(weightPractice.value);

    // Sum weights, distribute proportionally to match exactly 100%
    const total = valDiet + valPath + valPractice;
    
    state.weights.diet = Math.round((valDiet / total) * 100);
    state.weights.path = Math.round((valPath / total) * 100);
    state.weights.practice = 100 - (state.weights.diet + state.weights.path); // Make sure it sums up perfectly

    // Update labels
    labelWDiet.innerText = `${state.weights.diet}%`;
    labelWPath.innerText = `${state.weights.path}%`;
    labelWPractice.innerText = `${state.weights.practice}%`;

    // Re-render feed matches with new alignment percentages
    renderProfileFeed();
  }

  weightDiet.addEventListener("input", handleWeightSliderChange);
  weightPath.addEventListener("input", handleWeightSliderChange);
  weightPractice.addEventListener("input", handleWeightSliderChange);

  // --- QUICK SEARCH BINDING ---
  btnQuickSearch.addEventListener("click", () => {
    // Populate filters based on quick search and route
    state.filters.gender = quickGender.value;
    state.filters.religion = quickReligion.value;
    state.filters.path = quickPath.value;
    state.filters.diet = quickDiet.value;

    // Mirror sidebar UI state
    filtGender.value = quickGender.value;
    filtReligion.value = quickReligion.value;
    filtPath.value = quickPath.value;
    filtDiet.value = quickDiet.value;

    switchView("view-dashboard");
  });

  // --- DETAILS MODAL CONTROLLER ---
  function openProfileModal(profileId) {
    const candidate = state.profiles.find(p => p.id === profileId);
    if (!candidate) return;

    const compatibility = computeCompatibilityScore(candidate);
    const firstLetter = candidate.name.charAt(0);

    // Header styling matching background gradients
    modalHeroBanner.className = `modal-hero bg-gradient-to-br ${candidate.avatarColor}`;
    modalAvatarElement.className = `modal-avatar bg-gradient-to-br ${candidate.avatarColor}`;
    modalAvatarElement.innerText = firstLetter;

    // Text populations
    modalNameText.innerText = candidate.name;
    modalPathText.innerText = `${candidate.spiritualPath} • ${candidate.diet}`;
    modalCompatibilityText.innerText = `${compatibility}% Match`;
    modalBioText.innerText = `"${candidate.bio}"`;

    modalReligionText.innerText = candidate.religion;
    modalSectText.innerText = candidate.sect;
    modalCasteText.innerText = candidate.caste;
    modalSubcasteText.innerText = candidate.subcaste;
    modalDietText.innerText = candidate.diet;
    modalDeityText.innerText = candidate.deity;
    modalSadhanaText.innerText = candidate.sadhana;

    // Hobbies loading
    modalHobbiesContainer.innerHTML = "";
    candidate.hobbies.forEach(hobby => {
      const pill = document.createElement("span");
      pill.className = "hobby-pill";
      pill.innerText = hobby;
      modalHobbiesContainer.appendChild(pill);
    });

    // Shortlist button active state visual representation
    const isLiked = state.likedProfiles.has(candidate.id);
    if (isLiked) {
      modalBtnLike.innerHTML = `<i class="fa-solid fa-heart"></i> Shortlisted`;
      modalBtnLike.className = "btn-card btn-card-primary";
    } else {
      modalBtnLike.innerHTML = `<i class="fa-solid fa-heart"></i> Add to Shortlist`;
      modalBtnLike.className = "btn-card btn-card-secondary";
    }

    updateModalConnectionButton(candidate.id);

    modalBtnLike.onclick = () => {
      toggleShortlist(candidate.id);
      // Re-populate modal button state
      const updatedLike = state.likedProfiles.has(candidate.id);
      if (updatedLike) {
        modalBtnLike.innerHTML = `<i class="fa-solid fa-heart"></i> Shortlisted`;
        modalBtnLike.className = "btn-card btn-card-primary";
      } else {
        modalBtnLike.innerHTML = `<i class="fa-solid fa-heart"></i> Add to Shortlist`;
        modalBtnLike.className = "btn-card btn-card-secondary";
      }
      renderProfileFeed(); // Sync card likes in feed
    };

    profileDetailModal.classList.add("active");
  }

  function updateModalConnectionButton(profileId) {
    const status = getConnectionStatus(profileId);
    const meta = getConnectionMeta(profileId);
    modalBtnChat.disabled = meta.disabled;
    modalBtnChat.className = `btn-card ${meta.className}`;

    if (status === "matched") {
      modalBtnChat.innerHTML = `<i class="fa-solid ${meta.icon}"></i> Open Chat`;
    } else if (status === "incoming") {
      modalBtnChat.innerHTML = `<i class="fa-solid ${meta.icon}"></i> Accept Request`;
    } else {
      modalBtnChat.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.label}`;
    }

    modalBtnChat.onclick = () => {
      if (status === "matched") {
        closeModal();
        startDirectChat(profileId);
      } else if (status === "incoming") {
        closeModal();
        acceptConnectionRequest(profileId);
      } else if (status === "sent") {
        alert("Your connection request is waiting for acceptance. Chat will open only after it becomes a match.");
      } else {
        sendConnectionRequest(profileId);
        updateModalConnectionButton(profileId);
      }
    };
  }

  function closeModal() {
    profileDetailModal.classList.remove("active");
  }

  btnModalClose.addEventListener("click", closeModal);
  profileDetailModal.addEventListener("click", (e) => {
    if (e.target === profileDetailModal) closeModal();
  });

  // Shortlisting toggle helper
  function toggleShortlist(id, btnNode = null) {
    if (state.likedProfiles.has(id)) {
      state.likedProfiles.delete(id);
      if (btnNode) btnNode.classList.remove("liked");
    } else {
      state.likedProfiles.add(id);
      if (btnNode) btnNode.classList.add("liked");
    }
  }

  function handleConnectionAction(profileId) {
    const status = getConnectionStatus(profileId);

    if (status === "matched") {
      startDirectChat(profileId);
      return;
    }

    if (status === "incoming") {
      switchView("view-requests");
      return;
    }

    if (status === "sent") {
      alert("Your request is pending. Messages unlock only after the receiver accepts and it becomes a match.");
      return;
    }

    sendConnectionRequest(profileId);
  }

  function sendConnectionRequest(profileId) {
    const candidate = state.profiles.find(p => p.id === profileId);
    if (!candidate || getConnectionStatus(profileId) !== "none") return;

    state.connections.sent.add(profileId);
    persistConnections();
    renderProfileFeed();
    renderConnectionRequests();
    alert(`Connection request sent to ${candidate.name}. Chat will unlock only after they accept.`);
  }

  function acceptConnectionRequest(profileId) {
    const candidate = state.profiles.find(p => p.id === profileId);
    if (!candidate || getConnectionStatus(profileId) !== "incoming") return;

    state.connections.incoming.delete(profileId);
    state.connections.sent.delete(profileId);
    state.connections.matched.add(profileId);
    ensureConversation(profileId);
    state.conversations[profileId].push({
      sender: "system",
      text: `You accepted ${candidate.name}'s connection request. This is now a match.`,
      time: "Just now"
    });
    persistConnections();
    renderProfileFeed();
    renderConnectionRequests();
    startDirectChat(profileId);
  }

  function declineConnectionRequest(profileId) {
    const candidate = state.profiles.find(p => p.id === profileId);
    if (!candidate || getConnectionStatus(profileId) !== "incoming") return;

    state.connections.incoming.delete(profileId);
    persistConnections();
    renderProfileFeed();
    renderConnectionRequests();
  }

  function withdrawConnectionRequest(profileId) {
    const candidate = state.profiles.find(p => p.id === profileId);
    if (!candidate || getConnectionStatus(profileId) !== "sent") return;

    state.connections.sent.delete(profileId);
    persistConnections();
    renderProfileFeed();
    renderConnectionRequests();
  }

  // --- INTERACTIVE CHAT ENGINE & CHAT BOT MOCKUP ---
  function renderChatSidebar() {
    inboxUserList.innerHTML = "";

    if (state.activeChatUserId && getConnectionStatus(state.activeChatUserId) !== "matched") {
      clearActiveChat();
    }

    const matchedProfiles = state.profiles.filter(p => getConnectionStatus(p.id) === "matched");

    if (matchedProfiles.length === 0) {
      clearActiveChat();
      inboxUserList.innerHTML = `
        <li class="chat-empty-state">
          <i class="fa-solid fa-lock"></i>
          <span>No accepted matches yet.</span>
        </li>
      `;
      return;
    }

    matchedProfiles.forEach(p => {
      ensureConversation(p.id);
      const firstLetter = p.name.charAt(0);
      const isSelected = state.activeChatUserId === p.id;
      const lastMsgObj = state.conversations[p.id][state.conversations[p.id].length - 1];
      const lastMsgText = lastMsgObj ? lastMsgObj.text : "...";

      const li = document.createElement("li");
      li.className = `chat-user-item ${isSelected ? 'active' : ''}`;
      li.innerHTML = `
        <div class="chat-avatar bg-gradient-to-br ${p.avatarColor}">${firstLetter}</div>
        <div class="chat-user-details">
          <span class="chat-user-name">${p.name}</span>
          <span class="chat-user-sub">${lastMsgText}</span>
        </div>
      `;

      li.addEventListener("click", () => selectChatUser(p.id));
      inboxUserList.appendChild(li);
    });
  }

  function openFirstMatchedChatIfNeeded() {
    if (state.activeChatUserId && getConnectionStatus(state.activeChatUserId) === "matched") {
      selectChatUser(state.activeChatUserId);
      return;
    }

    const firstMatch = state.profiles.find(p => getConnectionStatus(p.id) === "matched");
    if (firstMatch) {
      selectChatUser(firstMatch.id);
    } else {
      clearActiveChat();
    }
  }

  function renderConnectionRequests() {
    const incomingProfiles = state.profiles.filter(p => getConnectionStatus(p.id) === "incoming");
    const sentProfiles = state.profiles.filter(p => getConnectionStatus(p.id) === "sent");

    incomingRequestList.innerHTML = "";
    sentRequestList.innerHTML = "";

    if (incomingProfiles.length === 0) {
      incomingRequestList.innerHTML = `
        <div class="request-empty">
          <i class="fa-solid fa-inbox"></i>
          <span>No received requests.</span>
        </div>
      `;
    } else {
      incomingProfiles.forEach(profile => {
        incomingRequestList.appendChild(createRequestItem(profile, "incoming"));
      });
    }

    if (sentProfiles.length === 0) {
      sentRequestList.innerHTML = `
        <div class="request-empty">
          <i class="fa-solid fa-paper-plane"></i>
          <span>No sent requests.</span>
        </div>
      `;
    } else {
      sentProfiles.forEach(profile => {
        sentRequestList.appendChild(createRequestItem(profile, "sent"));
      });
    }

    updateJourneyStats();
  }

  function createRequestItem(profile, type) {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `
      <div class="chat-avatar bg-gradient-to-br ${profile.avatarColor}">${profile.name.charAt(0)}</div>
      <div class="request-details">
        <span class="request-name">${profile.name}</span>
        <span class="request-sub">${profile.age} Yrs - ${profile.spiritualPath}</span>
      </div>
      <div class="request-actions"></div>
    `;

    const actions = item.querySelector(".request-actions");
    if (type === "incoming") {
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "request-btn accept";
      acceptBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
      acceptBtn.title = "Accept request";
      acceptBtn.addEventListener("click", () => acceptConnectionRequest(profile.id));

      const declineBtn = document.createElement("button");
      declineBtn.className = "request-btn decline";
      declineBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
      declineBtn.title = "Decline request";
      declineBtn.addEventListener("click", () => declineConnectionRequest(profile.id));

      actions.appendChild(acceptBtn);
      actions.appendChild(declineBtn);
    } else {
      const pendingBadge = document.createElement("span");
      pendingBadge.className = "request-pending";
      pendingBadge.textContent = "Pending";

      const withdrawBtn = document.createElement("button");
      withdrawBtn.className = "request-btn decline";
      withdrawBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
      withdrawBtn.title = "Withdraw request";
      withdrawBtn.addEventListener("click", () => withdrawConnectionRequest(profile.id));

      actions.appendChild(pendingBadge);
      actions.appendChild(withdrawBtn);
    }

    return item;
  }

  function selectChatUser(profileId) {
    if (getConnectionStatus(profileId) !== "matched") {
      clearActiveChat();
      alert("Chat is locked until the connection request is accepted and this profile becomes a match.");
      return;
    }

    state.activeChatUserId = profileId;
    ensureConversation(profileId);
    
    // Highlight list visually
    const items = document.querySelectorAll(".chat-user-item");
    items.forEach(el => el.classList.remove("active"));
    
    renderChatSidebar(); // Re-render to highlight active and show last messages

    const candidate = state.profiles.find(p => p.id === profileId);
    if (!candidate) return;

    // Swap panes
    chatPlaceholderView.style.display = "none";
    activeChatPane.classList.add("active");

    // Populate Headers
    activeChatAvatar.className = `chat-avatar bg-gradient-to-br ${candidate.avatarColor}`;
    activeChatAvatar.innerText = candidate.name.charAt(0);
    activeChatName.innerText = candidate.name;
    activeChatStatus.innerText = `${candidate.spiritualPath} Devotee`;

    renderChatStream();
  }

  function renderChatStream() {
    chatMessageStream.innerHTML = "";
    const messages = state.conversations[state.activeChatUserId] || [];

    messages.forEach(msg => {
      const bubble = document.createElement("div");
      const bubbleType = msg.sender === "system" ? "system" : (msg.sender === "me" ? "outgoing" : "incoming");
      bubble.className = `message-bubble ${bubbleType}`;
      bubble.innerText = msg.text;
      chatMessageStream.appendChild(bubble);
    });

    // Auto scroll message pane to bottom
    chatMessageStream.scrollTop = chatMessageStream.scrollHeight;
  }

  function startDirectChat(profileId) {
    if (getConnectionStatus(profileId) !== "matched") {
      handleConnectionAction(profileId);
      return;
    }

    state.activeChatUserId = profileId;
    ensureConversation(profileId);
    switchView("view-chat");
    selectChatUser(profileId);
  }

  // SENDING CHAT MESSAGES
  function sendMessage() {
    const text = chatUserTextbox.value.trim();
    if (!text || !state.activeChatUserId) return;
    if (getConnectionStatus(state.activeChatUserId) !== "matched") {
      clearActiveChat();
      alert("Messages are enabled only after both sides accept the connection request.");
      return;
    }

    // Add outgoing message bubble
    ensureConversation(state.activeChatUserId);
    const userMsg = { sender: "me", text: text, time: "Just now" };
    state.conversations[state.activeChatUserId].push(userMsg);
    renderChatStream();
    chatUserTextbox.value = "";
    
    // Sync sidebar quick message snippet
    renderChatSidebar();

    // Trigger typing response simulation
    simulateTypingAndResponse(text);
  }

  btnSendChat.addEventListener("click", sendMessage);
  chatUserTextbox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // TYPING CUES & SMART SPIRITUAL RESPONSES
  function simulateTypingAndResponse(userText) {
    const activeId = state.activeChatUserId;
    const candidate = state.profiles.find(p => p.id === activeId);
    if (!candidate || getConnectionStatus(activeId) !== "matched") return;

    // Show indicator after delay
    setTimeout(() => {
      // Verify user hasn't switched chats during this delay
      if (state.activeChatUserId === activeId && getConnectionStatus(activeId) === "matched") {
        chatTypingIndicator.style.display = "flex";
        chatMessageStream.scrollTop = chatMessageStream.scrollHeight;
      }
    }, 600);

    // Respond after typing delay complete
    setTimeout(() => {
      if (state.activeChatUserId === activeId && getConnectionStatus(activeId) === "matched") {
        // Hide typing indicator
        chatTypingIndicator.style.display = "none";

        // Select response based on keywords or cycle through standard profile comments
        let replyText = "";
        const lowerText = userText.toLowerCase();

        if (lowerText.includes("sadhana") || lowerText.includes("meditation") || lowerText.includes("practice") || lowerText.includes("pray")) {
          replyText = `Regarding my spiritual schedule: ${candidate.sadhana} I believe staying dedicated to these practices is highly grounding.`;
        } else if (lowerText.includes("diet") || lowerText.includes("food") || lowerText.includes("eat")) {
          replyText = `Regarding my diet, I strictly follow: ${candidate.diet}. Having a clean, pure body supports a pure spiritual mind!`;
        } else if (lowerText.includes("guru") || lowerText.includes("deity") || lowerText.includes("god")) {
          replyText = `I draw deep daily inspiration from ${candidate.deity}. The path of ${candidate.spiritualPath} has opened my eyes to this connection.`;
        } else {
          // Cycle through predefined spiritual comments from the profile object
          const randIdx = Math.floor(Math.random() * candidate.chatResponses.length);
          replyText = candidate.chatResponses[randIdx];
        }

        const replyMsg = { sender: "them", text: replyText, time: "Just now" };
        state.conversations[activeId].push(replyMsg);
        
        renderChatStream();
        renderChatSidebar(); // Update sidebar message preview
      }
    }, 2200);
  }

  function renderHeroTitle(titleText) {
    contentHeroTitle.innerHTML = "";
    const parts = (titleText || "").split("|");
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        const span = document.createElement("span");
        span.textContent = part;
        contentHeroTitle.appendChild(span);
      } else {
        contentHeroTitle.appendChild(document.createTextNode(part));
      }
    });
  }

  function setText(element, value) {
    if (element) element.textContent = value || "";
  }

  function applyAdminSettings() {
    const { content } = state.adminSettings;
    const brandName = content.brandName || DEFAULT_ADMIN_SETTINGS.content.brandName;

    document.title = `${brandName} - Divine Union of Souls`;
    setText(siteLogoText, brandName);
    setText(contentHeroTagline, content.heroTagline);
    renderHeroTitle(content.heroTitle);
    setText(contentHeroDescription, content.heroDescription);
    setText(contentFeature1Title, content.feature1Title);
    setText(contentFeature1Body, content.feature1Body);
    setText(contentFeature2Title, content.feature2Title);
    setText(contentFeature2Body, content.feature2Body);
    setText(contentFeature3Title, content.feature3Title);
    setText(contentFeature3Body, content.feature3Body);
    setText(contentPremiumTitle, content.premiumTitle);
    setText(contentPremiumDescription, content.premiumDescription);
    setText(contentFooterBrand, brandName);
    setText(contentFooterDescription, content.footerDescription);
    setText(contentFooterBottom, `(c) ${new Date().getFullYear()} ${brandName}. Evolving Companionship, Elevating Consciousness. Built for Divine Unions.`);

    renderPlanCards();
    updateJourneyStats();
  }

  async function loadServerAdminSettings() {
    if (!isHttpRuntime()) return;

    try {
      const response = await fetch("/api/settings", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response.ok) return;

      const serverSettings = await response.json();
      state.adminSettings = deepMerge(DEFAULT_ADMIN_SETTINGS, serverSettings);
      writeJsonToStorage(STORAGE_KEYS.adminSettings, state.adminSettings);
      applyAdminSettings();
    } catch (error) {
      console.warn("Unable to load server settings. Using browser settings fallback.", error);
    }
  }

  function renderPlanCards() {
    Object.entries(state.adminSettings.plans).forEach(([planKey, plan]) => {
      const card = document.querySelector(`[data-plan-card="${planKey}"]`);
      const button = document.querySelector(`[data-plan-action="${planKey}"]`);
      if (!card) return;

      const planName = card.querySelector(".tier-name");
      const planPrice = card.querySelector(".tier-price");
      setText(planName, plan.name);

      if (planPrice) {
        planPrice.innerHTML = "";
        planPrice.appendChild(document.createTextNode(`${plan.price} `));
        const period = document.createElement("span");
        period.textContent = plan.period;
        planPrice.appendChild(period);
      }

      if (button) {
        button.textContent = `Choose ${plan.name.split(" ")[0]}`;
      }
    });
  }

  function maskCredential(value) {
    if (!value) return "not configured";
    if (value.length <= 6) return "configured";
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
  }

  function handlePlanCheckout(planKey) {
    const plan = state.adminSettings.plans[planKey];
    const payment = state.adminSettings.payment;
    if (!plan) return;

    alert(
      `${plan.name}\n` +
      `${plan.price} ${plan.period}\n\n` +
      `Provider: ${payment.provider} (${payment.mode})\n` +
      `Currency: ${payment.currency}\n` +
      `Public key: ${maskCredential(payment.publicKey)}\n\n` +
      `${payment.checkoutNote}`
    );
  }

  document.querySelectorAll("[data-plan-action]").forEach(button => {
    button.addEventListener("click", () => {
      handlePlanCheckout(button.getAttribute("data-plan-action"));
    });
  });

  // --- INITIAL FEED LAUNCH ---
  hydrateSessionAccount();
  applyAdminSettings();
  loadServerAdminSettings();
  updateAuthUI();
  updateWizardSteps();
  renderConnectionRequests();
  switchView("view-landing"); // Always land on hero index first
});
