const { useState, useEffect, useRef, useCallback } = React;
const fbase = window.FirebaseSDK;
const Wallet = window.DriveMxWallet;
const WalletUI = window.DriveMxWalletUI;
const StripeWallet = window.DriveMxStripeWallet || {
    available: false,
    openEmbeddedCheckout: async () => {
        const error = new Error('El módulo de recargas con Stripe no está disponible.');
        error.code = 'stripe-wallet-module-unavailable';
        throw error;
    },
    recoverPendingCheckouts: async () => ({ credited: false, recoveredCount: 0 }),
    AdminStripeSettingsCard: null
};
const WalletPayment = window.DriveMxWalletPayment || {
    available: false,
    useWalletPayment: () => ({
        authenticated: false,
        verified: false,
        loading: false,
        verifying: false,
        paying: false,
        error: '',
        identity: null,
        wallet: null,
        walletExists: false,
        walletActive: false,
        availableBalance: 0,
        requestLogin: () => {},
        refresh: async () => null,
        pay: async () => {
            const error = new Error('El módulo de pago con cartera no está disponible.');
            error.code = 'wallet-payment-module-unavailable';
            throw error;
        },
        canPay: () => false,
        getOrCreatePaymentId: () => '',
        reset: async () => {}
    }),
    WalletCredentialsCard: null,
    WalletBalanceBadge: null
};
const Cashback = window.DriveMxCashback || {};
const UsersUI = window.DriveMxUsersUI;
const AdsManager = window.DriveMxAdsManager;
const HomeProducts = window.DriveMxHomeProducts || {};
const ProductDetails = window.DriveMxProductDetails || {};
const Supermercado = window.DriveMxSupermercado || window.DriveMxSupermercadoCore || {};
const CostoEnvio = window.DriveMxCostoEnvio || {};
const NewShipmentUI = window.DriveMxNewShipment || {};
const GuideAssignmentUI = window.DriveMxGuideAssignment || {};
const ConductoresUI = window.DriveMxConductores || {};
const PanelControlUI = window.DriveMxPanelControlUI;
const ProductsCore = window.DriveMxProductsCore;
const AdminProductsUI = window.DriveMxAdminProducts;
const UserProductsUI = window.DriveMxUserProducts;
const EmailPasswordAuthUI = window.DriveMxEmailPasswordAuth;
const PackagesGuidesUI = window.DriveMxPackagesGuides;
const CartUI = window.DriveMxCart || {};
const SupportUI = window.DriveMxSupport || {};
const BusinessStorefronts = window.DriveMxBusinessStorefronts || {};

const Icons = {
    Truck: ({size=16}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-5l-4-4h-3v10h3Z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>,
    Trash: ({size=14}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
    LogOut: ({size=14}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>,
    ChevronLeft: ({size=18}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
    ChevronRight: ({size=18}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
    Menu: ({size=20}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
    Send: ({size=16}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
    Cart: ({size=18}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>,
    Lock: ({size=14}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    Unlock: ({size=14}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
};

const STEPS = PackagesGuidesUI.STEPS;
const appId = window.firebaseConfig.projectId;
const ADMIN_EMAIL = 'admin@drivemx.com';
const STAFF_USERS_COLLECTION = 'operators';
const PUBLIC_PRODUCTS_COLLECTION = ProductsCore.PUBLIC_PRODUCTS_COLLECTION;
const ADMIN_PRODUCTS_COLLECTION = ProductsCore.ADMIN_PRODUCTS_COLLECTION;
const USER_PRODUCTS_COLLECTION = ProductsCore.USER_PRODUCTS_COLLECTION;
const USER_SALES_COLLECTION = ProductsCore.USER_SALES_COLLECTION;
const PRODUCT_ORIGIN_CONTROL = ProductsCore.PRODUCT_ORIGIN_CONTROL;
const PRODUCT_ORIGIN_USER = ProductsCore.PRODUCT_ORIGIN_USER;
const STAFF_USERS_LOCAL_KEY = 'driveMxOperators';
const CART_MAX_ITEMS = 2;
const SUPERMARKET_MINIMUM_PRODUCTS = 5;
const REGISTERED_USERS_PAGE_SIZE = 20;
const CART_TTL_MS = 30 * 60 * 1000;
const CART_LOCAL_PREFIX = 'driveMxVisitorCart';
const CART_SESSION_KEY = 'driveMxVisitorCartSessionId';
const SALE_NOTIFICATION_MESSAGE = 'Tu producto ha sido vendido. Comunícate al 5633535701 o 5617549756 para la recolección de tu paquete.';
const PRODUCT_SIZE_OPTIONS = ProductsCore.PRODUCT_SIZE_OPTIONS;
const PAYMENT_BANK_AZTECA_ORDER_TEXT = 'Pagar solo con Banco Azteca, el nombre del titular de la cuenta debe de coincidir con el nombre registrado en el pedido para que la tranferencia sea aprobada';
const GLOBAL_SHIPPING_FEE = 150;
const SUPERMARKET_SETTINGS_COLLECTION = CostoEnvio.SETTINGS_COLLECTION || Supermercado.SETTINGS_COLLECTION || 'supermarket_settings';
const SUPERMARKET_SETTINGS_DOCUMENT = CostoEnvio.SETTINGS_DOCUMENT || Supermercado.SETTINGS_DOCUMENT || 'config';
const SUPERMARKET_SETTINGS_LOCAL_KEY = CostoEnvio.SETTINGS_LOCAL_KEY || Supermercado.SETTINGS_LOCAL_KEY || 'driveMxSupermarketSettings';
const isSupermarketPurchaseProduct = (product = {}) => {
    if (typeof Supermercado.isSupermarketProduct === 'function') {
        return Supermercado.isSupermarketProduct(product);
    }
    const category = String(product?.category ?? product?.categoria ?? product?.productCategory ?? product?.product_category ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ')
        .trim();
    return category === 'supermercado';
};
const getUniquePurchaseProducts = (items = [], predicate = () => true) => {
    const uniqueProducts = [];
    const seenIds = new Set();
    (Array.isArray(items) ? items : []).filter(Boolean).forEach((product, index) => {
        if (!predicate(product)) return;
        const productId = String(product?.id || '').trim();
        const uniqueKey = productId || `__product_${index}`;
        if (seenIds.has(uniqueKey)) return;
        seenIds.add(uniqueKey);
        uniqueProducts.push(product);
    });
    return uniqueProducts;
};
const getSupermarketPurchaseProducts = (items = []) => getUniquePurchaseProducts(items, isSupermarketPurchaseProduct);
const getDriveMxPurchaseProducts = (items = []) => getUniquePurchaseProducts(items, product => !isSupermarketPurchaseProduct(product));
const getSupermarketPurchaseProductCount = (items = []) => getSupermarketPurchaseProducts(items).length;
const getDriveMxPurchaseProductCount = (items = []) => getDriveMxPurchaseProducts(items).length;
const getSupermarketPurchaseQuantity = (items = []) => getSupermarketPurchaseProducts(items)
    .reduce((total, product) => {
        const quantity = Math.floor(Number(product?.quantity ?? product?.productQuantity ?? product?.selectedQuantity ?? 0));
        return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
const getSupermarketMinimumPurchaseError = (items = []) => {
    const productsToValidate = (Array.isArray(items) ? items : []).filter(Boolean);
    const supermarketProductCount = getSupermarketPurchaseProductCount(productsToValidate);
    if (supermarketProductCount === 0 || supermarketProductCount >= SUPERMARKET_MINIMUM_PRODUCTS) return '';
    return `La compra de Supermercado requiere seleccionar mínimo ${SUPERMARKET_MINIMUM_PRODUCTS} productos en el carrito. Actualmente seleccionaste ${supermarketProductCount}. La cantidad de cada producto puede elegirse libremente según disponibilidad.`;
};
const getDriveMxMaximumPurchaseError = (items = []) => {
    const driveMxProductCount = getDriveMxPurchaseProductCount(items);
    if (driveMxProductCount <= CART_MAX_ITEMS) return '';
    return `Productos Drive MX permiten máximo ${CART_MAX_ITEMS} productos distintos por compra.`;
};
const createBuyerMailLogFields = (mailResult = {}) => ({
    buyerNotificationRequired: mailResult.buyerNotificationRequired === true,
    buyerNotificationSent: mailResult.buyerNotificationSent === true,
    buyerNotificationCount: Math.max(0, Number(mailResult.buyerNotificationCount || 0)),
    buyerNotificationType: String(mailResult.buyerNotificationType || '')
});
const createBuyerTransferEmailAudit = (mailResult = {}) => {
    const rawError = mailResult?.buyerNotificationError;
    const errorText = String(rawError?.message || rawError?.response || rawError || '').trim().slice(0, 500);
    return {
        emailBuyerNotificationRequired: mailResult.buyerNotificationRequired === true,
        emailBuyerNotificationSent: mailResult.buyerNotificationSent === true,
        emailBuyerNotificationCount: Math.max(0, Number(mailResult.buyerNotificationCount || 0)),
        emailBuyerNotificationType: String(mailResult.buyerNotificationType || '').trim().slice(0, 60),
        emailBuyerNotificationError: errorText
    };
};
const normalizeSupermarketSettings = (settings = {}) => {
    if (typeof CostoEnvio.normalizeSettings === 'function') return CostoEnvio.normalizeSettings(settings);
    if (typeof Supermercado.normalizeSettings === 'function') return Supermercado.normalizeSettings(settings);
    const rawFee = Number(settings?.shippingFee ?? settings?.supermarketShippingFee ?? GLOBAL_SHIPPING_FEE);
    return { shippingFee: Number.isFinite(rawFee) && rawFee >= 0 ? Number(rawFee.toFixed(2)) : GLOBAL_SHIPPING_FEE };
};
const normalizeEmailSettings = (settings = {}) => ({
    senderEmail: String(settings?.senderEmail ?? '').trim(),
    appPassword: String(settings?.appPassword ?? '').trim(),
    receiverEmail: String(settings?.receiverEmail ?? '').trim()
});
const normalizePaymentSettings = (settings = {}) => ({
    bankAccount: String(settings?.bankAccount ?? '').trim()
});
const cleanFirestoreText = (value = '', maxLength = null) => {
    const normalized = String(value ?? '').trim();
    if (!Number.isFinite(Number(maxLength))) return normalized;
    return normalized.slice(0, Math.max(0, Math.floor(Number(maxLength))));
};
const finiteFirestoreNumber = (value, fallback = 0) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
};
const sanitizeFirestoreData = (value) => {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) {
        return value.map(item => sanitizeFirestoreData(item)).filter(item => item !== undefined);
    }
    if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function' && Number.isFinite(Number(value.seconds))) return value;
        return Object.fromEntries(
            Object.entries(value)
                .map(([key, item]) => [key, sanitizeFirestoreData(item)])
                .filter(([, item]) => item !== undefined)
        );
    }
    return String(value);
};
const normalizeProductSizes = ProductsCore.normalizeProductSizes;
const normalizeProductColors = ProductsCore.normalizeProductColors;
const productSizesText = (product = {}) => normalizeProductSizes(product.sizes || product.medidas).join(', ');
const productColorsText = (product = {}) => normalizeProductColors(product.colors || product.colores).join(', ');
const productOptionsLines = (product = {}) => {
    const lines = [];
    const sizes = productSizesText(product);
    const colors = productColorsText(product);
    if (sizes) lines.push(`Medidas: ${sizes}`);
    if (colors) lines.push(`Colores: ${colors}`);
    return lines;
};
const BLOCKED_ACCOUNT_MESSAGE = 'La cuenta ha sido bloqueada por el administrador.';
const DELETED_ACCOUNT_MESSAGE = 'La cuenta ha sido eliminada por el administrador.';
const getSafeFirestoreDocId = ProductsCore.safeDocumentId;
const createVisitorCartSessionId = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const getVisitorCartStorageKey = () => {
    try {
        let sessionId = sessionStorage.getItem(CART_SESSION_KEY);
        if (!sessionId) {
            sessionId = createVisitorCartSessionId();
            sessionStorage.setItem(CART_SESSION_KEY, sessionId);
        }
        return `${CART_LOCAL_PREFIX}_${sessionId}`;
    } catch(e) {
        return `${CART_LOCAL_PREFIX}_fallback`;
    }
};
const getProductStock = (product = {}) => ProductDetails.getProductStock ? ProductDetails.getProductStock(product) : Math.max(0, Math.floor(Number(product?.stock || product?.availableStock || 0)));
const clampProductQuantity = (quantity = 1, product = {}) => ProductDetails.clampQuantity ? ProductDetails.clampQuantity(quantity, product) : Math.min(Math.max(1, Math.floor(Number(quantity || 1))), getProductStock(product));
const clampProductSelectionQuantity = (quantity = 0, product = {}) => {
    const stock = getProductStock(product);
    if (stock <= 0) return 0;
    const numericQuantity = Math.floor(Number(quantity));
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) return 0;
    return Math.min(numericQuantity, stock);
};
const getProductUnitPrice = (product = {}) => ProductDetails.getProductUnitPrice ? ProductDetails.getProductUnitPrice(product) : Number(product?.unitPrice ?? product?.price ?? 0);
const getProductLineTotal = (product = {}, quantity = product?.quantity || 1) => ProductDetails.getProductLineTotal ? ProductDetails.getProductLineTotal(product, quantity) : Number((getProductUnitPrice(product) * Math.max(1, Math.floor(Number(quantity || 1)))).toFixed(2));
const getInitialProductPurchaseQuantity = () => 0;
const copyProductCommerceFields = (target = {}, source = {}) => {
    const categorized = typeof Supermercado.copyCategory === 'function'
        ? Supermercado.copyCategory(target, source)
        : { ...target, category: source?.category || source?.productCategory || source?.categoria || '' };
    return typeof CostoEnvio.copyProductShipping === 'function'
        ? CostoEnvio.copyProductShipping(categorized, source)
        : categorized;
};
const formatCheckoutShippingFee = (value = 0) => {
    const normalized = Number(value || 0);
    return normalized === 0 ? '$0' : `$${normalized.toFixed(2)}`;
};
const normalizeCartItems = (items = []) => Array.isArray(items) ? items.filter(Boolean).map(item => {
    const quantity = Math.max(1, Math.floor(Number(item.quantity || item.selectedQuantity || item.productQuantity || 1)) || 1);
    const unitPrice = Number(item.unitPrice ?? item.productUnitPrice ?? item.price ?? 0);
    const lineTotal = Number((unitPrice * quantity).toFixed(2));
    return copyProductCommerceFields({
        id: String(item.id || '').trim(),
        name: String(item.name || '').trim(),
        price: unitPrice,
        unitPrice,
        quantity,
        productQuantity: quantity,
        lineTotal,
        totalPrice: lineTotal,
        stock: Number(item.stock ?? item.availableStock ?? 0),
        availableStock: Number(item.availableStock ?? item.stock ?? 0),
        imageUrl: item.imageUrl || item.image || '',
        ownerId: item.ownerId || '',
        ownerName: item.ownerName || '',
        ownerEmail: item.ownerEmail || '',
        ownerPhone: item.ownerPhone || '',
        sellerNotificationEmail: item.sellerNotificationEmail || item.saleNotificationEmail || '',
        saleNotificationEmail: item.saleNotificationEmail || item.sellerNotificationEmail || '',
        sizes: normalizeProductSizes(item.sizes || item.medidas),
        colors: normalizeProductColors(item.colors || item.colores),
        addedAt: Number(item.addedAt || Date.now())
    }, item);
}).filter(item => item.id && item.name) : [];
const cleanupExpiredVisitorCarts = () => {
    try {
        const now = Date.now();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i) || '';
            if (!key.startsWith(CART_LOCAL_PREFIX)) continue;
            try {
                const data = JSON.parse(localStorage.getItem(key) || '{}');
                if (!data.expiresAt || Number(data.expiresAt) <= now) localStorage.removeItem(key);
            } catch(e) {
                localStorage.removeItem(key);
            }
        }
    } catch(e) {}
};
const readVisitorCart = () => {
    cleanupExpiredVisitorCarts();
    const key = getVisitorCartStorageKey();
    try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (!data.expiresAt || Number(data.expiresAt) <= Date.now()) {
            localStorage.removeItem(key);
            return [];
        }
        return normalizeCartItems(data.items || []);
    } catch(e) {
        try { localStorage.removeItem(key); } catch(err) {}
        return [];
    }
};
const writeVisitorCart = (items = []) => {
    const key = getVisitorCartStorageKey();
    const normalized = normalizeCartItems(items);
    try {
        if (normalized.length === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify({ items: normalized, expiresAt: Date.now() + CART_TTL_MS }));
    } catch(e) {}
    return normalized;
};
const clearVisitorCart = () => {
    try { localStorage.removeItem(getVisitorCartStorageKey()); } catch(e) {}
};
const readLocal = (key) => ProductsCore.readLocal(key, []);
const writeLocal = ProductsCore.writeLocal;
const getProductGallery = ProductsCore.getProductGallery;

const DRIVE_MX_HISTORY_KEY = 'driveMxBackNavigation';
const VALID_APP_VIEWS = new Set(['home', 'product-detail', 'delivery-data', 'payment-method', 'login', 'admin', 'admin-tracking', 'support', 'admin-support', 'operator', 'guide-assignment']);
const normalizeNavigationSnapshot = (snapshot = {}) => ({
    view: VALID_APP_VIEWS.has(snapshot.view) ? snapshot.view : 'home',
    selectedProductId: snapshot.selectedProductId ? String(snapshot.selectedProductId) : null,
    checkoutProductIds: Array.isArray(snapshot.checkoutProductIds) ? snapshot.checkoutProductIds.filter(Boolean).map(id => String(id)) : [],
    isCartOpen: Boolean(snapshot.isCartOpen),
    showUserModal: Boolean(snapshot.showUserModal),
    showAssignmentsPasswordModal: Boolean(snapshot.showAssignmentsPasswordModal),
    showAdminMenu: Boolean(snapshot.showAdminMenu),
    showUserMenu: Boolean(snapshot.showUserMenu),
    assignmentsUnlocked: Boolean(snapshot.assignmentsUnlocked)
});
const stringifyNavigationSnapshot = (snapshot) => JSON.stringify(normalizeNavigationSnapshot(snapshot));
const createDriveMxHistoryState = (snapshot, exitBoundary = false) => ({
    [DRIVE_MX_HISTORY_KEY]: true,
    exitBoundary,
    snapshot: normalizeNavigationSnapshot(snapshot),
    createdAt: Date.now()
});
const isDriveMxMainSnapshot = (snapshot = {}) => {
    const normalized = normalizeNavigationSnapshot(snapshot);
    return normalized.view === 'home'
        && !normalized.isCartOpen
        && !normalized.showUserModal
        && !normalized.showAssignmentsPasswordModal
        && !normalized.showAdminMenu
        && !normalized.showUserMenu;
};
const resolveStateValue = (nextValue, previousValue) => typeof nextValue === 'function' ? nextValue(previousValue) : nextValue;

const App = () => {
    const [view, setViewState] = useState('home');
    const [users, setUsers] = useState(() => readLocal(STAFF_USERS_LOCAL_KEY));
    const [staffUsersLoaded, setStaffUsersLoaded] = useState(false);
    const [ads, setAds] = useState(() => AdsManager.readAdsLocal());
    const [searchQuery, setSearchQuery] = useState('');
    const [userForm, setUserForm] = useState({ email: '', p: '', n: '', phone: '' });
    const [userRegistrationSaving, setUserRegistrationSaving] = useState(false);
    const [editingRegisteredUserId, setEditingRegisteredUserId] = useState(null);
    const [registeredUsersPage, setRegisteredUsersPage] = useState(1);
    const [selectedProductId, setSelectedProductId] = useState(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [selectedProductQuantity, setSelectedProductQuantity] = useState(0);
    const [cartItems, setCartItems] = useState(() => readVisitorCart());
    const [isCartOpen, setIsCartOpenState] = useState(false);
    const [checkoutProductIds, setCheckoutProductIds] = useState([]);
    const [deliveryForm, setDeliveryForm] = useState({ street: '', state: '', municipality: '', neighborhood: '', zip: '', fullName: '', phone: '', email: '', references: '' });
    const [emailSettings, setEmailSettings] = useState(() => {
        try {
            return normalizeEmailSettings(JSON.parse(localStorage.getItem('driveMxEmailSettings') || '{}'));
        } catch(e) {
            return normalizeEmailSettings();
        }
    });
    const [paymentSettings, setPaymentSettings] = useState(() => {
        try {
            return normalizePaymentSettings(JSON.parse(localStorage.getItem('driveMxPaymentSettings') || '{}'));
        } catch(e) {
            return normalizePaymentSettings();
        }
    });
    const [supermarketSettings, setSupermarketSettings] = useState(() => {
        try {
            return normalizeSupermarketSettings(JSON.parse(localStorage.getItem(SUPERMARKET_SETTINGS_LOCAL_KEY) || '{}'));
        } catch(e) {
            return normalizeSupermarketSettings();
        }
    });
    const [pendingTransfers, setPendingTransfers] = useState(() => readLocal('driveMxPendingTransfers'));
    const [completedSales, setCompletedSales] = useState([]);
    const [emailSaving, setEmailSaving] = useState(false);
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [orderSending, setOrderSending] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('transfer');
    const [showUserModal, setShowUserModalState] = useState(false);
    const [supportChats, setSupportChats] = useState(() => readLocal('driveMxSupportChats'));
    const [supportInput, setSupportInput] = useState('');
    const [activeSupportChatId, setActiveSupportChatId] = useState('');
    const [showAdminMenu, setShowAdminMenuState] = useState(false);
    const [showUserMenu, setShowUserMenuState] = useState(false);
    const [wallets, setWallets] = useState([]);
    const [walletSettings, setWalletSettings] = useState(() => Wallet.defaultSettings());
    const [walletSettingsSaving, setWalletSettingsSaving] = useState(false);
    const [cashbackSettingsSaving, setCashbackSettingsSaving] = useState(false);
    const [walletMovements, setWalletMovements] = useState([]);
    const [walletRecharges, setWalletRecharges] = useState([]);
    const [showWalletRecharge, setShowWalletRecharge] = useState(false);
    const [walletRechargeAmount, setWalletRechargeAmount] = useState('');
    const [walletRechargeProcessing, setWalletRechargeProcessing] = useState(false);
    const [stripeRechargeProcessing, setStripeRechargeProcessing] = useState(false);
    const [walletRechargeActionId, setWalletRechargeActionId] = useState('');

    const featureManagersRef = useRef({});
    const navigationActionsRef = useRef({});
    const walletCheckoutLoginReturnRef = useRef(null);
    const stripeRechargeInFlightRef = useRef(false);
    const authManager = EmailPasswordAuthUI.useEmailPasswordAuth({
        fbase,
        appId,
        firebaseConfig: window.firebaseConfig,
        adminEmail: ADMIN_EMAIL,
        usersCollection: STAFF_USERS_COLLECTION,
        users,
        staffUsersLoaded,
        onLogin: (profile) => featureManagersRef.current.onLogin?.(profile),
        onLogoutStart: () => featureManagersRef.current.onLogoutStart?.(),
        onLogoutComplete: () => featureManagersRef.current.onLogoutComplete?.(),
        onSessionProfileChange: (profile) => featureManagersRef.current.onSessionProfileChange?.(profile)
    });
    const { fbUser, sessionUser } = authManager;
    const walletPaymentManager = WalletPayment.useWalletPayment({
        fbase,
        appId,
        Wallet,
        fbUser,
        sessionUser,
        enabled: selectedPaymentMethod === 'wallet',
        onRequestLogin: () => featureManagersRef.current.requestWalletLogin?.()
    });
    const isUserBlocked = authManager.isUserBlocked;
    const getCurrentSessionProfile = () => authManager.findRegisteredUserProfile(sessionUser) || sessionUser || {};
    const ensureAccountAllowed = useCallback(() => {
        if (!sessionUser || sessionUser.role === 'admin') return true;
        if (isUserBlocked(getCurrentSessionProfile())) {
            alert(BLOCKED_ACCOUNT_MESSAGE);
            return false;
        }
        return true;
    }, [sessionUser, users]);

    const publicProductsManager = ProductsCore.usePublicProducts({ fbase, appId, enabled: Boolean(fbUser) });
    const products = publicProductsManager.products;
    const adminProductsManager = AdminProductsUI.useAdminProductsManager({
        fbase,
        appId,
        fbUser,
        sessionUser,
        publicProducts: publicProductsManager,
        supermarketSettings,
        setSupermarketSettings,
        adminEmail: ADMIN_EMAIL,
        onSessionUserChange: authManager.setSessionUser
    });
    const controlProducts = adminProductsManager.controlProducts;
    const userProductsManager = UserProductsUI.useUserProductsManager({
        fbase,
        appId,
        fbUser,
        sessionUser,
        users,
        publicProducts: publicProductsManager,
        wallets,
        walletSettings,
        Wallet,
        supermarketShippingFee: supermarketSettings.shippingFee,
        ensureAccountAllowed,
        verifyAdminPassword: authManager.verifyAdminPassword,
        onSessionUserChange: authManager.setSessionUser
    });
    const currentUserProducts = userProductsManager.currentUserProducts;
    const currentUserSales = userProductsManager.currentUserSales;
    const currentUserRfc = String(userProductsManager.rfc || sessionUser?.rfc || '').trim().toUpperCase();
    const userPanelRfcRequired = Boolean(sessionUser && !currentUserRfc);
    const calculateShippingFee = useCallback((items = []) => {
        const productsForShipping = Array.isArray(items) ? items.filter(Boolean) : [];
        if (productsForShipping.length === 0) return 0;
        if (typeof CostoEnvio.getCartShippingFee === 'function') {
            return CostoEnvio.getCartShippingFee(productsForShipping, {
                generalShippingFee: GLOBAL_SHIPPING_FEE,
                supermarketShippingFee: supermarketSettings.shippingFee
            });
        }
        if (typeof Supermercado.getCartShippingFee === 'function') {
            return Supermercado.getCartShippingFee(productsForShipping, {
                generalShippingFee: GLOBAL_SHIPPING_FEE,
                supermarketShippingFee: supermarketSettings.shippingFee
            });
        }
        return GLOBAL_SHIPPING_FEE;
    }, [supermarketSettings.shippingFee]);
    const packagesManager = PackagesGuidesUI.usePackagesGuidesManager({
        fbase,
        appId,
        fbUser,
        sessionUser,
        users,
        products,
        controlProducts,
        shippingFee: GLOBAL_SHIPPING_FEE,
        ensureAccountAllowed,
        verifyAdminPassword: authManager.verifyAdminPassword,
        onSessionProfileChange: authManager.setSessionUser,
        activeView: view
    });
    const {
        pkgs,
        transferTrackingDrafts,
        setTransferTrackingDrafts,
        trackingResult,
        trackingNotFound,
        assignmentsUnlocked,
        setAssignmentsUnlocked: setAssignmentsUnlockedState,
        showAssignmentsPasswordModal,
        setShowAssignmentsPasswordModal: setShowAssignmentsPasswordModalState,
        assignmentsPassword,
        setAssignmentsPassword,
        assignmentsPasswordError,
        setAssignmentsPasswordError,
        assignmentsUnlocking,
        setAssignmentsUnlocking
    } = packagesManager;
    const userHasAssignmentsAuthorization = packagesManager.userHasAssignmentsAuthorization;
    const latestNavigationSnapshotRef = useRef(null);
    const historyInitializedRef = useRef(false);
    const suppressHistorySyncRef = useRef(false);
    const pendingHistoryModeRef = useRef(null);
    const lastHistorySnapshotKeyRef = useRef('');
    const allowNativeBackExitRef = useRef(false);

    const getCurrentNavigationSnapshot = useCallback(() => normalizeNavigationSnapshot({
        view,
        selectedProductId,
        checkoutProductIds,
        isCartOpen,
        showUserModal,
        showAssignmentsPasswordModal,
        showAdminMenu,
        showUserMenu,
        assignmentsUnlocked
    }), [view, selectedProductId, checkoutProductIds, isCartOpen, showUserModal, showAssignmentsPasswordModal, showAdminMenu, showUserMenu, assignmentsUnlocked]);

    const requestHistorySync = useCallback((mode = 'push') => {
        if (suppressHistorySyncRef.current) return;
        if (mode === 'push') {
            pendingHistoryModeRef.current = 'push';
            return;
        }
        if (!pendingHistoryModeRef.current) pendingHistoryModeRef.current = 'replace';
    }, []);

    const setView = useCallback((nextValue) => {
        const previous = latestNavigationSnapshotRef.current?.view || view;
        const resolved = resolveStateValue(nextValue, previous);
        if (resolved !== previous) requestHistorySync('push');
        setViewState(resolved);
    }, [requestHistorySync, view]);

    const openProductDetail = useCallback((product = {}) => {
        const productId = String(product?.id || '').trim();
        if (!productId) return;
        setSelectedProductId(productId);
        setSelectedProductQuantity(getInitialProductPurchaseQuantity(product));
        setCurrentImageIndex(0);
        setView('product-detail');
    }, [setView]);

    useEffect(() => {
        if (view !== 'product-detail' || !selectedProductId) return undefined;
        const frame = globalThis.requestAnimationFrame(() => {
            globalThis.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });
        return () => globalThis.cancelAnimationFrame(frame);
    }, [view, selectedProductId]);

    const setIsCartOpen = useCallback((nextValue) => {
        const previous = Boolean(latestNavigationSnapshotRef.current?.isCartOpen ?? isCartOpen);
        const resolved = Boolean(resolveStateValue(nextValue, previous));
        if (resolved !== previous) requestHistorySync(resolved ? 'push' : 'replace');
        setIsCartOpenState(resolved);
    }, [requestHistorySync, isCartOpen]);

    const setShowUserModal = useCallback((nextValue) => {
        const previous = Boolean(latestNavigationSnapshotRef.current?.showUserModal ?? showUserModal);
        const resolved = Boolean(resolveStateValue(nextValue, previous));
        if (resolved !== previous) requestHistorySync(resolved ? 'push' : 'replace');
        setShowUserModalState(resolved);
    }, [requestHistorySync, showUserModal]);

    const setShowAssignmentsPasswordModal = useCallback((nextValue) => {
        const previous = Boolean(latestNavigationSnapshotRef.current?.showAssignmentsPasswordModal ?? showAssignmentsPasswordModal);
        const resolved = Boolean(resolveStateValue(nextValue, previous));
        if (resolved !== previous) requestHistorySync(resolved ? 'push' : 'replace');
        setShowAssignmentsPasswordModalState(resolved);
    }, [requestHistorySync, showAssignmentsPasswordModal]);

    const setShowAdminMenu = useCallback((nextValue) => {
        const previous = Boolean(latestNavigationSnapshotRef.current?.showAdminMenu ?? showAdminMenu);
        const resolved = Boolean(resolveStateValue(nextValue, previous));
        if (resolved !== previous) requestHistorySync(resolved ? 'push' : 'replace');
        setShowAdminMenuState(resolved);
    }, [requestHistorySync, showAdminMenu]);

    const setShowUserMenu = useCallback((nextValue) => {
        const previous = Boolean(latestNavigationSnapshotRef.current?.showUserMenu ?? showUserMenu);
        const resolved = Boolean(resolveStateValue(nextValue, previous));
        if (resolved !== previous) requestHistorySync(resolved ? 'push' : 'replace');
        setShowUserMenuState(resolved);
    }, [requestHistorySync, showUserMenu]);

    const setAssignmentsUnlocked = useCallback((nextValue) => {
        const previous = Boolean(latestNavigationSnapshotRef.current?.assignmentsUnlocked ?? assignmentsUnlocked);
        const resolved = Boolean(resolveStateValue(nextValue, previous));
        if (resolved !== previous) requestHistorySync('replace');
        setAssignmentsUnlockedState(resolved);
    }, [requestHistorySync, assignmentsUnlocked]);

    navigationActionsRef.current = { setView };
    featureManagersRef.current = {
        requestWalletLogin: () => {
            if (sessionUser && sessionUser.role !== 'admin') return;
            walletCheckoutLoginReturnRef.current = {
                selectedProductId: selectedProductId ? String(selectedProductId) : null,
                selectedProductQuantity: Number(selectedProductQuantity || 0),
                checkoutProductIds: Array.isArray(checkoutProductIds) ? [...checkoutProductIds] : []
            };
            authManager.setLoginForm({ email: '', p: '' });
            setView('login');
        },
        onLogin: (profile) => {
            const assignmentsAuthorized = profile?.role !== 'admin' && packagesManager.userHasAssignmentsAuthorization(profile);
            setAssignmentsUnlocked(assignmentsAuthorized);
            setShowUserMenu(false);
            setShowAssignmentsPasswordModal(false);
            setAssignmentsPassword('');
            setAssignmentsPasswordError('');

            const walletCheckoutReturn = walletCheckoutLoginReturnRef.current
                || (selectedPaymentMethod === 'wallet' ? {
                    selectedProductId: selectedProductId ? String(selectedProductId) : null,
                    selectedProductQuantity: Number(selectedProductQuantity || 0),
                    checkoutProductIds: Array.isArray(checkoutProductIds) ? [...checkoutProductIds] : []
                } : null);
            walletCheckoutLoginReturnRef.current = null;

            const hasWalletCheckout = Boolean(
                walletCheckoutReturn
                && (
                    walletCheckoutReturn.checkoutProductIds.length > 0
                    || (walletCheckoutReturn.selectedProductId && walletCheckoutReturn.selectedProductQuantity > 0)
                )
            );

            if (profile?.role !== 'admin' && hasWalletCheckout) {
                setCheckoutProductIds(walletCheckoutReturn.checkoutProductIds);
                setSelectedProductId(walletCheckoutReturn.selectedProductId);
                setSelectedProductQuantity(walletCheckoutReturn.selectedProductQuantity);
                setSelectedPaymentMethod('wallet');
                setView('payment-method');
                return;
            }
            setView(profile?.role === 'admin' ? 'admin' : 'operator');
        },
        onLogoutStart: () => {
            setUserForm({ email: '', p: '', n: '', phone: '' });
            setEditingRegisteredUserId(null);
            setShowUserModal(false);
            setShowUserMenu(false);
            setShowAdminMenu(false);
            setShowWalletRecharge(false);
            setWalletRechargeAmount('');
            setWalletRechargeProcessing(false);
            setStripeRechargeProcessing(false);
            stripeRechargeInFlightRef.current = false;
            setWalletMovements([]);
            userProductsManager.reset();
            packagesManager.reset();
            resetPublicFlow();
        },
        onLogoutComplete: () => {},
        onSessionProfileChange: (profile) => {
            if (profile?.role !== 'admin' && packagesManager.userHasAssignmentsAuthorization(profile)) {
                setAssignmentsUnlocked(true);
            }
        }
    };

    const applyNavigationSnapshot = useCallback((snapshot) => {
        const next = normalizeNavigationSnapshot(snapshot);
        const activeSession = authManager.getCurrentSession();
        if (['admin', 'admin-tracking', 'admin-support'].includes(next.view) && activeSession?.role !== 'admin') {
            next.view = activeSession ? 'operator' : 'home';
            next.showAdminMenu = false;
        }
        if (['operator', 'guide-assignment'].includes(next.view) && (!activeSession || activeSession.role === 'admin')) {
            next.view = activeSession?.role === 'admin' ? 'admin' : 'home';
            next.showUserMenu = false;
            next.assignmentsUnlocked = false;
            next.showAssignmentsPasswordModal = false;
        }
        if (['operator', 'guide-assignment'].includes(next.view) && activeSession && activeSession.role !== 'admin') {
            if (isUserBlocked(activeSession)) {
                next.view = 'home';
                next.showUserMenu = false;
                next.assignmentsUnlocked = false;
                next.showAssignmentsPasswordModal = false;
            } else if (next.assignmentsUnlocked && !userHasAssignmentsAuthorization(activeSession)) {
                next.assignmentsUnlocked = false;
            }
        }
        const currentKey = latestNavigationSnapshotRef.current ? stringifyNavigationSnapshot(latestNavigationSnapshotRef.current) : '';
        const nextKey = stringifyNavigationSnapshot(next);
        if (currentKey === nextKey) {
            suppressHistorySyncRef.current = false;
            pendingHistoryModeRef.current = null;
            latestNavigationSnapshotRef.current = next;
            lastHistorySnapshotKeyRef.current = nextKey;
            return;
        }
        suppressHistorySyncRef.current = true;
        setViewState(next.view);
        setSelectedProductId(next.selectedProductId);
        setCheckoutProductIds(next.checkoutProductIds);
        setIsCartOpenState(next.isCartOpen);
        setShowUserModalState(next.showUserModal);
        setShowAssignmentsPasswordModalState(next.showAssignmentsPasswordModal);
        setShowAdminMenuState(next.showAdminMenu);
        setShowUserMenuState(next.showUserMenu);
        setAssignmentsUnlockedState(next.assignmentsUnlocked);
        if (!next.showUserModal) {
            setUserForm({ email: '', p: '', n: '', phone: '' });
            setEditingRegisteredUserId(null);
        }
        if (!next.showAssignmentsPasswordModal) {
            setAssignmentsPassword('');
            setAssignmentsPasswordError('');
            setAssignmentsUnlocking(false);
        }
    }, []);


    useEffect(() => {
        const snapshot = getCurrentNavigationSnapshot();
        const key = stringifyNavigationSnapshot(snapshot);
        latestNavigationSnapshotRef.current = snapshot;

        if (!historyInitializedRef.current) {
            historyInitializedRef.current = true;
            lastHistorySnapshotKeyRef.current = key;
            try {
                window.history.replaceState(createDriveMxHistoryState(snapshot, true), '', window.location.href);
                window.history.pushState(createDriveMxHistoryState(snapshot, false), '', window.location.href);
            } catch(err) {
                console.warn('Historial Drive MX no disponible:', err);
            }
            return;
        }

        if (suppressHistorySyncRef.current) {
            suppressHistorySyncRef.current = false;
            pendingHistoryModeRef.current = null;
            lastHistorySnapshotKeyRef.current = key;
            return;
        }

        const mode = pendingHistoryModeRef.current;
        pendingHistoryModeRef.current = null;
        if (!mode || key === lastHistorySnapshotKeyRef.current) return;

        try {
            const state = createDriveMxHistoryState(snapshot, false);
            if (mode === 'replace') window.history.replaceState(state, '', window.location.href);
            else window.history.pushState(state, '', window.location.href);
            lastHistorySnapshotKeyRef.current = key;
        } catch(err) {
            console.warn('No se pudo sincronizar el historial Drive MX:', err);
        }
    }, [getCurrentNavigationSnapshot]);

    useEffect(() => {
        const handlePopState = (event) => {
            if (allowNativeBackExitRef.current) return;
            const state = event.state || {};

            if (state[DRIVE_MX_HISTORY_KEY] && state.exitBoundary) {
                const shouldExit = window.confirm('¿Deseas salir de Drive MX?');
                if (shouldExit) {
                    allowNativeBackExitRef.current = true;
                    window.history.back();
                    return;
                }
                const snapshot = latestNavigationSnapshotRef.current || getCurrentNavigationSnapshot();
                try {
                    window.history.pushState(createDriveMxHistoryState(snapshot, false), '', window.location.href);
                    lastHistorySnapshotKeyRef.current = stringifyNavigationSnapshot(snapshot);
                } catch(err) {
                    console.warn('No se pudo restaurar el historial Drive MX:', err);
                }
                return;
            }

            if (state[DRIVE_MX_HISTORY_KEY] && state.snapshot) {
                const nextSnapshot = normalizeNavigationSnapshot(state.snapshot);
                const currentKey = latestNavigationSnapshotRef.current ? stringifyNavigationSnapshot(latestNavigationSnapshotRef.current) : '';
                const nextKey = stringifyNavigationSnapshot(nextSnapshot);
                if (currentKey === nextKey) {
                    window.history.back();
                    return;
                }
                applyNavigationSnapshot(nextSnapshot);
                return;
            }

            const snapshot = latestNavigationSnapshotRef.current || getCurrentNavigationSnapshot();
            if (!isDriveMxMainSnapshot(snapshot)) {
                try {
                    window.history.pushState(createDriveMxHistoryState(snapshot, false), '', window.location.href);
                } catch(err) {
                    console.warn('No se pudo proteger la navegación Drive MX:', err);
                }
                return;
            }

            const shouldExit = window.confirm('¿Deseas salir de Drive MX?');
            if (shouldExit) {
                allowNativeBackExitRef.current = true;
                window.history.back();
            } else {
                try {
                    window.history.pushState(createDriveMxHistoryState(snapshot, false), '', window.location.href);
                } catch(err) {
                    console.warn('No se pudo cancelar la salida de Drive MX:', err);
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [applyNavigationSnapshot, getCurrentNavigationSnapshot]);

    useEffect(() => {
        const syncVisitorCart = () => setCartItems(readVisitorCart());
        syncVisitorCart();
        window.addEventListener('storage', syncVisitorCart);
        const timer = setInterval(syncVisitorCart, 60000);
        return () => {
            window.removeEventListener('storage', syncVisitorCart);
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (!fbUser) return undefined;
        const db = fbase.getFirestore();
        const userCol = fbase.collection(db, 'artifacts', appId, 'public', 'data', STAFF_USERS_COLLECTION);
        const transferCol = fbase.collection(db, 'artifacts', appId, 'public', 'data', 'bank_transfers');
        const completedSalesCol = fbase.collection(db, 'artifacts', appId, 'public', 'data', 'completed_sales');
        const supportCol = fbase.collection(db, 'artifacts', appId, 'public', 'data', 'support_chats');
        const mailSettingsRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'mail_settings', 'config');
        const paymentSettingsRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'payment_settings', 'config');
        const supermarketSettingsRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', SUPERMARKET_SETTINGS_COLLECTION, SUPERMARKET_SETTINGS_DOCUMENT);

        setStaffUsersLoaded(false);
        const unsubUsers = fbase.onSnapshot(userCol, (snapshot) => {
            const list = [];
            snapshot.forEach((documentSnapshot) => list.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
            setUsers(list);
            setStaffUsersLoaded(true);
            writeLocal(STAFF_USERS_LOCAL_KEY, list);
        }, (error) => {
            console.error('Firestore usuarios:', error);
            setStaffUsersLoaded(true);
        });

        let unsubTransfers = () => {};
        if (sessionUser?.role === 'admin') {
            unsubTransfers = fbase.onSnapshot(transferCol, (snapshot) => {
                const list = [];
                snapshot.forEach((documentSnapshot) => list.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
                list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
                setPendingTransfers(list);
                writeLocal('driveMxPendingTransfers', list);
            }, (error) => console.error('Firestore transferencias administrativas:', error));
        } else if (sessionUser && sessionUser.role !== 'admin') {
            const walletId = String(sessionUser.uid || sessionUser.id || '').trim();
            if (walletId) {
                const ownRechargeTransfersQuery = fbase.query(
                    transferCol,
                    fbase.where('type', '==', 'wallet_recharge'),
                    fbase.where('walletId', '==', walletId)
                );
                unsubTransfers = fbase.onSnapshot(ownRechargeTransfersQuery, (snapshot) => {
                    const list = [];
                    snapshot.forEach((documentSnapshot) => list.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
                    list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
                    setPendingTransfers(list);
                    writeLocal('driveMxPendingTransfers', list);
                }, (error) => console.error('Firestore recargas pendientes del usuario:', error));
            } else {
                setPendingTransfers([]);
            }
        } else {
            setPendingTransfers([]);
        }

        let unsubCompletedSales = () => {};
        if (sessionUser?.role === 'admin') {
            setCompletedSales(readLocal('driveMxCompletedSales'));
            unsubCompletedSales = fbase.onSnapshot(completedSalesCol, (snapshot) => {
                const list = [];
                snapshot.forEach((documentSnapshot) => list.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
                list.sort((a, b) => Number(b.soldAt || b.createdAt || 0) - Number(a.soldAt || a.createdAt || 0));
                setCompletedSales(list);
                writeLocal('driveMxCompletedSales', list);
            }, (error) => console.error('Firestore ventas realizadas:', error));
        } else {
            setCompletedSales([]);
        }

        const unsubMailSettings = fbase.onSnapshot(mailSettingsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const next = normalizeEmailSettings(snapshot.data() || {});
            setEmailSettings(next);
            try { localStorage.setItem('driveMxEmailSettings', JSON.stringify(next)); } catch(error) {}
        }, (error) => console.error('Firestore configuración correo:', error));

        const unsubSupportChats = fbase.onSnapshot(supportCol, (snapshot) => {
            const list = [];
            snapshot.forEach((documentSnapshot) => list.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
            list.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
            setSupportChats(list);
            writeLocal('driveMxSupportChats', list);
        }, (error) => console.error('Firestore soporte:', error));

        const unsubPaymentSettings = fbase.onSnapshot(paymentSettingsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const next = normalizePaymentSettings(snapshot.data() || {});
            setPaymentSettings(next);
            try { localStorage.setItem('driveMxPaymentSettings', JSON.stringify(next)); } catch(error) {}
        }, (error) => console.error('Firestore configuración pagos:', error));

        const unsubSupermarketSettings = fbase.onSnapshot(supermarketSettingsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const next = normalizeSupermarketSettings(snapshot.data() || {});
            setSupermarketSettings(next);
            try { localStorage.setItem(SUPERMARKET_SETTINGS_LOCAL_KEY, JSON.stringify(next)); } catch(error) {}
        }, (error) => console.error('Firestore configuración de envío de Supermercado:', error));

        return () => {
            unsubUsers();
            unsubTransfers();
            unsubCompletedSales();
            unsubSupportChats();
            unsubMailSettings();
            unsubPaymentSettings();
            unsubSupermarketSettings();
        };
    }, [fbUser, sessionUser?.role, sessionUser?.uid, sessionUser?.id]);

    useEffect(() => {
        if (!fbUser) return;
        return AdsManager.subscribeAds({ fbase, appId, onChange: setAds });
    }, [fbUser]);

    useEffect(() => {
        if (!fbUser) return;
        const unsubWallets = Wallet.subscribeWallets({ fbase, appId, onChange: setWallets });
        const unsubSettings = Wallet.subscribeSettings({ fbase, appId, onChange: setWalletSettings });
        return () => { unsubWallets(); unsubSettings(); };
    }, [fbUser]);

    useEffect(() => {
        if (!fbUser || !sessionUser || sessionUser.role === 'admin') {
            setWalletMovements([]);
            setShowWalletRecharge(false);
            setWalletRechargeAmount('');
            setWalletRechargeProcessing(false);
            setStripeRechargeProcessing(false);
            stripeRechargeInFlightRef.current = false;
            return;
        }
        const userWalletId = Wallet.getUserWalletId(sessionUser);
        if (!userWalletId) {
            setWalletMovements([]);
            return;
        }
        Wallet.ensureWalletDocument({ fbase, appId, user: sessionUser, createdBy: sessionUser?.email || '' }).catch((err) => console.error('Crear cartera inicial:', err));
        const unsubMovements = Wallet.subscribeMovements({ fbase, appId, userId: userWalletId, onChange: setWalletMovements });
        return () => unsubMovements();
    }, [fbUser, sessionUser?.uid, sessionUser?.id, sessionUser?.email, sessionUser?.name, sessionUser?.phone, sessionUser?.role]);

    useEffect(() => {
        if (!fbUser?.uid || fbUser.isAnonymous || !sessionUser || sessionUser.role === 'admin') return undefined;
        if (!StripeWallet.available || typeof StripeWallet.recoverPendingCheckouts !== 'function') return undefined;

        let active = true;
        StripeWallet.recoverPendingCheckouts({ fbase })
            .then((result = {}) => {
                if (!active || result.credited !== true) return;
                console.info('[Stripe] Recargas pendientes recuperadas:', result.recoveredCount || 0);
            })
            .catch((error) => {
                if (!active) return;
                const ignoredCodes = ['stripe-not-configured', 'stripe-auth-required', 'invalid-auth-token'];
                if (!ignoredCodes.includes(String(error?.code || ''))) {
                    console.error('Recuperar recargas Stripe pendientes:', error);
                }
            });

        return () => { active = false; };
    }, [fbUser?.uid, fbUser?.isAnonymous, sessionUser?.uid, sessionUser?.id, sessionUser?.role]);

    useEffect(() => {
        if (!fbUser || sessionUser?.role !== 'admin') {
            setWalletRecharges([]);
            return;
        }
        return Wallet.subscribeRecharges({ fbase, appId, onChange: setWalletRecharges });
    }, [fbUser, sessionUser?.role]);



    const getOperationErrorDetails = (err = {}) => ({
        name: err?.name || 'Error',
        code: err?.code || '',
        message: err?.message || String(err || 'Error desconocido'),
        stack: err?.stack || ''
    });

    const saveDoc = async (col, id, data, options = {}) => {
        const { throwOnError = false, skipLocalUpdate = false, applyLocalOnError = true, firestoreDb = null } = options || {};
        const applyLocalUpdate = () => {
            if (skipLocalUpdate) return;
            if (col === STAFF_USERS_COLLECTION) {
                setUsers(prev => { const next = [...prev.filter(x => x.id !== id), { id, ...data }]; writeLocal(STAFF_USERS_LOCAL_KEY, next); return next; });
            }
            if (col === 'bank_transfers') {
                setPendingTransfers(prev => { const next = [{ id, ...data }, ...prev.filter(x => x.id !== id)]; writeLocal('driveMxPendingTransfers', next); return next; });
            }
            if (col === 'completed_sales') {
                setCompletedSales(prev => { const next = [{ id, ...data }, ...prev.filter(x => x.id !== id)].sort((a, b) => Number(b.soldAt || b.createdAt || 0) - Number(a.soldAt || a.createdAt || 0)); writeLocal('driveMxCompletedSales', next); return next; });
            }
            if (col === 'support_chats') {
                setSupportChats(prev => { const next = [{ id, ...data }, ...prev.filter(x => x.id !== id)].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)); writeLocal('driveMxSupportChats', next); return next; });
            }
        };
        try {
            const db = firestoreDb || fbase.getFirestore();
            await fbase.setDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', col, id), data);
            applyLocalUpdate();
            return { success: true };
        } catch(err) {
            console.error('[Firestore][setDoc] No se pudo guardar el documento.', {
                collection: col,
                documentId: id,
                ...getOperationErrorDetails(err)
            }, err);
            if (applyLocalOnError) applyLocalUpdate();
            if (throwOnError) throw err;
            return { success: false, error: err };
        }
    };

    const readBankTransferDocument = async (transferId) => {
        const safeTransferId = String(transferId || '').trim();
        if (!safeTransferId) {
            const error = new Error('No se recibió el identificador de la transferencia.');
            error.code = 'TRANSFER_ID_MISSING';
            throw error;
        }
        const db = fbase.getFirestore();
        const transferRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'bank_transfers', safeTransferId);
        try {
            const snapshot = await fbase.getDoc(transferRef);
            if (!snapshot.exists()) {
                const error = new Error('La transferencia ya no existe en Firestore.');
                error.code = 'TRANSFER_NOT_FOUND';
                throw error;
            }
            return { id: snapshot.id, ...snapshot.data() };
        } catch(err) {
            console.error('[Transferencias][Firestore] No se pudo leer la transferencia.', {
                transferId: safeTransferId,
                ...getOperationErrorDetails(err)
            }, err);
            throw err;
        }
    };

    const updateBankTransferDocument = async (transferId, patch = {}, options = {}) => {
        const safeTransferId = String(transferId || '').trim();
        const expected = options?.expected || {};
        if (!safeTransferId) {
            const error = new Error('No se recibió el identificador de la transferencia.');
            error.code = 'TRANSFER_ID_MISSING';
            throw error;
        }
        const db = fbase.getFirestore();
        const transferRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'bank_transfers', safeTransferId);
        try {
            await fbase.setDoc(transferRef, { ...patch, transferId: safeTransferId }, { merge: true });
            const verifiedSnapshot = await fbase.getDoc(transferRef);
            if (!verifiedSnapshot.exists()) {
                const error = new Error('La transferencia no se encontró después de actualizarla.');
                error.code = 'TRANSFER_WRITE_NOT_VERIFIED';
                throw error;
            }
            const verifiedTransfer = { id: verifiedSnapshot.id, ...verifiedSnapshot.data() };
            for (const [field, expectedValue] of Object.entries(expected)) {
                if (verifiedTransfer[field] !== expectedValue) {
                    const error = new Error(`Firestore no confirmó el campo ${field} de la transferencia.`);
                    error.code = 'TRANSFER_WRITE_NOT_VERIFIED';
                    error.field = field;
                    throw error;
                }
            }
            setPendingTransfers(prev => {
                const next = [verifiedTransfer, ...prev.filter(item => (item.id || item.transferId) !== safeTransferId)]
                    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
                writeLocal('driveMxPendingTransfers', next);
                return next;
            });
            return verifiedTransfer;
        } catch(err) {
            console.error('[Transferencias][Firestore] No se pudo actualizar o verificar la transferencia.', {
                transferId: safeTransferId,
                patchFields: Object.keys(patch || {}),
                expected,
                ...getOperationErrorDetails(err)
            }, err);
            throw err;
        }
    };

    const getFirebaseAuthErrorMessage = (err) => {
        const code = String(err?.code || '');
        if (code === 'auth/email-already-in-use') return 'El correo ya está registrado. Inicia sesión o usa otro correo.';
        if (code === 'auth/invalid-email') return 'El correo electrónico no es válido.';
        if (code === 'auth/weak-password') return 'La contraseña debe tener mínimo 6 caracteres.';
        if (code === 'auth/network-request-failed') return 'No se pudo completar la operación. Revisa tu conexión e intenta de nuevo.';
        if (code === 'auth/operation-not-allowed') return 'Firebase no permite crear cuentas con correo y contraseña.';
        if (code === 'auth/secondary-session-not-isolated') return 'No se pudo aislar la creación del usuario. Recarga la página e intenta de nuevo.';
        if (code === 'auth/missing-user-id') return 'Firebase no devolvió un identificador válido para el usuario.';
        if (code === 'auth/existing-account-password-mismatch') return 'El correo ya existe. Inicia sesión con su contraseña o utiliza “¿Olvidaste tu contraseña?” para restablecerla.';
        if (code === 'firebase-admin-not-configured') return 'El servicio de usuarios no pudo conectarse con Firebase Admin.';
        return err?.message || 'No se pudo crear el usuario. Revisa los datos e intenta de nuevo.';
    };

    const getFirestoreRegistrationErrorMessage = (err) => {
        const code = String(err?.code || '').replace('firestore/', '');
        if (code === 'permission-denied') return 'Authentication aceptó la cuenta, pero Firestore rechazó el perfil.';
        if (code === 'unavailable') return 'Authentication aceptó la cuenta, pero Firestore no está disponible.';
        if (code === 'invalid-argument') return 'Authentication aceptó la cuenta, pero los datos del perfil fueron rechazados.';
        return err?.message || 'La cuenta existe en Authentication, pero no se pudo completar su perfil.';
    };

    const getSessionUserId = () => UserProductsUI.services.getUserProfileId(sessionUser || {});
    const normalizeOwnerValue = ProductsCore.normalizeOwnerValue;
    const getUserProfileId = UserProductsUI.services.getUserProfileId;
    const getUserProfileEmail = UserProductsUI.services.getUserProfileEmail;
    const getSaleRecordId = UserProductsUI.services.getSaleRecordId;
    const getSaleOwnerId = UserProductsUI.services.getSaleOwnerId;
    const getSaleOwnerEmail = UserProductsUI.services.getSaleOwnerEmail;
    const isSaleOwnedByUser = (sale = {}, user = sessionUser) => UserProductsUI.services.isSaleOwnedByUser(sale, user || {});
    const isProductOwnedByUserProfile = (product = {}, user = {}) => UserProductsUI.services.isProductOwnedByUserProfile(product, user);
    const getProductOwnerId = ProductsCore.getProductOwnerId;
    const isUserPanelPublication = ProductsCore.isUserPanelPublication;
    const isControlPanelProduct = ProductsCore.isControlPanelProduct;
    const getSellerInfoForProduct = (product = {}) => UserProductsUI.services.getSellerInfoForProduct(product, users);
    const saveUserCompletedSaleMirror = async (sale = {}, options = {}) => {
        try {
            return await UserProductsUI.services.saveCompletedSaleMirror({ fbase, appId, sale });
        } catch (err) {
            console.error('[Ventas][Firestore] No se pudo guardar el espejo de la venta.', {
                saleId: getSaleRecordId(sale),
                ownerId: getSaleOwnerId(sale),
                ...getOperationErrorDetails(err)
            }, err);
            if (options?.throwOnError) throw err;
            return null;
        }
    };
    const deleteUserCompletedSaleMirror = async (sale = {}) => {
        try {
            await UserProductsUI.services.deleteCompletedSaleMirror({ fbase, appId, sale });
        } catch (err) {
            console.error('Firestore borrar espejo venta usuario:', err);
        }
    };
    const deleteCompletedSale = async (sale) => {
        const saleId = getSaleRecordId(sale);
        if (!saleId) return;
        if (!confirm('¿Eliminar este registro de Ventas Realizadas? Solo se eliminará el registro de venta.')) return;
        setCompletedSales(prev => { const next = prev.filter(x => getSaleRecordId(x) !== saleId); writeLocal('driveMxCompletedSales', next); return next; });
        try {
            const db = fbase.getFirestore();
            await fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'completed_sales', saleId));
            await deleteUserCompletedSaleMirror(sale);
        } catch(err) {
            console.error('Firestore borrar venta realizada:', err);
            alert('No se pudo eliminar la venta realizada.');
        }
    };
    const deleteUser = async (userOrId) => {
        const targetUser = typeof userOrId === 'object' && userOrId ? userOrId : (users.find(u => (u.id || u.uid) === userOrId) || { id: userOrId });
        const targetId = getUserProfileId(targetUser);
        const targetEmail = getUserProfileEmail(targetUser);
        if (!targetId) return;
        if (targetUser.role === 'admin' || targetEmail === ADMIN_EMAIL.toLowerCase()) {
            alert('No se puede eliminar al administrador central.');
            return;
        }
        const label = targetUser.name || targetUser.email || targetId;
        if (!confirm(`¿Eliminar Usuario ${label}? Se eliminará su cuenta y sus datos asociados.`)) return;

        const removedUserIds = new Set([targetId, getSafeFirestoreDocId(targetId)].filter(Boolean));
        const matchesTargetProduct = (product = {}) => isProductOwnedByUserProfile(product, targetUser);
        const matchesTargetSale = (sale = {}) => isSaleOwnedByUser(sale, targetUser);
        const matchesTargetSupportChat = (chat = {}) => {
            const chatUserId = normalizeOwnerValue(chat.userId || chat.uid || chat.ownerId);
            const chatEmail = String(chat.userEmail || chat.email || '').trim().toLowerCase();
            return Boolean((chatUserId && removedUserIds.has(chatUserId)) || (chatEmail && targetEmail && chatEmail === targetEmail));
        };
        const productsToDelete = products.filter(matchesTargetProduct);
        const productIdsToDelete = productsToDelete.map(product => product.id).filter(Boolean);
        const targetUserDocumentId = getSafeFirestoreDocId(targetId);
        const salesToDelete = completedSales.filter(matchesTargetSale);
        const supportChatsToDelete = supportChats.filter(matchesTargetSupportChat);

        setUsers(prev => { const next = prev.filter(x => getUserProfileId(x) !== targetId && getUserProfileEmail(x) !== targetEmail); writeLocal(STAFF_USERS_LOCAL_KEY, next); return next; });
        productIdsToDelete.forEach(productId => publicProductsManager.removeLocal(productId));
        setCompletedSales(prev => { const next = prev.filter(sale => !matchesTargetSale(sale)); writeLocal('driveMxCompletedSales', next); return next; });
        setSupportChats(prev => { const next = prev.filter(chat => !matchesTargetSupportChat(chat)); writeLocal('driveMxSupportChats', next); return next; });
        if (activeSupportChatId && supportChatsToDelete.some(chat => (chat.id || chat.chatId) === activeSupportChatId)) setActiveSupportChatId('');

        try {
            const auth = fbase.getAuth();
            const adminToken = await auth.currentUser?.getIdToken?.(true);
            if (!adminToken) throw new Error('No se pudo validar la sesión del administrador.');

            const db = fbase.getFirestore();
            const clientDeletes = [
                fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', STAFF_USERS_COLLECTION, targetId)),
                ...productIdsToDelete.map(productId => fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', PUBLIC_PRODUCTS_COLLECTION, productId))),
                ...productIdsToDelete.map(productId => targetUserDocumentId
                    ? fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', USER_PRODUCTS_COLLECTION, targetUserDocumentId, 'items', productId))
                    : Promise.resolve()),
                ...salesToDelete.map(sale => {
                    const saleId = getSaleRecordId(sale);
                    return saleId ? fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'completed_sales', saleId)) : Promise.resolve();
                }),
                ...salesToDelete.map(sale => {
                    const userDocId = getSafeFirestoreDocId(getSaleOwnerId(sale));
                    const saleId = getSaleRecordId(sale);
                    return userDocId && saleId ? fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', USER_SALES_COLLECTION, userDocId, 'items', saleId)) : Promise.resolve();
                }),
                ...supportChatsToDelete.map(chat => {
                    const chatId = chat.id || chat.chatId;
                    return chatId ? fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'support_chats', chatId)) : Promise.resolve();
                })
            ];
            await Promise.allSettled(clientDeletes);

            const res = await fetch('/api/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ uid: targetId, email: targetEmail })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo eliminar la cuenta de Authentication.');
            alert('Usuario eliminado correctamente.');
        } catch(err) {
            console.error('Eliminar usuario:', err);
            console.error('Detalle técnico de eliminación de usuario:', err);
            alert('No se pudo completar la eliminación del usuario.');
        }
    };
    const walletCommissionPercent = Wallet.normalizePercent(walletSettings.globalCommissionPercent);
    const currentUserWallet = sessionUser && sessionUser.role !== 'admin'
        ? Wallet.findWalletForUser(wallets, sessionUser)
        : Wallet.normalizeWallet(null, sessionUser || {});
    const currentUserWalletBlockedMessage = sessionUser && sessionUser.role !== 'admin' && !Wallet.isWalletActivated(currentUserWallet)
        ? Wallet.INSUFFICIENT_MESSAGE
        : '';
    const walletRechargeRows = (() => {
        const byId = new Map();
        (Array.isArray(walletRecharges) ? walletRecharges : []).forEach((recharge) => {
            const id = String(recharge.referenceId || recharge.rechargeId || recharge.id || '');
            if (!id) return;
            byId.set(id, { ...recharge, status: recharge.status || 'Completada' });
        });
        (Array.isArray(pendingTransfers) ? pendingTransfers : [])
            .filter((transfer) => transfer.type === 'wallet_recharge')
            .forEach((transfer) => {
                const transferId = String(transfer.id || transfer.transferId || '');
                if (!transferId) return;
                const status = String(transfer.status || '').toLowerCase() === 'pagado' ? 'Completada' : 'Pendiente';
                if (status === 'Completada' && byId.has(transferId)) return;
                byId.set(transferId, {
                    id: transferId,
                    rechargeId: transferId,
                    referenceId: transferId,
                    sourceTransferId: transferId,
                    walletId: transfer.walletId || transfer.userId || '',
                    userId: transfer.userId || transfer.walletId || '',
                    userName: transfer.userName || transfer.holderName || 'Usuario',
                    userEmail: transfer.userEmail || '',
                    amount: Number(transfer.amount || 0),
                    currency: transfer.currency || 'MXN',
                    status,
                    createdAt: transfer.createdAt || transfer.updatedAt || Date.now(),
                    createdBy: transfer.createdBy || '',
                    source: 'bank_transfers'
                });
            });
        return Array.from(byId.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    })();
    const pendingSalesTransfers = (Array.isArray(pendingTransfers) ? pendingTransfers : [])
        .filter((transfer) => transfer.type !== 'wallet_recharge');
    const productSections = Supermercado.splitProducts(products);
    const activeProducts = productSections.general;
    const supermarketProducts = productSections.supermarket;
    const activeAds = AdsManager.getActiveAds(ads);
    const findProductById = (productId) => products.find(p => String(p.id) === String(productId));
    const selectedProduct = findProductById(selectedProductId);
    const createPurchasableProduct = (product = {}, quantity = 1, fallback = {}) => {
        if (!product?.id && !fallback?.id) return null;
        const source = { ...(fallback || {}), ...(product || {}) };
        const unitPrice = getProductUnitPrice(source);
        const selectedQuantity = clampProductQuantity(quantity, source);
        const lineTotal = Number((unitPrice * selectedQuantity).toFixed(2));
        return {
            ...source,
            price: unitPrice,
            unitPrice,
            quantity: selectedQuantity,
            productQuantity: selectedQuantity,
            lineTotal,
            totalPrice: lineTotal,
            stock: getProductStock(source),
            availableStock: getProductStock(source)
        };
    };
    const hydrateCartProduct = (item = {}) => {
        const liveProduct = findProductById(item.id);
        return createPurchasableProduct(liveProduct || item, item.quantity || 1, item);
    };
    const selectedPurchaseQuantity = selectedProduct ? clampProductSelectionQuantity(selectedProductQuantity, selectedProduct) : 0;
    const selectedCheckoutProduct = selectedProduct ? createPurchasableProduct(selectedProduct, selectedPurchaseQuantity) : null;
    const cartProducts = cartItems.map(hydrateCartProduct).filter(Boolean);
    const cartSubtotal = cartProducts.reduce((total, product) => total + getProductLineTotal(product, product.quantity), 0);
    const cartTotalQuantity = cartProducts.reduce((total, product) => total + Number(product.quantity || 0), 0);
    const cartSupermarketProductCount = getSupermarketPurchaseProductCount(cartProducts);
    const cartDriveMxProductCount = getDriveMxPurchaseProductCount(cartProducts);
    const checkoutProducts = checkoutProductIds.length > 0
        ? checkoutProductIds.map(id => hydrateCartProduct(cartItems.find(item => String(item.id) === String(id)) || findProductById(id))).filter(Boolean)
        : (selectedCheckoutProduct ? [selectedCheckoutProduct] : []);
    const checkoutSubtotal = checkoutProducts.reduce((total, product) => total + getProductLineTotal(product, product.quantity), 0);
    const checkoutShippingFee = calculateShippingFee(checkoutProducts);
    const checkoutTotal = checkoutSubtotal + checkoutShippingFee;
    const checkoutTotalQuantity = checkoutProducts.reduce((total, product) => total + Number(product.quantity || 0), 0);
    const checkoutSupermarketProductCount = getSupermarketPurchaseProductCount(checkoutProducts);
    const checkoutDriveMxProductCount = getDriveMxPurchaseProductCount(checkoutProducts);
    const checkoutProduct = checkoutProducts[0] || null;
    const checkoutProductNames = checkoutProducts.map(product => `${product.name}${Number(product.quantity || 0) > 1 ? ` x${product.quantity}` : ''}`).filter(Boolean).join(', ');
    const checkoutProductIdsLabel = checkoutProducts.map(product => product.id).filter(Boolean).join(', ');
    const checkoutProductKey = checkoutProducts.map(product => `${product.id}:${Number(product.price || 0)}:${Number(product.quantity || 0)}`).join('|');
    const selectedGallery = getProductGallery(selectedProduct);
    const selectedMainImage = selectedGallery[currentImageIndex] || '';

    const ensureCheckoutInventoryAllowed = (productsToValidate = checkoutProducts) => {
        const items = Array.isArray(productsToValidate) ? productsToValidate.filter(Boolean) : [];
        for (const product of items) {
            const stock = getProductStock(product);
            const quantity = Number(product.quantity || product.productQuantity || 0);
            if (stock <= 0) {
                alert(`El producto ${product.name || product.id || ''} está agotado.`);
                return false;
            }
            if (!quantity || quantity < 1) {
                alert(`Selecciona una cantidad válida para ${product.name || product.id || 'el producto'}.`);
                return false;
            }
            if (quantity > stock) {
                alert(`Solo hay ${stock} unidad${stock === 1 ? '' : 'es'} disponible${stock === 1 ? '' : 's'} de ${product.name || 'este producto'}.`);
                return false;
            }
        }
        return true;
    };

    const ensureSupermarketMinimumAllowed = (productsToValidate = checkoutProducts) => {
        const driveMxValidationMessage = getDriveMxMaximumPurchaseError(productsToValidate);
        if (driveMxValidationMessage) {
            alert(driveMxValidationMessage);
            return false;
        }
        const supermarketValidationMessage = getSupermarketMinimumPurchaseError(productsToValidate);
        if (!supermarketValidationMessage) return true;
        alert(supermarketValidationMessage);
        return false;
    };

    const ensureCheckoutWalletsAllowed = (productsToValidate = checkoutProducts) => {
        const validation = Wallet.validateProductsForSale({
            products: productsToValidate,
            wallets,
            commissionPercent: walletCommissionPercent
        });
        if (!validation.ok) {
            alert(Wallet.INSUFFICIENT_MESSAGE);
            return false;
        }
        return true;
    };

    const saveWalletCommissionSettings = async (e) => {
        e.preventDefault();
        const percent = Number(walletSettings.globalCommissionPercent || 0);
        const minimumFirstRecharge = Number(walletSettings.minimumFirstRecharge || 0);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            alert('Ingresa un porcentaje de comisión global entre 0 y 100.');
            return;
        }
        if (!Number.isFinite(minimumFirstRecharge) || minimumFirstRecharge < Wallet.MIN_FIRST_RECHARGE || minimumFirstRecharge > 1000000) {
            alert(`La recarga mínima debe ser de al menos ${Wallet.formatMoney(Wallet.MIN_FIRST_RECHARGE)} y máximo $1,000,000 MXN.`);
            return;
        }
        setWalletSettingsSaving(true);
        try {
            const next = await Wallet.saveSettings({
                fbase,
                appId,
                settings: { ...walletSettings, globalCommissionPercent: percent, minimumFirstRecharge },
                actor: sessionUser?.email || ADMIN_EMAIL
            });
            setWalletSettings(next);
            alert('Configuración de cartera guardada correctamente.');
        } catch(err) {
            console.error('Guardar configuración de comisiones:', err);
            alert('No se pudo guardar la configuración de comisiones.');
        } finally {
            setWalletSettingsSaving(false);
        }
    };

    const saveCashbackSettings = async (event) => {
        event?.preventDefault?.();
        const rawAmount = Number(walletSettings.globalCashbackAmount);
        const maximum = Number(Cashback.MAX_AMOUNT || 1000000);
        if (!Number.isFinite(rawAmount) || rawAmount < 0 || rawAmount > maximum) {
            alert(`Ingresa una cantidad de Cash Back entre $0.00 y $${maximum.toLocaleString('es-MX')} MXN.`);
            return;
        }
        const amount = typeof Cashback.normalizeAmount === 'function'
            ? Cashback.normalizeAmount(rawAmount, Cashback.DEFAULT_AMOUNT || 10)
            : Number(rawAmount.toFixed(2));
        setCashbackSettingsSaving(true);
        try {
            const next = await Wallet.saveSettings({
                fbase,
                appId,
                settings: { ...walletSettings, globalCashbackAmount: amount },
                actor: sessionUser?.email || ADMIN_EMAIL
            });
            setWalletSettings(next);
            alert(`Cash Back global guardado en ${Wallet.formatMoney(next.globalCashbackAmount)} por cada compra pagada con cartera.`);
        } catch(error) {
            console.error('Guardar Cash Back global:', error);
            alert('No se pudo guardar la configuración de Cash Back.');
        } finally {
            setCashbackSettingsSaving(false);
        }
    };

    const persistCart = (items = []) => {
        const next = writeVisitorCart(items);
        setCartItems(next);
        return next;
    };

    const createCartItemFromProduct = (product = {}, quantity = 1) => {
        const seller = getSellerInfoForProduct(product);
        const image = getProductGallery(product)[0] || product.imageUrl || product.image || '';
        const selectedQuantity = clampProductQuantity(quantity, product);
        const unitPrice = getProductUnitPrice(product);
        const lineTotal = Number((unitPrice * selectedQuantity).toFixed(2));
        return copyProductCommerceFields({
            id: product.id || '',
            name: product.name || '',
            price: unitPrice,
            unitPrice,
            quantity: selectedQuantity,
            productQuantity: selectedQuantity,
            lineTotal,
            totalPrice: lineTotal,
            stock: getProductStock(product),
            availableStock: getProductStock(product),
            imageUrl: image,
            ownerId: seller.id || product.ownerId || '',
            ownerName: seller.name || product.ownerName || '',
            ownerEmail: seller.email || product.ownerEmail || '',
            ownerPhone: seller.phone || product.ownerPhone || '',
            sellerNotificationEmail: seller.saleNotificationEmail || product.sellerNotificationEmail || product.saleNotificationEmail || '',
            saleNotificationEmail: seller.saleNotificationEmail || product.saleNotificationEmail || product.sellerNotificationEmail || '',
            sizes: normalizeProductSizes(product.sizes || product.medidas),
            colors: normalizeProductColors(product.colors || product.colores),
            addedAt: Date.now()
        }, product);
    };

    const isProductInCart = (productId) => cartItems.some(item => String(item.id) === String(productId));

    const addProductToCart = (product, quantity = 0) => {
        if (!product?.id) return;
        const requestedQuantity = clampProductSelectionQuantity(quantity, product);
        if (requestedQuantity < 1) {
            alert('Selecciona una cantidad mayor a cero antes de agregar el producto al carrito.');
            return;
        }
        const cartItem = createCartItemFromProduct(product, requestedQuantity);
        if (!ensureCheckoutInventoryAllowed([cartItem])) return;
        if (isProductInCart(product.id)) {
            const nextItems = cartItems.map(item => String(item.id) === String(product.id) ? createCartItemFromProduct(product, requestedQuantity) : item);
            persistCart(nextItems);
            alert('Cantidad actualizada en el carrito.');
            setIsCartOpen(true);
            return;
        }
        if (!isSupermarketPurchaseProduct(cartItem) && getDriveMxPurchaseProductCount(cartItems) >= CART_MAX_ITEMS) {
            alert(`Productos Drive MX permiten máximo ${CART_MAX_ITEMS} productos distintos por compra. Los productos de Supermercado no usan este límite y requieren mínimo ${SUPERMARKET_MINIMUM_PRODUCTS} productos seleccionados en el carrito.`);
            setIsCartOpen(true);
            return;
        }
        persistCart([...cartItems, cartItem]);
        setIsCartOpen(true);
    };

    const updateCartProductQuantity = (productId, quantity) => {
        const storedItem = cartItems.find(item => String(item.id) === String(productId));
        const sourceProduct = findProductById(productId) || storedItem;
        if (!sourceProduct) return;
        const selectedQuantity = clampProductQuantity(quantity, sourceProduct);
        if (selectedQuantity < 1) return;
        const nextItems = cartItems.map(item => String(item.id) === String(productId)
            ? createCartItemFromProduct(sourceProduct, selectedQuantity)
            : item);
        persistCart(nextItems);
    };

    const removeProductFromCart = (productId) => {
        const next = persistCart(cartItems.filter(item => String(item.id) !== String(productId)));
        setCheckoutProductIds(prev => prev.filter(id => String(id) !== String(productId)));
        if (next.length === 0) setCheckoutProductIds([]);
    };

    const clearCartState = () => {
        clearVisitorCart();
        setCartItems([]);
        setCheckoutProductIds([]);
        setIsCartOpen(false);
    };

    const clearCompletedCartIfNeeded = () => {
        if (checkoutProductIds.length > 0) clearCartState();
    };

    const startSingleProductCheckout = (product, quantity = selectedPurchaseQuantity) => {
        if (!product?.id) {
            alert('No se encontró el producto seleccionado.');
            return;
        }
        const requestedQuantity = clampProductSelectionQuantity(quantity, product);
        if (requestedQuantity < 1) {
            alert('Selecciona una cantidad mayor a cero antes de comprar.');
            return;
        }
        const checkoutItem = createPurchasableProduct(product, requestedQuantity);
        if (!ensureSupermarketMinimumAllowed([checkoutItem])) return;
        if (!ensureCheckoutInventoryAllowed([checkoutItem])) return;
        setCheckoutProductIds([]);
        setSelectedProductId(product.id);
        setSelectedProductQuantity(checkoutItem.quantity || 1);
        setIsCartOpen(false);
        setView('delivery-data');
    };

    const startCartCheckout = () => {
        const validCartProducts = cartProducts.filter(product => product?.id);
        if (validCartProducts.length === 0) {
            alert('El carrito está vacío.');
            return;
        }
        if (!ensureSupermarketMinimumAllowed(validCartProducts)) return;
        if (!ensureCheckoutInventoryAllowed(validCartProducts)) return;
        const nextCart = validCartProducts.map(product => createCartItemFromProduct(product, product.quantity || 1));
        persistCart(nextCart);
        setCheckoutProductIds(nextCart.map(product => product.id));
        setSelectedProductId(nextCart[0].id);
        setSelectedProductQuantity(nextCart[0].quantity || 1);
        setCurrentImageIndex(0);
        setIsCartOpen(false);
        setView('delivery-data');
    };

    const resetPublicFlow = () => {
        walletCheckoutLoginReturnRef.current = null;
        setView('home');
        setSearchQuery('');
        packagesManager.resetTracking();
        setSelectedProductId(null);
        setCheckoutProductIds([]);
        setSelectedProductQuantity(0);
        setCurrentImageIndex(0);
        setSelectedPaymentMethod('transfer');
        walletPaymentManager.reset();
        setIsCartOpen(false);
        resetDeliveryForm();
        setOrderSending(false);
    };

    const resetAfterIncompletePayment = () => {
        resetPublicFlow();
    };

    const selectPaymentMethod = (method) => {
        setSelectedPaymentMethod(method);
        if (method === 'wallet') {
            if (!walletPaymentManager.authenticated) featureManagersRef.current.requestWalletLogin?.();
            return;
        }
        walletPaymentManager.reset();
    };

    const getPrimaryAuth = () => EmailPasswordAuthUI.services.getPrimaryAuth({
        fbase,
        firebaseConfig: window.firebaseConfig
    });

    const getSecondaryAuth = () => EmailPasswordAuthUI.services.getSecondaryAuth({
        fbase,
        firebaseConfig: window.firebaseConfig
    });

    const normalizeRegistrationEmail = (value = '') => String(value || '').replace(/\s+/g, '').toLowerCase();

    const findRegisteredUserByEmail = async (email = '') => {
        const normalizedEmail = normalizeRegistrationEmail(email);
        if (!normalizedEmail) return null;

        const localMatch = (Array.isArray(users) ? users : []).find((user) => normalizeRegistrationEmail(user.email) === normalizedEmail);
        if (localMatch) return localMatch;

        try {
            const db = fbase.getFirestore();
            const usersRef = fbase.collection(db, 'artifacts', appId, 'public', 'data', STAFF_USERS_COLLECTION);
            const snap = await fbase.getDocs(fbase.query(usersRef, fbase.where('emailNormalized', '==', normalizedEmail)));
            if (!snap.empty) {
                const docSnap = snap.docs[0];
                return { id: docSnap.id, ...docSnap.data() };
            }
        } catch(err) {
            console.error('Buscar usuario por correo normalizado:', err);
        }

        return null;
    };

    const createOrUpdateUserWalletProfile = async (userData, options = {}) => {
        const userId = userData?.uid || userData?.id;
        if (!userId) return { success: false, reason: 'missing-user-id' };

        const firestoreDb = options?.firestoreDb || null;
        const registrationFbase = firestoreDb ? { ...fbase, getFirestore: () => firestoreDb } : fbase;

        try {
            await Wallet.ensureWalletDocument({
                fbase: registrationFbase,
                appId,
                user: { ...userData, id: userId },
                createdBy: sessionUser?.email || ADMIN_EMAIL
            });
            return { success: true, source: 'wallet-module' };
        } catch (walletErr) {
            console.error('Crear cartera con módulo Wallet:', walletErr);
        }

        try {
            const db = firestoreDb || fbase.getFirestore();
            const walletId = Wallet.getUserWalletId({ ...userData, id: userId }) || userId;
            const walletRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'wallets', walletId);
            const now = Date.now();
            const fallbackWallet = {
                id: walletId,
                uid: walletId,
                userId: walletId,
                userName: userData.name || userData.email || 'Usuario',
                userEmail: String(userData.email || '').trim().toLowerCase(),
                userPhone: userData.phone || '',
                currency: 'MXN',
                balance: 0,
                activated: false,
                firstRechargeCompleted: false,
                firstRechargeAt: null,
                rechargeCount: 0,
                totalRecharged: 0,
                totalCommissions: 0,
                lastRechargeAt: null,
                lastCommissionAt: null,
                createdAt: now,
                updatedAt: now,
                createdBy: sessionUser?.email || ADMIN_EMAIL,
                status: 'Pendiente de activación'
            };
            await fbase.setDoc(walletRef, fallbackWallet, { merge: true });
            return { success: true, source: 'fallback-direct' };
        } catch (fallbackErr) {
            console.error('Crear cartera fallback:', fallbackErr);
            return { success: false, error: fallbackErr };
        }
    };

    const resetRegisteredUserForm = () => {
        setUserForm({ email: '', p: '', n: '', phone: '' });
        setEditingRegisteredUserId(null);
        setUserRegistrationSaving(false);
    };

    const closeRegisteredUserModal = () => {
        resetRegisteredUserForm();
        setShowUserModal(false);
    };

    const openRegisterUserModal = () => {
        resetRegisteredUserForm();
        setShowUserModal(true);
    };

    const editRegisteredUser = (user) => {
        const userId = getUserProfileId(user || {});
        if (!userId) return;
        setEditingRegisteredUserId(userId);
        setUserForm({
            email: user.email || '',
            p: '',
            n: user.name || '',
            phone: user.phone || ''
        });
        setShowUserModal(true);
    };

    const registerUser = async (event) => {
        event?.preventDefault?.();
        if (userRegistrationSaving) return;

        const trimmedName = String(userForm?.n || '').trim();
        const normalizedEmail = normalizeRegistrationEmail(userForm?.email);
        const trimmedPhone = String(userForm?.phone || '').trim();
        const password = String(userForm?.p || '');

        if (editingRegisteredUserId) {
            if (!trimmedName || !normalizedEmail || !trimmedPhone) {
                alert('Completa el nombre, correo electrónico y número de teléfono.');
                return;
            }

            setUserRegistrationSaving(true);
            try {
                const currentUser = users.find(user => getUserProfileId(user) === editingRegisteredUserId || user.id === editingRegisteredUserId);
                if (!currentUser) {
                    alert('No se encontró el usuario que deseas editar.');
                    return;
                }
                if (currentUser.role === 'admin') {
                    alert('No se puede editar al administrador central desde este módulo.');
                    return;
                }
                const now = Date.now();
                const nextUser = {
                    ...currentUser,
                    uid: currentUser.uid || currentUser.id || editingRegisteredUserId,
                    email: currentUser.email || normalizedEmail,
                    emailNormalized: normalizeRegistrationEmail(currentUser.email || normalizedEmail),
                    name: trimmedName,
                    phone: trimmedPhone,
                    updatedAt: now,
                    updatedBy: sessionUser?.email || ADMIN_EMAIL
                };
                await saveDoc(STAFF_USERS_COLLECTION, currentUser.id || editingRegisteredUserId, nextUser, { throwOnError: true });
                await Wallet.ensureWalletDocument({
                    fbase,
                    appId,
                    user: { ...nextUser, id: currentUser.id || editingRegisteredUserId },
                    createdBy: sessionUser?.email || ADMIN_EMAIL
                }).catch((err) => console.error('Actualizar cartera de usuario:', err));
                closeRegisteredUserModal();
                alert('Usuario actualizado correctamente.');
            } catch(err) {
                console.error('Actualizar usuario registrado:', err);
                alert('No se pudo actualizar el usuario. Revisa tu conexión e intenta de nuevo.');
            } finally {
                setUserRegistrationSaving(false);
            }
            return;
        }

        if (!trimmedName || !normalizedEmail || !trimmedPhone || !password) {
            alert('Completa nombre, correo electrónico, teléfono y contraseña.');
            return;
        }
        if (password.length < 6) {
            alert('La contraseña debe tener mínimo 6 caracteres.');
            return;
        }

        setUserRegistrationSaving(true);

        let primaryAuth = null;
        let secondaryAuth = null;
        let credential = null;
        let profileSaved = false;
        let primaryUserUidBefore = '';
        let serverProvisionError = null;

        const applyProfileLocally = (profile = {}) => {
            const userId = String(profile.uid || profile.id || '').trim();
            if (!userId) return;
            const normalizedProfile = { ...profile, id: userId, uid: userId };
            setUsers((previous) => {
                const next = [
                    ...previous.filter((item) => {
                        const itemId = String(item?.uid || item?.id || '').trim();
                        const itemEmail = normalizeRegistrationEmail(item?.email);
                        return itemId !== userId && itemEmail !== normalizedEmail;
                    }),
                    normalizedProfile
                ];
                writeLocal(STAFF_USERS_LOCAL_KEY, next);
                return next;
            });
        };

        try {
            primaryAuth = getPrimaryAuth();
            primaryUserUidBefore = String(primaryAuth?.currentUser?.uid || '');
            const primaryEmail = normalizeRegistrationEmail(primaryAuth?.currentUser?.email);
            const primaryAdminAuthenticated = primaryEmail === normalizeRegistrationEmail(ADMIN_EMAIL);

            // Cuando el administrador está autenticado, el servidor crea o repara
            // Authentication, el perfil y la cartera sin cerrar su sesión principal.
            // Se ejecuta antes de revisar la lista local porque una corrección anterior
            // pudo dejar un perfil incompleto o con un ID distinto al UID de Authentication.
            if (primaryAdminAuthenticated && primaryAuth.currentUser) {
                try {
                    const serverResult = await EmailPasswordAuthUI.services.provisionUserAccountProfile({
                        firebaseUser: primaryAuth.currentUser,
                        email: normalizedEmail,
                        password,
                        name: trimmedName,
                        phone: trimmedPhone
                    });
                    const profile = serverResult.profile || {};
                    profileSaved = true;
                    applyProfileLocally(profile);
                    closeRegisteredUserModal();
                    alert('Usuario creado y perfil habilitado correctamente.');
                    return;
                } catch (error) {
                    serverProvisionError = error;
                    console.error('Crear usuario mediante Firebase Admin:', error);
                }
            }

            const existingUser = await findRegisteredUserByEmail(normalizedEmail);
            if (existingUser) {
                alert('El correo ya está registrado. Inicia sesión o usa otro correo.');
                return;
            }

            // Registro público o respaldo: usa una instancia secundaria para no
            // sustituir la sesión principal del administrador o del visitante.
            secondaryAuth = getSecondaryAuth();
            if (!secondaryAuth?.app || secondaryAuth === primaryAuth || secondaryAuth.app?.name === primaryAuth?.app?.name) {
                const isolationError = new Error('La sesión secundaria de Firebase no está aislada.');
                isolationError.code = 'auth/secondary-session-not-isolated';
                throw isolationError;
            }
            await fbase.signOut(secondaryAuth).catch(() => {});

            try {
                credential = await fbase.createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, password);
            } catch(authCreateError) {
                if (authCreateError?.code !== 'auth/email-already-in-use') throw authCreateError;
                try {
                    credential = await fbase.signInWithEmailAndPassword(secondaryAuth, normalizedEmail, password);
                } catch(signInError) {
                    console.error('Validar cuenta existente para reparar perfil:', signInError);
                    const mismatchError = new Error('El correo ya existe y la contraseña no coincide.');
                    mismatchError.code = 'auth/existing-account-password-mismatch';
                    mismatchError.cause = signInError;
                    throw mismatchError;
                }
            }

            const userId = String(credential?.user?.uid || '').trim();
            if (!userId) {
                const credentialError = new Error('Firebase no devolvió el UID de la cuenta nueva.');
                credentialError.code = 'auth/missing-user-id';
                throw credentialError;
            }

            const userEmail = normalizeRegistrationEmail(credential.user.email || normalizedEmail);
            const now = Date.now();
            const newUser = {
                uid: userId,
                email: userEmail,
                emailNormalized: userEmail,
                name: trimmedName,
                phone: trimmedPhone,
                saleNotificationEmail: userEmail,
                role: 'usuario',
                active: true,
                blocked: false,
                accountStatus: 'Activo',
                assignmentsAuthorized: false,
                createdAt: now,
                updatedAt: now
            };

            try {
                const serverResult = await EmailPasswordAuthUI.services.provisionUserAccountProfile({
                    firebaseUser: credential.user,
                    email: userEmail,
                    name: trimmedName,
                    phone: trimmedPhone
                });
                const profile = serverResult.profile || newUser;
                profileSaved = true;
                applyProfileLocally(profile);
            } catch (error) {
                serverProvisionError = error;
                console.error('Crear perfil mediante API:', error);

                // Respaldo directo con la sesión del propio usuario. Este camino
                // conserva el registro aun si la ruta de Vercel falla temporalmente.
                const secondaryDb = fbase.getFirestore(secondaryAuth.app);
                await saveDoc(STAFF_USERS_COLLECTION, userId, newUser, {
                    throwOnError: true,
                    applyLocalOnError: false,
                    firestoreDb: secondaryDb
                });
                profileSaved = true;

                const walletResult = await createOrUpdateUserWalletProfile(
                    { ...newUser, id: userId },
                    { firestoreDb: secondaryDb }
                );
                if (!walletResult.success) {
                    console.error('La cartera inicial se volverá a crear al iniciar sesión:', walletResult.error || walletResult.reason);
                }
            }

            closeRegisteredUserModal();
            alert('Usuario creado y perfil habilitado correctamente.');
        } catch(err) {
            console.error('Registrar usuario:', err);
            if (serverProvisionError) console.error('Error previo del servicio de usuarios:', serverProvisionError);
            if (err?.code === 'auth/existing-account-password-mismatch') {
                alert(getFirebaseAuthErrorMessage(err));
            } else if (credential?.user?.uid && !profileSaved) {
                alert(getFirestoreRegistrationErrorMessage(err));
            } else {
                alert(getFirebaseAuthErrorMessage(err));
            }
        } finally {
            if (secondaryAuth && secondaryAuth !== primaryAuth) {
                await fbase.signOut(secondaryAuth).catch((err) => console.error('Cerrar sesión secundaria:', err));
            }

            const primaryUserUidAfter = String(primaryAuth?.currentUser?.uid || '');
            if (primaryUserUidBefore && primaryUserUidAfter && primaryUserUidBefore !== primaryUserUidAfter) {
                console.error('La sesión principal cambió inesperadamente durante el registro.', {
                    before: primaryUserUidBefore,
                    after: primaryUserUidAfter
                });
            }
            setUserRegistrationSaving(false);
        }
    };

    const toggleUserBlocked = async (user) => {
        if (!user?.id) return;
        if (user.role === 'admin') {
            alert('No se puede bloquear al administrador central.');
            return;
        }
        const currentlyBlocked = isUserBlocked(user);
        const nextBlocked = !currentlyBlocked;
        const actionLabel = nextBlocked ? 'bloquear' : 'desbloquear';
        if (!confirm(`¿Deseas ${actionLabel} a ${user.name || user.email || 'este usuario'}?`)) return;
        const now = Date.now();
        const next = {
            ...user,
            uid: user.uid || user.id,
            active: !nextBlocked,
            blocked: nextBlocked,
            accountStatus: nextBlocked ? 'Bloqueado' : 'Activo',
            blockedAt: nextBlocked ? now : null,
            blockedBy: nextBlocked ? (sessionUser?.email || ADMIN_EMAIL) : '',
            unblockedAt: nextBlocked ? null : now,
            unblockedBy: nextBlocked ? '' : (sessionUser?.email || ADMIN_EMAIL),
            updatedAt: now,
            updatedBy: sessionUser?.email || ADMIN_EMAIL
        };
        await saveDoc(STAFF_USERS_COLLECTION, user.id, next);
        alert(nextBlocked ? 'Usuario bloqueado correctamente.' : 'Usuario desbloqueado correctamente.');
    };

    const saveEmailSettings = async (e) => {
        e.preventDefault();
        const next = {
            senderEmail: emailSettings.senderEmail.trim(),
            appPassword: emailSettings.appPassword.trim(),
            receiverEmail: emailSettings.receiverEmail.trim(),
            updatedAt: Date.now(),
            updatedBy: sessionUser?.email || ''
        };
        if (!next.senderEmail || !next.appPassword || !next.receiverEmail) {
            alert('Completa correo remitente, contraseña de aplicación y correo base receptor.');
            return;
        }
        setEmailSaving(true);
        try {
            await saveDoc('mail_settings', 'config', next);
            try { localStorage.setItem('driveMxEmailSettings', JSON.stringify(next)); } catch(err) {}
            alert('Configuración de correo guardada correctamente.');
        } catch(err) {
            console.error('Guardar configuración de correo:', err);
            alert('No se pudo guardar la configuración de correo.');
        } finally {
            setEmailSaving(false);
        }
    };

    const savePaymentSettings = async (e) => {
        e.preventDefault();
        const normalizedSettings = normalizePaymentSettings(paymentSettings);
        const next = {
            bankAccount: cleanFirestoreText(normalizedSettings.bankAccount, 160),
            updatedAt: Date.now(),
            updatedBy: cleanFirestoreText(sessionUser?.email, 254)
        };
        if (!next.bankAccount) {
            alert('Configura el número de cuenta bancaria.');
            return;
        }
        setPaymentSaving(true);
        try {
            await saveDoc('payment_settings', 'config', next, { throwOnError: true, applyLocalOnError: false });
            setPaymentSettings(next);
            try { localStorage.setItem('driveMxPaymentSettings', JSON.stringify(next)); } catch(err) {}
            alert('Configuración de pagos guardada correctamente.');
        } catch(err) {
            console.error('Guardar configuración de pagos:', err);
            alert('No se pudo guardar la configuración de pagos.');
        } finally {
            setPaymentSaving(false);
        }
    };

    const buildOrderPayload = () => {
        const normalizedMailSettings = normalizeEmailSettings(emailSettings);
        const orderProducts = checkoutProducts.map(product => {
            const seller = getSellerInfoForProduct(product || {});
            const requestedQuantity = Math.floor(finiteFirestoreNumber(product?.quantity ?? product?.productQuantity, 1));
            const quantity = Math.max(1, requestedQuantity || 1);
            const unitPrice = Math.max(0, finiteFirestoreNumber(getProductUnitPrice(product || {}), 0));
            const lineTotal = Number((unitPrice * quantity).toFixed(2));
            return copyProductCommerceFields({
                id: cleanFirestoreText(product?.id, 180),
                name: cleanFirestoreText(product?.name, 180),
                price: unitPrice,
                unitPrice,
                productUnitPrice: unitPrice,
                quantity,
                productQuantity: quantity,
                lineTotal,
                totalPrice: lineTotal,
                productTotal: lineTotal,
                stockAtPurchase: Math.max(0, Math.floor(finiteFirestoreNumber(getProductStock(product || {}), 0))),
                sizes: normalizeProductSizes(product?.sizes || product?.medidas).slice(0, 500),
                colors: normalizeProductColors(product?.colors || product?.colores).slice(0, 500),
                ownerId: cleanFirestoreText(seller.id, 180),
                ownerName: cleanFirestoreText(seller.name, 180),
                ownerEmail: cleanFirestoreText(seller.email, 254),
                ownerPhone: cleanFirestoreText(seller.phone, 60),
                saleNotificationEmail: cleanFirestoreText(seller.saleNotificationEmail, 254),
                sellerNotificationEmail: cleanFirestoreText(seller.saleNotificationEmail, 254)
            }, product);
        }).filter(product => product.id && product.name && Number.isFinite(product.price) && Number(product.quantity || 0) > 0);
        const primaryProduct = orderProducts[0] || {};
        const orderSubtotal = Number(orderProducts.reduce((total, product) => total + finiteFirestoreNumber(product.lineTotal ?? product.totalPrice, 0), 0).toFixed(2));
        const orderShippingFee = calculateShippingFee(orderProducts);
        const orderTotal = Number((orderSubtotal + orderShippingFee).toFixed(2));
        const orderTotalQuantity = orderProducts.reduce((total, product) => total + Math.max(1, Math.floor(finiteFirestoreNumber(product.quantity, 1))), 0);
        return sanitizeFirestoreData({
            mailSettings: {
                senderEmail: cleanFirestoreText(normalizedMailSettings.senderEmail, 254),
                appPassword: cleanFirestoreText(normalizedMailSettings.appPassword, 500),
                receiverEmail: cleanFirestoreText(normalizedMailSettings.receiverEmail, 254)
            },
            product: primaryProduct,
            products: orderProducts,
            cart: {
                itemCount: orderProducts.length,
                totalQuantity: orderTotalQuantity,
                quantityTotal: orderTotalQuantity,
                maxItems: null,
                driveMxMaxItems: CART_MAX_ITEMS,
                supermarketMinimumProducts: SUPERMARKET_MINIMUM_PRODUCTS,
                subtotal: orderSubtotal,
                shippingFee: orderShippingFee,
                total: orderTotal,
                expiresInMinutes: Math.round(CART_TTL_MS / 60000)
            },
            delivery: {
                street: cleanFirestoreText(deliveryForm.street, 240),
                state: cleanFirestoreText(deliveryForm.state, 120),
                municipality: cleanFirestoreText(deliveryForm.municipality, 140),
                neighborhood: cleanFirestoreText(deliveryForm.neighborhood, 180),
                zip: cleanFirestoreText(deliveryForm.zip, 25),
                fullName: cleanFirestoreText(deliveryForm.fullName, 180),
                phone: cleanFirestoreText(deliveryForm.phone, 60),
                email: cleanFirestoreText(deliveryForm.email, 254),
                references: cleanFirestoreText(deliveryForm.references, 1200)
            }
        });
    };

    const validatePendingTransferPayload = (payload = {}) => {
        const orderProducts = Array.isArray(payload.products) ? payload.products : [];
        if (orderProducts.length < 1) {
            return 'No se encontraron productos válidos para registrar la compra.';
        }
        const driveMxMaximumError = getDriveMxMaximumPurchaseError(orderProducts);
        if (driveMxMaximumError) return driveMxMaximumError;
        for (const product of orderProducts) {
            if (!String(product?.id || '').trim() || !String(product?.name || '').trim()) {
                return 'Uno de los productos no contiene ID o nombre válido.';
            }
            if (!Number.isFinite(Number(product?.price)) || Number(product.price) < 0) {
                return `El precio de ${product?.name || 'uno de los productos'} no es válido.`;
            }
            if (!Number.isFinite(Number(product?.quantity)) || Number(product.quantity) < 1) {
                return `La cantidad de ${product?.name || 'uno de los productos'} no es válida.`;
            }
        }
        const supermarketMinimumError = getSupermarketMinimumPurchaseError(orderProducts);
        if (supermarketMinimumError) return supermarketMinimumError;
        const delivery = payload.delivery || {};
        const requiredFields = [
            ['street', 'La calle es obligatoria.'],
            ['state', 'El estado es obligatorio.'],
            ['municipality', 'El municipio es obligatorio.'],
            ['neighborhood', 'La colonia es obligatoria.'],
            ['zip', 'El código postal es obligatorio.'],
            ['fullName', 'El nombre completo es obligatorio.'],
            ['phone', 'El teléfono es obligatorio.'],
            ['email', 'El correo electrónico es obligatorio.'],
            ['references', 'Las referencias del domicilio son obligatorias.']
        ];
        for (const [field, message] of requiredFields) {
            if (!String(delivery[field] || '').trim()) return message;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(delivery.email || '').trim())) {
            return 'Ingresa un correo electrónico válido.';
        }
        if (!payload.cart || Number(payload.cart.itemCount) !== orderProducts.length || !Number.isFinite(Number(payload.cart.total))) {
            return 'No se pudo calcular correctamente el total de la compra.';
        }
        return '';
    };

    const appendSaleNotificationToPayload = (payload = {}) => {
        const payloadProducts = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : (payload.product ? [payload.product] : []);
        const enrichedProducts = payloadProducts.map(payloadProduct => {
            const sourceProduct = products.find(product => String(product.id) === String(payloadProduct.id)) || payloadProduct;
            const seller = getSellerInfoForProduct(sourceProduct);
            const notificationEmail = String(
                seller.saleNotificationEmail ||
                payloadProduct.sellerNotificationEmail ||
                payloadProduct.saleNotificationEmail ||
                payloadProduct.notificationEmail ||
                ''
            ).trim();
            const unitPrice = Number(payloadProduct.unitPrice ?? payloadProduct.productUnitPrice ?? payloadProduct.price ?? sourceProduct.price ?? 0);
            const requestedQuantity = Number(payloadProduct.quantity || payloadProduct.productQuantity || 1);
            const quantity = Math.max(1, Math.floor(requestedQuantity) || 1);
            const lineTotal = Number((unitPrice * quantity).toFixed(2));
            return copyProductCommerceFields({
                ...payloadProduct,
                id: payloadProduct.id || sourceProduct.id || '',
                name: payloadProduct.name || sourceProduct.name || '',
                price: unitPrice,
                unitPrice,
                productUnitPrice: unitPrice,
                quantity,
                productQuantity: quantity,
                lineTotal,
                totalPrice: lineTotal,
                productTotal: lineTotal,
                stockAtPurchase: Number(payloadProduct.stockAtPurchase ?? sourceProduct.stock ?? 0),
                sizes: normalizeProductSizes(payloadProduct.sizes || sourceProduct.sizes || sourceProduct.medidas),
                colors: normalizeProductColors(payloadProduct.colors || sourceProduct.colors || sourceProduct.colores),
                ownerId: seller.id || payloadProduct.ownerId || '',
                ownerName: seller.name || payloadProduct.ownerName || '',
                ownerEmail: seller.email || payloadProduct.ownerEmail || '',
                ownerPhone: seller.phone || payloadProduct.ownerPhone || '',
                saleNotificationEmail: notificationEmail || payloadProduct.saleNotificationEmail || '',
                sellerNotificationEmail: notificationEmail || payloadProduct.sellerNotificationEmail || ''
            }, sourceProduct);
        }).filter(product => product.id && product.name && Number(product.quantity || 0) > 0);
        const saleNotifications = enrichedProducts
            .filter(product => String(product.sellerNotificationEmail || product.saleNotificationEmail || '').trim())
            .map(product => ({
                to: String(product.sellerNotificationEmail || product.saleNotificationEmail || '').trim(),
                message: `Tu producto ha sido vendido.

Producto: ${product.name || ''}
Cantidad: ${Number(product.quantity || 1)}
Precio unitario: $${Number(product.unitPrice || product.price || 0).toFixed(2)}
Total producto: $${Number(product.lineTotal || product.totalPrice || 0).toFixed(2)}
${productOptionsLines(product).join('\n')}

Comunícate al 5633535701 o 5617549756 para la recolección de tu paquete.`,
                sellerName: product.ownerName || '',
                productName: product.name || '',
                productId: product.id || '',
                productQuantity: Number(product.quantity || 1),
                productUnitPrice: Number(product.unitPrice || product.price || 0),
                productTotal: Number(product.lineTotal || product.totalPrice || 0),
                productPrice: Number(product.lineTotal || product.totalPrice || 0)
            }));
        const enrichedSubtotal = enrichedProducts.reduce((total, product) => total + Number(product.lineTotal || product.totalPrice || 0), 0);
        const enrichedShippingFee = calculateShippingFee(enrichedProducts);
        const enrichedTotal = enrichedSubtotal + enrichedShippingFee;
        const enrichedQuantityTotal = enrichedProducts.reduce((total, product) => total + Number(product.quantity || 0), 0);
        return {
            ...payload,
            product: enrichedProducts[0] || payload.product || {},
            products: enrichedProducts,
            cart: { ...(payload.cart || {}), itemCount: enrichedProducts.length, totalQuantity: enrichedQuantityTotal, quantityTotal: enrichedQuantityTotal, subtotal: enrichedSubtotal, shippingFee: enrichedShippingFee, total: enrichedTotal, maxItems: null, driveMxMaxItems: CART_MAX_ITEMS, supermarketMinimumProducts: SUPERMARKET_MINIMUM_PRODUCTS },
            saleNotification: saleNotifications[0] || undefined,
            saleNotifications
        };
    };

    const findExistingSaleCommission = async (saleId, sellerId = '') => {
        const safeSaleId = String(saleId || '').trim();
        const safeSellerId = Wallet.getUserWalletId(sellerId || '');
        if (!safeSaleId || !safeSellerId) return null;
        try {
            const db = fbase.getFirestore();
            const commissionsRef = fbase.collection(db, 'artifacts', appId, 'public', 'data', 'wallet_commissions');
            const commissionsQuery = fbase.query(commissionsRef, fbase.where('saleId', '==', safeSaleId));
            const snapshot = await fbase.getDocs(commissionsQuery);
            let existingCommission = null;
            snapshot.forEach(docSnapshot => {
                if (existingCommission) return;
                const data = docSnapshot.data() || {};
                if (Wallet.getUserWalletId(data.walletId || data.userId || '') !== safeSellerId) return;
                existingCommission = { id: docSnapshot.id, ...data };
            });
            return existingCommission;
        } catch(err) {
            console.error('[Ventas][Comisión] No se pudo verificar si la comisión ya estaba descontada.', {
                saleId: safeSaleId,
                sellerId: safeSellerId,
                ...getOperationErrorDetails(err)
            }, err);
            throw err;
        }
    };

    const applyCompletedSaleLocal = (saleId, saleData = {}) => {
        setCompletedSales(prev => {
            const next = [{ id: saleId, ...saleData }, ...prev.filter(x => String(x.id || x.saleId) !== String(saleId))]
                .sort((a, b) => Number(b.soldAt || b.createdAt || 0) - Number(a.soldAt || a.createdAt || 0));
            writeLocal('driveMxCompletedSales', next);
            return next;
        });
    };

    const applyProductInventoryLocal = (productId, patch = {}, ownerId = '') => {
        if (!productId) return;
        publicProductsManager.patchLocal(productId, patch);
        adminProductsManager.patchInventoryLocal(productId, patch);
        userProductsManager.patchInventoryLocal(productId, patch, ownerId);
    };

    const processCompletedSaleTransaction = async ({ id, sale, sourceProduct = {}, seller = {}, saleSellerId = '' }) => {
        if (!fbase || typeof fbase.runTransaction !== 'function') {
            const error = new Error('Firebase runTransaction no está disponible para descontar inventario de forma segura.');
            error.code = 'FIRESTORE_TRANSACTION_UNAVAILABLE';
            throw error;
        }
        const db = fbase.getFirestore();
        const productId = String(sale.productId || sourceProduct.id || '').trim();
        const quantity = Math.max(1, Math.floor(Number(sale.productQuantity || sale.quantity || 1)) || 1);
        if (!productId) {
            const error = new Error('La venta no contiene un producto válido para descontar inventario.');
            error.code = 'SALE_PRODUCT_ID_MISSING';
            throw error;
        }

        const isWalletPayment = String(sale.paymentMethod || '').trim() === 'Cartera' && Boolean(sale.walletPaymentId);
        const walletPaymentId = String(sale.walletPaymentId || '').trim();
        const walletBuyerId = Wallet.getUserWalletId(sale.walletBuyerId || '');
        const rawWalletPaymentItemIndex = Number(sale.walletPaymentItemIndex);
        const walletPaymentItemIndex = Number.isInteger(rawWalletPaymentItemIndex) && rawWalletPaymentItemIndex >= 0
            ? rawWalletPaymentItemIndex
            : -1;
        const publicProductRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', PUBLIC_PRODUCTS_COLLECTION, productId);
        const adminProductRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', ADMIN_PRODUCTS_COLLECTION, productId);
        const ownerDocId = getSafeFirestoreDocId(saleSellerId || sourceProduct.ownerId || sourceProduct.sellerId || '');
        const userProductRef = ownerDocId ? fbase.doc(db, 'artifacts', appId, 'public', 'data', USER_PRODUCTS_COLLECTION, ownerDocId, 'items', productId) : null;
        const saleRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'completed_sales', id);
        const userSaleRef = isWalletPayment && ownerDocId
            ? fbase.doc(db, 'artifacts', appId, 'public', 'data', USER_SALES_COLLECTION, ownerDocId, 'items', id)
            : null;
        const shouldDebitCommission = Boolean(saleSellerId)
            && isUserPanelPublication(sourceProduct)
            && !isWalletPayment;
        let walletId = '';
        let walletRef = null;
        let movementRef = null;
        let commissionRef = null;
        let movementId = '';
        let commissionId = '';
        let commissionAmount = 0;

        if (isWalletPayment && (!walletBuyerId || walletPaymentItemIndex < 0)) {
            const error = new Error('No se pudo relacionar la venta con el pago de cartera.');
            error.code = 'WALLET_PAYMENT_REFERENCE_INVALID';
            throw error;
        }

        if (shouldDebitCommission) {
            walletId = Wallet.getUserWalletId(saleSellerId);
            // En una compra con cartera no se crea ni se repara ninguna cartera.
            // Se utiliza exclusivamente la cartera del vendedor que ya existe.
            if (!isWalletPayment) {
                await Wallet.ensureWalletDocument({
                    fbase,
                    appId,
                    user: { ...seller, id: walletId, uid: walletId },
                    createdBy: sessionUser?.email || ADMIN_EMAIL
                });
            }
            movementId = Wallet.safeDocId(`mov_commission_${walletId}_${id}`);
            commissionId = Wallet.safeDocId(`commission_${walletId}_${id}`);
            walletRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'wallets', walletId);
            movementRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'wallets', walletId, 'movements', movementId);
            commissionRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'wallet_commissions', commissionId);
            commissionAmount = Wallet.calculateCommission(Number(sale.productCost || sale.productTotal || 0), walletCommissionPercent);
        }

        try {
            return await fbase.runTransaction(db, async (transaction) => {
                if (!isWalletPayment) {
                    const saleSnapshot = await transaction.get(saleRef);
                    if (saleSnapshot.exists()) {
                        return { alreadyRegistered: true, sale: { id: saleSnapshot.id, ...saleSnapshot.data() } };
                    }
                }

                const publicProductSnapshot = await transaction.get(publicProductRef);
                const adminProductSnapshot = await transaction.get(adminProductRef);
                const userProductSnapshot = userProductRef ? await transaction.get(userProductRef) : null;
                const walletSnapshot = walletRef ? await transaction.get(walletRef) : null;
                const commissionSnapshot = commissionRef && !isWalletPayment ? await transaction.get(commissionRef) : null;

                if (!publicProductSnapshot.exists()) {
                    const error = new Error('No se encontró el producto en inventario para completar la venta.');
                    error.code = 'PRODUCT_NOT_FOUND_FOR_INVENTORY';
                    error.productId = productId;
                    throw error;
                }

                const currentProduct = { id: publicProductSnapshot.id, ...publicProductSnapshot.data() };
                const currentStock = getProductStock(currentProduct);
                if (currentStock <= 0) {
                    const error = new Error(`El producto ${currentProduct.name || productId} está agotado.`);
                    error.code = 'PRODUCT_OUT_OF_STOCK';
                    error.productId = productId;
                    throw error;
                }
                if (quantity > currentStock) {
                    const error = new Error(`Inventario insuficiente para ${currentProduct.name || productId}. Disponibles: ${currentStock}. Solicitadas: ${quantity}.`);
                    error.code = 'PRODUCT_STOCK_INSUFFICIENT';
                    error.productId = productId;
                    error.availableStock = currentStock;
                    error.requestedQuantity = quantity;
                    throw error;
                }

                const updatedAt = Date.now();
                const remainingStock = Math.max(0, currentStock - quantity);
                const inventoryPatch = {
                    stock: remainingStock,
                    availableStock: remainingStock,
                    updatedAt,
                    inventoryUpdatedAt: updatedAt,
                    lastSaleId: id,
                    lastSoldQuantity: quantity,
                    ...(isWalletPayment ? {
                        lastWalletPaymentId: walletPaymentId,
                        lastWalletPaymentBuyerId: walletBuyerId,
                        lastWalletPaymentItemIndex: walletPaymentItemIndex,
                        lastWalletPaymentUnitPrice: Number(sale.productUnitPrice || sale.unitPrice || 0),
                        lastWalletPaymentLineTotal: Number(sale.productCost || sale.productTotal || 0),
                        lastWalletPaymentOrderTotal: Number(sale.orderTotal || 0),
                        lastWalletPaymentOrderSignature: String(sale.walletOrderSignature || '')
                    } : {})
                };

                let commissionResult = {
                    applies: false,
                    commissionAmount: 0,
                    balanceBefore: null,
                    balanceAfter: null,
                    percent: walletCommissionPercent,
                    idempotent: false
                };

                if (shouldDebitCommission) {
                    if (!walletSnapshot || !walletSnapshot.exists()) {
                        const error = new Error('No se encontró la cartera del vendedor en Firestore.');
                        error.code = 'WALLET_NOT_FOUND';
                        throw error;
                    }
                    const currentWallet = Wallet.normalizeWallet({ id: walletSnapshot.id, ...walletSnapshot.data() }, seller);
                    if (commissionSnapshot && commissionSnapshot.exists()) {
                        const existingCommission = { id: commissionSnapshot.id, ...commissionSnapshot.data() };
                        commissionResult = {
                            applies: true,
                            commissionAmount: Number(existingCommission.absoluteAmount || Math.abs(Number(existingCommission.amount || 0)) || 0),
                            balanceBefore: existingCommission.balanceBefore ?? null,
                            balanceAfter: existingCommission.balanceAfter ?? null,
                            percent: existingCommission.commissionPercent ?? walletCommissionPercent,
                            idempotent: true
                        };
                    } else {
                        if (!Wallet.isWalletActivated(currentWallet)) {
                            const error = new Error(Wallet.INSUFFICIENT_MESSAGE);
                            error.code = 'WALLET_NOT_ACTIVE';
                            throw error;
                        }
                        const balanceBefore = Wallet.roundMoney(currentWallet.balance || 0);
                        if (commissionAmount > 0 && balanceBefore < commissionAmount) {
                            const error = new Error(Wallet.INSUFFICIENT_MESSAGE);
                            error.code = 'WALLET_INSUFFICIENT_FUNDS';
                            throw error;
                        }
                        const balanceAfter = Wallet.roundMoney(balanceBefore - commissionAmount);
                        commissionResult = {
                            applies: true,
                            commissionAmount,
                            balanceBefore,
                            balanceAfter,
                            percent: walletCommissionPercent,
                            idempotent: false
                        };

                        if (commissionAmount > 0) {
                            const nextWallet = {
                                ...currentWallet,
                                balance: balanceAfter,
                                totalCommissions: Wallet.roundMoney(Number(currentWallet.totalCommissions || 0) + commissionAmount),
                                lastCommissionAt: updatedAt,
                                updatedAt,
                                updatedBy: sessionUser?.email || ADMIN_EMAIL,
                                status: balanceAfter > 0 ? 'Activa' : 'Sin saldo'
                            };
                            const productName = String(sale.productName || currentProduct.name || 'producto vendido').slice(0, 180);
                            const movement = {
                                id: movementId,
                                movementId,
                                walletId,
                                userId: walletId,
                                userName: currentWallet.userName || seller.name || sale.sellerName || '',
                                userEmail: currentWallet.userEmail || seller.email || sale.sellerEmail || '',
                                type: 'commission',
                                direction: 'debit',
                                concept: `Comisión por venta: ${productName}`,
                                amount: -commissionAmount,
                                absoluteAmount: commissionAmount,
                                balanceBefore,
                                balanceAfter,
                                currency: Wallet.CURRENCY || 'MXN',
                                commissionPercent: walletCommissionPercent,
                                saleId: id,
                                productId,
                                productName,
                                createdAt: updatedAt,
                                createdBy: sessionUser?.email || ADMIN_EMAIL
                            };
                            const commission = {
                                ...movement,
                                id: commissionId,
                                commissionId,
                                status: 'Descontada'
                            };
                            transaction.set(walletRef, nextWallet, { merge: true });
                            transaction.set(movementRef, movement);
                            transaction.set(commissionRef, commission);
                        }
                    }
                }

                const saleWithWallet = {
                    ...sale,
                    productQuantity: quantity,
                    quantity,
                    productUnitPrice: Number(sale.productUnitPrice || sale.unitPrice || sale.price || 0),
                    productTotal: Number(sale.productCost || sale.productTotal || 0),
                    inventoryDeducted: true,
                    inventoryDeductedQuantity: quantity,
                    productStockBefore: currentStock,
                    productStockAfter: remainingStock,
                    inventoryUpdatedAt: updatedAt,
                    walletCommissionPercent: commissionResult.percent ?? walletCommissionPercent,
                    walletCommissionAmount: Number(commissionResult.commissionAmount || 0),
                    walletCommissionStatus: isWalletPayment && Boolean(saleSellerId) && isUserPanelPublication(sourceProduct)
                        ? 'Pendiente de procesamiento'
                        : (commissionResult.applies ? (Number(commissionResult.commissionAmount || 0) > 0 ? 'Descontada' : 'Sin comisión') : 'No aplica'),
                    walletBalanceBeforeCommission: commissionResult.balanceBefore,
                    walletBalanceAfterCommission: commissionResult.balanceAfter,
                    updatedAt
                };

                transaction.set(publicProductRef, inventoryPatch, { merge: true });
                if (adminProductSnapshot.exists()) transaction.set(adminProductRef, inventoryPatch, { merge: true });
                if (userProductRef && userProductSnapshot && userProductSnapshot.exists()) transaction.set(userProductRef, inventoryPatch, { merge: true });
                transaction.set(saleRef, saleWithWallet);
                if (userSaleRef) {
                    transaction.set(userSaleRef, {
                        id,
                        ...saleWithWallet,
                        saleId: id,
                        sellerId: saleSellerId,
                        visibleToUserId: saleSellerId,
                        updatedAt
                    });
                }

                return {
                    alreadyRegistered: false,
                    sale: { id, ...saleWithWallet },
                    inventoryPatch,
                    ownerDocId,
                    productId
                };
            });
        } catch (error) {
            if (isWalletPayment) {
                try {
                    const existingSaleSnapshot = await fbase.getDoc(saleRef);
                    if (existingSaleSnapshot.exists()) {
                        const existingSale = { id: existingSaleSnapshot.id, ...existingSaleSnapshot.data() };
                        if (existingSale.walletPaymentId === walletPaymentId && Wallet.getUserWalletId(existingSale.walletBuyerId || '') === walletBuyerId) {
                            return { alreadyRegistered: true, sale: existingSale, productId };
                        }
                    }
                } catch (existingSaleError) {
                    console.error('[Cartera][Venta] No se pudo comprobar el registro idempotente de la venta.', existingSaleError);
                }
            }
            throw error;
        }
    };

    const registerCompletedSale = async ({ payload = {}, paymentMethod = '', saleId = '', transferId = '', soldAt = Date.now(), walletPayment = null }) => {
        const payloadProducts = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : (payload.product ? [payload.product] : []);
        const orderSubtotal = payloadProducts.reduce((total, product) => total + Number(product.lineTotal || product.totalPrice || product.productTotal || (Number(product.price || product.unitPrice || 0) * Number(product.quantity || 1)) || 0), 0);
        const orderShippingFee = Number(payload.cart?.shippingFee ?? calculateShippingFee(payloadProducts));
        const orderTotal = Number(payload.cart?.total ?? (orderSubtotal + orderShippingFee));
        const orderQuantityTotal = payloadProducts.reduce((total, product) => total + Number(product.quantity || product.productQuantity || 1), 0);
        const baseId = String(saleId || `sale_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        const walletPaymentId = paymentMethod === 'Cartera' ? String(walletPayment?.paymentId || transferId || '').trim() : '';
        const walletBuyerId = walletPaymentId ? Wallet.getUserWalletId(walletPayment?.buyerId || sessionUser?.uid || sessionUser?.id || '') : '';
        const walletOrderSignature = walletPaymentId ? String(walletPayment?.orderSignature || '').trim() : '';
        const walletMovementId = walletPaymentId ? String(walletPayment?.movementId || `mov_purchase_${walletPaymentId}`).trim() : '';
        const savedSales = [];

        if (payloadProducts.length === 0) {
            const error = new Error('La transferencia no contiene productos válidos para registrar la venta.');
            error.code = 'SALE_PRODUCTS_MISSING';
            throw error;
        }
        if (walletPaymentId && (!walletBuyerId || !walletOrderSignature)) {
            const error = new Error('La referencia del pago con cartera no es válida.');
            error.code = 'WALLET_PAYMENT_REFERENCE_INVALID';
            throw error;
        }

        for (const [index, payloadProduct] of payloadProducts.entries()) {
            const sourceProduct = products.find(product => String(product.id) === String(payloadProduct.id)) || payloadProduct;
            const seller = getSellerInfoForProduct(sourceProduct);
            const id = payloadProducts.length > 1 ? `${baseId}_${index + 1}` : baseId;
            const quantity = Math.max(1, Math.floor(Number(payloadProduct.quantity || payloadProduct.productQuantity || 1)) || 1);
            const unitPrice = Number(payloadProduct.unitPrice ?? payloadProduct.productUnitPrice ?? payloadProduct.price ?? sourceProduct.price ?? 0);
            const lineTotal = Number((unitPrice * quantity).toFixed(2));
            const saleSellerId = seller.id || payloadProduct.ownerId || '';
            const sale = {
                saleId: id,
                orderSaleId: baseId,
                cartItemCount: payloadProducts.length,
                orderQuantityTotal,
                orderTotal,
                orderSubtotal,
                shippingFee: orderShippingFee,
                paymentMethod,
                transferId,
                ...(walletPaymentId ? {
                    walletPaymentId,
                    walletPaymentMovementId: walletMovementId,
                    walletPaymentItemIndex: index,
                    walletBuyerId,
                    walletOrderSignature
                } : {}),
                productId: payloadProduct.id || sourceProduct.id || '',
                productName: payloadProduct.name || sourceProduct.name || '',
                productCost: lineTotal,
                productUnitPrice: unitPrice,
                unitPrice,
                productQuantity: quantity,
                quantity,
                productTotal: lineTotal,
                productSizes: normalizeProductSizes(payloadProduct.sizes || sourceProduct.sizes || sourceProduct.medidas),
                productColors: normalizeProductColors(payloadProduct.colors || sourceProduct.colors || sourceProduct.colores),
                sellerId: saleSellerId,
                sellerName: seller.name || payloadProduct.ownerName || 'Admin Central',
                sellerEmail: seller.email || payloadProduct.ownerEmail || ADMIN_EMAIL,
                sellerPhone: seller.phone || payloadProduct.ownerPhone || '-',
                sellerNotificationEmail: seller.saleNotificationEmail || payloadProduct.sellerNotificationEmail || '',
                buyerName: payload.delivery?.fullName || '',
                buyerEmail: payload.delivery?.email || '',
                buyerPhone: payload.delivery?.phone || '',
                soldAt,
                createdAt: soldAt,
                updatedAt: Date.now()
            };

            const result = await processCompletedSaleTransaction({ id, sale, sourceProduct, seller, saleSellerId });
            const savedSale = result.sale || sale;
            if (!result.alreadyRegistered && result.inventoryPatch) {
                applyProductInventoryLocal(result.productId || sale.productId, result.inventoryPatch, saleSellerId);
                applyCompletedSaleLocal(id, savedSale);
            }
            // En cartera, el espejo de venta se guarda dentro de la misma transacción
            // existente que actualiza inventario y comisión, para conservar atomicidad.
            if (!walletPaymentId) await saveUserCompletedSaleMirror(savedSale, { throwOnError: true });
            savedSales.push(savedSale);
        }

        return savedSales.length === 1 ? savedSales[0] : savedSales;
    };

    const sendOrderEmail = async (payload = {}, options = {}) => {
        const maxAttempts = Math.max(1, Math.min(3, Number(options.maxAttempts || 2)));
        const requestId = String(payload.requestId || payload.transferId || `order_${Date.now()}`).trim();
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            try {
                console.info('[Transferencias][Correo] Solicitud al endpoint iniciada.', {
                    requestId,
                    transferId: payload.transferId || '',
                    attempt,
                    maxAttempts,
                    productCount: Array.isArray(payload.products) ? payload.products.length : (payload.product ? 1 : 0)
                });
                const response = await fetch('/api/send-order-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, requestId }),
                    signal: controller.signal
                });
                const rawResponse = await response.text();
                let data = {};
                if (rawResponse) {
                    try { data = JSON.parse(rawResponse); }
                    catch(parseError) { data = { error: rawResponse.slice(0, 500) }; }
                }
                if (!response.ok || !data.success) {
                    const error = new Error(data.error || `El endpoint de correo respondió HTTP ${response.status}.`);
                    error.code = data.code || `EMAIL_HTTP_${response.status}`;
                    error.stage = data.stage || 'send-order-email';
                    error.httpStatus = response.status;
                    error.responseData = data;
                    throw error;
                }
                if (data.saleNotificationError) console.warn('[Transferencias][Correo] Advertencia de notificación de venta:', data.saleNotificationError);
                console.info('[Transferencias][Correo] Correos enviados correctamente.', {
                    requestId,
                    baseEmailSent: data.baseEmailSent !== false,
                    saleNotificationCount: Number(data.saleNotificationCount || 0),
                    ...createBuyerMailLogFields(data),
                    ...Supermercado.createMailLogFields(data)
                });
                return data;
            } catch(err) {
                const normalizedError = err?.name === 'AbortError'
                    ? Object.assign(new Error('El envío de correo excedió el tiempo máximo de espera.'), { code: 'EMAIL_TIMEOUT', stage: 'send-order-email' })
                    : err;
                lastError = normalizedError;
                const responseData = normalizedError?.responseData || {};
                const retryable = !responseData.partialSuccess && (
                    !normalizedError?.httpStatus ||
                    normalizedError.httpStatus === 408 ||
                    normalizedError.httpStatus === 429 ||
                    normalizedError.httpStatus >= 500
                );
                console.error('[Transferencias][Correo] Falló la solicitud de correo.', {
                    requestId,
                    attempt,
                    retryable,
                    stage: normalizedError?.stage || '',
                    httpStatus: normalizedError?.httpStatus || null,
                    ...getOperationErrorDetails(normalizedError)
                }, normalizedError);
                if (attempt >= maxAttempts || !retryable) throw normalizedError;
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            } finally {
                clearTimeout(timeoutId);
            }
        }

        throw lastError || new Error('No se pudo enviar el correo.');
    };

    const createPendingWalletRechargeTransfer = async () => {
        if (!ensureAccountAllowed()) return;
        const normalizedPaymentSettings = normalizePaymentSettings(paymentSettings);
        if (!normalizedPaymentSettings.bankAccount) {
            alert('Falta configurar el número de cuenta bancaria en el Panel Admin.');
            return;
        }
        const currentWallet = Wallet.findWalletForUser(wallets, sessionUser || {});
        const activeUserProductCount = currentUserProducts.filter(product => product.active !== false).length;
        const validation = Wallet.validateRechargeAmount(currentWallet, walletRechargeAmount, walletSettings, activeUserProductCount);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }
        const userId = Wallet.getUserWalletId(sessionUser || {});
        if (!userId) {
            alert('No se pudo identificar la cartera del usuario.');
            return;
        }
        setWalletRechargeProcessing(true);
        try {
            const createdAt = Date.now();
            const id = `WR-${userId}-${createdAt}`;
            const rechargeTransferData = sanitizeFirestoreData({
                transferId: id,
                type: 'wallet_recharge',
                paymentMethod: 'Transferencia bancaria',
                bankAccount: cleanFirestoreText(normalizedPaymentSettings.bankAccount, 160),
                bankLegend: cleanFirestoreText('La recarga se abonará al saldo a favor cuando el administrador confirme la transferencia.', 500),
                holderName: cleanFirestoreText(Wallet.getUserName ? Wallet.getUserName(sessionUser || {}) : (sessionUser?.name || sessionUser?.email || 'Usuario'), 180),
                status: 'Pendiente',
                walletId: userId,
                userId,
                userName: cleanFirestoreText(sessionUser?.name || sessionUser?.email || 'Usuario', 180),
                userEmail: cleanFirestoreText(sessionUser?.email, 254),
                userPhone: cleanFirestoreText(sessionUser?.phone, 80),
                amount: finiteFirestoreNumber(validation.amount, 0),
                currency: 'MXN',
                createdAt,
                updatedAt: createdAt,
                createdBy: cleanFirestoreText(sessionUser?.email, 254)
            });
            await saveDoc('bank_transfers', id, rechargeTransferData, { throwOnError: true, applyLocalOnError: false });
            alert('Recarga registrada como Pendiente. El saldo se abonará cuando el administrador confirme la transferencia.');
            setWalletRechargeAmount('');
            setShowWalletRecharge(false);
        } catch(err) {
            console.error('Registrar recarga por transferencia:', err);
            alert('No se pudo registrar la recarga pendiente.');
        } finally {
            setWalletRechargeProcessing(false);
        }
    };

    const createStripeWalletRecharge = async () => {
        if (stripeRechargeInFlightRef.current) return;
        if (!ensureAccountAllowed()) return;
        if (!StripeWallet.available || typeof StripeWallet.openEmbeddedCheckout !== 'function') {
            alert('El pago con tarjeta Stripe no está disponible.');
            return;
        }
        if (!sessionUser || sessionUser.role === 'admin') {
            alert('Inicia sesión con el usuario propietario de la cartera.');
            return;
        }

        const currentWallet = Wallet.findWalletForUser(wallets, sessionUser || {});
        const activeUserProductCount = currentUserProducts.filter(product => product.active !== false).length;
        const validation = Wallet.validateRechargeAmount(currentWallet, walletRechargeAmount, walletSettings, activeUserProductCount);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }

        const userId = Wallet.getUserWalletId(sessionUser || {});
        if (!userId) {
            alert('No se pudo identificar la cartera del usuario.');
            return;
        }

        stripeRechargeInFlightRef.current = true;
        setStripeRechargeProcessing(true);
        try {
            const result = await StripeWallet.openEmbeddedCheckout({
                fbase,
                amount: validation.amount
            });

            if (result?.credited === true) {
                const amountText = Wallet.formatMoney(Number(result.amount || validation.amount));
                const balanceNumber = Number(result.balanceAfter);
                const balanceText = Number.isFinite(balanceNumber)
                    ? ` Saldo disponible: ${Wallet.formatMoney(balanceNumber)}.`
                    : '';
                alert(`Recarga con Stripe confirmada por ${amountText}.${balanceText}`);
                setWalletRechargeAmount('');
                setShowWalletRecharge(false);
            }
        } catch (error) {
            console.error('Recargar cartera con Stripe:', error);
            alert(error?.message || 'No se pudo completar la recarga con tarjeta Stripe.');
        } finally {
            stripeRechargeInFlightRef.current = false;
            setStripeRechargeProcessing(false);
        }
    };

    const applyPendingPurchaseTransferLocal = (id, data) => {
        setPendingTransfers(prev => {
            const current = Array.isArray(prev) ? prev : [];
            const next = [{ id, ...data }, ...current.filter(item => String(item?.id || item?.transferId || '') !== String(id))];
            writeLocal('driveMxPendingTransfers', next);
            return next;
        });
    };

    const registerPendingPurchaseTransferApi = async (id, transferData) => {
        const endpoint = '/api/register-pending-transfer';
        const maxAttempts = 2;
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transferId: id, transfer: transferData }),
                    signal: controller.signal
                });
                const responseData = await response.json().catch(() => ({}));
                if (!response.ok || responseData.success !== true) {
                    const error = new Error(responseData.error || `No se pudo registrar la transferencia en el servidor (${response.status}).`);
                    error.code = responseData.code || `HTTP_${response.status}`;
                    error.httpStatus = response.status;
                    error.responseData = responseData;
                    throw error;
                }
                return responseData;
            } catch(err) {
                const normalizedError = err?.name === 'AbortError'
                    ? Object.assign(new Error('El registro de la transferencia excedió el tiempo máximo de espera.'), { code: 'REGISTER_TRANSFER_TIMEOUT' })
                    : err;
                lastError = normalizedError;
                const httpStatus = Number(normalizedError?.httpStatus || 0);
                const retryable = !httpStatus || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
                console.error('[Transferencias][Servidor] No se pudo registrar la transferencia pendiente.', {
                    transferId: id,
                    attempt,
                    retryable,
                    ...getOperationErrorDetails(normalizedError)
                }, normalizedError);
                if (attempt >= maxAttempts || !retryable) throw normalizedError;
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            } finally {
                clearTimeout(timeoutId);
            }
        }

        throw lastError || new Error('No se pudo registrar la transferencia pendiente en el servidor.');
    };

    const createPendingTransfer = async () => {
        const normalizedPaymentSettings = normalizePaymentSettings(paymentSettings);
        if (!normalizedPaymentSettings.bankAccount) {
            alert('Falta configurar el número de cuenta bancaria en el Panel Admin.');
            return;
        }
        if (!ensureSupermarketMinimumAllowed(checkoutProducts)) return;
        if (!ensureCheckoutInventoryAllowed(checkoutProducts)) return;
        if (!ensureCheckoutWalletsAllowed(checkoutProducts)) return;
        setOrderSending(true);
        try {
            const payload = buildOrderPayload();
            const validationMessage = validatePendingTransferPayload(payload);
            if (validationMessage) {
                alert(validationMessage);
                return;
            }

            try {
                const auth = fbase.getAuth();
                if (!auth.currentUser) await fbase.signInAnonymously(auth);
            } catch(authError) {
                console.warn('[Transferencias] No se pudo renovar la sesión anónima; se intentará registrar con las reglas públicas actuales.', authError);
            }

            const now = Date.now();
            const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
            const id = `TR-${now}-${randomSuffix}`;
            const transferData = sanitizeFirestoreData({
                transferId: id,
                type: 'purchase',
                paymentMethod: 'Transferencia bancaria',
                bankAccount: cleanFirestoreText(normalizedPaymentSettings.bankAccount, 160),
                bankLegend: cleanFirestoreText(PAYMENT_BANK_AZTECA_ORDER_TEXT, 500),
                holderName: cleanFirestoreText(payload.delivery.fullName, 180),
                status: 'Pendiente',
                order: payload,
                createdAt: now,
                updatedAt: now
            });
            try {
                await registerPendingPurchaseTransferApi(id, transferData);
                applyPendingPurchaseTransferLocal(id, transferData);
            } catch(serverError) {
                const serverStatus = Number(serverError?.httpStatus || 0);
                const canUseDirectFirestoreFallback = !serverStatus || serverStatus === 404 || serverStatus === 405 || serverStatus >= 500;
                if (!canUseDirectFirestoreFallback) throw serverError;

                console.warn('[Transferencias][Registro] Se usará la escritura directa de respaldo en Firestore.', {
                    transferId: id,
                    serverStatus: serverStatus || null,
                    ...getOperationErrorDetails(serverError)
                });
                try {
                    await saveDoc('bank_transfers', id, transferData, { throwOnError: true, applyLocalOnError: false });
                } catch(firestoreError) {
                    firestoreError.serverRegistrationError = getOperationErrorDetails(serverError);
                    throw firestoreError;
                }
            }
            alert('Transferencia registrada como Pendiente. Tu solicitud se procesará cuando el administrador confirme el pago.');
            clearCompletedCartIfNeeded();
            resetPublicFlow();
        } catch(err) {
            const details = getOperationErrorDetails(err);
            console.error('[Transferencias][Registro] No se pudo crear la transferencia pendiente.', details, err);
            if (String(details.code || '').includes('permission-denied')) {
                alert('No se pudo registrar la transferencia pendiente porque la aplicación no tiene permiso para guardar el pedido.');
            } else if (String(details.code || '').includes('invalid-argument')) {
                alert('No se pudo registrar la transferencia pendiente porque uno de los datos del pedido no es válido. Revisa el formulario e inténtalo nuevamente.');
            } else {
                alert('No se pudo registrar la transferencia pendiente. Revisa tu conexión e inténtalo nuevamente.');
            }
        } finally {
            setOrderSending(false);
        }
    };

    const payWithWallet = async () => {
        if (!walletPaymentManager.authenticated) {
            walletPaymentManager.requestLogin();
            return;
        }
        let verifiedWallet = walletPaymentManager.wallet;
        if (!walletPaymentManager.verified) {
            verifiedWallet = await walletPaymentManager.refresh();
            if (!verifiedWallet) {
                alert(walletPaymentManager.error || 'No se encontró la cartera existente del usuario.');
                return;
            }
        }
        if (!ensureSupermarketMinimumAllowed(checkoutProducts)) return;
        if (!ensureCheckoutInventoryAllowed(checkoutProducts)) return;
        const availableBalance = Wallet.roundMoney(verifiedWallet?.balance ?? walletPaymentManager.availableBalance ?? 0);
        const walletIsActive = typeof Wallet.isWalletActivated === 'function'
            ? Wallet.isWalletActivated(verifiedWallet || walletPaymentManager.wallet || {})
            : walletPaymentManager.walletActive;
        if (!walletIsActive || availableBalance < Wallet.roundMoney(checkoutTotal)) {
            alert(`Saldo insuficiente. La compra requiere ${Wallet.formatMoney(checkoutTotal)} y la cartera dispone de ${Wallet.formatMoney(availableBalance)}.`);
            return;
        }

        let paymentId = '';
        let paymentResult = null;
        let walletDebitConfirmed = false;
        let postPaymentStage = 'antes-del-cobro';
        setOrderSending(true);
        try {
            const payload = buildOrderPayload();
            const validationMessage = validatePendingTransferPayload(payload);
            if (validationMessage) {
                alert(validationMessage);
                return;
            }

            paymentId = walletPaymentManager.getOrCreatePaymentId();
            const walletOrder = {
                products: (Array.isArray(payload.products) ? payload.products : []).map((product) => ({
                    id: product.id,
                    quantity: product.quantity
                })),
                delivery: { ...(payload.delivery || {}) },
                cart: {
                    subtotal: Number(payload.cart?.subtotal || 0),
                    shippingFee: Number(payload.cart?.shippingFee || 0),
                    total: Number(payload.cart?.total || 0)
                }
            };
            postPaymentStage = 'cobro-cartera';
            paymentResult = await walletPaymentManager.pay({ paymentId, order: walletOrder });
            walletDebitConfirmed = true;
            postPaymentStage = paymentResult?.idempotent ? 'pago-ya-existente-recuperado' : 'pago-nuevo-confirmado';

            const paidProductsById = new Map((Array.isArray(paymentResult.products) ? paymentResult.products : []).map((item) => [String(item.id), item]));
            const paidProducts = (Array.isArray(payload.products) ? payload.products : []).map((product) => {
                const paidItem = paidProductsById.get(String(product.id));
                if (!paidItem) return product;
                return {
                    ...product,
                    name: paidItem.name || product.name,
                    price: Number(paidItem.unitPrice),
                    unitPrice: Number(paidItem.unitPrice),
                    productUnitPrice: Number(paidItem.unitPrice),
                    quantity: Number(paidItem.quantity),
                    productQuantity: Number(paidItem.quantity),
                    lineTotal: Number(paidItem.lineTotal),
                    totalPrice: Number(paidItem.lineTotal),
                    productTotal: Number(paidItem.lineTotal),
                    ownerId: paidItem.ownerId || product.ownerId || ''
                };
            });
            const paidPayload = {
                ...payload,
                product: paidProducts[0] || payload.product || {},
                products: paidProducts,
                cart: {
                    ...(payload.cart || {}),
                    subtotal: Number(paymentResult.subtotal || 0),
                    shippingFee: Number(paymentResult.shippingFee || 0),
                    total: Number(paymentResult.total || 0)
                }
            };

            postPaymentStage = 'registrar-venta-inventario';
            await registerCompletedSale({
                payload: paidPayload,
                paymentMethod: 'Cartera',
                saleId: `wallet_${paymentId}`,
                transferId: paymentId,
                soldAt: Number(paymentResult.paidAt || Date.now()),
                walletPayment: {
                    paymentId,
                    movementId: paymentResult.movementId,
                    buyerId: sessionUser?.uid || sessionUser?.id || fbUser?.uid || '',
                    orderSignature: paymentResult.orderSignature
                }
            });

            postPaymentStage = 'venta-registrada';
            let emailSent = true;
            try {
                const emailPayload = appendSaleNotificationToPayload({
                    ...paidPayload,
                    transferId: paymentId,
                    walletPaymentId: paymentId,
                    paidAt: Number(paymentResult.paidAt || Date.now()),
                    paymentStatus: 'Pagado',
                    paymentMethod: 'Cartera',
                    requestId: `wallet_${paymentId}`
                });
                await sendOrderEmail(emailPayload, { maxAttempts: 2 });
            } catch(emailError) {
                emailSent = false;
                console.error('[Cartera][Correo] El pago y la compra se completaron, pero no se pudo enviar el correo.', {
                    paymentId,
                    ...getOperationErrorDetails(emailError)
                }, emailError);
            }

            try { await walletPaymentManager.refresh(); } catch(refreshError) {}
            const balanceText = ` Saldo restante: ${Wallet.formatMoney(paymentResult.balanceAfter || 0)}.`;
            const emailText = emailSent
                ? ' La confirmación de compra fue enviada por correo.'
                : ' La compra quedó confirmada, aunque no fue posible enviar el correo de confirmación.';
            alert(`Pago con cartera realizado correctamente.${balanceText}${emailText}`);
            clearCompletedCartIfNeeded();
            resetPublicFlow();
        } catch(error) {
            const code = String(error?.code || '').toLowerCase();
            const details = error?.details || {};
            console.error('[Cartera][Pago] No se pudo completar el flujo.', {
                paymentId,
                walletDebitConfirmed,
                ...getOperationErrorDetails(error),
                details
            }, error);

            if (walletDebitConfirmed) {
                const technicalCode = String(error?.code || 'SIN_CODIGO');
                const technicalMessage = String(error?.message || 'Error desconocido');
                const technicalStage = String(error?.stage || postPaymentStage || 'registro-posterior-al-cobro');
                console.error('[Cartera][Registro posterior al cobro] Diagnóstico exacto.', {
                    paymentId,
                    idempotent: paymentResult?.idempotent === true,
                    stage: technicalStage,
                    code: technicalCode,
                    message: technicalMessage,
                    details
                }, error);
                alert(
                    `El cobro NO se repetirá. Falló el registro posterior al pago.\n\n` +
                    `Etapa: ${technicalStage}\n` +
                    `Código: ${technicalCode}\n` +
                    `Detalle: ${technicalMessage}`
                );
            } else if (code.includes('wallet-auth') || code.includes('wallet-user-invalid') || code.includes('wallet-profile')) {
                walletPaymentManager.requestLogin();
            } else if (code.includes('wallet-insufficient-funds') || code.includes('wallet-not-found') || code.includes('wallet-not-active')) {
                const available = Number(details.availableBalance ?? walletPaymentManager.availableBalance ?? 0);
                alert(`${error?.message || 'Saldo insuficiente o cartera no disponible.'} Saldo disponible: ${Wallet.formatMoney(available)}.`);
            } else if (code.includes('seller-wallet') || code === 'wallet_not_found' || code === 'wallet_insufficient_funds') {
                alert(Wallet.INSUFFICIENT_MESSAGE);
            } else if (code.includes('wallet-payment-permission-denied') || code.includes('permission-denied')) {
                alert(error?.message || 'No se pudo autorizar el pago o continuar el flujo de compra en Firestore. Publica el archivo firestore.rules incluido en este paquete.');
            } else if (code.includes('product-') || code.includes('order-total-changed')) {
                alert(error?.message || 'El inventario o el total de la compra cambió. Regresa al carrito y revisa la compra.');
            } else if (code.includes('timeout') || code.includes('network') || code.includes('unavailable')) {
                alert('No se pudo confirmar la respuesta del cobro. Presiona nuevamente “Pagar con cartera”; el mismo identificador se reutilizará y el pago no se duplicará.');
            } else {
                alert(error?.message || 'No se pudo realizar el pago con cartera.');
            }
        } finally {
            setOrderSending(false);
        }
    };

    const markTransferPaid = async (transfer) => {
        const transferId = String(transfer?.id || transfer?.transferId || '').trim();
        const isSaleTransfer = transfer?.type !== 'wallet_recharge';
        const canConfirmPending = transfer?.status === 'Pendiente';
        const canRetrySaleEmail = isSaleTransfer && transfer?.status === 'Pagado' && transfer?.emailStatus !== 'Enviado';
        if (sessionUser?.role !== 'admin' || (!canConfirmPending && !canRetrySaleEmail)) return;
        if (!transferId) {
            alert('No se pudo identificar la transferencia.');
            return;
        }

        const requestedPaidAt = Number(transfer?.paidAt || Date.now());
        let stage = 'inicio';
        let paymentConfirmed = transfer?.status === 'Pagado';
        let emailsSent = false;
        let currentTransfer = transfer;
        setOrderSending(true);
        console.info('[Transferencias][Pagado] Inicio del procesamiento.', {
            transferId,
            currentStatus: transfer?.status || '',
            emailStatus: transfer?.emailStatus || '',
            actor: sessionUser?.email || ''
        });

        try {
            stage = 'leer-transferencia';
            currentTransfer = await readBankTransferDocument(transferId);
            paymentConfirmed = currentTransfer.status === 'Pagado';

            if (currentTransfer.type === 'wallet_recharge') {
                if (currentTransfer.status !== 'Pendiente') return;
                stage = 'aprobar-recarga';
                const targetUser = {
                    uid: currentTransfer.walletId || currentTransfer.userId,
                    id: currentTransfer.walletId || currentTransfer.userId,
                    name: currentTransfer.userName || currentTransfer.holderName || 'Usuario',
                    email: currentTransfer.userEmail || '',
                    phone: currentTransfer.userPhone || ''
                };
                await Wallet.recordRecharge({
                    fbase,
                    appId,
                    user: targetUser,
                    wallet: Wallet.getWalletById(wallets, currentTransfer.walletId || currentTransfer.userId),
                    amount: currentTransfer.amount,
                    referenceId: transferId,
                    actor: sessionUser?.email || ADMIN_EMAIL,
                    settings: walletSettings
                });
                setPendingTransfers(prev => {
                    const next = prev.filter(item => (item.id || item.transferId) !== transferId);
                    writeLocal('driveMxPendingTransfers', next);
                    return next;
                });
                const db = fbase.getFirestore();
                await fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'bank_transfers', transferId));
                alert('Transferencia de recarga aprobada. El saldo fue abonado y quedó registrada únicamente en la cartera del usuario.');
                return;
            }

            if (currentTransfer.status !== 'Pendiente' && currentTransfer.status !== 'Pagado') {
                const error = new Error(`La transferencia tiene un estado no procesable: ${currentTransfer.status || 'sin estado'}.`);
                error.code = 'TRANSFER_STATUS_INVALID';
                throw error;
            }
            if (currentTransfer.status === 'Pagado' && currentTransfer.emailStatus === 'Enviado') {
                alert('Transferencia confirmada correctamente');
                return;
            }
            if (!currentTransfer.order || typeof currentTransfer.order !== 'object') {
                const error = new Error('La transferencia no contiene los datos del pedido.');
                error.code = 'TRANSFER_ORDER_MISSING';
                throw error;
            }

            const storedMailSettings = currentTransfer.order.mailSettings || {};
            const payload = appendSaleNotificationToPayload({
                ...currentTransfer.order,
                transferId,
                paidAt: Number(currentTransfer.paidAt || requestedPaidAt),
                paymentStatus: 'Pagado',
                mailSettings: {
                    senderEmail: String(emailSettings.senderEmail || storedMailSettings.senderEmail || '').trim(),
                    appPassword: String(emailSettings.appPassword || storedMailSettings.appPassword || '').trim(),
                    receiverEmail: String(emailSettings.receiverEmail || storedMailSettings.receiverEmail || '').trim()
                }
            });
            const transferProducts = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : (payload.product ? [payload.product] : []);
            if (transferProducts.length === 0) {
                const error = new Error('No se encontraron productos válidos en la transferencia.');
                error.code = 'TRANSFER_PRODUCTS_MISSING';
                throw error;
            }
            const supermarketMinimumError = getSupermarketMinimumPurchaseError(transferProducts);
            if (supermarketMinimumError) {
                const error = new Error(supermarketMinimumError);
                error.code = 'SUPERMARKET_MINIMUM_PRODUCTS';
                throw error;
            }

            if (currentTransfer.status === 'Pendiente') {
                stage = 'validar-saldo-y-comision';
                if (!ensureCheckoutWalletsAllowed(transferProducts)) return;
            }

            stage = 'registrar-venta-y-comision';
            const registeredSaleResult = await registerCompletedSale({
                payload,
                paymentMethod: 'Transferencia bancaria',
                saleId: `transfer_${transferId}`,
                transferId,
                soldAt: Number(currentTransfer.paidAt || requestedPaidAt)
            });
            const registeredSales = Array.isArray(registeredSaleResult) ? registeredSaleResult : [registeredSaleResult].filter(Boolean);
            const saleIds = registeredSales.map(sale => sale?.id || sale?.saleId).filter(Boolean);

            stage = 'marcar-transferencia-pagada';
            currentTransfer = await updateBankTransferDocument(transferId, {
                status: 'Pagado',
                paidAt: Number(currentTransfer.paidAt || requestedPaidAt),
                paidBy: currentTransfer.paidBy || sessionUser?.email || ADMIN_EMAIL,
                updatedAt: Date.now(),
                paymentProcessingStatus: 'Completado',
                paymentError: '',
                saleIds,
                emailStatus: 'Pendiente',
                emailError: '',
                emailErrorCode: ''
            }, { expected: { status: 'Pagado' } });
            paymentConfirmed = true;
            console.info('[Transferencias][Pagado] Venta, comisión y estado de pago confirmados en Firestore.', {
                transferId,
                saleIds,
                paidAt: currentTransfer.paidAt
            });

            stage = 'enviar-correos';
            const mailResult = await sendOrderEmail({
                ...payload,
                transferId,
                paidAt: currentTransfer.paidAt,
                paymentStatus: 'Pagado',
                requestId: `transfer_${transferId}`
            });
            emailsSent = true;

            stage = 'guardar-resultado-correo';
            const emailSentAt = Date.now();
            currentTransfer = await updateBankTransferDocument(transferId, {
                status: 'Pagado',
                updatedAt: emailSentAt,
                emailStatus: 'Enviado',
                emailSentAt,
                emailLastAttemptAt: emailSentAt,
                emailError: '',
                emailErrorCode: '',
                emailRequestId: mailResult.requestId || `transfer_${transferId}`,
                emailBaseSent: mailResult.baseEmailSent !== false,
                emailSaleNotificationCount: Number(mailResult.saleNotificationCount || 0),
                ...createBuyerTransferEmailAudit(mailResult),
                ...Supermercado.createTransferEmailAudit(mailResult)
            }, { expected: { status: 'Pagado', emailStatus: 'Enviado' } });

            console.info('[Transferencias][Pagado] Flujo completado correctamente.', {
                transferId,
                saleIds,
                emailStatus: currentTransfer.emailStatus,
                saleNotificationCount: Number(mailResult.saleNotificationCount || 0)
            });
            alert('Transferencia confirmada correctamente');
        } catch(err) {
            const details = getOperationErrorDetails(err);
            console.error('[Transferencias][Pagado] El flujo no pudo completarse.', {
                transferId,
                stage,
                paymentConfirmed,
                emailsSent,
                httpStatus: err?.httpStatus || null,
                responseData: err?.responseData || null,
                ...details
            }, err);

            if (!paymentConfirmed && ['marcar-transferencia-pagada', 'enviar-correos', 'guardar-resultado-correo'].includes(stage)) {
                try {
                    const latestTransfer = await readBankTransferDocument(transferId);
                    paymentConfirmed = latestTransfer.status === 'Pagado';
                } catch(verificationError) {
                    console.error('[Transferencias][Pagado] No se pudo volver a verificar el estado después del error.', {
                        transferId,
                        ...getOperationErrorDetails(verificationError)
                    }, verificationError);
                }
            }

            if (paymentConfirmed && !emailsSent) {
                try {
                    await updateBankTransferDocument(transferId, {
                        status: 'Pagado',
                        updatedAt: Date.now(),
                        emailStatus: 'Error',
                        emailLastAttemptAt: Date.now(),
                        emailError: String(details.message || 'No se pudo enviar el correo.').slice(0, 500),
                        emailErrorCode: String(details.code || err?.stage || 'EMAIL_ERROR').slice(0, 120),
                        ...createBuyerTransferEmailAudit(err?.responseData || {}),
                        ...Supermercado.createTransferEmailAudit(err?.responseData || {})
                    }, { expected: { status: 'Pagado', emailStatus: 'Error' } });
                } catch(statusError) {
                    console.error('[Transferencias][Pagado] Tampoco se pudo guardar el detalle del error de correo.', {
                        transferId,
                        ...getOperationErrorDetails(statusError)
                    }, statusError);
                }
                alert(`La transferencia quedó pagada, pero no se pudieron enviar los correos. Detalle: ${details.message}`);
            } else if (paymentConfirmed && emailsSent) {
                alert(`La transferencia y los correos fueron procesados, pero no se pudo guardar la confirmación final. Detalle: ${details.message}`);
            } else {
                alert(`No se pudo confirmar la transferencia. Detalle: ${details.message}`);
            }
        } finally {
            setOrderSending(false);
        }
    };

    const deleteTransfer = async (transfer) => {
        if (sessionUser?.role !== 'admin') return;
        const transferId = transfer?.id || transfer?.transferId;
        if (!transferId) return;
        if (!confirm('¿Eliminar este registro de transferencia pendiente?')) return;
        setPendingTransfers(prev => { const next = prev.filter(item => (item.id || item.transferId) !== transferId); writeLocal('driveMxPendingTransfers', next); return next; });
        setTransferTrackingDrafts(prev => { const next = { ...prev }; delete next[transferId]; return next; });
        try {
            const db = fbase.getFirestore();
            await fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'bank_transfers', transferId));
        } catch(err) {
            console.error('Firestore borrar transferencia:', err);
            alert('No se pudo eliminar la transferencia.');
        }
    };

    const findWalletRechargeTransfer = (item = {}) => {
        const wantedId = String(item.sourceTransferId || item.referenceId || item.transferId || item.id || item.rechargeId || '');
        return pendingTransfers.find((transfer) => {
            const transferId = String(transfer.id || transfer.transferId || '');
            return transfer.type === 'wallet_recharge' && transferId && transferId === wantedId;
        }) || null;
    };

    const approveWalletRechargeFromPanel = async (item = {}) => {
        if (sessionUser?.role !== 'admin') return;
        const transfer = findWalletRechargeTransfer(item);
        if (!transfer) {
            alert('No se encontró la transferencia pendiente de esta recarga en la información de cartera del usuario.');
            return;
        }
        const itemId = item.id || item.rechargeId || item.referenceId || transfer.id || transfer.transferId;
        setWalletRechargeActionId(itemId);
        try {
            await markTransferPaid(transfer);
        } finally {
            setWalletRechargeActionId('');
        }
    };

    const deleteWalletRechargeFromPanel = async (item = {}) => {
        if (sessionUser?.role !== 'admin') return;
        const transfer = findWalletRechargeTransfer(item);
        const itemId = item.id || item.rechargeId || item.referenceId;
        setWalletRechargeActionId(itemId || '');
        try {
            if (transfer) {
                await deleteTransfer(transfer);
                return;
            }
            const rechargeId = item.rechargeId || item.id;
            if (!rechargeId) return;
            if (!confirm('¿Eliminar este registro de recarga del historial? Esta acción no modifica el saldo ya abonado.')) return;
            setWalletRecharges(prev => prev.filter(recharge => (recharge.id || recharge.rechargeId) !== rechargeId));
            const db = fbase.getFirestore();
            await fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'wallet_recharges', rechargeId));
        } catch(err) {
            console.error('Eliminar recarga de cartera:', err);
            alert('No se pudo eliminar la recarga.');
        } finally {
            setWalletRechargeActionId('');
        }
    };

    const validateDeliveryForm = () => {
        const requiredFields = [
            ['street', 'La calle es obligatoria.'],
            ['state', 'El estado es obligatorio.'],
            ['municipality', 'El municipio es obligatorio.'],
            ['neighborhood', 'La colonia es obligatoria.'],
            ['zip', 'El código postal es obligatorio.'],
            ['fullName', 'El nombre completo es obligatorio.'],
            ['phone', 'El teléfono es obligatorio.'],
            ['email', 'El correo electrónico es obligatorio.'],
            ['references', 'Las referencias del domicilio son obligatorias.']
        ];
        for (const [field, message] of requiredFields) {
            if (!String(deliveryForm[field] || '').trim()) {
                alert(message);
                return false;
            }
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryForm.email.trim())) {
            alert('Ingresa un correo electrónico válido.');
            return false;
        }
        return true;
    };

    const resetDeliveryForm = () => {
        setDeliveryForm({ street: '', state: '', municipality: '', neighborhood: '', zip: '', fullName: '', phone: '', email: '', references: '' });
    };

    const handleDeliveryContinue = async () => {
        if (checkoutProducts.length === 0) {
            alert('No se encontraron productos seleccionados.');
            return;
        }
        if (!ensureSupermarketMinimumAllowed(checkoutProducts)) return;
        if (!validateDeliveryForm()) return;
        if (!ensureCheckoutInventoryAllowed(checkoutProducts)) return;
        setSelectedPaymentMethod('transfer');
        setView('payment-method');
    };

    const getSupportUserId = () => sessionUser?.uid || sessionUser?.id || fbUser?.uid || 'local';
    const activeSupportChat = supportChats.find(c => c.id === activeSupportChatId) || null;
    const adminSelectedSupportChat = activeSupportChat || supportChats.find(c => c.status === 'open') || null;

    const createSupportChat = async (userId, userEmail = '') => {
        const id = `support_${userId}_${Date.now()}`;
        const chat = {
            chatId: id,
            userId,
            userEmail,
            status: 'open',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await saveDoc('support_chats', id, chat);
        setActiveSupportChatId(id);
        return chat;
    };

    const openSupportFromCover = async () => {
        const userId = getSupportUserId();
        const active = supportChats.find(c => c.userId === userId && c.status === 'open');
        if (active) setActiveSupportChatId(active.id || active.chatId);
        else await createSupportChat(userId, 'Usuario portada');
        setView('support');
    };

    const openAdminSupport = () => {
        const firstOpen = supportChats.find(c => c.status === 'open') || supportChats[0];
        setActiveSupportChatId(firstOpen?.id || firstOpen?.chatId || '');
        setShowAdminMenu(false);
        setView('admin-support');
    };

    const openAdminTracking = () => {
        setShowAdminMenu(false);
        setSearchQuery('');
        packagesManager.resetTracking();
        setView('admin-tracking');
    };

    const runTrackingSearch = (value, notify = false) => {
        setSearchQuery(value);
        return packagesManager.runTrackingSearch(value, notify);
    };

    const openAssignmentsAccess = () => {
        setShowUserMenu(false);
        packagesManager.openAssignmentsAccess();
    };

    const sendSupportMessage = async (role = 'user') => {
        if (sessionUser && sessionUser.role !== 'admin' && !ensureAccountAllowed()) return;
        const text = supportInput.trim();
        if (!text) return;
        let chat = role === 'admin' ? adminSelectedSupportChat : activeSupportChat;
        if (!chat && role !== 'admin') chat = await createSupportChat(getSupportUserId(), 'Usuario portada');
        if (!chat || chat.status === 'closed') return;
        const id = chat.id || chat.chatId;
        const message = {
            id: `msg_${Date.now()}`,
            text,
            sender: role,
            senderName: role === 'admin' ? 'Soporte Técnico' : 'Usuario',
            createdAt: Date.now()
        };
        await saveDoc('support_chats', id, { ...chat, messages: [...(chat.messages || []), message], updatedAt: Date.now() });
        setActiveSupportChatId(id);
        setSupportInput('');
    };

    const closeSupportChat = async (chat) => {
        if (!chat) return;
        const id = chat.id || chat.chatId;
        await saveDoc('support_chats', id, { ...chat, status: 'closed', closedAt: Date.now(), updatedAt: Date.now(), closedBy: sessionUser?.email || 'admin' });
        const newChat = await createSupportChat(chat.userId || getSupportUserId(), chat.userEmail || 'Usuario portada');
        setActiveSupportChatId(newChat.chatId);
    };

    const deleteSupportChat = async (chat) => {
        if (!chat) return;
        const id = chat.id || chat.chatId;
        if (!id) return;
        if (!confirm('¿Eliminar esta conversación de soporte técnico?')) return;
        const nextChats = supportChats.filter(c => (c.id || c.chatId) !== id);
        setSupportChats(nextChats);
        writeLocal('driveMxSupportChats', nextChats);
        if ((activeSupportChatId || '') === id) {
            setActiveSupportChatId(nextChats[0]?.id || nextChats[0]?.chatId || '');
        }
        try {
            const db = fbase.getFirestore();
            await fbase.deleteDoc(fbase.doc(db, 'artifacts', appId, 'public', 'data', 'support_chats', id));
        } catch(err) { console.error('Firestore borrar soporte:', err); }
    };


    return (
        <div className="min-h-screen flex flex-col">
            <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3 cursor-pointer" onClick={resetPublicFlow}>
                    <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-100">
                        <Icons.Truck size={18} />
                    </div>
                </div>
                {sessionUser ? (
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-bold leading-none">{sessionUser.name}</p>
                            <p className="text-[8px] font-black text-red-500 uppercase">{sessionUser.role}</p>
                        </div>
                        <button onClick={authManager.handleLogout} className="p-2 text-slate-400"><Icons.LogOut /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => { setIsCartOpen(true); }} className="relative w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-red-50 hover:text-red-600" aria-label="Abrir carrito">
                            <Icons.Cart size={19} />
                            {cartItems.length > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{cartItems.length}</span>}
                        </button>
                        <button onClick={openSupportFromCover} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600">Soporte Técnico</button>
                        <button onClick={() => { resetPublicFlow(); authManager.setLoginForm({ email: '', p: '' }); setView('login'); }} className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Registrarse</button>
                    </div>
                )}
            </header>

            {CartUI.ShoppingCartModal && (
                <CartUI.ShoppingCartModal
                    isOpen={isCartOpen}
                    products={cartProducts}
                    driveMxMaxItems={CART_MAX_ITEMS}
                    supermarketMinimumProducts={SUPERMARKET_MINIMUM_PRODUCTS}
                    ttlMinutes={Math.round(CART_TTL_MS / 60000)}
                    driveMxProductCount={cartDriveMxProductCount}
                    supermarketProductCount={cartSupermarketProductCount}
                    totalQuantity={cartTotalQuantity}
                    subtotal={cartSubtotal}
                    getProductStock={getProductStock}
                    getProductLineTotal={getProductLineTotal}
                    onUpdateQuantity={updateCartProductQuantity}
                    onRemoveProduct={removeProductFromCart}
                    onCheckout={startCartCheckout}
                    onClose={() => setIsCartOpen(false)}
                />
            )}

            <main className="flex-grow p-6 flex flex-col items-center">
                {view === 'home' && (
                    <div className="w-full max-w-6xl py-10 space-y-8 animate-slide">
                        <div className="text-center max-w-xl mx-auto">
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Productos <span className="text-red-500">Drive MX</span></h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Portada de productos</p>
                        </div>

                            <div className="w-full mt-6 animate-slide space-y-10">
                                <div className="max-w-xl mx-auto">
                                    <img src="repartidora.png" alt="Drive MX" className="w-full h-auto" />
                                </div>

                                {NewShipmentUI.PublicGuideTracker && (
                                    <NewShipmentUI.PublicGuideTracker
                                        fbase={fbase}
                                        appId={appId}
                                        steps={STEPS}
                                    />
                                )}

                                {BusinessStorefronts.BusinessHomeSection ? (
                                    <BusinessStorefronts.BusinessHomeSection
                                        products={products}
                                        ads={ads}
                                        getProductGallery={getProductGallery}
                                        onProductClick={openProductDetail}
                                    />
                                ) : (
                                    <>
                                        {HomeProducts.HomeProductsSection && (
                                            <HomeProducts.HomeProductsSection
                                                products={activeProducts}
                                                ads={ads}
                                                getProductGallery={getProductGallery}
                                                onProductClick={openProductDetail}
                                            />
                                        )}
                                        {Supermercado.SupermercadoHomeSection && (
                                            <Supermercado.SupermercadoHomeSection
                                                products={supermarketProducts}
                                                getProductGallery={getProductGallery}
                                                onProductClick={openProductDetail}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        
                    </div>
                )}

                {view === 'product-detail' && selectedProduct && ProductDetails.ProductDetail && (
                    <>
                        <ProductDetails.ProductDetail
                            product={selectedProduct}
                            gallery={selectedGallery}
                            currentImageIndex={currentImageIndex}
                            setCurrentImageIndex={setCurrentImageIndex}
                            quantity={selectedPurchaseQuantity}
                            allowZeroQuantity={true}
                            onQuantityChange={setSelectedProductQuantity}
                            Icons={Icons}
                            productSizesText={productSizesText}
                            productColorsText={productColorsText}
                            onBack={resetPublicFlow}
                            onBuy={startSingleProductCheckout}
                            onAddToCart={addProductToCart}
                            isInCart={isProductInCart(selectedProduct.id)}
                        />
                        {BusinessStorefronts.RelatedBusinessProducts && (
                            <BusinessStorefronts.RelatedBusinessProducts
                                products={products}
                                selectedProduct={selectedProduct}
                                getProductGallery={getProductGallery}
                                onProductClick={openProductDetail}
                            />
                        )}
                    </>
                )}

                {view === 'delivery-data' && checkoutProducts.length > 0 && (
                    <div className="w-full max-w-5xl py-6 animate-slide checkout-screen">
                        <button onClick={() => { resetDeliveryForm(); if (checkoutProductIds.length > 0) { setView('home'); setIsCartOpen(true); } else { setView('product-detail'); } }} className="mb-6 text-[10px] font-black uppercase text-slate-400 hover:text-red-500">← {checkoutProductIds.length > 0 ? 'Volver al carrito' : 'Volver al detalle'}</button>
                        <div className="card-glass checkout-card">
                            <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between gap-4 checkout-header">
                                <div className="checkout-title">
                                    <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-1 checkout-product-label">{checkoutProducts.length > 1 ? 'Productos seleccionados' : 'Producto seleccionado'}: {checkoutProductNames}</p>
                                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Datos de entrega</h1>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 checkout-id-label">ID{checkoutProducts.length > 1 ? 's' : ''} conservado{checkoutProducts.length > 1 ? 's' : ''}: {checkoutProductIdsLabel}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 checkout-actions">
                                    <button type="button" onClick={resetPublicFlow} className="text-[9px] font-black uppercase text-slate-400 hover:text-red-500">Cancelar</button>
                                    <button type="button" onClick={handleDeliveryContinue} disabled={orderSending} className="btn-primary h-11 disabled:opacity-50 disabled:cursor-not-allowed checkout-submit-button">{orderSending ? 'Procesando...' : 'Continuar'}</button>
                                </div>
                            </div>

                            <form onSubmit={(e) => { e.preventDefault(); handleDeliveryContinue(); }} className="p-6 lg:p-8 space-y-6 checkout-form">
                                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Resumen de compra</p>
                                        <p className="text-[9px] font-black text-red-500 uppercase">{checkoutProducts.length} producto{checkoutProducts.length === 1 ? '' : 's'} · {checkoutTotalQuantity} unidad{checkoutTotalQuantity === 1 ? '' : 'es'}</p>
                                    </div>
                                    {checkoutDriveMxProductCount > 0 && <p className="text-[9px] font-black text-slate-400 uppercase">Drive MX: {checkoutDriveMxProductCount}/{CART_MAX_ITEMS} productos máximos</p>}
                                    {checkoutSupermarketProductCount > 0 && <p className={`text-[9px] font-black uppercase ${checkoutSupermarketProductCount >= SUPERMARKET_MINIMUM_PRODUCTS ? 'text-slate-400' : 'text-red-500'}`}>Supermercado: {checkoutSupermarketProductCount}/{SUPERMARKET_MINIMUM_PRODUCTS} productos mínimos en el carrito</p>}
                                    {checkoutProducts.map(product => (
                                        <div key={product.id} className="flex items-center justify-between gap-3 text-sm font-bold checkout-summary-row">
                                            <span className="text-slate-700">{product.name} <span className="text-[10px] text-slate-400 uppercase">x{Number(product.quantity || 0)} · unitario ${Number(product.unitPrice || product.price || 0).toFixed(2)}</span></span>
                                            <span className="text-red-500 font-black">${getProductLineTotal(product, product.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                    <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Subtotal productos</span>
                                        <span className="text-lg font-black text-red-500">${Number(checkoutSubtotal || 0).toFixed(2)}</span>
                                    </div>
                                    {checkoutProducts.length > 0 && (
                                        <div className="flex items-center justify-between gap-3 text-sm font-bold border-t border-slate-200 pt-3">
                                            <span className="text-slate-700">Gastos de envio</span>
                                            <span className="text-red-500 font-black">{formatCheckoutShippingFee(checkoutShippingFee)}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Total a pagar</span>
                                        <span className="text-xl font-black text-red-500">${Number(checkoutTotal || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Calle</label>
                                        <input className="input-field" placeholder="Calle y número" maxLength={240} value={deliveryForm.street} onChange={e => setDeliveryForm({...deliveryForm, street: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Estado</label>
                                        <input className="input-field" placeholder="Estado" maxLength={120} value={deliveryForm.state} onChange={e => setDeliveryForm({...deliveryForm, state: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Municipio</label>
                                        <input className="input-field" placeholder="Municipio" maxLength={140} value={deliveryForm.municipality} onChange={e => setDeliveryForm({...deliveryForm, municipality: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Colonia</label>
                                        <input className="input-field" placeholder="Colonia" maxLength={180} value={deliveryForm.neighborhood} onChange={e => setDeliveryForm({...deliveryForm, neighborhood: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Código Postal</label>
                                        <input className="input-field" placeholder="Código Postal" inputMode="numeric" maxLength={25} value={deliveryForm.zip} onChange={e => setDeliveryForm({...deliveryForm, zip: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Nombre completo</label>
                                        <input className="input-field" placeholder="Nombre completo" maxLength={180} value={deliveryForm.fullName} onChange={e => setDeliveryForm({...deliveryForm, fullName: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Teléfono</label>
                                        <input className="input-field" placeholder="Teléfono" inputMode="tel" maxLength={60} value={deliveryForm.phone} onChange={e => setDeliveryForm({...deliveryForm, phone: e.target.value})} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Correo electrónico</label>
                                        <input className="input-field" placeholder="Correo electrónico" type="email" maxLength={254} value={deliveryForm.email} onChange={e => setDeliveryForm({...deliveryForm, email: e.target.value})} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Referencias del domicilio</label>
                                        <textarea className="input-field min-h-[120px] resize-none" placeholder="Referencias del domicilio" maxLength={1200} value={deliveryForm.references} onChange={e => setDeliveryForm({...deliveryForm, references: e.target.value})}></textarea>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}


                {view === 'payment-method' && checkoutProducts.length > 0 && (
                    <div className="w-full max-w-4xl py-6 animate-slide checkout-screen">
                        <button onClick={resetAfterIncompletePayment} className="mb-6 text-[10px] font-black uppercase text-slate-400 hover:text-red-500">← Cancelar pago y volver al inicio</button>
                        <div className="card-glass checkout-card">
                            <div className="bg-white border-b border-slate-100 px-6 py-5 checkout-header">
                                <div className="checkout-title">
                                    <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-1 checkout-product-label">{checkoutProducts.length > 1 ? 'Productos seleccionados' : 'Producto seleccionado'}: {checkoutProductNames}</p>
                                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Método de pago</h1>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 checkout-id-label">ID{checkoutProducts.length > 1 ? 's' : ''} conservado{checkoutProducts.length > 1 ? 's' : ''}: {checkoutProductIdsLabel}</p>
                                </div>
                            </div>
                            <div className="p-6 lg:p-8 space-y-5">
                                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                                    <p className="text-[9px] font-black text-slate-400 uppercase">Resumen de compra</p>
                                    {checkoutProducts.map(product => (
                                        <div key={product.id} className="flex items-center justify-between gap-3 text-sm font-bold checkout-summary-row">
                                            <span className="text-slate-700">{product.name} <span className="text-[10px] text-slate-400 uppercase">x{Number(product.quantity || 0)} · unitario ${Number(product.unitPrice || product.price || 0).toFixed(2)}</span></span>
                                            <span className="text-red-500 font-black">${getProductLineTotal(product, product.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between gap-3 text-sm font-bold border-t border-slate-200 pt-3">
                                        <span className="text-slate-700">Gastos de envio</span>
                                        <span className="text-red-500 font-black">{formatCheckoutShippingFee(checkoutShippingFee)}</span>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {[
                                        ['transfer', 'Transferencia bancaria', 'Queda Pendiente hasta que el administrador confirme el pago. El costo de envío se calcula según la categoría de los productos.'],
                                        WalletPayment.available === false ? null : ['wallet', 'Cartera (pago con cartera)', 'Requiere iniciar sesión únicamente para consultar la cartera existente y descontar una sola vez el total de la compra.']
                                    ].filter(Boolean).map(([value, title, desc]) => (
                                        <label key={value} className={`border-2 rounded-2xl p-5 cursor-pointer hover:border-red-200 transition-all bg-white ${selectedPaymentMethod === value ? 'border-red-400' : 'border-slate-100'}`}>
                                            <div className="flex items-start gap-3">
                                                <input type="radio" name="paymentMethod" className="mt-1" checked={selectedPaymentMethod === value} onChange={() => selectPaymentMethod(value)} />
                                                <div>
                                                    <p className="text-sm font-black text-slate-800">{title}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 leading-relaxed">{desc}</p>
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {selectedPaymentMethod === 'transfer' && (
                                    <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Cuenta bancaria Banco Azteca</p>
                                        <p className="text-2xl font-black text-slate-900 break-all">{paymentSettings.bankAccount || 'Cuenta no configurada'}</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">{PAYMENT_BANK_AZTECA_ORDER_TEXT}</p>
                                    </div>
                                )}

                                {selectedPaymentMethod === 'wallet' && WalletPayment.WalletCredentialsCard && (
                                    <WalletPayment.WalletCredentialsCard manager={walletPaymentManager} total={checkoutTotal} />
                                )}

                                <div className="bg-slate-50 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 checkout-submit-bar">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Total</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Productos: ${Number(checkoutSubtotal || 0).toFixed(2)} · Envío: {formatCheckoutShippingFee(checkoutShippingFee)} · Unidades: {checkoutTotalQuantity}</p>
                                        <p className="text-3xl font-black text-red-500">${Number(checkoutTotal || 0).toFixed(2)}</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 checkout-payment-actions">
                                        {selectedPaymentMethod === 'wallet' && WalletPayment.WalletBalanceBadge && (
                                            <WalletPayment.WalletBalanceBadge manager={walletPaymentManager} total={checkoutTotal} />
                                        )}
                                        {selectedPaymentMethod === 'transfer' ? (
                                            <button type="button" onClick={createPendingTransfer} disabled={orderSending || !paymentSettings.bankAccount} className="btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed checkout-submit-button">{orderSending ? 'Registrando...' : 'Registrar transferencia pendiente'}</button>
                                        ) : (
                                            <button type="button" onClick={payWithWallet} disabled={orderSending || walletPaymentManager.paying || !walletPaymentManager.canPay(checkoutTotal)} className="btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed checkout-submit-button">{orderSending || walletPaymentManager.paying ? 'Cobrando...' : 'Pagar con cartera'}</button>
                                        )}
                                    </div>
                                </div>
                                <button type="button" onClick={resetAfterIncompletePayment} className="w-full text-[9px] font-black text-slate-400 uppercase hover:text-red-500">Cancelar método de pago y restablecer pantalla</button>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'admin' && (
                    <PanelControlUI.AdminPanel
                        Icons={Icons}
                        WalletUI={WalletUI}
                        StripeWallet={StripeWallet}
                        CashbackUI={Cashback}
                        UsersUI={UsersUI}
                        AdsManager={AdsManager}
                        fbase={fbase}
                        appId={appId}
                        sessionUser={sessionUser}
                        showAdminMenu={showAdminMenu}
                        setShowAdminMenu={setShowAdminMenu}
                        openAdminTracking={openAdminTracking}
                        openAdminSupport={openAdminSupport}
                        users={users}
                        packagesManager={packagesManager}
                        emailSettings={emailSettings}
                        setEmailSettings={setEmailSettings}
                        saveEmailSettings={saveEmailSettings}
                        emailSaving={emailSaving}
                        paymentSettings={paymentSettings}
                        setPaymentSettings={setPaymentSettings}
                        savePaymentSettings={savePaymentSettings}
                        paymentSaving={paymentSaving}
                        walletSettings={walletSettings}
                        setWalletSettings={setWalletSettings}
                        saveWalletCommissionSettings={saveWalletCommissionSettings}
                        walletSettingsSaving={walletSettingsSaving}
                        saveCashbackSettings={saveCashbackSettings}
                        cashbackSettingsSaving={cashbackSettingsSaving}
                        wallets={wallets}
                        walletRechargeRows={walletRechargeRows}
                        approveWalletRechargeFromPanel={approveWalletRechargeFromPanel}
                        deleteWalletRechargeFromPanel={deleteWalletRechargeFromPanel}
                        walletRechargeActionId={walletRechargeActionId}
                        pendingSalesTransfers={pendingSalesTransfers}
                        markTransferPaid={markTransferPaid}
                        deleteTransfer={deleteTransfer}
                        orderSending={orderSending}
                        productOptionsLines={productOptionsLines}
                        completedSales={completedSales}
                        deleteCompletedSale={deleteCompletedSale}
                        ads={ads}
                        adminProductsManager={adminProductsManager}
                        registeredUsersPage={registeredUsersPage}
                        REGISTERED_USERS_PAGE_SIZE={REGISTERED_USERS_PAGE_SIZE}
                        setRegisteredUsersPage={setRegisteredUsersPage}
                        editRegisteredUser={editRegisteredUser}
                        toggleUserBlocked={toggleUserBlocked}
                        deleteUser={deleteUser}
                        isUserBlocked={isUserBlocked}
                    />
                )}


                {view === 'admin-tracking' && (
                    <PanelControlUI.AdminTrackingPanel
                        setView={setView}
                        searchQuery={searchQuery}
                        runTrackingSearch={runTrackingSearch}
                        trackingNotFound={trackingNotFound}
                        trackingResult={trackingResult}
                        getProductGallery={getProductGallery}
                        productSizesText={productSizesText}
                        productColorsText={productColorsText}
                    />
                )}


                {(view === 'support' || view === 'admin-support') && SupportUI.SupportPanel && (
                    <SupportUI.SupportPanel
                        view={view}
                        supportChats={supportChats}
                        activeSupportChatId={activeSupportChatId}
                        supportInput={supportInput}
                        Icons={Icons}
                        onBack={() => setView(view === 'admin-support' ? 'admin' : 'home')}
                        onSelectChat={setActiveSupportChatId}
                        onInputChange={setSupportInput}
                        onSendMessage={sendSupportMessage}
                        onCloseChat={closeSupportChat}
                        onDeleteChat={deleteSupportChat}
                    />
                )}

                {view === 'operator' && (
                    <div className="w-full max-w-5xl space-y-8 animate-slide">
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Panel de Usuario Registrado</p>
                                <h1 className="text-3xl font-black uppercase tracking-tight">Acceso <span className="text-red-500">Usuario</span></h1>
                            </div>
                            {!userPanelRfcRequired && (
                                <div className="relative">
                                    <button type="button" onClick={() => setShowUserMenu(!showUserMenu)} className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-red-500 shadow-sm" aria-label="Abrir menú de usuario">
                                        <Icons.Menu />
                                    </button>
                                    {showUserMenu && (
                                        <div className="absolute right-0 top-14 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl p-2 z-50 animate-slide">
                                            <button type="button" onClick={() => { if (!ensureAccountAllowed()) return; setShowUserMenu(false); document.getElementById('user-products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600">Administración de Productos</button>
                                            <button type="button" onClick={() => { if (!ensureAccountAllowed()) return; setShowUserMenu(false); document.getElementById('user-drivers-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600">Conductores</button>
                                            <button type="button" onClick={() => { if (!ensureAccountAllowed()) return; setShowUserMenu(false); document.getElementById('user-sales-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600">Ventas Realizadas</button>
                                            <button type="button" onClick={() => { if (!ensureAccountAllowed()) return; setShowUserMenu(false); document.getElementById('wallet-movements-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600">Movimientos</button>
                                            <button type="button" onClick={() => { if (!ensureAccountAllowed()) return; setShowUserMenu(false); setView('guide-assignment'); }} className="w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600">Asignación de Guías</button>
                                            <button type="button" onClick={openAssignmentsAccess} className="w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600">Mis Asignaciones</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="card-glass overflow-hidden">
                            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
                                <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">RFC obligatorio</h2>
                            </div>
                            <form onSubmit={userProductsManager.saveRfc} className="p-6 grid md:grid-cols-[1fr_auto] gap-3 items-end">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">RFC del usuario</label>
                                    <input required maxLength="20" autoCapitalize="characters" className="input-field" placeholder="RFC" value={userProductsManager.rfc || ''} onChange={(event) => userProductsManager.setRfc(String(event.target.value || '').trim().toUpperCase().replace(/\s+/g, ''))} />
                                </div>
                                <button disabled={userProductsManager.rfcSaving} type="submit" className="btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed">{userProductsManager.rfcSaving ? 'Guardando...' : 'Guardar RFC'}</button>
                            </form>
                            {userPanelRfcRequired && (
                                <div className="px-6 pb-6">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Debes registrar tu RFC para utilizar cualquier función del Panel de Usuario.</p>
                                </div>
                            )}
                        </div>

                        {!userPanelRfcRequired && (
                            <>
                                <WalletUI.UserWalletCard
                                    user={sessionUser}
                                    wallet={currentUserWallet}
                                    rechargeAmount={walletRechargeAmount}
                                    onRechargeAmountChange={setWalletRechargeAmount}
                                    showRecharge={showWalletRecharge}
                                    onToggleRecharge={() => { if (!ensureAccountAllowed()) return; setShowWalletRecharge(prev => !prev); }}
                                    onCloseRecharge={() => { setShowWalletRecharge(false); setWalletRechargeAmount(''); }}
                                    rechargeProcessing={walletRechargeProcessing}
                                    stripeRechargeProcessing={stripeRechargeProcessing}
                                    settings={walletSettings}
                                    bankAccount={paymentSettings.bankAccount}
                                    onCreatePendingRecharge={createPendingWalletRechargeTransfer}
                                    onCreateStripeRecharge={createStripeWalletRecharge}
                                    blockedMessage={currentUserWalletBlockedMessage}
                                    userProductCount={currentUserProducts.filter(product => product.active !== false).length}
                                />

                                <WalletUI.WalletMovementsPanel movements={walletMovements} />

                                <UserProductsUI.UserProductsPanel manager={userProductsManager} Icons={Icons} hideRfcSettings />

                                {ConductoresUI.ConductoresPanel && (
                                    <ConductoresUI.ConductoresPanel
                                        fbase={fbase}
                                        appId={appId}
                                        currentUser={sessionUser}
                                        ensureAccountAllowed={ensureAccountAllowed}
                                        onClaimed={packagesManager.onShipmentCreated}
                                    />
                                )}

                                <PackagesGuidesUI.UserAssignmentsPanel manager={packagesManager} Icons={Icons} />
                            </>
                        )}
                    </div>
                )}

                {view === 'guide-assignment' && userPanelRfcRequired && (
                    <div className="w-full max-w-3xl card-glass p-6 animate-slide">
                        <h2 className="text-xl font-black uppercase tracking-tight">RFC obligatorio</h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mt-2">Registra tu RFC antes de utilizar cualquier función del Panel de Usuario.</p>
                        <button type="button" onClick={() => setView('operator')} className="btn-primary h-11 px-5 mt-5">Registrar RFC</button>
                    </div>
                )}

                {view === 'guide-assignment' && !userPanelRfcRequired && GuideAssignmentUI.GuideAssignmentPanel && (
                    <GuideAssignmentUI.GuideAssignmentPanel
                        fbase={fbase}
                        appId={appId}
                        currentUser={sessionUser}
                        Icons={Icons}
                        steps={STEPS}
                        ensureAccountAllowed={ensureAccountAllowed}
                        onBack={() => setView('operator')}
                    />
                )}

                {view === 'login' && (
                    <EmailPasswordAuthUI.EmailPasswordLogin manager={authManager} onRegister={openRegisterUserModal} />
                )}
            </main>

            <PackagesGuidesUI.AssignmentsPasswordModal manager={packagesManager} />

            <UsersUI.RegisteredUserModal
                isOpen={showUserModal}
                editingRegisteredUserId={editingRegisteredUserId}
                userForm={userForm}
                setUserForm={setUserForm}
                userRegistrationSaving={userRegistrationSaving}
                onSubmit={registerUser}
                onClose={closeRegisteredUserModal}
            />
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
