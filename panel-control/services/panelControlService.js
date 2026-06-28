export function normalizeGuideId(value = '') {
  return String(value || '').toUpperCase().trim();
}

export function buildPackageFromPanelForm(form = {}) {
  return {
    ...form,
    id: normalizeGuideId(form.id),
    status: 'Recolectado',
    currentStep: 0
  };
}

export function createEmptyPackageForm() {
  return { id: '', o: '', d: '', op: '', productId: '' };
}
