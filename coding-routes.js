import { createCodingWorkspace } from './coding-workspace.js';

export function installCodingRoutes(app, options = {}) {
  const workspace = options.workspace || createCodingWorkspace(options);
  app.get('/api/coding', async (req, res) => res.json(await workspace.status()));
  app.put('/api/coding/settings', async (req, res) => {
    const body = req.body || {};
    const current = await workspace.status();
    const settings = await workspace.saveCodingSettings({
      workspacePath: body.workspacePath ?? current.settings.workspacePath,
      model: body.model ?? current.settings.model,
      baseUrl: body.baseUrl ?? current.settings.baseUrl,
    });
    res.json({ settings });
  });
  app.post('/api/coding/open', async (req, res) => res.status(201).json(await workspace.openWorkspace(req.body || {})));
  app.post('/api/coding/jobs', async (req, res) => {
    // Preflight failures are returned synchronously; process execution continues in background.
    try {
      const job = await workspace.runJob(req.body || {});
      return res.status(202).json({ job });
    } catch (error) { return res.status(error.status || 503).json({ error: error.message }); }
  });
  app.get('/api/coding/jobs/:id', (req, res) => {
    const job = workspace.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Coding job tidak ditemukan.' });
    res.json({ job });
  });
  app.post('/api/coding/jobs/:id/cancel', async (req, res) => res.json({ job: await workspace.cancelJob(req.params.id) }));
  return workspace;
}

