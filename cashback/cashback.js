(function attachDriveMxCashback(global) {
  'use strict';

  const DEFAULT_AMOUNT = 10;
  const MAX_AMOUNT = 1000000;

  const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

  function normalizeAmount(value, fallback = DEFAULT_AMOUNT) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      return roundMoney(fallback);
    }
    return roundMoney(amount);
  }

  function normalizeSettings(settings = {}) {
    return {
      ...settings,
      globalCashbackAmount: normalizeAmount(
        settings.globalCashbackAmount ?? settings.cashbackAmount ?? settings.cashBackAmount,
        DEFAULT_AMOUNT
      )
    };
  }

  function formatMoney(value) {
    return `$${normalizeAmount(value, 0).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} MXN`;
  }

  function createUI(React) {
    if (!React) return {};
    const h = React.createElement;

    function AdminCashbackSettings(props = {}) {
      const value = props.value ?? props.settings?.globalCashbackAmount ?? DEFAULT_AMOUNT;
      return h('div', { className: 'card-glass overflow-hidden drive-mx-cashback-card' },
        h('div', { className: 'drive-mx-cashback-card__header' },
          h('div', null,
            h('p', { className: 'drive-mx-cashback-card__eyebrow' }, 'Cartera'),
            h('h2', { className: 'drive-mx-cashback-card__title' }, 'Cash Back'),
            h('p', { className: 'drive-mx-cashback-card__description' },
              'Cantidad global que se devuelve automáticamente a la cartera después de cada compra pagada con saldo.'
            )
          ),
          h('div', { className: 'drive-mx-cashback-card__amount' }, formatMoney(value))
        ),
        h('form', { onSubmit: props.onSubmit, className: 'drive-mx-cashback-card__form' },
          h('label', { className: 'drive-mx-cashback-card__label' },
            h('span', null, 'Cantidad global por compra'),
            h('div', { className: 'drive-mx-cashback-card__input-wrap' },
              h('span', { 'aria-hidden': 'true' }, '$'),
              h('input', {
                type: 'number',
                min: '0',
                max: String(MAX_AMOUNT),
                step: '0.01',
                inputMode: 'decimal',
                value,
                onChange: (event) => props.onChange?.(event.target.value),
                className: 'drive-mx-cashback-card__input',
                'aria-label': 'Cantidad global de Cash Back'
              }),
              h('span', null, 'MXN')
            )
          ),
          h('p', { className: 'drive-mx-cashback-card__hint' }, 'El valor inicial global es de $10.00 MXN.'),
          h('button', {
            type: 'submit',
            disabled: Boolean(props.saving),
            className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed drive-mx-cashback-card__button'
          }, props.saving ? 'Guardando...' : 'Guardar Cash Back')
        )
      );
    }

    return { AdminCashbackSettings };
  }

  const api = {
    DEFAULT_AMOUNT,
    MAX_AMOUNT,
    roundMoney,
    normalizeAmount,
    normalizeSettings,
    formatMoney,
    ...createUI(global.React)
  };

  global.DriveMxCashback = api;
})(window);

