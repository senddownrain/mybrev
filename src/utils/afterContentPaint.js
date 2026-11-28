/** Give Vue and the browser a paint before starting optional reader work. */
export function afterContentPaint(task) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTimeout(task, 0)));
}

const prayerTextSelector = '.liturgical-hour-column .ora-text, .readings-content .parsed-reading, .prayer-view-container .prayer-text';
let resolveFirstPrayerPaint;
export const firstPrayerPaint = new Promise((resolve) => { resolveFirstPrayerPaint = resolve; });

export function observeFirstPrayerText(task) {
  function check() {
    const prayer = document.querySelector(prayerTextSelector);
    if (!prayer?.textContent.trim()) return;
    observer.disconnect();
    afterContentPaint(() => {
      performance.mark('malitounik:first-prayer-text');
      resolveFirstPrayerPaint();
      task();
    });
  }
  const observer = new window.MutationObserver(check);
  observer.observe(document.getElementById('app'), { childList: true, characterData: true, subtree: true });
  check();
}
