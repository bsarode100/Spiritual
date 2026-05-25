// SpiritualShaadi - Core Application Script (server-backed)

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    adminSettings: "spiritualShaadi.adminSettings.v1",
    likedProfiles: "spiritualShaadi.shortlist.v1"
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
      console.warn(`Unable to read ${key}`, error);
      return fallback;
    }
  }

  function writeJsonToStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn(`Unable to save ${key}`, error); }
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

  // ---------------------------------------------------------------------------
  // API client
  // ---------------------------------------------------------------------------

  async function api(path, { method = "GET", body, headers = {}, signal } = {}) {
    const init = {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { ...headers },
      signal
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const response = await fetch(path, init);
    let data = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { ok: false, error: text }; }
    }
    if (!response.ok) {
      const err = new Error((data && data.error) || response.statusText || "Request failed");
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data || {};
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const state = {
    me: null,                   // server account, includes profile (may be null)
    userProfile: null,          // shortcut to me?.profile
    profiles: [],               // fetched from /api/profiles
    filters: { gender: "all", religion: "all", path: "all", diet: "all", caste: "all" },
    weights: { diet: 35, path: 45, practice: 20 },
    likedProfiles: new Set(readJsonFromStorage(STORAGE_KEYS.likedProfiles, [])),
    connections: { incoming: [], sent: [], matched: [] },
    auth: { mode: "signin", signupOtp: { mobile: null, code: null, verified: false } },
    activeChatUserId: null,     // peer profileId
    conversations: {},          // peerProfileId -> [{sender, text, time}]
    lastMessageId: {},          // peerProfileId -> latest fetched message id (polling cursor)
    chatPollTimer: null,
    onboardingStep: 1,
    adminSettings: deepMerge(DEFAULT_ADMIN_SETTINGS, readJsonFromStorage(STORAGE_KEYS.adminSettings, {}))
  };

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

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------

  const views = document.querySelectorAll(".view-section");
  const navLinks = document.querySelectorAll(".nav-link");
  const footerLinks = document.querySelectorAll(".footer-nav-link");
  const logoBtn = document.getElementById("btn-logo");
  const navRegisterLink = document.getElementById("nav-register");
  const cardContainer = document.getElementById("profile-card-container");
  const matchCountLabel = document.getElementById("match-count-label");

  const wizardProgressSteps = document.querySelectorAll(".progress-step");
  const wizardProgressBar = document.getElementById("wizard-progress-bar");
  const wizardSteps = document.querySelectorAll(".wizard-step");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");

  const filtGender = document.getElementById("filt-gender");
  const filtReligion = document.getElementById("filt-religion");
  const filtPath = document.getElementById("filt-path");
  const filtDiet = document.getElementById("filt-diet");
  const filtCaste = document.getElementById("filt-caste");
  const btnResetFilters = document.getElementById("btn-reset-filters");

  const weightDiet = document.getElementById("weight-diet");
  const weightPath = document.getElementById("weight-path");
  const weightPractice = document.getElementById("weight-practice");
  const labelWDiet = document.getElementById("label-w-diet");
  const labelWPath = document.getElementById("label-w-path");
  const labelWPractice = document.getElementById("label-w-practice");

  const quickGender = document.getElementById("quick-gender");
  const quickReligion = document.getElementById("quick-religion");
  const quickPath = document.getElementById("quick-path");
  const quickDiet = document.getElementById("quick-diet");
  const btnQuickSearch = document.getElementById("btn-quick-search");

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

  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const navMenu = document.querySelector(".nav-menu");

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function setText(element, value) { if (element) element.textContent = value || ""; }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) element.value = value;
  }

  function normalizeMobile(value) { return String(value || "").replace(/\D/g, ""); }
  function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
  function normalizeIdentifier(value) { return String(value || "").trim().toLowerCase(); }
  function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value)); }
  function isValidPassword(value) { return String(value || "").length >= 8; }

  function setFieldError(field, hasError) {
    if (!field) return;
    field.classList.toggle("field-error", hasError);
  }

  function persistLiked() {
    writeJsonToStorage(STORAGE_KEYS.likedProfiles, [...state.likedProfiles]);
  }

  // ---------------------------------------------------------------------------
  // Connection lookups (driven by server state)
  // ---------------------------------------------------------------------------

  function allConnections() {
    return [...state.connections.matched, ...state.connections.incoming, ...state.connections.sent];
  }

  function getConnectionStatus(profileId) {
    if (state.connections.matched.some(c => c.peer && c.peer.profileId === profileId)) return "matched";
    if (state.connections.incoming.some(c => c.peer && c.peer.profileId === profileId)) return "incoming";
    if (state.connections.sent.some(c => c.peer && c.peer.profileId === profileId)) return "sent";
    return "none";
  }

  function getConnectionByPeer(profileId) {
    return allConnections().find(c => c.peer && c.peer.profileId === profileId) || null;
  }

  function getConnectionMeta(profileId) {
    const status = getConnectionStatus(profileId);
    const metaByStatus = {
      matched:  { label: "Chat",            icon: "fa-comments",       className: "btn-card-primary",   disabled: false },
      incoming: { label: "Review Request",  icon: "fa-user-check",     className: "btn-card-secondary", disabled: false },
      sent:     { label: "Request Sent",    icon: "fa-hourglass-half", className: "btn-card-secondary", disabled: true },
      none:     { label: "Send Request",    icon: "fa-user-plus",      className: "btn-card-secondary", disabled: false }
    };
    return metaByStatus[status];
  }

  function getConnectionBadgeLabel(status) {
    return {
      matched: "Matched",
      incoming: "Request Received",
      sent: "Request Sent",
      none: "Request Required"
    }[status] || "Request Required";
  }

  function updateJourneyStats() {
    setText(statTotalProfiles, state.profiles.length);
    setText(statReceivedRequests, state.connections.incoming.length);
    setText(statSentRequests, state.connections.sent.length);
    setText(statMatchedChats, state.connections.matched.length);
  }

  // ---------------------------------------------------------------------------
  // View routing
  // ---------------------------------------------------------------------------

  function switchView(viewId) {
    views.forEach(section => {
      section.classList.remove("active");
      if (section.id === viewId) section.classList.add("active");
    });
    navLinks.forEach(link => {
      link.classList.remove("active");
      if (link.getAttribute("data-view") === viewId) link.classList.add("active");
    });

    navMenu.classList.remove("mobile-open");
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Stop chat polling when leaving chat view
    if (viewId !== "view-chat") stopChatPolling();

    if (viewId === "view-dashboard") {
      refreshConnections().then(() => renderProfileFeed());
    } else if (viewId === "view-requests") {
      refreshConnections().then(() => renderConnectionRequests());
    } else if (viewId === "view-chat") {
      refreshConnections().then(() => {
        renderChatSidebar();
        openFirstMatchedChatIfNeeded();
      });
    } else if (viewId === "view-register") {
      updateAuthUI();
    }
  }

  navLinks.forEach(link => {
    link.addEventListener("click", e => { e.preventDefault(); switchView(link.getAttribute("data-view")); });
  });
  footerLinks.forEach(link => {
    link.addEventListener("click", e => { e.preventDefault(); switchView(link.getAttribute("data-view")); });
  });
  document.querySelectorAll("[data-view-shortcut]").forEach(button => {
    button.addEventListener("click", () => switchView(button.getAttribute("data-view-shortcut")));
  });
  logoBtn.addEventListener("click", () => switchView("view-landing"));

  mobileMenuBtn.addEventListener("click", () => {
    navMenu.classList.toggle("mobile-open");
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

  // ---------------------------------------------------------------------------
  // Auth: signup / signin / logout / session hydration
  // ---------------------------------------------------------------------------

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

  function clearAuthFieldErrors() {
    [signinIdentifierInput, signinPasswordInput, signupNameInput, signupMobileInput,
      signupOtpInput, signupEmailInput, signupPasswordInput, signupConfirmPasswordInput]
      .forEach(field => setFieldError(field, false));
  }

  function applyAccountFromServer(account) {
    state.me = account;
    state.userProfile = account ? account.profile || null : null;
    if (state.userProfile) populateOnboardingForm(state.userProfile);
    else if (account) prefillAccountBasics(account);
  }

  async function refreshMe() {
    try {
      const data = await api("/api/me");
      applyAccountFromServer(data.account);
    } catch (error) {
      if (error.status !== 401) console.warn("refreshMe failed:", error.message);
      applyAccountFromServer(null);
    }
  }

  async function refreshConnections() {
    if (!state.me) {
      state.connections = { incoming: [], sent: [], matched: [] };
      return;
    }
    try {
      const data = await api("/api/connections");
      state.connections = {
        incoming: data.incoming || [],
        sent: data.sent || [],
        matched: data.matched || []
      };
    } catch (error) {
      if (error.status !== 401) console.warn("refreshConnections failed:", error.message);
      state.connections = { incoming: [], sent: [], matched: [] };
    }
    updateJourneyStats();
  }

  async function handleSignin(event) {
    event.preventDefault();
    clearAuthFieldErrors();
    const identifier = signinIdentifierInput.value;
    const password = signinPasswordInput.value;
    let hasError = false;
    if (!normalizeIdentifier(identifier)) { setFieldError(signinIdentifierInput, true); hasError = true; }
    if (!password) { setFieldError(signinPasswordInput, true); hasError = true; }
    if (hasError) { showAuthStatus("Enter your login ID and password.", "error"); return; }

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { identifier, password, remember: signinRememberInput.checked }
      });
      applyAccountFromServer(data.account);
      await refreshConnections();
      updateAuthUI();
      if (state.userProfile) switchView("view-dashboard");
      else showAuthStatus(`Welcome ${displayName(state.me)}. Complete your profile to start matching.`, "success");
    } catch (error) {
      setFieldError(signinIdentifierInput, true);
      setFieldError(signinPasswordInput, true);
      showAuthStatus(error.message || "Login failed.", "error");
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    clearAuthFieldErrors();
    const name = signupNameInput.value.trim();
    const mobile = normalizeMobile(signupMobileInput.value);
    const otp = signupOtpInput.value.trim();
    const email = normalizeEmail(signupEmailInput.value);
    const password = signupPasswordInput.value;
    const confirmPassword = signupConfirmPasswordInput.value;
    let hasError = false;

    if (name.length < 2) { setFieldError(signupNameInput, true); hasError = true; }
    if (mobile.length < 10 || mobile.length > 15) { setFieldError(signupMobileInput, true); hasError = true; }
    if (!state.auth.signupOtp.verified || state.auth.signupOtp.mobile !== mobile || otp !== state.auth.signupOtp.code) {
      setFieldError(signupOtpInput, true); hasError = true;
    }
    if (!isValidEmail(email)) { setFieldError(signupEmailInput, true); hasError = true; }
    if (!isValidPassword(password)) { setFieldError(signupPasswordInput, true); hasError = true; }
    if (password !== confirmPassword) { setFieldError(signupConfirmPasswordInput, true); hasError = true; }
    if (!signupTermsInput.checked) { hasError = true; }
    if (hasError) {
      showAuthStatus("Complete all signup fields, verify the mobile OTP, and set an 8 character password.", "error");
      return;
    }

    try {
      const data = await api("/api/auth/signup", {
        method: "POST",
        body: { name, mobile, email, password }
      });
      applyAccountFromServer(data.account);
      resetSignupOtp();
      await refreshConnections();
      updateAuthUI();
      showAuthStatus(`Account created. Your Profile ID is ${state.me.profileId}. Complete onboarding to publish your profile.`, "success");
    } catch (error) {
      if (error.status === 409) {
        setFieldError(signupMobileInput, true);
        setFieldError(signupEmailInput, true);
      }
      showAuthStatus(error.message || "Signup failed.", "error");
    }
  }

  async function handleLogout() {
    try { await api("/api/auth/logout", { method: "POST" }); }
    catch (error) { console.warn("Logout failed:", error.message); }
    applyAccountFromServer(null);
    state.connections = { incoming: [], sent: [], matched: [] };
    state.conversations = {};
    state.lastMessageId = {};
    state.activeChatUserId = null;
    stopChatPolling();
    signinIdentifierInput.value = "";
    signinPasswordInput.value = "";
    setAuthMode("signin");
    updateAuthUI();
    switchView("view-landing");
  }

  function displayName(account) {
    return (account && (account.profile && account.profile.name)) || (account && account.name) || (account && account.email) || (account && account.mobile) || "Member";
  }

  function updateAuthUI() {
    const isSignedIn = Boolean(state.me);
    authGate.style.display = isSignedIn ? "none" : "block";
    onboardingWizardWrapper.classList.toggle("auth-locked", !isSignedIn);
    authMemberLabel.textContent = isSignedIn ? displayName(state.me) : "";
    authProfileLabel.textContent = isSignedIn ? `Profile ID: ${state.me.profileId}` : "";
    if (navRegisterLink) {
      navRegisterLink.innerHTML = isSignedIn
        ? `<i class="fa-solid fa-id-card"></i> My Profile`
        : `<i class="fa-solid fa-right-to-bracket"></i> Member Login`;
    }
    if (isSignedIn) {
      prefillAccountBasics(state.me);
      if (state.userProfile) populateOnboardingForm(state.userProfile);
    }
  }

  function sendSignupOtp() {
    clearAuthFieldErrors();
    const mobile = normalizeMobile(signupMobileInput.value);
    if (mobile.length < 10 || mobile.length > 15) {
      setFieldError(signupMobileInput, true);
      showAuthStatus("Enter a valid mobile number before sending OTP.", "error");
      return;
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    state.auth.signupOtp = { mobile, code: otp, verified: false };
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
    state.auth.signupOtp = { mobile: null, code: null, verified: false };
    signupOtpInput.value = "";
    signupOtpInput.disabled = true;
    setFieldError(signupOtpInput, false);
  }

  function handleForgotPassword() {
    clearAuthFieldErrors();
    const identifier = signinIdentifierInput.value.trim();
    if (!identifier) {
      setFieldError(signinIdentifierInput, true);
      showAuthStatus("Enter your registered mobile, email, or profile ID first.", "error");
      return;
    }
    showAuthStatus("Password reset is not available yet. Please contact site admin for help.", "error");
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

  function prefillAccountBasics(account) {
    const nameInput = document.getElementById("reg-name");
    if (nameInput && !nameInput.value) nameInput.value = (account && account.name) || "";
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
    if (state.auth.signupOtp.mobile && state.auth.signupOtp.mobile !== mobile) resetSignupOtp();
  });
  btnAuthForgot.addEventListener("click", handleForgotPassword);
  btnAuthLogout.addEventListener("click", handleLogout);

  // ---------------------------------------------------------------------------
  // Compatibility engine (uses session profile, server-supplied candidates)
  // ---------------------------------------------------------------------------

  function computeCompatibilityScore(candidate) {
    const user = state.userProfile || defaultUserProfile;
    const userDiet = String(user.diet || "").toLowerCase();
    const candDiet = String(candidate.diet || "").toLowerCase();

    let dietScore = 60;
    if (userDiet === candDiet) {
      dietScore = 100;
    } else if (
      (userDiet.includes("sattvic") && candDiet.includes("jain")) ||
      (userDiet.includes("jain") && candDiet.includes("sattvic")) ||
      (userDiet.includes("vegetarian") && candDiet.includes("sattvic")) ||
      (userDiet.includes("vegetarian") && candDiet.includes("jain"))
    ) dietScore = 80;
    else if (
      (userDiet.includes("non-vegetarian") && !candDiet.includes("non-vegetarian")) ||
      (!userDiet.includes("non-vegetarian") && candDiet.includes("non-vegetarian"))
    ) dietScore = 20;

    const userPath = String(user.spiritualPath || "").toLowerCase();
    const candPath = String(candidate.spiritualPath || "").toLowerCase();
    const orgs = ["iskcon", "isha", "vipassana", "art of living", "brahmakumaris", "sufi", "rajchandra", "swaminarayan", "charismatic"];
    let userOrg = "none", candOrg = "none";
    orgs.forEach(org => {
      if (userPath.includes(org)) userOrg = org;
      if (candPath.includes(org)) candOrg = org;
    });

    let pathScore = 10;
    if (userOrg !== "none" && userOrg === candOrg) pathScore = 100;
    else if (user.religion === candidate.religion) pathScore = 60;

    let practiceScore = 70;
    const userSadhana = String(user.sadhana || "").toLowerCase();
    const candSadhana = String(candidate.sadhana || "").toLowerCase();
    const sharedKeywords = ["meditation", "chanting", "yoga", "seva", "rosary", "prayers", "gita", "bible", "dhikr", "namaz"];
    let overlapCount = 0;
    sharedKeywords.forEach(kw => { if (userSadhana.includes(kw) && candSadhana.includes(kw)) overlapCount++; });
    practiceScore += overlapCount * 10;
    if (practiceScore > 100) practiceScore = 100;

    return Math.round(
      dietScore * (state.weights.diet / 100) +
      pathScore * (state.weights.path / 100) +
      practiceScore * (state.weights.practice / 100)
    );
  }

  // ---------------------------------------------------------------------------
  // Onboarding wizard
  // ---------------------------------------------------------------------------

  function updateWizardSteps() {
    wizardProgressSteps.forEach(step => {
      const stepNum = parseInt(step.getAttribute("data-step"));
      step.classList.remove("active", "completed");
      if (stepNum === state.onboardingStep) step.classList.add("active");
      else if (stepNum < state.onboardingStep) step.classList.add("completed");
    });
    const percent = ((state.onboardingStep - 1) / (wizardProgressSteps.length - 1)) * 100;
    wizardProgressBar.style.width = `${percent}%`;
    wizardSteps.forEach(step => {
      step.classList.remove("active");
      if (parseInt(step.getAttribute("data-step")) === state.onboardingStep) step.classList.add("active");
    });
    btnPrev.disabled = state.onboardingStep === 1;
    if (state.onboardingStep === 4) {
      btnNext.innerHTML = `${state.userProfile ? "Save Profile" : "Submit Profile"} <i class="fa-solid fa-hands-praying"></i>`;
    } else {
      btnNext.innerHTML = `Next <i class="fa-solid fa-arrow-right"></i>`;
    }
  }

  btnPrev.addEventListener("click", () => {
    if (state.onboardingStep > 1) { state.onboardingStep--; updateWizardSteps(); }
  });

  btnNext.addEventListener("click", () => {
    if (!state.me) {
      alert("Please sign in or create an account before onboarding.");
      updateAuthUI();
      return;
    }
    const currentStepFields = document.querySelectorAll(
      `.wizard-step[data-step="${state.onboardingStep}"] input, .wizard-step[data-step="${state.onboardingStep}"] textarea, .wizard-step[data-step="${state.onboardingStep}"] select`
    );
    let isValid = true;
    currentStepFields.forEach(field => {
      let fieldValid = true;
      const value = field.value.trim();
      if (field.hasAttribute("required") && !value) fieldValid = false;
      if (field.type === "number" && value) {
        const numericValue = Number(value);
        const min = field.min ? Number(field.min) : null;
        const max = field.max ? Number(field.max) : null;
        if (!Number.isFinite(numericValue) || (min !== null && numericValue < min) || (max !== null && numericValue > max)) fieldValid = false;
      }
      field.classList.toggle("field-error", !fieldValid);
      if (!fieldValid) isValid = false;
    });
    if (!isValid) {
      alert("Please complete the required fields with your spiritual details before proceeding.");
      return;
    }
    if (state.onboardingStep < 4) { state.onboardingStep++; updateWizardSteps(); }
    else registerUserProfile();
  });

  async function registerUserProfile() {
    if (!state.me) {
      alert("Please sign in again before saving your profile.");
      updateAuthUI();
      return;
    }
    const hobbies = document.getElementById("reg-hobbies").value.split(",").map(h => h.trim()).filter(Boolean);
    const profile = {
      name: document.getElementById("reg-name").value,
      gender: document.getElementById("reg-gender").value,
      age: parseInt(document.getElementById("reg-age").value, 10),
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
      hobbies: hobbies.length ? hobbies : ["Meditation", "Reading scriptures", "Seva"]
    };
    try {
      const data = await api("/api/me/profile", { method: "PUT", body: profile });
      applyAccountFromServer(data.account);
      updateAuthUI();
      updateWizardSteps();
      alert(`Your profile "${profile.name}" has been saved. Use Profile ID ${state.me.profileId}, mobile, or email with your password for next login.`);
      switchView("view-dashboard");
    } catch (error) {
      alert(error.message || "Could not save profile. Please try again.");
    }
  }

  // ---------------------------------------------------------------------------
  // Profile feed (server-backed)
  // ---------------------------------------------------------------------------

  async function fetchProfiles() {
    if (!state.me) {
      state.profiles = [];
      return;
    }
    try {
      const params = new URLSearchParams();
      Object.entries(state.filters).forEach(([key, value]) => {
        if (value && value !== "all") params.set(key, value);
      });
      const query = params.toString();
      const data = await api(`/api/profiles${query ? `?${query}` : ""}`);
      state.profiles = Array.isArray(data.profiles) ? data.profiles : [];
    } catch (error) {
      if (error.status !== 401) console.warn("fetchProfiles failed:", error.message);
      state.profiles = [];
    }
    updateJourneyStats();
  }

  async function renderProfileFeed() {
    cardContainer.innerHTML = `
      <div class="empty-feed">
        <div class="empty-feed-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
        <p>Loading aligned souls...</p>
      </div>
    `;

    if (!state.me) {
      cardContainer.innerHTML = `
        <div class="empty-feed">
          <div class="empty-feed-icon"><i class="fa-solid fa-lock"></i></div>
          <h3>Sign in to discover aligned souls</h3>
          <p>Create or log in to your member account to view real profiles.</p>
        </div>
      `;
      matchCountLabel.innerText = "Showing 0 potential conscious candidates";
      return;
    }

    await fetchProfiles();

    matchCountLabel.innerText = `Showing ${state.profiles.length} potential conscious candidates`;

    if (state.profiles.length === 0) {
      cardContainer.innerHTML = `
        <div class="empty-feed">
          <div class="empty-feed-icon"><i class="fa-solid fa-dove"></i></div>
          <h3>No Seekers Aligned Under Selected Vows</h3>
          <p>Try clearing some criteria or expanding your filter bounds to discover complementary souls.</p>
        </div>
      `;
      return;
    }

    const profilesWithScore = state.profiles
      .map(p => ({ ...p, compatibility: computeCompatibilityScore(p) }))
      .sort((a, b) => b.compatibility - a.compatibility);

    cardContainer.innerHTML = "";
    profilesWithScore.forEach(p => {
      const isLiked = state.likedProfiles.has(p.profileId);
      const connectionStatus = getConnectionStatus(p.profileId);
      const connectionMeta = getConnectionMeta(p.profileId);
      const disabledAttribute = connectionMeta.disabled ? "disabled" : "";
      const firstLetter = (p.name || "?").charAt(0);

      const card = document.createElement("div");
      card.className = "profile-card";
      card.innerHTML = `
        <div class="compatibility-badge">
          <i class="fa-solid fa-heart"></i> ${p.compatibility}% Match
        </div>
        <div class="card-header">
          <div class="avatar-wrapper bg-gradient-to-br ${p.avatarColor || ""}">${firstLetter}</div>
          <div class="candidate-basics">
            <span class="candidate-name">${escapeHtml(p.name)}</span>
            <div class="candidate-meta">
              <span>${p.age || ""} Yrs${p.height ? ` &bull; ${escapeHtml(p.height)}` : ""}</span>
              <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(p.location || "")}</span>
            </div>
          </div>
        </div>
        <div class="connection-status ${connectionStatus}">
          <i class="fa-solid ${connectionMeta.icon}"></i> ${getConnectionBadgeLabel(connectionStatus)}
        </div>
        <div class="candidate-path">
          <div class="path-detail"><strong>Divine Focus:</strong><span>${escapeHtml(p.deity || "")}</span></div>
          <div class="path-detail"><strong>Spiritual Org:</strong><span>${escapeHtml(p.spiritualPath || "")}</span></div>
          <div class="path-detail"><strong>Caste / Community:</strong><span>${escapeHtml(p.caste || "")} (${escapeHtml(p.subcaste || "N/A")})</span></div>
        </div>
        <p class="candidate-bio">"${escapeHtml(p.bio || "")}"</p>
        <div class="card-actions">
          <button class="btn-card btn-card-primary btn-view-details" data-id="${p.profileId}"><i class="fa-solid fa-eye"></i> View Profile</button>
          <button class="btn-card ${connectionMeta.className} btn-connection-action" data-id="${p.profileId}" ${disabledAttribute}>
            <i class="fa-solid ${connectionMeta.icon}"></i> ${connectionMeta.label}
          </button>
          <button class="btn-card-like btn-like-action ${isLiked ? "liked" : ""}" data-id="${p.profileId}">
            <i class="fa-solid fa-heart"></i>
          </button>
        </div>
      `;
      cardContainer.appendChild(card);
    });

    document.querySelectorAll(".btn-view-details").forEach(btn => {
      btn.addEventListener("click", () => openProfileModal(btn.getAttribute("data-id")));
    });
    document.querySelectorAll(".btn-connection-action").forEach(btn => {
      btn.addEventListener("click", () => handleConnectionAction(btn.getAttribute("data-id")));
    });
    document.querySelectorAll(".btn-like-action").forEach(btn => {
      btn.addEventListener("click", () => toggleShortlist(btn.getAttribute("data-id"), btn));
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------------------------------------------------------------------------
  // Filter & weight bindings
  // ---------------------------------------------------------------------------

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
    filtGender.value = "all"; filtReligion.value = "all"; filtPath.value = "all"; filtDiet.value = "all"; filtCaste.value = "all";
    applyFiltersFromSidebar();
  });

  function handleWeightSliderChange() {
    const valDiet = parseInt(weightDiet.value, 10);
    const valPath = parseInt(weightPath.value, 10);
    const valPractice = parseInt(weightPractice.value, 10);
    const total = valDiet + valPath + valPractice || 1;
    state.weights.diet = Math.round((valDiet / total) * 100);
    state.weights.path = Math.round((valPath / total) * 100);
    state.weights.practice = 100 - (state.weights.diet + state.weights.path);
    labelWDiet.innerText = `${state.weights.diet}%`;
    labelWPath.innerText = `${state.weights.path}%`;
    labelWPractice.innerText = `${state.weights.practice}%`;
    renderProfileFeed();
  }
  weightDiet.addEventListener("input", handleWeightSliderChange);
  weightPath.addEventListener("input", handleWeightSliderChange);
  weightPractice.addEventListener("input", handleWeightSliderChange);

  btnQuickSearch.addEventListener("click", () => {
    state.filters.gender = quickGender.value;
    state.filters.religion = quickReligion.value;
    state.filters.path = quickPath.value;
    state.filters.diet = quickDiet.value;
    filtGender.value = quickGender.value;
    filtReligion.value = quickReligion.value;
    filtPath.value = quickPath.value;
    filtDiet.value = quickDiet.value;
    switchView("view-dashboard");
  });

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  function findProfileById(profileId) {
    return state.profiles.find(p => p.profileId === profileId) ||
           (getConnectionByPeer(profileId) ? getConnectionByPeer(profileId).peer : null);
  }

  function openProfileModal(profileId) {
    const candidate = findProfileById(profileId);
    if (!candidate) return;
    const compatibility = computeCompatibilityScore(candidate);
    const firstLetter = (candidate.name || "?").charAt(0);

    modalHeroBanner.className = `modal-hero bg-gradient-to-br ${candidate.avatarColor || ""}`;
    modalAvatarElement.className = `modal-avatar bg-gradient-to-br ${candidate.avatarColor || ""}`;
    modalAvatarElement.innerText = firstLetter;

    modalNameText.innerText = candidate.name || "";
    modalPathText.innerText = `${candidate.spiritualPath || ""} • ${candidate.diet || ""}`;
    modalCompatibilityText.innerText = `${compatibility}% Match`;
    modalBioText.innerText = `"${candidate.bio || ""}"`;
    modalReligionText.innerText = candidate.religion || "";
    modalSectText.innerText = candidate.sect || "";
    modalCasteText.innerText = candidate.caste || "";
    modalSubcasteText.innerText = candidate.subcaste || "N/A";
    modalDietText.innerText = candidate.diet || "";
    modalDeityText.innerText = candidate.deity || "";
    modalSadhanaText.innerText = candidate.sadhana || "";

    modalHobbiesContainer.innerHTML = "";
    (candidate.hobbies || []).forEach(hobby => {
      const pill = document.createElement("span");
      pill.className = "hobby-pill";
      pill.innerText = hobby;
      modalHobbiesContainer.appendChild(pill);
    });

    const isLiked = state.likedProfiles.has(candidate.profileId);
    modalBtnLike.innerHTML = isLiked
      ? `<i class="fa-solid fa-heart"></i> Shortlisted`
      : `<i class="fa-solid fa-heart"></i> Add to Shortlist`;
    modalBtnLike.className = isLiked ? "btn-card btn-card-primary" : "btn-card btn-card-secondary";

    updateModalConnectionButton(candidate.profileId);

    modalBtnLike.onclick = () => {
      toggleShortlist(candidate.profileId);
      const updatedLike = state.likedProfiles.has(candidate.profileId);
      modalBtnLike.innerHTML = updatedLike
        ? `<i class="fa-solid fa-heart"></i> Shortlisted`
        : `<i class="fa-solid fa-heart"></i> Add to Shortlist`;
      modalBtnLike.className = updatedLike ? "btn-card btn-card-primary" : "btn-card btn-card-secondary";
      renderProfileFeed();
    };

    profileDetailModal.classList.add("active");
  }

  function updateModalConnectionButton(profileId) {
    const status = getConnectionStatus(profileId);
    const meta = getConnectionMeta(profileId);
    modalBtnChat.disabled = meta.disabled;
    modalBtnChat.className = `btn-card ${meta.className}`;
    if (status === "matched") modalBtnChat.innerHTML = `<i class="fa-solid ${meta.icon}"></i> Open Chat`;
    else if (status === "incoming") modalBtnChat.innerHTML = `<i class="fa-solid ${meta.icon}"></i> Accept Request`;
    else modalBtnChat.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.label}`;

    modalBtnChat.onclick = async () => {
      if (status === "matched") { closeModal(); startDirectChat(profileId); }
      else if (status === "incoming") { closeModal(); await acceptConnectionRequest(profileId); }
      else if (status === "sent") {
        alert("Your connection request is waiting for acceptance. Chat will open only after it becomes a match.");
      } else {
        await sendConnectionRequest(profileId);
        updateModalConnectionButton(profileId);
      }
    };
  }

  function closeModal() { profileDetailModal.classList.remove("active"); }
  btnModalClose.addEventListener("click", closeModal);
  profileDetailModal.addEventListener("click", e => { if (e.target === profileDetailModal) closeModal(); });

  function toggleShortlist(id, btnNode = null) {
    if (state.likedProfiles.has(id)) {
      state.likedProfiles.delete(id);
      if (btnNode) btnNode.classList.remove("liked");
    } else {
      state.likedProfiles.add(id);
      if (btnNode) btnNode.classList.add("liked");
    }
    persistLiked();
  }

  // ---------------------------------------------------------------------------
  // Connection actions (server-backed)
  // ---------------------------------------------------------------------------

  function handleConnectionAction(profileId) {
    const status = getConnectionStatus(profileId);
    if (status === "matched") { startDirectChat(profileId); return; }
    if (status === "incoming") { switchView("view-requests"); return; }
    if (status === "sent") { alert("Your request is pending. Messages unlock only after the receiver accepts."); return; }
    sendConnectionRequest(profileId);
  }

  async function sendConnectionRequest(profileId) {
    const candidate = findProfileById(profileId) || { name: "this member" };
    try {
      await api("/api/connections/request", { method: "POST", body: { toProfileId: profileId } });
      await refreshConnections();
      renderProfileFeed();
      renderConnectionRequests();
      alert(`Connection request sent to ${candidate.name || "this member"}. Chat unlocks only after they accept.`);
      // Seed bots auto-accept after ~3s server-side. Refresh shortly to pick that up.
      setTimeout(() => {
        refreshConnections().then(() => {
          renderProfileFeed();
          renderConnectionRequests();
        });
      }, 3500);
    } catch (error) {
      alert(error.message || "Could not send request.");
    }
  }

  async function acceptConnectionRequest(profileId) {
    const conn = getConnectionByPeer(profileId);
    if (!conn) return;
    try {
      await api(`/api/connections/${conn.id}/accept`, { method: "POST" });
      await refreshConnections();
      renderProfileFeed();
      renderConnectionRequests();
      startDirectChat(profileId);
    } catch (error) {
      alert(error.message || "Could not accept request.");
    }
  }

  async function declineConnectionRequest(profileId) {
    const conn = getConnectionByPeer(profileId);
    if (!conn) return;
    try {
      await api(`/api/connections/${conn.id}/decline`, { method: "POST" });
      await refreshConnections();
      renderProfileFeed();
      renderConnectionRequests();
    } catch (error) {
      alert(error.message || "Could not decline request.");
    }
  }

  async function withdrawConnectionRequest(profileId) {
    const conn = getConnectionByPeer(profileId);
    if (!conn) return;
    try {
      await api(`/api/connections/${conn.id}/withdraw`, { method: "POST" });
      await refreshConnections();
      renderProfileFeed();
      renderConnectionRequests();
    } catch (error) {
      alert(error.message || "Could not withdraw request.");
    }
  }

  // ---------------------------------------------------------------------------
  // Requests view rendering
  // ---------------------------------------------------------------------------

  function renderConnectionRequests() {
    const incomingPeers = state.connections.incoming.map(c => c.peer).filter(Boolean);
    const sentPeers = state.connections.sent.map(c => c.peer).filter(Boolean);

    incomingRequestList.innerHTML = "";
    sentRequestList.innerHTML = "";

    if (incomingPeers.length === 0) {
      incomingRequestList.innerHTML = `<div class="request-empty"><i class="fa-solid fa-inbox"></i><span>No received requests.</span></div>`;
    } else {
      incomingPeers.forEach(peer => incomingRequestList.appendChild(createRequestItem(peer, "incoming")));
    }

    if (sentPeers.length === 0) {
      sentRequestList.innerHTML = `<div class="request-empty"><i class="fa-solid fa-paper-plane"></i><span>No sent requests.</span></div>`;
    } else {
      sentPeers.forEach(peer => sentRequestList.appendChild(createRequestItem(peer, "sent")));
    }
    updateJourneyStats();
  }

  function createRequestItem(profile, type) {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `
      <div class="chat-avatar bg-gradient-to-br ${profile.avatarColor || ""}">${(profile.name || "?").charAt(0)}</div>
      <div class="request-details">
        <span class="request-name">${escapeHtml(profile.name || "")}</span>
        <span class="request-sub">${profile.age || ""} Yrs - ${escapeHtml(profile.spiritualPath || "")}</span>
      </div>
      <div class="request-actions"></div>
    `;
    const actions = item.querySelector(".request-actions");
    if (type === "incoming") {
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "request-btn accept";
      acceptBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
      acceptBtn.title = "Accept request";
      acceptBtn.addEventListener("click", () => acceptConnectionRequest(profile.profileId));
      const declineBtn = document.createElement("button");
      declineBtn.className = "request-btn decline";
      declineBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
      declineBtn.title = "Decline request";
      declineBtn.addEventListener("click", () => declineConnectionRequest(profile.profileId));
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
      withdrawBtn.addEventListener("click", () => withdrawConnectionRequest(profile.profileId));
      actions.appendChild(pendingBadge);
      actions.appendChild(withdrawBtn);
    }
    return item;
  }

  // ---------------------------------------------------------------------------
  // Chat (server-backed, polled every 5s)
  // ---------------------------------------------------------------------------

  function clearActiveChat() {
    state.activeChatUserId = null;
    chatTypingIndicator.style.display = "none";
    chatMessageStream.innerHTML = "";
    activeChatPane.classList.remove("active");
    chatPlaceholderView.style.display = "flex";
  }

  function renderChatSidebar() {
    inboxUserList.innerHTML = "";
    if (state.activeChatUserId && getConnectionStatus(state.activeChatUserId) !== "matched") {
      clearActiveChat();
    }
    const matchedPeers = state.connections.matched.map(c => c.peer).filter(Boolean);
    if (matchedPeers.length === 0) {
      clearActiveChat();
      inboxUserList.innerHTML = `<li class="chat-empty-state"><i class="fa-solid fa-lock"></i><span>No accepted matches yet.</span></li>`;
      return;
    }
    matchedPeers.forEach(p => {
      const messages = state.conversations[p.profileId] || [];
      const last = messages[messages.length - 1];
      const lastMsgText = last ? last.text : "Start a sacred conversation...";
      const isSelected = state.activeChatUserId === p.profileId;
      const li = document.createElement("li");
      li.className = `chat-user-item ${isSelected ? "active" : ""}`;
      li.innerHTML = `
        <div class="chat-avatar bg-gradient-to-br ${p.avatarColor || ""}">${(p.name || "?").charAt(0)}</div>
        <div class="chat-user-details">
          <span class="chat-user-name">${escapeHtml(p.name || "")}</span>
          <span class="chat-user-sub">${escapeHtml(lastMsgText)}</span>
        </div>
      `;
      li.addEventListener("click", () => selectChatUser(p.profileId));
      inboxUserList.appendChild(li);
    });
  }

  function openFirstMatchedChatIfNeeded() {
    if (state.activeChatUserId && getConnectionStatus(state.activeChatUserId) === "matched") {
      selectChatUser(state.activeChatUserId);
      return;
    }
    const first = state.connections.matched[0] && state.connections.matched[0].peer;
    if (first) selectChatUser(first.profileId);
    else clearActiveChat();
  }

  async function selectChatUser(profileId) {
    if (getConnectionStatus(profileId) !== "matched") {
      clearActiveChat();
      alert("Chat is locked until the connection request is accepted and this profile becomes a match.");
      return;
    }
    state.activeChatUserId = profileId;
    const peer = (getConnectionByPeer(profileId) || {}).peer;
    if (!peer) return;

    chatPlaceholderView.style.display = "none";
    activeChatPane.classList.add("active");

    activeChatAvatar.className = `chat-avatar bg-gradient-to-br ${peer.avatarColor || ""}`;
    activeChatAvatar.innerText = (peer.name || "?").charAt(0);
    activeChatName.innerText = peer.name || "";
    activeChatStatus.innerText = `${peer.spiritualPath || ""} Devotee`;

    // Initial fetch (full history)
    state.conversations[profileId] = [];
    state.lastMessageId[profileId] = "";
    await fetchMessagesFor(profileId);
    renderChatSidebar();
    renderChatStream();

    startChatPolling();
  }

  async function fetchMessagesFor(profileId) {
    try {
      const cursor = state.lastMessageId[profileId];
      const url = `/api/messages/${encodeURIComponent(profileId)}${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`;
      const data = await api(url);
      const incoming = Array.isArray(data.messages) ? data.messages : [];
      if (!state.conversations[profileId]) state.conversations[profileId] = [];
      incoming.forEach(m => {
        state.conversations[profileId].push({
          id: m.id,
          sender: m.sender === state.me.profileId ? "me" : "them",
          text: m.text,
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
        state.lastMessageId[profileId] = m.id;
      });
      return incoming.length;
    } catch (error) {
      if (error.status !== 403) console.warn("fetchMessages failed:", error.message);
      return 0;
    }
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
    chatMessageStream.scrollTop = chatMessageStream.scrollHeight;
  }

  function startChatPolling() {
    stopChatPolling();
    state.chatPollTimer = setInterval(async () => {
      if (!state.activeChatUserId) { stopChatPolling(); return; }
      const newCount = await fetchMessagesFor(state.activeChatUserId);
      if (newCount > 0) { renderChatStream(); renderChatSidebar(); }
    }, 5000);
  }

  function stopChatPolling() {
    if (state.chatPollTimer) { clearInterval(state.chatPollTimer); state.chatPollTimer = null; }
  }

  function startDirectChat(profileId) {
    if (getConnectionStatus(profileId) !== "matched") {
      handleConnectionAction(profileId);
      return;
    }
    state.activeChatUserId = profileId;
    switchView("view-chat");
  }

  async function sendMessage() {
    const text = chatUserTextbox.value.trim();
    if (!text || !state.activeChatUserId) return;
    if (getConnectionStatus(state.activeChatUserId) !== "matched") {
      clearActiveChat();
      alert("Messages are enabled only after both sides accept the connection request.");
      return;
    }
    chatUserTextbox.value = "";
    try {
      const data = await api(`/api/messages/${encodeURIComponent(state.activeChatUserId)}`, { method: "POST", body: { text } });
      const msg = data.message;
      if (msg) {
        state.conversations[state.activeChatUserId] = state.conversations[state.activeChatUserId] || [];
        state.conversations[state.activeChatUserId].push({
          id: msg.id,
          sender: "me",
          text: msg.text,
          time: new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
        state.lastMessageId[state.activeChatUserId] = msg.id;
        renderChatStream();
        renderChatSidebar();
      }
      // Bot replies come on the next poll tick (~5s)
    } catch (error) {
      alert(error.message || "Could not send message.");
    }
  }

  btnSendChat.addEventListener("click", sendMessage);
  chatUserTextbox.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });

  // ---------------------------------------------------------------------------
  // Admin site settings (existing)
  // ---------------------------------------------------------------------------

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
    try {
      const response = await fetch("/api/settings", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const serverSettings = await response.json();
      state.adminSettings = deepMerge(DEFAULT_ADMIN_SETTINGS, serverSettings);
      writeJsonToStorage(STORAGE_KEYS.adminSettings, state.adminSettings);
      applyAdminSettings();
    } catch (error) {
      console.warn("Unable to load server settings.", error);
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
      if (button) button.textContent = `Choose ${plan.name.split(" ")[0]}`;
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
      `${plan.name}\n${plan.price} ${plan.period}\n\n` +
      `Provider: ${payment.provider} (${payment.mode})\nCurrency: ${payment.currency}\n` +
      `Public key: ${maskCredential(payment.publicKey)}\n\n${payment.checkoutNote}`
    );
  }
  document.querySelectorAll("[data-plan-action]").forEach(button => {
    button.addEventListener("click", () => handlePlanCheckout(button.getAttribute("data-plan-action")));
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  applyAdminSettings();
  loadServerAdminSettings();
  refreshMe().then(async () => {
    await refreshConnections();
    updateAuthUI();
    updateWizardSteps();
    renderConnectionRequests();
    switchView("view-landing");
  });
});
