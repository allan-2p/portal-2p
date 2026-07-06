ALTER TYPE public.app_role RENAME VALUE 'gestor' TO 'gerente';
ALTER TYPE public.app_role RENAME VALUE 'diretoria' TO 'diretor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';