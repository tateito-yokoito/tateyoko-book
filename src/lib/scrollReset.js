export function scheduleScrollReset() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const reset = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    document
      .querySelectorAll(
        '[data-scroll-container="true"], [class~="overflow-y-auto"], [class~="overflow-auto"]'
      )
      .forEach(element => {
        element.scrollTop = 0;
      });
  };

  reset();

  let secondFrame = null;
  const firstFrame = window.requestAnimationFrame(() => {
    reset();
    secondFrame = window.requestAnimationFrame(reset);
  });

  return () => {
    window.cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
  };
}
