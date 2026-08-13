CREATE TABLE public.integration_alert_settings (
  slug text PRIMARY KEY,
  alert_enabled boolean NOT NULL DEFAULT true,
  stale_minutes integer NOT NULL DEFAULT 1440,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_alert_settings TO authenticated;
GRANT ALL ON public.integration_alert_settings TO service_role;

ALTER TABLE public.integration_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read integration alert settings"
ON public.integration_alert_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage integration alert settings"
ON public.integration_alert_settings FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER integration_alert_settings_touch
BEFORE UPDATE ON public.integration_alert_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();