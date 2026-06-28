import { AD_FALLBACK_TEXT, getActiveAds } from '../services/adsService.js';

const h = globalThis.React?.createElement;

function fileSizeLabel(size = 0) {
  const value = Number(size || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export function AdminAdsPanel(props = {}) {
  if (!h) return null;
  const React = globalThis.React;
  const manager = props.adsManager || globalThis.DriveMxAdsManager;
  const firebaseSdk = props.firebaseSdk || props.firebase || props.fbase;
  const ads = Array.isArray(props.ads) ? props.ads : [];
  const activeCount = getActiveAds(ads).length;
  const [pendingFiles, setPendingFiles] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [processingId, setProcessingId] = React.useState('');
  const [error, setError] = React.useState('');
  const pendingFilesRef = React.useRef(pendingFiles);

  React.useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  React.useEffect(() => () => {
    pendingFilesRef.current.forEach((item) => {
      try { globalThis.URL.revokeObjectURL(item.preview); } catch (err) {}
    });
  }, []);

  const selectFiles = (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file && String(file.type || '').startsWith('image/'));
    const next = files.map((file) => ({ file, preview: globalThis.URL.createObjectURL(file), id: `${Date.now()}_${Math.random().toString(36).slice(2)}` }));
    setPendingFiles((prev) => [...prev, ...next]);
    event.target.value = '';
    setError('');
  };

  const removePending = (targetId) => {
    setPendingFiles((prev) => prev.filter((item) => {
      if (item.id === targetId) {
        try { globalThis.URL.revokeObjectURL(item.preview); } catch (err) {}
        return false;
      }
      return true;
    }));
  };

  const uploadPending = async () => {
    if (!pendingFiles.length || uploading) return;
    if (!manager?.createAdFromFile || !firebaseSdk || !props.appId) {
      setError('No se encontró la configuración de Firebase para subir anuncios.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      for (const item of pendingFiles) {
        await manager.createAdFromFile({ fbase: firebaseSdk, appId: props.appId, file: item.file, currentUser: props.currentUser });
      }
      pendingFiles.forEach((item) => {
        try { globalThis.URL.revokeObjectURL(item.preview); } catch (err) {}
      });
      setPendingFiles([]);
    } catch (err) {
      console.error('Subir anuncio publicitario:', err);
      setError(err?.message || 'No se pudo subir el anuncio.');
    } finally {
      setUploading(false);
    }
  };

  const toggleAd = async (ad) => {
    if (!manager?.toggleAd || !firebaseSdk || !props.appId) return;
    const id = ad?.id || ad?.adId;
    setProcessingId(`toggle_${id}`);
    setError('');
    try {
      await manager.toggleAd({ fbase: firebaseSdk, appId: props.appId, ad, currentUser: props.currentUser });
    } catch (err) {
      console.error('Activar/desactivar anuncio:', err);
      setError(err?.message || 'No se pudo actualizar el anuncio.');
    } finally {
      setProcessingId('');
    }
  };

  const deleteAd = async (ad) => {
    if (!manager?.deleteAd || !firebaseSdk || !props.appId) return;
    if (!globalThis.confirm('¿Eliminar este anuncio publicitario?')) return;
    const id = ad?.id || ad?.adId;
    setProcessingId(`delete_${id}`);
    setError('');
    try {
      await manager.deleteAd({ fbase: firebaseSdk, appId: props.appId, ad });
    } catch (err) {
      console.error('Eliminar anuncio:', err);
      setError(err?.message || 'No se pudo eliminar el anuncio.');
    } finally {
      setProcessingId('');
    }
  };

  return h('div', { className: 'card-glass overflow-hidden drive-mx-admin-ads-panel' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3' },
      h('div', null,
        h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Publicidad'),
        h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Anuncios automáticos cada 4 publicaciones en Productos Drive MX')
      ),
      h('div', { className: 'flex flex-wrap gap-2' },
        h('span', { className: 'px-3 py-2 bg-white border border-slate-100 rounded-full text-[9px] font-black text-red-500 uppercase' }, `${activeCount} activos`),
        h('span', { className: 'px-3 py-2 bg-white border border-slate-100 rounded-full text-[9px] font-black text-slate-400 uppercase' }, `${ads.length} anuncios`)
      )
    ),

    h('div', { className: 'p-6 space-y-5' },
      h('label', { className: 'drive-mx-ad-upload bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 cursor-pointer hover:border-red-200 transition-all block' },
        h('input', { type: 'file', accept: 'image/*', multiple: true, className: 'hidden', onChange: selectFiles }),
        h('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3' },
          h('div', null,
            h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Subir imágenes desde galería'),
            h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase mt-1 leading-relaxed' }, 'Acepta cualquier orientación y resolución compatible; se mostrará sin deformarse')
          ),
          h('span', { className: 'px-3 py-2 bg-white rounded-xl text-[9px] font-black text-slate-400 uppercase' }, 'Seleccionar anuncios')
        )
      ),

      pendingFiles.length > 0 ? h('div', { className: 'space-y-3' },
        h('div', { className: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-3' },
          pendingFiles.map((item) => h('div', { key: item.id, className: 'rounded-2xl border border-slate-100 bg-white overflow-hidden' },
            h('div', { className: 'drive-mx-ad-preview bg-slate-50' },
              h('img', { src: item.preview, alt: item.file.name, className: 'drive-mx-ad-preview-image' })
            ),
            h('div', { className: 'p-3 flex items-start justify-between gap-3' },
              h('div', { className: 'min-w-0' },
                h('p', { className: 'text-[10px] font-black text-slate-700 truncate' }, item.file.name),
                h('p', { className: 'text-[8px] font-black text-slate-300 uppercase' }, fileSizeLabel(item.file.size))
              ),
              h('button', { type: 'button', onClick: () => removePending(item.id), className: 'px-2 py-1 rounded-lg bg-red-50 text-red-500 text-[8px] font-black uppercase' }, 'Quitar')
            )
          ))
        ),
        h('button', { type: 'button', disabled: uploading, onClick: uploadPending, className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, uploading ? 'Subiendo...' : `Subir ${pendingFiles.length} anuncio${pendingFiles.length === 1 ? '' : 's'}`)
      ) : null,

      error ? h('p', { className: 'text-[10px] font-black text-red-500 uppercase tracking-widest' }, error) : null,

      h('div', { className: 'drive-mx-ad-fallback drive-mx-ad-fallback-panel' }, AD_FALLBACK_TEXT),

      h('div', { className: 'overflow-x-auto' },
        h('table', { className: 'w-full text-left' },
          h('thead', { className: 'bg-white border-b border-slate-50' },
            h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
              h('th', { className: 'px-6 py-3' }, 'Vista'),
              h('th', { className: 'px-6 py-3' }, 'Archivo'),
              h('th', { className: 'px-6 py-3' }, 'Estado'),
              h('th', { className: 'px-6 py-3' }, 'Actualización'),
              h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
            )
          ),
          h('tbody', { className: 'divide-y divide-slate-50' },
            ads.map((ad) => {
              const id = ad.id || ad.adId;
              const disabled = processingId.endsWith(`_${id}`);
              return h('tr', { key: id, className: 'text-[10px] font-bold text-slate-600 align-top' },
                h('td', { className: 'px-6 py-4' },
                  h('div', { className: 'w-28 h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center' },
                    ad.imageUrl ? h('img', { src: ad.imageUrl, alt: ad.fileName || 'Anuncio', className: 'w-full h-full object-contain' }) : h('span', { className: 'text-[8px] font-black text-slate-300 uppercase' }, 'Sin imagen')
                  )
                ),
                h('td', { className: 'px-6 py-4' },
                  h('p', { className: 'font-black text-slate-800 break-anywhere' }, ad.fileName || 'Anuncio'),
                  h('p', { className: 'font-mono text-[8px] text-slate-400 break-anywhere' }, id)
                ),
                h('td', { className: 'px-6 py-4' },
                  h('span', { className: `px-2 py-1 rounded-full text-[8px] uppercase ${ad.active !== false ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}` }, ad.active !== false ? 'Activo' : 'Inactivo')
                ),
                h('td', { className: 'px-6 py-4' }, ad.updatedAt ? new Date(ad.updatedAt).toLocaleString('es-MX') : '-'),
                h('td', { className: 'px-6 py-4 text-right' },
                  h('div', { className: 'flex justify-end gap-2 flex-wrap' },
                    h('button', { type: 'button', disabled, onClick: () => toggleAd(ad), className: 'px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase disabled:opacity-50' }, ad.active !== false ? 'Desactivar' : 'Activar'),
                    h('button', { type: 'button', disabled, onClick: () => deleteAd(ad), className: 'px-2 py-1 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-[8px] font-black uppercase disabled:opacity-50' }, 'Eliminar')
                  )
                )
              );
            }),
            ads.length === 0 ? h('tr', null,
              h('td', { colSpan: '5', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay anuncios registrados')
            ) : null
          )
        )
      )
    )
  );
}
