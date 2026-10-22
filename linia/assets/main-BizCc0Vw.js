(async () => {
  try { if (sessionStorage.getItem('linia-rescue')) return; sessionStorage.setItem('linia-rescue', '1'); } catch {}
  document.body.innerHTML = '<p style="font:17px system-ui;padding:32px;color:#7b6b61">Открываем «Линию»…</p>';
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter(r => !new URL(r.scope).pathname.includes('/linia/') && !new URL(r.scope).pathname.includes('/kurs/')).map(r => r.unregister()));
  } catch {}
  location.reload();
})();
