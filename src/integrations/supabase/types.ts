export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      commission_settings: {
        Row: {
          config: Json
          id: string
          updated_at: string
        }
        Insert: {
          config: Json
          id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cpo_clientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          classificacao: string
          complemento: string | null
          condicao_pagamento: string | null
          contato_cargo: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          contribuinte: boolean
          created_at: string
          created_by: string
          doc: string | null
          email: string | null
          id: string
          ie: string | null
          im: string | null
          logradouro: string | null
          nome_fantasia: string | null
          numero: string | null
          observacoes: string | null
          razao_social: string
          regime_tributario: string | null
          site: string | null
          telefone: string | null
          transportadora: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          classificacao?: string
          complemento?: string | null
          condicao_pagamento?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          contribuinte?: boolean
          created_at?: string
          created_by?: string
          doc?: string | null
          email?: string | null
          id?: string
          ie?: string | null
          im?: string | null
          logradouro?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          razao_social: string
          regime_tributario?: string | null
          site?: string | null
          telefone?: string | null
          transportadora?: string | null
          uf?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          classificacao?: string
          complemento?: string | null
          condicao_pagamento?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          contribuinte?: boolean
          created_at?: string
          created_by?: string
          doc?: string | null
          email?: string | null
          id?: string
          ie?: string | null
          im?: string | null
          logradouro?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          razao_social?: string
          regime_tributario?: string | null
          site?: string | null
          telefone?: string | null
          transportadora?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      cpo_config: {
        Row: {
          aliq_inter: number
          comissao_base: string
          comissao_pct: number
          id: number
          ipi: number
          majoracao_sem_ie: number
          mb_atencao: number
          pis_cofins: number
          politica_mb_min: number
          updated_at: string
        }
        Insert: {
          aliq_inter?: number
          comissao_base?: string
          comissao_pct?: number
          id?: number
          ipi?: number
          majoracao_sem_ie?: number
          mb_atencao?: number
          pis_cofins?: number
          politica_mb_min?: number
          updated_at?: string
        }
        Update: {
          aliq_inter?: number
          comissao_base?: string
          comissao_pct?: number
          id?: number
          ipi?: number
          majoracao_sem_ie?: number
          mb_atencao?: number
          pis_cofins?: number
          politica_mb_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      cpo_products: {
        Row: {
          ativo: boolean
          created_at: string
          custo: number
          id: string
          nome: string
          potencia: string | null
          preco_sugerido: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          custo?: number
          id?: string
          nome: string
          potencia?: string | null
          preco_sugerido?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          custo?: number
          id?: string
          nome?: string
          potencia?: string | null
          preco_sugerido?: number
          updated_at?: string
        }
        Relationships: []
      }
      cpo_proposals: {
        Row: {
          cliente_doc: string | null
          cliente_email: string | null
          cliente_ie: string | null
          cliente_nome: string
          cliente_telefone: string | null
          contribuinte: boolean
          created_at: string
          created_by: string | null
          frete_mod: string
          frete_valor: number
          id: string
          itens: Json
          numero: string | null
          status: string
          totais: Json
          uf: string
          updated_at: string
        }
        Insert: {
          cliente_doc?: string | null
          cliente_email?: string | null
          cliente_ie?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          contribuinte?: boolean
          created_at?: string
          created_by?: string | null
          frete_mod?: string
          frete_valor?: number
          id?: string
          itens?: Json
          numero?: string | null
          status?: string
          totais?: Json
          uf?: string
          updated_at?: string
        }
        Update: {
          cliente_doc?: string | null
          cliente_email?: string | null
          cliente_ie?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          contribuinte?: boolean
          created_at?: string
          created_by?: string | null
          frete_mod?: string
          frete_valor?: number
          id?: string
          itens?: Json
          numero?: string | null
          status?: string
          totais?: Json
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      cpo_tasks: {
        Row: {
          cliente_nome: string | null
          created_at: string
          descricao: string | null
          due_date: string | null
          id: string
          owner_id: string
          prioridade: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cliente_nome?: string | null
          created_at?: string
          descricao?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string
          prioridade?: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cliente_nome?: string | null
          created_at?: string
          descricao?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cpo_uf_rates: {
        Row: {
          aliq_interna: number
          fcp: number
          nome: string
          uf: string
          updated_at: string
        }
        Insert: {
          aliq_interna?: number
          fcp?: number
          nome: string
          uf: string
          updated_at?: string
        }
        Update: {
          aliq_interna?: number
          fcp?: number
          nome?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      group_kpi_goals: {
        Row: {
          goal: number
          kpi_key: string
          label: string
          period_type: string
          updated_at: string
        }
        Insert: {
          goal?: number
          kpi_key: string
          label: string
          period_type: string
          updated_at?: string
        }
        Update: {
          goal?: number
          kpi_key?: string
          label?: string
          period_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      hidden_salespeople: {
        Row: {
          created_at: string
          hidden_by: string | null
          sf_user_id: string
        }
        Insert: {
          created_at?: string
          hidden_by?: string | null
          sf_user_id: string
        }
        Update: {
          created_at?: string
          hidden_by?: string | null
          sf_user_id?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      marketing_goals: {
        Row: {
          goal: number
          key: string
          label: string
          period: string
          real_value: number
          unit: string
          updated_at: string
        }
        Insert: {
          goal?: number
          key: string
          label: string
          period?: string
          real_value?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          goal?: number
          key?: string
          label?: string
          period?: string
          real_value?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          before_state: Json
          created_at: string
          details: Json
          feature_keys: string[]
          id: string
          instance_id: string
          undone_at: string | null
          undone_by: string | null
          user_ids: string[]
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          before_state?: Json
          created_at?: string
          details?: Json
          feature_keys?: string[]
          id?: string
          instance_id: string
          undone_at?: string | null
          undone_by?: string | null
          user_ids?: string[]
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          before_state?: Json
          created_at?: string
          details?: Json
          feature_keys?: string[]
          id?: string
          instance_id?: string
          undone_at?: string | null
          undone_by?: string | null
          user_ids?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          cargo: string | null
          cargo_tipo: string | null
          created_at: string
          email: string
          equipe: string | null
          filter_scope: Database["public"]["Enums"]["filter_scope"]
          full_name: string | null
          id: string
          is_external: boolean
          meta_mensal: number | null
          organizacao: string
          regime_contratacao: string
          sf_user_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cargo_tipo?: string | null
          created_at?: string
          email: string
          equipe?: string | null
          filter_scope?: Database["public"]["Enums"]["filter_scope"]
          full_name?: string | null
          id: string
          is_external?: boolean
          meta_mensal?: number | null
          organizacao?: string
          regime_contratacao?: string
          sf_user_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cargo_tipo?: string | null
          created_at?: string
          email?: string
          equipe?: string | null
          filter_scope?: Database["public"]["Enums"]["filter_scope"]
          full_name?: string | null
          id?: string
          is_external?: boolean
          meta_mensal?: number | null
          organizacao?: string
          regime_contratacao?: string
          sf_user_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      salesforce_team_members: {
        Row: {
          created_at: string
          sf_user_id: string
          team: Database["public"]["Enums"]["sf_team"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          sf_user_id: string
          team: Database["public"]["Enums"]["sf_team"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          sf_user_id?: string
          team?: Database["public"]["Enums"]["sf_team"]
          updated_at?: string
        }
        Relationships: []
      }
      salesperson_bonus_goals: {
        Row: {
          bonus_text: string
          created_at: string
          sf_user_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bonus_text?: string
          created_at?: string
          sf_user_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bonus_text?: string
          created_at?: string
          sf_user_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      salesperson_goals: {
        Row: {
          active: boolean
          created_at: string
          month: number
          monthly_goal: number
          sf_user_id: string
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          month: number
          monthly_goal?: number
          sf_user_id: string
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          active?: boolean
          created_at?: string
          month?: number
          monthly_goal?: number
          sf_user_id?: string
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: []
      }
      salesperson_new_ab_goals: {
        Row: {
          created_at: string
          goal: number
          quarter: number
          sf_user_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          goal?: number
          quarter: number
          sf_user_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          goal?: number
          quarter?: number
          sf_user_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      salesperson_retention_goals: {
        Row: {
          created_at: string
          goal: number
          quarter: number
          sf_user_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          goal?: number
          quarter: number
          sf_user_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          goal?: number
          quarter?: number
          sf_user_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          created_at: string
          detail: string | null
          email: string | null
          event: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email?: string | null
          event: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string | null
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_feature_permissions: {
        Row: {
          allowed: boolean
          feature_key: string
          instance_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          feature_key: string
          instance_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          feature_key?: string
          instance_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feature_permissions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      user_instance_access: {
        Row: {
          granted_at: string
          instance_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          instance_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          instance_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_instance_access_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invites: {
        Row: {
          accepted_at: string | null
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string
          equipe: string | null
          full_name: string | null
          id: string
          invited_by: string | null
          is_external: boolean
          organizacao: string
          regime_contratacao: string
          role: Database["public"]["Enums"]["app_role"]
          sf_user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email: string
          equipe?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          is_external?: boolean
          organizacao?: string
          regime_contratacao?: string
          role?: Database["public"]["Enums"]["app_role"]
          sf_user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string
          equipe?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          is_external?: boolean
          organizacao?: string
          regime_contratacao?: string
          role?: Database["public"]["Enums"]["app_role"]
          sf_user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_view_preferences: {
        Row: {
          screen: string
          updated_at: string
          user_id: string
          variant_key: string
        }
        Insert: {
          screen: string
          updated_at?: string
          user_id: string
          variant_key: string
        }
        Update: {
          screen?: string
          updated_at?: string
          user_id?: string
          variant_key?: string
        }
        Relationships: []
      }
      view_variants: {
        Row: {
          cargo: string | null
          created_at: string
          enabled: boolean
          id: string
          instance_id: string | null
          label: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          screen: string
          updated_at: string
          variant_key: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          instance_id?: string | null
          label?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          screen: string
          updated_at?: string
          variant_key: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          instance_id?: string | null
          label?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          screen?: string
          updated_at?: string
          variant_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor" | "diretor" | "marketing"
      filter_scope: "geral" | "pre_vendas" | "carteira" | "individual"
      sf_team: "pre_vendas" | "carteira"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gerente", "vendedor", "diretor", "marketing"],
      filter_scope: ["geral", "pre_vendas", "carteira", "individual"],
      sf_team: ["pre_vendas", "carteira"],
    },
  },
} as const
