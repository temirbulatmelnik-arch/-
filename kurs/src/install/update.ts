export async function checkForInstalledUpdate() {
  const workers = navigator.serviceWorker;
  if (!workers) return;
  const registration = await workers.getRegistration();
  if (!registration) return;
  await registration.update();
  const update = registration.installing ?? registration.waiting;
  if (!update) return;

  await new Promise<void>(resolve => {
    const finish = () => {
      window.clearTimeout(timeout);
      update.removeEventListener('statechange', check);
      resolve();
    };
    const check = () => {
      if (update.state === 'activated' || update.state === 'redundant') finish();
    };
    const timeout = window.setTimeout(finish, 15_000);
    update.addEventListener('statechange', check);
    check();
  });
}
