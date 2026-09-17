/* Arrastar e soltar com Pointer Events (mouse e toque), com rolagem automática. */
window.RH = window.RH || {};

RH.dnd = {
  // onDrop(item, toIndex) recebe o índice final entre os itens (sem contar o arrastado).
  sortable(list, { itemSelector, handleSelector, onDrop, onStart, onEnd }) {
    let drag = null;

    const items = () => Array.from(list.querySelectorAll(itemSelector));

    const preventTouch = (e) => { if (drag) e.preventDefault(); };

    const viewportHeight = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);

    // Anima os vizinhos quando o espaço reservado muda de lugar (técnica FLIP).
    const flip = (mutate) => {
      const others = items().filter((el) => el !== drag.item);
      const before = new Map(others.map((el) => [el, el.getBoundingClientRect().top]));
      mutate();
      for (const el of others) {
        const delta = before.get(el) - el.getBoundingClientRect().top;
        if (!delta) continue;
        el.classList.remove('flip-move');
        el.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => {
          el.classList.add('flip-move');
          el.style.transform = '';
        });
      }
    };

    const placeHolderIndex = () => {
      let index = 0;
      for (const child of list.children) {
        if (child === drag.placeholder) return index;
        if (child !== drag.item && child.matches(itemSelector)) index++;
      }
      return index;
    };

    const reposition = () => {
      const { lastY } = drag;
      drag.item.style.top = `${drag.startTop + (lastY - drag.startY)}px`;
      const others = items().filter((el) => el !== drag.item);
      let target = null;
      for (const el of others) {
        const r = el.getBoundingClientRect();
        if (lastY < r.top + r.height / 2) { target = el; break; }
      }
      const current = drag.placeholder.nextElementSibling === drag.item
        ? drag.item.nextElementSibling
        : drag.placeholder.nextElementSibling;
      if (target !== current) flip(() => list.insertBefore(drag.placeholder, target));
    };

    const tick = () => {
      if (!drag) return;
      const edge = 70;
      const h = viewportHeight();
      const bottomBar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h')) || 0;
      let speed = 0;
      if (drag.lastY < edge + 60) speed = -Math.ceil((edge + 60 - drag.lastY) / 6);
      else if (drag.lastY > h - bottomBar - edge) speed = Math.ceil((drag.lastY - (h - bottomBar - edge)) / 6);
      if (speed) {
        window.scrollBy(0, speed);
        reposition();
      }
      drag.raf = requestAnimationFrame(tick);
    };

    const cleanup = (commit) => {
      if (!drag) return;
      const { item, placeholder, handle, pointerId, fromIndex } = drag;
      cancelAnimationFrame(drag.raf);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      handle.removeEventListener('lostpointercapture', onLost);
      window.removeEventListener('touchmove', preventTouch);
      try { handle.releasePointerCapture(pointerId); } catch { /* já liberado */ }
      const toIndex = placeHolderIndex();
      item.classList.remove('is-dragging');
      item.style.position = '';
      item.style.top = '';
      item.style.left = '';
      item.style.width = '';
      if (commit) {
        list.insertBefore(item, placeholder);
      } else {
        const rest = items().filter((el) => el !== item);
        list.insertBefore(item, rest[fromIndex] || placeholder);
      }
      placeholder.remove();
      drag = null;
      // o clique que vem logo depois de soltar não deve abrir nada
      const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (onEnd) onEnd(item);
      if (commit && toIndex !== fromIndex && onDrop) onDrop(item, toIndex);
    };

    function onMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag.lastY = e.clientY;
      reposition();
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      cleanup(true);
    }

    function onCancel() { cleanup(false); }

    function onLost() { if (drag) cleanup(true); }

    list.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest(handleSelector);
      if (!handle || !list.contains(handle) || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const item = handle.closest(itemSelector);
      if (!item) return;
      e.preventDefault();
      const rect = item.getBoundingClientRect();
      const placeholder = document.createElement(item.tagName);
      placeholder.className = 'sl-placeholder';
      placeholder.style.height = `${rect.height}px`;
      const fromIndex = items().indexOf(item);
      drag = { item, handle, placeholder, pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY, startTop: rect.top, fromIndex, raf: 0 };
      list.insertBefore(placeholder, item);
      item.classList.add('is-dragging');
      item.style.position = 'fixed';
      item.style.top = `${rect.top}px`;
      item.style.left = `${rect.left}px`;
      item.style.width = `${rect.width}px`;
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onCancel);
      handle.addEventListener('lostpointercapture', onLost);
      window.addEventListener('touchmove', preventTouch, { passive: false });
      if (onStart) onStart(item);
      drag.raf = requestAnimationFrame(tick);
    });

    return { isDragging: () => !!drag };
  },
};
