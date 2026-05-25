// SpiritualShaadi - Separate Admin Panel Script

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "spiritualShaadi.adminSettings.v1";

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

  const adminFields = {
    brandName: document.getElementById("admin-brand-name"),
    heroTagline: document.getElementById("admin-hero-tagline"),
    heroTitle: document.getElementById("admin-hero-title"),
    heroDescription: document.getElementById("admin-hero-description"),
    feature1Title: document.getElementById("admin-feature-1-title"),
    feature1Body: document.getElementById("admin-feature-1-body"),
    feature2Title: document.getElementById("admin-feature-2-title"),
    feature2Body: document.getElementById("admin-feature-2-body"),
    feature3Title: document.getElementById("admin-feature-3-title"),
    feature3Body: document.getElementById("admin-feature-3-body"),
    premiumTitle: document.getElementById("admin-premium-title"),
    premiumDescription: document.getElementById("admin-premium-description"),
    footerDescription: document.getElementById("admin-footer-description"),
    paymentProvider: document.getElementById("admin-payment-provider"),
    paymentMode: document.getElementById("admin-payment-mode"),
    paymentPublicKey: document.getElementById("admin-payment-public-key"),
    paymentSecretKey: document.getElementById("admin-payment-secret-key"),
    paymentWebhook: document.getElementById("admin-payment-webhook"),
    paymentCurrency: document.getElementById("admin-payment-currency"),
    paymentNote: document.getElementById("admin-payment-note"),
    planSilverName: document.getElementById("admin-plan-silver-name"),
    planSilverPrice: document.getElementById("admin-plan-silver-price"),
    planSilverPeriod: document.getElementById("admin-plan-silver-period"),
    planGoldName: document.getElementById("admin-plan-gold-name"),
    planGoldPrice: document.getElementById("admin-plan-gold-price"),
    planGoldPeriod: document.getElementById("admin-plan-gold-period"),
    planPlatinumName: document.getElementById("admin-plan-platinum-name"),
    planPlatinumPrice: document.getElementById("admin-plan-platinum-price"),
    planPlatinumPeriod: document.getElementById("admin-plan-platinum-period")
  };

  const adminTabs = document.querySelectorAll(".admin-tab");
  const adminPanels = document.querySelectorAll(".admin-panel");
  const adminSaveStatus = document.getElementById("admin-save-status");
  const btnAdminSave = document.getElementById("btn-admin-save");
  const btnAdminReset = document.getElementById("btn-admin-reset");
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const navMenu = document.querySelector(".nav-menu");

  let adminSettings = loadSettings();
  let serverBackedSettings = false;

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
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Unable to save ${key}`, error);
    }
  }

  function isHttpRuntime() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
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

  function loadSettings() {
    return deepMerge(DEFAULT_ADMIN_SETTINGS, readJsonFromStorage(STORAGE_KEY, {}));
  }

  function setField(field, value) {
    if (field) field.value = value || "";
  }

  function populateAdminForm() {
    const { content, payment, plans } = adminSettings;
    setField(adminFields.brandName, content.brandName);
    setField(adminFields.heroTagline, content.heroTagline);
    setField(adminFields.heroTitle, content.heroTitle);
    setField(adminFields.heroDescription, content.heroDescription);
    setField(adminFields.feature1Title, content.feature1Title);
    setField(adminFields.feature1Body, content.feature1Body);
    setField(adminFields.feature2Title, content.feature2Title);
    setField(adminFields.feature2Body, content.feature2Body);
    setField(adminFields.feature3Title, content.feature3Title);
    setField(adminFields.feature3Body, content.feature3Body);
    setField(adminFields.premiumTitle, content.premiumTitle);
    setField(adminFields.premiumDescription, content.premiumDescription);
    setField(adminFields.footerDescription, content.footerDescription);
    setField(adminFields.paymentProvider, payment.provider);
    setField(adminFields.paymentMode, payment.mode);
    setField(adminFields.paymentPublicKey, payment.publicKey);
    setField(adminFields.paymentSecretKey, payment.secretKey);
    setField(adminFields.paymentWebhook, payment.webhookSecret);
    setField(adminFields.paymentCurrency, payment.currency);
    setField(adminFields.paymentNote, payment.checkoutNote);
    setField(adminFields.planSilverName, plans.silver.name);
    setField(adminFields.planSilverPrice, plans.silver.price);
    setField(adminFields.planSilverPeriod, plans.silver.period);
    setField(adminFields.planGoldName, plans.gold.name);
    setField(adminFields.planGoldPrice, plans.gold.price);
    setField(adminFields.planGoldPeriod, plans.gold.period);
    setField(adminFields.planPlatinumName, plans.platinum.name);
    setField(adminFields.planPlatinumPrice, plans.platinum.price);
    setField(adminFields.planPlatinumPeriod, plans.platinum.period);
  }

  function readRequiredField(field, fallback) {
    const value = field.value.trim();
    return value || fallback;
  }

  function collectAdminSettings() {
    return {
      content: {
        brandName: readRequiredField(adminFields.brandName, DEFAULT_ADMIN_SETTINGS.content.brandName),
        heroTagline: readRequiredField(adminFields.heroTagline, DEFAULT_ADMIN_SETTINGS.content.heroTagline),
        heroTitle: readRequiredField(adminFields.heroTitle, DEFAULT_ADMIN_SETTINGS.content.heroTitle),
        heroDescription: readRequiredField(adminFields.heroDescription, DEFAULT_ADMIN_SETTINGS.content.heroDescription),
        feature1Title: readRequiredField(adminFields.feature1Title, DEFAULT_ADMIN_SETTINGS.content.feature1Title),
        feature1Body: readRequiredField(adminFields.feature1Body, DEFAULT_ADMIN_SETTINGS.content.feature1Body),
        feature2Title: readRequiredField(adminFields.feature2Title, DEFAULT_ADMIN_SETTINGS.content.feature2Title),
        feature2Body: readRequiredField(adminFields.feature2Body, DEFAULT_ADMIN_SETTINGS.content.feature2Body),
        feature3Title: readRequiredField(adminFields.feature3Title, DEFAULT_ADMIN_SETTINGS.content.feature3Title),
        feature3Body: readRequiredField(adminFields.feature3Body, DEFAULT_ADMIN_SETTINGS.content.feature3Body),
        premiumTitle: readRequiredField(adminFields.premiumTitle, DEFAULT_ADMIN_SETTINGS.content.premiumTitle),
        premiumDescription: readRequiredField(adminFields.premiumDescription, DEFAULT_ADMIN_SETTINGS.content.premiumDescription),
        footerDescription: readRequiredField(adminFields.footerDescription, DEFAULT_ADMIN_SETTINGS.content.footerDescription)
      },
      payment: {
        provider: adminFields.paymentProvider.value,
        mode: adminFields.paymentMode.value,
        publicKey: adminFields.paymentPublicKey.value.trim(),
        secretKey: adminFields.paymentSecretKey.value.trim(),
        webhookSecret: adminFields.paymentWebhook.value.trim(),
        currency: readRequiredField(adminFields.paymentCurrency, DEFAULT_ADMIN_SETTINGS.payment.currency),
        checkoutNote: readRequiredField(adminFields.paymentNote, DEFAULT_ADMIN_SETTINGS.payment.checkoutNote)
      },
      plans: {
        silver: {
          name: readRequiredField(adminFields.planSilverName, DEFAULT_ADMIN_SETTINGS.plans.silver.name),
          price: readRequiredField(adminFields.planSilverPrice, DEFAULT_ADMIN_SETTINGS.plans.silver.price),
          period: readRequiredField(adminFields.planSilverPeriod, DEFAULT_ADMIN_SETTINGS.plans.silver.period)
        },
        gold: {
          name: readRequiredField(adminFields.planGoldName, DEFAULT_ADMIN_SETTINGS.plans.gold.name),
          price: readRequiredField(adminFields.planGoldPrice, DEFAULT_ADMIN_SETTINGS.plans.gold.price),
          period: readRequiredField(adminFields.planGoldPeriod, DEFAULT_ADMIN_SETTINGS.plans.gold.period)
        },
        platinum: {
          name: readRequiredField(adminFields.planPlatinumName, DEFAULT_ADMIN_SETTINGS.plans.platinum.name),
          price: readRequiredField(adminFields.planPlatinumPrice, DEFAULT_ADMIN_SETTINGS.plans.platinum.price),
          period: readRequiredField(adminFields.planPlatinumPeriod, DEFAULT_ADMIN_SETTINGS.plans.platinum.period)
        }
      }
    };
  }

  function switchAdminPanel(tabName) {
    adminTabs.forEach(tab => {
      tab.classList.toggle("active", tab.getAttribute("data-admin-tab") === tabName);
    });
    adminPanels.forEach(panel => {
      panel.classList.toggle("active", panel.id === `admin-panel-${tabName}`);
    });
  }

  function showSavedStatus(text) {
    adminSaveStatus.textContent = text;
    setTimeout(() => {
      adminSaveStatus.textContent = serverBackedSettings
        ? "Changes are saved on the server for all visitors."
        : "Changes are saved locally in this browser.";
    }, 1800);
  }

  async function loadServerSettings() {
    if (!isHttpRuntime()) return;

    try {
      const response = await fetch("/api/admin/settings", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(`Settings request failed with ${response.status}`);

      adminSettings = deepMerge(DEFAULT_ADMIN_SETTINGS, await response.json());
      serverBackedSettings = true;
      writeJsonToStorage(STORAGE_KEY, adminSettings);
      populateAdminForm();
      adminSaveStatus.textContent = "Changes are saved on the server for all visitors.";
    } catch (error) {
      console.warn("Unable to load server settings", error);
      serverBackedSettings = false;
      adminSaveStatus.textContent = "Server settings unavailable. Changes will stay in this browser only.";
    }
  }

  async function saveAdminSettings() {
    adminSettings = collectAdminSettings();
    writeJsonToStorage(STORAGE_KEY, adminSettings);

    if (isHttpRuntime()) {
      try {
        const response = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(adminSettings)
        });
        if (!response.ok) throw new Error(`Save failed with ${response.status}`);

        const payload = await response.json();
        adminSettings = deepMerge(DEFAULT_ADMIN_SETTINGS, payload.settings || adminSettings);
        serverBackedSettings = true;
        writeJsonToStorage(STORAGE_KEY, adminSettings);
        showSavedStatus("Saved on server. Public site will use these settings.");
        return;
      } catch (error) {
        console.warn("Unable to save server settings", error);
        serverBackedSettings = false;
      }
    }

    showSavedStatus("Saved locally. Server save is unavailable.");
  }

  btnAdminSave.addEventListener("click", saveAdminSettings);

  btnAdminReset.addEventListener("click", async () => {
    if (!confirm("Reset website content, payment settings, and plan prices to defaults?")) return;
    adminSettings = deepMerge(DEFAULT_ADMIN_SETTINGS, {});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Unable to clear admin settings", error);
    }
    populateAdminForm();
    await saveAdminSettings();
    showSavedStatus("Defaults restored.");
  });

  adminTabs.forEach(tab => {
    tab.addEventListener("click", () => switchAdminPanel(tab.getAttribute("data-admin-tab")));
  });

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

  populateAdminForm();
  loadServerSettings();
});
