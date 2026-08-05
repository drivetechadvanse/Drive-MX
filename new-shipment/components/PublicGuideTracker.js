import { findGuideByCode, normalizeGuideCode } from '../services/newShipmentService.js';

const h = globalThis.React?.createElement;
const useState = globalThis.React?.useState;
const DEFAULT_STEPS = ['Recolectado', 'Procesando', 'En Camino', 'Entregado'];

function getTrackingStepIndex(pkg = {}, steps = DEFAULT_STEPS) {
  const current = Number(pkg.currentStep);
  if (Number.isFinite(current)) return Math.max(0, Math.min(steps.length - 1, current));
  const status = String(pkg.status || '').toLowerCase();
  if (status.includes('entregado')) return 3;
  if (status.includes('camino')) return 2;
  if (status.includes('proces')) return 1;
  return 0;
}

function trackingStepLabel(step = '') {
  return step === 'Procesando' ? 'Procesado' : step;
}

export function TrackingStatusCard(props = {}) {
  if (!h) return null;
  const pkg = props.pkg || {};
  const steps = Array.isArray(props.steps) && props.steps.length ? props.steps : DEFAULT_STEPS;
  const activeIndex = getTrackingStepIndex(pkg, steps);
  const customer = pkg.customer || {};
  const fullName = pkg.fullName || customer.fullName || 'Nombre no registrado';
  const phone = pkg.phone || customer.phone || 'Teléfono no registrado';

  return h('div', { className: 'card-glass p-6 max-w-3xl mx-auto animate-slide space-y-5' },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3' },
      h('div', null,
        h('p', { className: 'text-[9px] font-black text-slate-400 uppercase mb-1' }, 'Número de guía'),
        h('h2', { className: 'text-3xl font-black text-red-600' }, `#${pkg.id || pkg.trackingNumber || ''}`)
      ),
      h('span', { className: 'px-3 py-2 bg-red-50 text-red-600 rounded-full text-[9px] font-black uppercase tracking-widest self-start' }, trackingStepLabel(pkg.status || steps[activeIndex]))
    ),
    h('div', { className: 'bg-slate-50 rounded-2xl p-4 grid sm:grid-cols-2 gap-4' },
      h('div', null,
        h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Nombre completo'),
        h('p', { className: 'text-sm font-black text-slate-900 uppercase break-anywhere' }, fullName)
      ),
      h('div', null,
        h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Número de teléfono'),
        h('p', { className: 'text-sm font-black text-slate-900 break-anywhere' }, phone)
      ),
      h('div', null,
        h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Origen'),
        h('p', { className: 'text-sm font-black text-slate-900 uppercase break-anywhere' }, pkg.o || 'Origen pendiente')
      ),
      h('div', null,
        h('p', { className: 'text-[8px] font-black text-slate-400 uppercase' }, 'Destino'),
        h('p', { className: 'text-sm font-black text-slate-900 uppercase break-anywhere' }, pkg.d || 'Destino pendiente')
      )
    ),
    h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-2' },
      steps.map((step, index) => h('div', {
        key: step,
        className: `p-3 rounded-xl border-2 text-center ${index <= activeIndex ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-100 text-slate-300'}`
      }, h('p', { className: 'text-[9px] font-black uppercase' }, trackingStepLabel(step))))
    ),
    h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase text-center' }, 'La información se actualiza cuando cambia el estado del envío.')
  );
}

export function PublicGuideTracker(props = {}) {
  if (!h || !useState) return null;
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const runSearch = async () => {
    const code = normalizeGuideCode(query);
    if (!code) {
      setResult(null);
      setNotFound(false);
      setErrorMessage('');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const found = await findGuideByCode({
        fbase: props.fbase,
        appId: props.appId,
        guideCode: code
      });
      setResult(found);
      setNotFound(!found);
    } catch (error) {
      console.error('Consultar guía:', error);
      setResult(null);
      setNotFound(false);
      setErrorMessage('No se pudo consultar la guía. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const value = event.target.value.toUpperCase();
    setQuery(value);
    if (!value.trim()) {
      setResult(null);
      setNotFound(false);
      setErrorMessage('');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  };

  return h('section', { className: 'card-glass p-6 max-w-3xl mx-auto space-y-4' },
    h('div', { className: 'text-center' },
      h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Consultar número de guía'),
      h('h2', { className: 'text-2xl font-black tracking-tight' }, 'Rastrea tu envío'),
      h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1' }, 'Origen, destino y estado actualizado por el usuario')
    ),
    h('div', { className: 'bg-slate-50 p-2 rounded-2xl border-2 border-slate-100 flex gap-2' },
      h('input', {
        className: 'flex-grow bg-transparent px-4 text-sm font-bold uppercase outline-none min-w-0',
        placeholder: 'INGRESA TU NÚMERO DE GUÍA',
        value: query,
        onChange: handleChange,
        onKeyDown: handleKeyDown,
        maxLength: 40
      }),
      h('button', {
        type: 'button',
        onClick: runSearch,
        disabled: loading,
        className: 'btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
      }, loading ? 'Consultando...' : 'Consultar')
    ),
    errorMessage ? h('p', { className: 'text-center text-[10px] font-black text-red-500 uppercase tracking-widest' }, errorMessage) : null,
    notFound ? h('p', { className: 'text-center text-[10px] font-black text-red-500 uppercase tracking-widest' }, 'No se encontró la guía') : null,
    !result && !notFound && !errorMessage ? h('p', { className: 'text-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Ingresa el número de guía registrado en Nuevo Envío') : null,
    result ? h(TrackingStatusCard, { pkg: result, steps: props.steps }) : null
  );
}
