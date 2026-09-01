import { AdminNewShipmentCard } from '../../new-shipment/new-shipment.js';
import {
  AdminHeader,
  ActiveShipmentsCard,
  EmailSettingsCard,
  PaymentSettingsCard,
  PendingTransfersCard,
  CompletedSalesCard,
  ProductsAdminPanel
} from './AdminPanelSections.js';

const h = globalThis.React?.createElement;

export function AdminPanel(props = {}) {
  if (!h) return null;
  const WalletUI = props.WalletUI || globalThis.DriveMxWalletUI || {};
  const CashbackUI = props.CashbackUI || globalThis.DriveMxCashback || {};
  const UsersUI = props.UsersUI || globalThis.DriveMxUsersUI || {};
  const AdsManager = props.AdsManager || globalThis.DriveMxAdsManager || {};
  const AdminAdsPanel = props.AdminAdsPanel || AdsManager.AdminAdsPanel;
  const CostoEnvio = globalThis.DriveMxCostoEnvio || {};

  return h('div', { className: 'w-full max-w-5xl space-y-8 animate-slide drive-mx-panel-control' },
    h(AdminHeader, {
      Icons: props.Icons,
      showAdminMenu: props.showAdminMenu,
      setShowAdminMenu: props.setShowAdminMenu,
      openAdminTracking: props.openAdminTracking,
      openAdminSupport: props.openAdminSupport
    }),
    h('div', { className: 'grid md:grid-cols-3 gap-8' },
      h(AdminNewShipmentCard, {
        fbase: props.fbase,
        appId: props.appId,
        currentUser: props.sessionUser,
        users: props.users,
        onCreated: props.onShipmentCreated || props.packagesManager?.onShipmentCreated
      }),
      h('div', { className: 'md:col-span-2 space-y-8' },
        h(ActiveShipmentsCard, {
          manager: props.packagesManager,
          pkgs: props.pkgs,
          deletePkg: props.deletePkg,
          findProductByTracking: props.findProductByTracking,
          Icons: props.Icons
        }),
        h(EmailSettingsCard, {
          emailSettings: props.emailSettings,
          setEmailSettings: props.setEmailSettings,
          saveEmailSettings: props.saveEmailSettings,
          emailSaving: props.emailSaving
        }),
        h(PaymentSettingsCard, {
          paymentSettings: props.paymentSettings,
          setPaymentSettings: props.setPaymentSettings,
          savePaymentSettings: props.savePaymentSettings,
          paymentSaving: props.paymentSaving
        }),
        props.StripeWallet?.AdminStripeSettingsCard ? h(props.StripeWallet.AdminStripeSettingsCard, {
          fbase: props.fbase,
          sessionUser: props.sessionUser
        }) : null,
        props.userProductsManager ? h('div', { className: 'card-glass overflow-hidden' },
          h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
            h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'RFC Panel de Control'),
            h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'RFC del administrador para la cuenta del Panel de Control')
          ),
          h('form', { onSubmit: props.userProductsManager.saveRfc || noop, className: 'p-6 grid md:grid-cols-[1fr_auto] gap-3 items-end' },
            h('div', null,
              h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'RFC del Panel de Control'),
              h('input', {
                required: true,
                maxLength: 20,
                autoCapitalize: 'characters',
                className: 'input-field',
                placeholder: 'RFC',
                value: props.userProductsManager.rfc || '',
                onChange: (event) => props.userProductsManager.setRfc?.(String(event.target.value || '').trim().toUpperCase().replace(/\s+/g, ''))
              })
            ),
            h('button', {
              disabled: props.userProductsManager.rfcSaving,
              type: 'submit',
              className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
            }, props.userProductsManager.rfcSaving ? 'Guardando...' : 'Guardar RFC')
          )
        ) : null,
        WalletUI.AdminCommissionSettings ? h(WalletUI.AdminCommissionSettings, {
          settings: props.walletSettings,
          value: props.walletSettings?.globalCommissionPercent,
          onChange: (value) => props.setWalletSettings?.((prev) => ({ ...prev, globalCommissionPercent: value })),
          minimumValue: props.walletSettings?.minimumFirstRecharge,
          onMinimumChange: (value) => props.setWalletSettings?.((prev) => ({ ...prev, minimumFirstRecharge: value })),
          onSubmit: props.saveWalletCommissionSettings,
          saving: props.walletSettingsSaving
        }) : null,
        CashbackUI.AdminCashbackSettings ? h(CashbackUI.AdminCashbackSettings, {
          settings: props.walletSettings,
          value: props.walletSettings?.globalCashbackAmount ?? CashbackUI.DEFAULT_AMOUNT ?? 10,
          onChange: (value) => props.setWalletSettings?.((prev) => ({ ...prev, globalCashbackAmount: value })),
          onSubmit: props.saveCashbackSettings,
          saving: props.cashbackSettingsSaving
        }) : null,
        WalletUI.AdminWalletsPanel ? h(WalletUI.AdminWalletsPanel, {
          users: props.users,
          wallets: props.wallets,
          recharges: props.walletRechargeRows,
          onApproveRecharge: props.approveWalletRechargeFromPanel,
          onDeleteRecharge: props.deleteWalletRechargeFromPanel,
          rechargeProcessingId: props.walletRechargeActionId
        }) : null,
        h(PendingTransfersCard, {
          pendingSalesTransfers: props.pendingSalesTransfers,
          sessionUser: props.sessionUser,
          transferTrackingDrafts: props.transferTrackingDrafts,
          setTransferTrackingDrafts: props.setTransferTrackingDrafts,
          assignTrackingToTransfer: props.assignTrackingToTransfer,
          markTransferPaid: props.markTransferPaid,
          deleteTransfer: props.deleteTransfer,
          orderSending: props.orderSending,
          productOptionsLines: props.productOptionsLines
        }),
        h(CompletedSalesCard, {
          completedSales: props.completedSales,
          deleteCompletedSale: props.deleteCompletedSale,
          normalizeProductSizes: props.normalizeProductSizes,
          normalizeProductColors: props.normalizeProductColors,
          Icons: props.Icons
        }),
        AdminAdsPanel ? h(AdminAdsPanel, {
          ads: props.ads,
          adsManager: AdsManager,
          firebaseSdk: props.fbase,
          appId: props.appId,
          currentUser: props.sessionUser
        }) : null,
        h(ProductsAdminPanel, {
          manager: props.adminProductsManager,
          Icons: props.Icons
        }),
        CostoEnvio.AdminShippingCostPanel ? h(CostoEnvio.AdminShippingCostPanel, {
          manager: props.adminProductsManager
        }) : null,
        UsersUI.RegisteredUsersPanel ? h(UsersUI.RegisteredUsersPanel, {
          users: props.users,
          page: props.registeredUsersPage,
          pageSize: props.REGISTERED_USERS_PAGE_SIZE,
          onPageChange: props.setRegisteredUsersPage,
          onEditUser: props.editRegisteredUser,
          onToggleBlocked: props.toggleUserBlocked,
          onDeleteUser: props.deleteUser,
          isUserBlocked: props.isUserBlocked,
          icons: props.Icons
        }) : null
      )
    )
  );
}
