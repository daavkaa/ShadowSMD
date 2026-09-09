// Apply before the stylesheet to avoid a flash. Preference is local to this browser.
(() => {
 let theme;
 try { theme=localStorage.getItem('shadowops-theme'); } catch (_) {}
 if(!['light','dark'].includes(theme))theme=window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
 document.documentElement.dataset.theme=theme;
 document.documentElement.style.colorScheme=theme;
})();
