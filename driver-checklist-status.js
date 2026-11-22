(() => {
  'use strict';
  const cfg = window.keOnboardingConfig;
  const steps = ['personal', 'vehicle', 'background', 'submit'];
  const cards = steps.map(key => document.querySelector('[data-checklist-step="' + key + '"]'));
  if (!cfg || cards.some(card => !card?.querySelector('[data-checklist-label]'))) return;
  const auth = supabase.createClient(cfg.url, cfg.key);
  let generation = 0;
  function paint(result) {
    cards.forEach((card, i) => {
      const complete = result?.[steps[i]] === true;
      card.classList.toggle('is-completed', complete);
      card.querySelector('[data-checklist-label]').textContent = complete ? '✓ Completed' : 'Start →';
    });
  }
  async function refresh() {
    const request = ++generation;
    paint(null);
    try {
      const initial = await auth.auth.getSession();
      const session = initial.data?.session;
      if (request !== generation || initial.error || !session?.user?.id || !session.access_token) return;
      const token = session.access_token;
      const scoped = supabase.createClient(cfg.url, cfg.key, {accessToken: async () => token});
      const {data, error} = await scoped.rpc('get_my_driver_checklist_status');
      if (request !== generation || error || !data || steps.some(step => typeof data[step] !== 'boolean')) return;
      const current = await auth.auth.getSession();
      if (request !== generation || current.error || current.data?.session?.user?.id !== session.user.id) return;
      paint(data);
    } catch { /* Leave existing neutral links in place if status cannot be verified. */ }
  }
  auth.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
      ++generation;
      paint(null);
      if (event !== 'SIGNED_OUT') setTimeout(refresh, 0);
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  void refresh();
})();
