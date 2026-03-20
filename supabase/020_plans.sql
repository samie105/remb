-- ============================================================
-- 020: Plans — AI-driven architecture planning per project
-- ============================================================

-- Plans table: each plan is a conversation thread about architecture
CREATE TABLE plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plans_user_project ON plans (user_id, project_id, status);
CREATE INDEX idx_plans_project_status ON plans (project_id, status);

-- Plan phases: each plan has ordered phases (milestones)
CREATE TABLE plan_phases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  sort_order  INT NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_phases_plan ON plan_phases (plan_id, sort_order);

-- Plan messages: the AI chat thread for a plan
CREATE TABLE plan_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_messages_plan ON plan_messages (plan_id, created_at);

-- Auto-update updated_at on plans
CREATE OR REPLACE FUNCTION update_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plans_updated
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_plan_timestamp();

CREATE TRIGGER trg_plan_phases_updated
  BEFORE UPDATE ON plan_phases
  FOR EACH ROW EXECUTE FUNCTION update_plan_timestamp();

-- RLS policies
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_user_policy ON plans
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY plan_phases_user_policy ON plan_phases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_phases.plan_id AND plans.user_id = auth.uid())
  );

CREATE POLICY plan_messages_user_policy ON plan_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_messages.plan_id AND plans.user_id = auth.uid())
  );
