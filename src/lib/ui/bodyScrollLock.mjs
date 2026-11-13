export function createBodyScrollLockManager() {
  let activeLocks = 0;
  let previousOverflow = '';

  return {
    acquire(body) {
      if (!body?.style) return () => {};
      if (activeLocks === 0) previousOverflow = body.style.overflow;
      activeLocks += 1;
      body.style.overflow = 'hidden';
      let released = false;
      return () => {
        if (released) return;
        released = true;
        activeLocks = Math.max(0, activeLocks - 1);
        if (activeLocks === 0) body.style.overflow = previousOverflow;
      };
    },
    getActiveCount() { return activeLocks; },
  };
}

export const bodyScrollLockManager = createBodyScrollLockManager();
