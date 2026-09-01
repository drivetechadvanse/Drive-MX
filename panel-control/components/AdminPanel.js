import {
  AdminHeader,
  EmailSettingsCard,
  PaymentSettingsCard,
  PendingTransfersCard,
  CompletedSalesCard,
  ActiveShipmentsCard,
  ProductsAdminPanel
} from './AdminPanelSections.js';

const h = globalThis.React?.createElement;
const noop = () => {};

function CashbackSettingsCard(props = {}) {
  if (!h) return null;
  const settings = props.walletSettings || {};
  const setWalletSettings = props.setWalletSettings || noop;
  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Configuración de Cash Back'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Monto global regresado al usuario por cada compra pagada con cartera')
    ),
    h('form', { onSubmit: props.saveCashbackSettings || noop, className: 'p-6 grid md:grid-cols-[1fr_auto] gap-3 items-end' },
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Cash Back por compra (MXN)'),
        h('input', {
          required: true,
          type: 'number',
          min: '0',
          step: '0.01',
          className: 'input-field',
          value: settings.globalCashbackAmount ?? 0,
          onChange: (event) => setWalletSettings({ ...settings, globalCashbackAmount: event.target.value })
        })
      ),
      h('button', {
        disabled: props.cashbackSettingsSaving,
        type: 'submit',
        className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
      }, props.cashbackSettingsSaving ? 'Guardando...' : 'Guardar Cash Back')
    )
  );
}

export function AdminPanel(props = {}) {
  if (!h) return null;

  const WalletUI = props.WalletUI || globalThis.DriveMxWalletUI || {};
  const StripeWallet = props.StripeWallet || globalThis.DriveMxStripeWallet || {};
  const UsersUI = props.UsersUI || globalThis.DriveMxUsersUI || {};
  const AdsManager = props.AdsManager || globalThis.DriveMxAdsManager || {};
  const ProductsCore = globalThis.DriveMxProductsCore || {};

  const sections = [];
  sections.push(h(AdminHeader, { key: 'header', ...props }));
  sections.push(h(EmailSettingsCard, { key: 'email', ...props }));
  sections.push(h(PaymentSettingsCard, { key: 'payment', ...props }));

  if (typeof StripeWallet.AdminStripeSettingsCard === 'function') {
    sections.push(h(StripeWallet.AdminStripeSettingsCard, {
      key: 'stripe',
      fbase: props.fbase,
      sessionUser: props.sessionUser
    }));
  }

  if (typeof WalletUI.AdminCommissionSettings === 'function') {
    sections.push(h(WalletUI.AdminCommissionSettings, {
      key: 'commission',
      settings: props.walletSettings,
      value: props.walletSettings?.globalCommissionPercent ?? '',
      minimumValue: props.walletSettings?.minimumFirstRecharge ?? '',
      onChange: (value) => props.setWalletSettings?.({ ...props.walletSettings, globalCommissionPercent: value }),
      onMinimumChange: (value) => props.setWalletSettings?.({ ...props.walletSettings, minimumFirstRecharge: value }),
      onSubmit: props.saveWalletCommissionSettings,
      saving: props.walletSettingsSaving
    }));
  }

  sections.push(h(CashbackSettingsCard, { key: 'cashback', ...props }));

  if (typeof WalletUI.AdminWalletsPanel === 'function') {
    sections.push(h(WalletUI.AdminWalletsPanel, {
      key: 'wallets',
      users: props.users,
      wallets: props.wallets,
      recharges: props.walletRechargeRows,
      onApproveRecharge: props.approveWalletRechargeFromPanel,
      onDeleteRecharge: props.deleteWalletRechargeFromPanel,
      rechargeProcessingId: props.walletRechargeActionId
    }));
  }

  sections.push(h(PendingTransfersCard, {
    key: 'pending-transfers',
    ...props
  }));

  sections.push(h(CompletedSalesCard, {
    key: 'completed-sales',
    ...props,
    normalizeProductSizes: ProductsCore.normalizeProductSizes,
    normalizeProductColors: ProductsCore.normalizeProductColors
  }));

  sections.push(h(ActiveShipmentsCard, {
    key: 'shipments',
    manager: props.packagesManager,
    Icons: props.Icons
  }));

  if (typeof AdsManager.AdminAdsPanel === 'function') {
    sections.push(h(AdsManager.AdminAdsPanel, {
      key: 'ads',
      adsManager: AdsManager,
      ads: props.ads,
      firebaseSdk: props.fbase,
      appId: props.appId,
      currentUser: props.sessionUser
    }));
  }

  sections.push(h(ProductsAdminPanel, {
    key: 'products',
    manager: props.adminProductsManager,
    Icons: props.Icons
  }));

  if (typeof UsersUI.RegisteredUsersPanel === 'function') {
    sections.push(h(UsersUI.RegisteredUsersPanel, {
      key: 'users',
      users: props.users,
      page: props.registeredUsersPage,
      pageSize: props.REGISTERED_USERS_PAGE_SIZE,
      onPageChange: props.setRegisteredUsersPage,
      onEditUser: props.editRegisteredUser,
      onToggleBlocked: props.toggleUserBlocked,
      onDeleteUser: props.deleteUser,
      isUserBlocked: props.isUserBlocked,
      icons: props.Icons
    }));
  }

  return h('div', {
    className: 'w-full max-w-7xl py-6 space-y-6 animate-slide drive-mx-admin-panel'
  }, ...sections.filter(Boolean));
}
