(function (global) {
  'use strict';

  const React = global.React;
  const h = React?.createElement;

  function injectStyles() {
    const id = 'drive-mx-support-stylesheet';
    if (!global.document || global.document.getElementById(id)) return;
    const script = global.document.currentScript;
    const link = global.document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = script?.src ? new URL('./support.css', script.src).href : './support/support.css';
    global.document.head.appendChild(link);
  }

  function chatId(chat = {}) {
    return String(chat?.id || chat?.chatId || '');
  }

  function findSelectedChats(chats = [], activeChatId = '') {
    const list = Array.isArray(chats) ? chats.filter(Boolean) : [];
    const active = list.find((chat) => chatId(chat) === String(activeChatId || '')) || null;
    const adminSelected = active || list.find((chat) => chat?.status === 'open') || list[0] || null;
    return { list, active, adminSelected };
  }

  function renderIcon(Icon, props = {}, fallback = '') {
    return typeof Icon === 'function' ? h(Icon, props) : fallback;
  }

  function SupportPanel(props = {}) {
    if (!h) return null;
    const isAdmin = props.view === 'admin-support' || props.mode === 'admin';
    const Icons = props.Icons || {};
    const selected = findSelectedChats(props.supportChats, props.activeSupportChatId);
    const currentChat = isAdmin ? selected.adminSelected : selected.active;
    const messages = Array.isArray(currentChat?.messages) ? currentChat.messages : [];
    const isClosed = currentChat?.status === 'closed';
    const senderRole = isAdmin ? 'admin' : 'user';

    return h('div', { className: 'w-full max-w-5xl py-8 animate-slide drive-mx-support' },
      h('button', {
        type: 'button',
        onClick: props.onBack,
        className: 'mb-5 text-[10px] font-black uppercase text-slate-400 hover:text-red-500'
      }, '← Volver'),
      h('div', { className: 'drive-mx-support-card card-glass overflow-hidden grid md:grid-cols-[280px_1fr]' },
        isAdmin ? h('aside', { className: 'drive-mx-support-sidebar border-r border-slate-100 bg-slate-50 p-4 space-y-3' },
          h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Chats de soporte'),
          h('div', { className: 'drive-mx-support-sidebar-list space-y-2 max-h-[540px] overflow-y-auto pr-1' },
            selected.list.map((chat) => {
              const id = chatId(chat);
              const isActive = id === String(props.activeSupportChatId || '');
              return h('article', {
                key: id,
                className: `w-full p-3 rounded-2xl border text-[10px] font-bold ${isActive ? 'bg-white border-red-200' : 'bg-white/70 border-slate-100'}`
              },
                h('button', {
                  type: 'button',
                  onClick: () => props.onSelectChat?.(id),
                  className: 'w-full text-left'
                },
                  h('p', { className: 'drive-mx-support-user-label font-black text-slate-800' }, chat?.userEmail || chat?.userId || 'Usuario'),
                  h('p', { className: `mt-1 uppercase text-[8px] font-black ${chat?.status === 'closed' ? 'text-slate-300' : 'text-green-600'}` }, chat?.status === 'closed' ? 'Cerrado' : 'Activo')
                ),
                h('button', {
                  type: 'button',
                  onClick: (event) => {
                    event.stopPropagation();
                    props.onDeleteChat?.(chat);
                  },
                  className: 'mt-2 w-full px-2 py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white text-[8px] font-black uppercase flex items-center justify-center gap-1'
                }, renderIcon(Icons.Trash, { size: 11 }, '×'), ' Eliminar')
              );
            }),
            selected.list.length === 0
              ? h('p', { className: 'text-[10px] font-bold text-slate-300 uppercase text-center py-8' }, 'Sin chats todavía')
              : null
          )
        ) : null,

        h('section', { className: `${isAdmin ? '' : 'md:col-span-2'} drive-mx-support-chat flex flex-col bg-white` },
          h('header', { className: 'drive-mx-support-header px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3' },
            h('div', null,
              h('p', { className: 'text-[10px] text-red-500 font-black uppercase tracking-widest' }, 'Soporte Técnico'),
              h('h1', { className: 'text-2xl font-black tracking-tight' }, 'Chat interno')
            ),
            isAdmin && selected.adminSelected
              ? h('div', { className: 'drive-mx-support-admin-actions flex items-center gap-2' },
                  selected.adminSelected?.status !== 'closed'
                    ? h('button', {
                        type: 'button',
                        onClick: () => props.onCloseChat?.(selected.adminSelected),
                        className: 'px-3 py-2 bg-green-50 text-green-600 rounded-xl text-[8px] font-black uppercase'
                      }, 'Solucionado')
                    : null,
                  h('button', {
                    type: 'button',
                    onClick: () => props.onDeleteChat?.(selected.adminSelected),
                    className: 'px-3 py-2 bg-red-50 text-red-500 rounded-xl text-[8px] font-black uppercase flex items-center gap-1'
                  }, renderIcon(Icons.Trash, { size: 11 }, '×'), ' Eliminar')
                )
              : null
          ),

          h('div', { className: 'drive-mx-support-messages flex-1 p-5 bg-slate-50 overflow-y-auto space-y-3 max-h-[460px]', 'aria-live': 'polite' },
            messages.map((message) => h('div', {
              key: message?.id,
              className: `flex ${message?.sender === 'admin' ? 'justify-end' : 'justify-start'}`
            },
              h('div', { className: `max-w-[78%] rounded-2xl px-4 py-3 text-sm font-semibold ${message?.sender === 'admin' ? 'bg-red-500 text-white rounded-br-sm' : 'bg-white text-slate-700 rounded-bl-sm border border-slate-100'}` },
                h('p', { className: 'drive-mx-support-message-text' }, message?.text || ''),
                h('p', { className: `text-[8px] font-black uppercase mt-2 ${message?.sender === 'admin' ? 'text-red-100' : 'text-slate-300'}` }, `${message?.senderName || ''}${message?.createdAt ? ` · ${new Date(message.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}`)
              )
            )),
            messages.length === 0
              ? h('div', { className: 'h-full min-h-[14rem] flex items-center justify-center text-center text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Escribe un mensaje para iniciar soporte')
              : null,
            isClosed
              ? h('p', { className: 'text-center text-[10px] font-black text-slate-400 uppercase' }, 'Conversación cerrada')
              : null
          ),

          h('div', { className: 'drive-mx-support-compose p-4 border-t border-slate-100 flex gap-2' },
            h('input', {
              disabled: isClosed,
              className: 'input-field',
              placeholder: 'Escribe tu mensaje...',
              value: props.supportInput || '',
              onChange: (event) => props.onInputChange?.(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  props.onSendMessage?.(senderRole);
                }
              }
            }),
            h('button', {
              type: 'button',
              disabled: isClosed,
              onClick: () => props.onSendMessage?.(senderRole),
              className: 'btn-primary disabled:opacity-50'
            }, renderIcon(Icons.Send, {}, '➤'), ' Enviar')
          )
        )
      )
    );
  }

  injectStyles();

  global.DriveMxSupport = {
    chatId,
    findSelectedChats,
    SupportPanel
  };
})(window);
