import { createSelfDevelopmentEngine } from './self-development-engine.js';

export function installSelfDevelopmentRoutes(app, options = {}) {
  const engine = options.engine || createSelfDevelopmentEngine(options);
  const respond = (fn, status = 200) => async (req, res) => { try { res.status(status).json(await fn(req)); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } };
  app.get('/api/self-development', respond(() => engine.snapshot()));
  app.get('/api/self-development/proposals/:id', respond(req => engine.get(req.params.id)));
  app.post('/api/self-development/proposals', respond(req => engine.create(req.body || {}), 201));
  app.post('/api/self-development/proposals/:id/code', respond(req => engine.code(req.params.id, req.body || {}), 202));
  app.post('/api/self-development/proposals/:id/changes', respond(req => engine.writeChanges(req.params.id, req.body || {})));
  app.post('/api/self-development/proposals/:id/observe', respond(req => engine.observe(req.params.id, req.body || {})));
  app.post('/api/self-development/proposals/:id/validate', respond(req => engine.validate(req.params.id, req.body || {})));
  app.post('/api/self-development/proposals/:id/pull-request', respond(req => engine.preparePullRequest(req.params.id, req.body || {})));
  app.post('/api/self-development/proposals/:id/pr', respond(req => engine.preparePullRequest(req.params.id, req.body || {})));
  app.post('/api/self-development/proposals/:id/review', respond(req => engine.reviewPullRequest(req.params.id, { ...(req.body || {}), actor: req.body?.actor || 'reviewer' })));
  app.post('/api/self-development/proposals/:id/approve', respond(req => engine.approve(req.params.id, { ...(req.body || {}), approved: req.body?.approved === true, actor: req.body?.actor || 'owner' })));
  app.post('/api/self-development/proposals/:id/apply', respond(req => engine.apply(req.params.id, { ...(req.body || {}), approved: req.body?.approved === true, actor: req.body?.actor || 'owner' })));
  app.post('/api/self-development/proposals/:id/rollback', respond(req => engine.rollback(req.params.id, { ...(req.body || {}), approved: req.body?.approved === true, actor: req.body?.actor || 'owner' })));
  app.delete('/api/self-development/proposals/:id/worktree', respond(req => engine.dispose(req.params.id)));
  return engine;
}
