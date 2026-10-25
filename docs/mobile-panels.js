/* Non-modal map overview: half-height, expanded, and swipe-down dismissal. */
(() => {
  const sheet = document.getElementById('sidebar');
  const handle = document.getElementById('sheet-handle');
  const mobile = matchMedia('(max-width: 999px)');

  let expanded = false;
  let drag = null;
  let suppressClick = false;

  const bounds = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    return { half: height * 0.5, full: height };
  };

  function setHeight(height) {
    sheet.style.setProperty('--sheet-height', `${height}px`);
    sheet.classList.toggle(
      'sheet-expanded',
      height >= bounds().full - 1
    );
  }

  function snap(full) {
    expanded = full;
    sheet.classList.remove('sheet-dragging');
    setHeight(full ? bounds().full : bounds().half);

    handle.setAttribute('aria-expanded', String(full));
    handle.setAttribute(
      'aria-label',
      full ? 'Collapse place overview' : 'Expand place overview'
    );
  }

  function dismiss() {
    snap(false);

    // Use the existing close button so dismissal has the same
    // effects as clicking × (map state, classes, focus, etc.).
    const closeButton = sheet.querySelector('.sidebar-close');

    if (closeButton) {
      closeButton.click();
    } else {
      console.warn('Overview close button not found');
    }
  }

  window.MobileOverview = {
    reset() {
      if (mobile.matches) snap(false);
    }
  };

  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    snap(!expanded);
  });

  handle.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      snap(event.key === 'ArrowUp');
    }
  });

  handle.addEventListener('pointerdown', event => {
    if (!mobile.matches || !event.isPrimary || event.button !== 0) return;

    suppressClick = false;

    drag = {
      id: event.pointerId,
      y: event.clientY,
      height: sheet.getBoundingClientRect().height,
      moved: false
    };

    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;

    const delta = drag.y - event.clientY;

    if (Math.abs(delta) > 5) drag.moved = true;
    if (!drag.moved) return;

    sheet.classList.add('sheet-dragging');

    // Allow dragging below half-height, down to zero.
    const height = Math.max(
      0,
      Math.min(bounds().full, drag.height + delta)
    );

    setHeight(height);
  });

  function finish(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.id) return;

    const moved = drag.moved;
    const delta = drag.y - event.clientY;
    const height = sheet.getBoundingClientRect().height;
    const id = drag.id;

    drag = null;
    suppressClick = moved;

    if (handle.hasPointerCapture(id)) {
      handle.releasePointerCapture(id);
    }

    if (cancelled || !moved) {
      snap(expanded);
      return;
    }

    const { half, full } = bounds();

    // Dragged below half-height: dismiss once sufficiently far down.
    if (height < half - 48) {
      dismiss();
      return;
    }

    // Expanded sheet: a substantial downward swipe collapses it.
    if (delta < -48 && expanded) {
      snap(false);
      return;
    }

    // Otherwise snap to the nearest normal position.
    if (Math.abs(delta) > 48) {
      snap(delta > 0);
    } else {
      snap(height > (half + full) / 2);
    }
  }

  handle.addEventListener('pointerup', event => finish(event));
  handle.addEventListener('pointercancel', event => finish(event, true));
  handle.addEventListener(
    'lostpointercapture',
    event => finish(event, true)
  );

  function resize() {
    drag = null;
    sheet.classList.remove('sheet-dragging');

    if (mobile.matches) {
      snap(expanded);
    } else {
      sheet.style.removeProperty('--sheet-height');
      sheet.classList.remove('sheet-expanded');
    }
  }

  mobile.addEventListener('change', resize);
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);

  resize();
})();