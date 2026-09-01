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
  const setWalletSettings = typeof props.setWalletSettings === 'function' ? props.setWalletSettings : noop;
  const amount = settings.globalCashbackAmount ?? 10;

  return h('div', { className: 'card-glass overflow-hidden', id: 'admin-cashback-settings' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Configuración de Cash Back'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Cantidad global que se regresa al usuario después de una compra pagada con cartera')
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
          placeholder: 'Ej. 10',
          value: amount,
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

  const WalletUI = props.WalletUI || {};
  const StripeWallet = props.StripeWallet || {};
  const UsersUI = props.UsersUI || {};
  const AdsManager = props.AdsManager || {};

  const cards = [];

  cards.push(h(AdminHeader, { key: 'header', ...props }));
  cards.push(h(EmailSettingsCard, { key: 'email', ...props }));
  cards.push(h(PaymentSettingsCard, { key: 'payments', ...props }));

  if (typeof WalletUI.AdminCommissionSettings === 'function') {
    cards.push(h(WalletUI.AdminCommissionSettings, {
      key: 'wallet-commission',
      settings: props.walletSettings,
      value: props.walletSettings?.globalCommissionPercent,
      minimumValue: props.walletSettings?.minimumFirstRecharge,
      saving: props.walletSettingsSaving,
      onChange: (value) => props.setWalletSettings?.({ ...props.walletSettings, globalCommissionPercent: value }),
      onMinimumChange: (value) => props.setWalletSettings?.({ ...props.walletSettings, minimumFirstRecharge: value }),
      onSubmit: props.saveWalletCommissionSettings || noop
    }));
  }

  cards.push(h(CashbackSettingsCard, { key: 'cashback', ...props }));

  if (typeof StripeWallet.AdminStripeSettingsCard === 'function') {
    cards.push(h(StripeWallet.AdminStripeSettingsCard, {
      key: 'stripe-wallet',
      fbase: props.fbase,
      sessionUser: props.sessionUser
    }));
  }

  if (typeof WalletUI.AdminWalletsPanel === 'function') {
    cards.push(h(WalletUI.AdminWalletsPanel, {
      key: 'wallets',
      users: props.users,
      wallets: props.wallets,
      recharges: props.walletRechargeRows,
      onApproveRecharge: props.approveWalletRechargeFromPanel,
      onDeleteRecharge: props.deleteWalletRechargeFromPanel,
      rechargeProcessingId: props.walletRechargeActionId
    }));
  }

  cards.push(h(PendingTransfersCard, { key: 'pending-transfers', ...props }));
  cards.push(h(CompletedSalesCard, { key: 'completed-sales', ...props }));
  cards.push(h(ActiveShipmentsCard, { key: 'active-shipments', ...props, manager: props.packagesManager }));

  if (typeof AdsManager.AdminAdsPanel === 'function') {
    cards.push(h(AdsManager.AdminAdsPanel, {
      key: 'ads',
      adsManager: AdsManager,
      ads: props.ads,
      fbase: props.fbase,
      appId: props.appId,
      currentUser: props.sessionUser
    }));
  }

  cards.push(h(ProductsAdminPanel, { key: 'products', manager: props.adminProductsManager, Icons: props.Icons }));

  if (typeof UsersUI.RegisteredUsersPanel === 'function') {
    cards.push(h(UsersUI.RegisteredUsersPanel, {
      key: 'registered-users',
      users: props.users,
      page: props.registeredUsersPage,
      pageSize: props.REGISTERED_USERS_PAGE_SIZE,
      icons: props.Icons,
      onPageChange: props.setRegisteredUsersPage,
      onEditUser: props.editRegisteredUser,
      onToggleBlocked: props.toggleUserBlocked,
      onDeleteUser: props.deleteUser,
      isUserBlocked: props.isUserBlocked
    }));
  }

  return h('div', { className: 'space-y-6 pb-10' }, ...cards);
}

