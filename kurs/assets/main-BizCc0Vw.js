(async () => {
  try { if (sessionStorage.getItem('kurs-rescue')) return; sessionStorage.setItem('kurs-rescue', '1'); } catch {}
  document.body.innerHTML = '<p style="font:17px system-ui;padding:32px;color:#5d6b66">Открываем «Курс»…</p>';
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter(r => !new URL(r.scope).pathname.includes('/kurs/') && !new URL(r.scope).pathname.includes('/linia/')).map(r => r.unregister()));
  } catch {}
  location.reload();
})();
