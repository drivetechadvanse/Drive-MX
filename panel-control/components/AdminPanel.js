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
  const UsersUI = props.UsersUI || globalThis.DriveMxUsersUI || {};
  const AdsManager = props.AdsManager || globalThis.DriveMxAdsManager || {};
  const AdminAdsPanel = props.AdminAdsPanel || AdsManager.AdminAdsPanel;

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
        onCreated: props.onShipmentCreated
      }),
      h('div', { className: 'md:col-span-2 space-y-8' },
        h(ActiveShipmentsCard, {
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
        WalletUI.AdminCommissionSettings ? h(WalletUI.AdminCommissionSettings, {
          settings: props.walletSettings,
          value: props.walletSettings?.globalCommissionPercent,
          onChange: (value) => props.setWalletSettings?.((prev) => ({ ...prev, globalCommissionPercent: value })),
          minimumValue: props.walletSettings?.minimumFirstRecharge,
          onMinimumChange: (value) => props.setWalletSettings?.((prev) => ({ ...prev, minimumFirstRecharge: value })),
          onSubmit: props.saveWalletCommissionSettings,
          saving: props.walletSettingsSaving
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
          Icons: props.Icons,
          editingProductId: props.editingProductId,
          resetProductForm: props.resetProductForm,
          handleProductSubmit: props.handleProductSubmit,
          handleProductImagesSelect: props.handleProductImagesSelect,
          productForm: props.productForm,
          setProductForm: props.setProductForm,
          productImageFiles: props.productImageFiles,
          replaceExistingProductImage: props.replaceExistingProductImage,
          removeExistingProductImage: props.removeExistingProductImage,
          removeNewProductImage: props.removeNewProductImage,
          PRODUCT_SIZE_OPTIONS: props.PRODUCT_SIZE_OPTIONS,
          normalizeProductSizes: props.normalizeProductSizes,
          normalizeProductColors: props.normalizeProductColors,
          productUploading: props.productUploading,
          controlProducts: props.controlProducts,
          getProductGallery: props.getProductGallery,
          editProduct: props.editProduct,
          toggleProduct: props.toggleProduct,
          deleteProduct: props.deleteProduct
        }),
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
          
