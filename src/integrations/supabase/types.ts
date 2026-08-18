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
      carregadores_clientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          condicao_pagamento: string | null
          contato_cargo: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          contatos: Json
          contribuinte: boolean
          created_at: string
          created_by: string
          doc: string | null
          email: string | null
          id: string
          ie: string | null
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
          complemento?: string | null
          condicao_pagamento?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          contatos?: Json
          contribuinte?: boolean
          created_at?: string
          created_by?: string
          doc?: string | null
          email?: string | null
          id?: string
          ie?: string | null
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
          complemento?: string | null
          condicao_pagamento?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          contatos?: Json
          contribuinte?: boolean
          created_at?: string
          created_by?: string
          doc?: string | null
          email?: string | null
          id?: string
          ie?: string | null
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
      carregadores_clientes_im_legado: {
        Row: {
          archived_at: string
          cliente_id: string
          doc: string | null
          id: string
          im: string
          razao_social: string | null
        }
        Insert: {
          archived_at?: string
          cliente_id: string
          doc?: string | null
          id?: string
          im: string
          razao_social?: string | null
        }
        Update: {
          archived_at?: string
          cliente_id?: string
          doc?: string | null
          id?: string
          im?: string
          razao_social?: string | null
        }
        Relationships: []
      }
      carregadores_config: {
        Row: {
          aliq_inter: number
          cmv_max: number
          comissao_base: string
          comissao_pct: number
          fator_clt: number
          id: number
          ipi: number
          majoracao_sem_ie: number
          mb_atencao: number
          pct_gerente: number
          pct_indicacao: number
          pct_representante: number
          pis_cofins: number
          politica_mb_min: number
          updated_at: string
        }
        Insert: {
          aliq_inter?: number
          cmv_max?: number
          comissao_base?: string
          comissao_pct?: number
          fator_clt?: number
          id?: number
          ipi?: number
          majoracao_sem_ie?: number
          mb_atencao?: number
          pct_gerente?: number
          pct_indicacao?: number
          pct_representante?: number
          pis_cofins?: number
          politica_mb_min?: number
          updated_at?: string
        }
        Update: {
          aliq_inter?: number
          cmv_max?: number
          comissao_base?: string
          comissao_pct?: number
          fator_clt?: number
          id?: number
          ipi?: number
          majoracao_sem_ie?: number
          mb_atencao?: number
          pct_gerente?: number
          pct_indicacao?: number
          pct_representante?: number
          pis_cofins?: number
          politica_mb_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      carregadores_metas: {
        Row: {
          ano: number
          ativo: boolean
          created_at: string
          id: string
          mes: number
          meta: number
          meta_bonus: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ano: number
          ativo?: boolean
          created_at?: string
          id?: string
          mes: number
          meta?: number
          meta_bonus?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: number
          ativo?: boolean
          created_at?: string
          id?: string
          mes?: number
          meta?: number
          meta_bonus?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      carregadores_ncm: {
        Row: {
          aliq_inter: number
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string
          gera_difal: boolean
          id: string
          ipi: number
          observacoes: string | null
          pis_cofins: number
          tem_st: boolean
          updated_at: string
        }
        Insert: {
          aliq_inter?: number
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao: string
          gera_difal?: boolean
          id?: string
          ipi?: number
          observacoes?: string | null
          pis_cofins?: number
          tem_st?: boolean
          updated_at?: string
        }
        Update: {
          aliq_inter?: number
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string
          gera_difal?: boolean
          id?: string
          ipi?: number
          observacoes?: string | null
          pis_cofins?: number
          tem_st?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      carregadores_padrinhos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          doc: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          doc?: string | null
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          doc?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      carregadores_produtos: {
        Row: {
          ativo: boolean
          codigo: string | null
          created_at: string
          custo: number
          id: string
          ncm_id: string | null
          nome: string
          preco_sugerido: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo?: string | null
          created_at?: string
          custo?: number
          id?: string
          ncm_id?: string | null
          nome: string
          preco_sugerido?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string | null
          created_at?: string
          custo?: number
          id?: string
          ncm_id?: string | null
          nome?: string
          preco_sugerido?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpo_products_ncm_id_fkey"
            columns: ["ncm_id"]
            isOneToOne: false
            referencedRelation: "carregadores_ncm"
            referencedColumns: ["id"]
          },
        ]
      }
      carregadores_tarefas: {
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
      carregadores_uf_rates: {
        Row: {
          aliq_interna: number
          convenio_st: boolean
          fcp: number
          nome: string
          uf: string
          updated_at: string
        }
        Insert: {
          aliq_interna?: number
          convenio_st?: boolean
          fcp?: number
          nome: string
          uf: string
          updated_at?: string
        }
        Update: {
          aliq_interna?: number
          convenio_st?: boolean
          fcp?: number
          nome?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          account_id: string
          account_name: string | null
          canvas: Json
          created_at: string
          id: string
          instancia: string
          notes: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          canvas?: Json
          created_at?: string
          id?: string
          instancia?: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          canvas?: Json
          created_at?: string
          id?: string
          instancia?: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cliente_logos: {
        Row: {
          data_url: string
          doc: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data_url: string
          doc: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data_url?: string
          doc?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          capital_social: number | null
          cep: string | null
          cidade: string | null
          cnae_principal_codigo: string | null
          cnae_principal_descricao: string | null
          cnaes_secundarios: Json
          complemento: string | null
          condicao_pagamento: string | null
          condicao_pgto_sap: string | null
          contato_cargo: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          contatos: Json
          contribuinte: boolean
          created_at: string
          created_by: string | null
          created_by_email: string | null
          created_by_nome: string | null
          data_abertura: string | null
          doc: string
          email: string | null
          enriquecimento: Json | null
          finalidade: string | null
          id: string
          ie: string | null
          ie_situacao: string | null
          instancia: string
          logradouro: string | null
          municipio_ibge: string | null
          natureza_juridica: string | null
          nome_fantasia: string | null
          numero: string | null
          numero_sap: string | null
          observacoes: string | null
          organizacao: string
          porte: string | null
          razao_social: string
          regime_tributario: string | null
          sap_erro: string | null
          sap_status: string | null
          sf_account_id: string | null
          sf_contact_id: string | null
          sf_erro: string | null
          sf_status: string | null
          sincronizado_em: string | null
          site: string | null
          situacao_cadastral: string | null
          suframa: string | null
          suframa_situacao: string | null
          tabela_preco: string | null
          telefone: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cidade?: string | null
          cnae_principal_codigo?: string | null
          cnae_principal_descricao?: string | null
          cnaes_secundarios?: Json
          complemento?: string | null
          condicao_pagamento?: string | null
          condicao_pgto_sap?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          contatos?: Json
          contribuinte?: boolean
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          created_by_nome?: string | null
          data_abertura?: string | null
          doc: string
          email?: string | null
          enriquecimento?: Json | null
          finalidade?: string | null
          id?: string
          ie?: string | null
          ie_situacao?: string | null
          instancia: string
          logradouro?: string | null
          municipio_ibge?: string | null
          natureza_juridica?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          numero_sap?: string | null
          observacoes?: string | null
          organizacao: string
          porte?: string | null
          razao_social: string
          regime_tributario?: string | null
          sap_erro?: string | null
          sap_status?: string | null
          sf_account_id?: string | null
          sf_contact_id?: string | null
          sf_erro?: string | null
          sf_status?: string | null
          sincronizado_em?: string | null
          site?: string | null
          situacao_cadastral?: string | null
          suframa?: string | null
          suframa_situacao?: string | null
          tabela_preco?: string | null
          telefone?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cidade?: string | null
          cnae_principal_codigo?: string | null
          cnae_principal_descricao?: string | null
          cnaes_secundarios?: Json
          complemento?: string | null
          condicao_pagamento?: string | null
          condicao_pgto_sap?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          contatos?: Json
          contribuinte?: boolean
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          created_by_nome?: string | null
          data_abertura?: string | null
          doc?: string
          email?: string | null
          enriquecimento?: Json | null
          finalidade?: string | null
          id?: string
          ie?: string | null
          ie_situacao?: string | null
          instancia?: string
          logradouro?: string | null
          municipio_ibge?: string | null
          natureza_juridica?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          numero_sap?: string | null
          observacoes?: string | null
          organizacao?: string
          porte?: string | null
          razao_social?: string
          regime_tributario?: string | null
          sap_erro?: string | null
          sap_status?: string | null
          sf_account_id?: string | null
          sf_contact_id?: string | null
          sf_erro?: string | null
          sf_status?: string | null
          sincronizado_em?: string | null
          site?: string | null
          situacao_cadastral?: string | null
          suframa?: string | null
          suframa_situacao?: string | null
          tabela_preco?: string | null
          telefone?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      containers: {
        Row: {
          atualizado_em: string
          dt_remessa: string | null
          est_entreposto: number
          g_weight_total: number
          g_weight_un: number
          id: number
          id_container: string
          material: string
          n_weight_total: number
          n_weight_un: number
          supplier: string | null
        }
        Insert: {
          atualizado_em?: string
          dt_remessa?: string | null
          est_entreposto?: number
          g_weight_total?: number
          g_weight_un?: number
          id?: never
          id_container: string
          material: string
          n_weight_total?: number
          n_weight_un?: number
          supplier?: string | null
        }
        Update: {
          atualizado_em?: string
          dt_remessa?: string | null
          est_entreposto?: number
          g_weight_total?: number
          g_weight_un?: number
          id?: never
          id_container?: string
          material?: string
          n_weight_total?: number
          n_weight_un?: number
          supplier?: string | null
        }
        Relationships: []
      }
      contatos: {
        Row: {
          ativo: boolean
          cargo: string | null
          cliente_doc: string
          cliente_id: string
          created_at: string
          emails: Json
          id: string
          instancia: string
          nome: string
          numero_sap: string | null
          organizacao: string
          sf_account_id: string | null
          sf_contact_id: string | null
          sf_erro: string | null
          sf_status: string | null
          telefones: Json
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          cliente_doc?: string
          cliente_id: string
          created_at?: string
          emails?: Json
          id?: string
          instancia: string
          nome?: string
          numero_sap?: string | null
          organizacao?: string
          sf_account_id?: string | null
          sf_contact_id?: string | null
          sf_erro?: string | null
          sf_status?: string | null
          telefones?: Json
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          cliente_doc?: string
          cliente_id?: string
          created_at?: string
          emails?: Json
          id?: string
          instancia?: string
          nome?: string
          numero_sap?: string | null
          organizacao?: string
          sf_account_id?: string | null
          sf_contact_id?: string | null
          sf_erro?: string | null
          sf_status?: string | null
          telefones?: Json
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
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
      estoque: {
        Row: {
          atualizado_em: string
          centro: string
          cmm: number
          descricao: string | null
          ean: string | null
          est_bloqueado: number
          est_entreposto: number
          est_livre: number
          grp_mercadorias: string | null
          material: string
          ncm: string | null
          preco_venda: number
          qtd_pend_faturar: number
          tipo_material: string | null
          umb: string | null
          valor_estoque: number
        }
        Insert: {
          atualizado_em?: string
          centro?: string
          cmm?: number
          descricao?: string | null
          ean?: string | null
          est_bloqueado?: number
          est_entreposto?: number
          est_livre?: number
          grp_mercadorias?: string | null
          material: string
          ncm?: string | null
          preco_venda?: number
          qtd_pend_faturar?: number
          tipo_material?: string | null
          umb?: string | null
          valor_estoque?: number
        }
        Update: {
          atualizado_em?: string
          centro?: string
          cmm?: number
          descricao?: string | null
          ean?: string | null
          est_bloqueado?: number
          est_entreposto?: number
          est_livre?: number
          grp_mercadorias?: string | null
          material?: string
          ncm?: string | null
          preco_venda?: number
          qtd_pend_faturar?: number
          tipo_material?: string | null
          umb?: string | null
          valor_estoque?: number
        }
        Relationships: []
      }
      estoque_sync_runs: {
        Row: {
          containers_count: number
          error_message: string | null
          finished_at: string | null
          id: string
          materiais_count: number
          ncm_aplicado: number
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          containers_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          materiais_count?: number
          ncm_aplicado?: number
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          containers_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          materiais_count?: number
          ncm_aplicado?: number
          started_at?: string
          status?: string
          triggered_by?: string | null
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
      integration_alert_settings: {
        Row: {
          alert_enabled: boolean
          created_at: string
          slug: string
          stale_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_enabled?: boolean
          created_at?: string
          slug: string
          stale_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_enabled?: boolean
          created_at?: string
          slug?: string
          stale_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: Json
          duration_ms: number | null
          event: string
          id: string
          level: string
          message: string | null
          slug: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          event: string
          id?: string
          level?: string
          message?: string | null
          slug: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          event?: string
          id?: string
          level?: string
          message?: string | null
          slug?: string
        }
        Relationships: []
      }
      log_retention_policy: {
        Row: {
          archive_days: number
          created_at: string
          enabled: boolean
          hot_days: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archive_days?: number
          created_at?: string
          enabled?: boolean
          hot_days?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archive_days?: number
          created_at?: string
          enabled?: boolean
          hot_days?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      log_retention_runs: {
        Row: {
          archive_days: number
          archived_count: number
          error_message: string | null
          hot_days: number
          id: string
          purged_count: number
          ran_at: string
        }
        Insert: {
          archive_days: number
          archived_count?: number
          error_message?: string | null
          hot_days: number
          id?: string
          purged_count?: number
          ran_at?: string
        }
        Update: {
          archive_days?: number
          archived_count?: number
          error_message?: string | null
          hot_days?: number
          id?: string
          purged_count?: number
          ran_at?: string
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
      moderation_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          area: string
          created_at: string
          details: Json
          id: string
          instance_id: string
          summary: string
          target: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          area: string
          created_at?: string
          details?: Json
          id?: string
          instance_id?: string
          summary: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          area?: string
          created_at?: string
          details?: Json
          id?: string
          instance_id?: string
          summary?: string
          target?: string | null
        }
        Relationships: []
      }
      permission_profile_features: {
        Row: {
          created_at: string
          feature_key: string
          instance_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          instance_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          instance_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_profile_features_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_profile_features_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_profile_instances: {
        Row: {
          created_at: string
          instance_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          instance_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          instance_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_profile_instances_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_profile_instances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_profiles: {
        Row: {
          created_at: string
          default_instance: string | null
          default_route: string | null
          description: string | null
          id: string
          is_full_access: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_instance?: string | null
          default_route?: string | null
          description?: string | null
          id?: string
          is_full_access?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_instance?: string | null
          default_route?: string | null
          description?: string | null
          id?: string
          is_full_access?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          custo: number
          descricao: string
          grp_mercadorias: string | null
          last_synced_at: string | null
          lista_preco: string | null
          ncm: string | null
          no_catalogo: boolean
          origem: string
          permissao: string
          preco_venda: number
          sap_raw: Json | null
          tipo: string | null
          unidade: string | null
          updated_at: string
          visibilidade: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          custo?: number
          descricao?: string
          grp_mercadorias?: string | null
          last_synced_at?: string | null
          lista_preco?: string | null
          ncm?: string | null
          no_catalogo?: boolean
          origem?: string
          permissao?: string
          preco_venda?: number
          sap_raw?: Json | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string
          visibilidade?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          custo?: number
          descricao?: string
          grp_mercadorias?: string | null
          last_synced_at?: string | null
          lista_preco?: string | null
          ncm?: string | null
          no_catalogo?: boolean
          origem?: string
          permissao?: string
          preco_venda?: number
          sap_raw?: Json | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string
          visibilidade?: string
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
          numero_sap: string | null
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
          numero_sap?: string | null
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
          numero_sap?: string | null
          organizacao?: string
          regime_contratacao?: string
          sf_user_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
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
      sap_catalogo_sap: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          id: string
          last_synced_at: string | null
          ncm_codigo: string | null
          no_catalogo: boolean
          sap_raw: Json | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
          id?: string
          last_synced_at?: string | null
          ncm_codigo?: string | null
          no_catalogo?: boolean
          sap_raw?: Json | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          id?: string
          last_synced_at?: string | null
          ncm_codigo?: string | null
          no_catalogo?: boolean
          sap_raw?: Json | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sap_produtos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          custo: number
          descricao: string
          id: string
          imagem_path: string | null
          last_synced_at: string | null
          lista_preco: string | null
          ncm_codigo: string | null
          ncm_id: string | null
          origem: string
          permissao: string
          preco_sugerido: number
          sap_raw: Json | null
          tipo: string
          updated_at: string
          visibilidade: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          custo?: number
          descricao: string
          id?: string
          imagem_path?: string | null
          last_synced_at?: string | null
          lista_preco?: string | null
          ncm_codigo?: string | null
          ncm_id?: string | null
          origem?: string
          permissao?: string
          preco_sugerido?: number
          sap_raw?: Json | null
          tipo?: string
          updated_at?: string
          visibilidade?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          custo?: number
          descricao?: string
          id?: string
          imagem_path?: string | null
          last_synced_at?: string | null
          lista_preco?: string | null
          ncm_codigo?: string | null
          ncm_id?: string | null
          origem?: string
          permissao?: string
          preco_sugerido?: number
          sap_raw?: Json | null
          tipo?: string
          updated_at?: string
          visibilidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_produtos_ncm_id_fkey"
            columns: ["ncm_id"]
            isOneToOne: false
            referencedRelation: "carregadores_ncm"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_produtos_sync_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          inserted_count: number
          started_at: string
          status: string
          triggered_by: string | null
          updated_count: number
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted_count?: number
          started_at?: string
          status?: string
          triggered_by?: string | null
          updated_count?: number
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted_count?: number
          started_at?: string
          status?: string
          triggered_by?: string | null
          updated_count?: number
        }
        Relationships: []
      }
      solar_calc_config: {
        Row: {
          altura_min: number
          balanco_ponta: number
          barra_curta_larga: number
          barra_curta_padrao: number
          barras_longas: number[]
          cod_grampo_final: string
          cod_grampo_intermediario: string
          cod_juncao: string
          cod_terminal_aterramento: string
          espessura_max: number
          espessura_min: number
          folga_paineis: number
          id: number
          largura_limite: number
          largura_min: number
          limite_paineis_todos_trilhos: number
          updated_at: string
        }
        Insert: {
          altura_min?: number
          balanco_ponta?: number
          barra_curta_larga?: number
          barra_curta_padrao?: number
          barras_longas?: number[]
          cod_grampo_final?: string
          cod_grampo_intermediario?: string
          cod_juncao?: string
          cod_terminal_aterramento?: string
          espessura_max?: number
          espessura_min?: number
          folga_paineis?: number
          id?: number
          largura_limite?: number
          largura_min?: number
          limite_paineis_todos_trilhos?: number
          updated_at?: string
        }
        Update: {
          altura_min?: number
          balanco_ponta?: number
          barra_curta_larga?: number
          barra_curta_padrao?: number
          barras_longas?: number[]
          cod_grampo_final?: string
          cod_grampo_intermediario?: string
          cod_juncao?: string
          cod_terminal_aterramento?: string
          espessura_max?: number
          espessura_min?: number
          folga_paineis?: number
          id?: number
          largura_limite?: number
          largura_min?: number
          limite_paineis_todos_trilhos?: number
          updated_at?: string
        }
        Relationships: []
      }
      solar_cupons: {
        Row: {
          ativo: boolean
          cliente_doc: string | null
          cliente_nome: string | null
          codigo: string
          created_at: string
          created_by: string | null
          id: string
          percentual: number
          reutilizavel: boolean
          tipos: string[]
          updated_at: string
          usos: number
          validade: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          cliente_doc?: string | null
          cliente_nome?: string | null
          codigo: string
          created_at?: string
          created_by?: string | null
          id?: string
          percentual?: number
          reutilizavel?: boolean
          tipos?: string[]
          updated_at?: string
          usos?: number
          validade: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          cliente_doc?: string | null
          cliente_nome?: string | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          percentual?: number
          reutilizavel?: boolean
          tipos?: string[]
          updated_at?: string
          usos?: number
          validade?: string
          valor?: number
        }
        Relationships: []
      }
      solar_geradores: {
        Row: {
          ativo: boolean
          created_at: string
          exige_microinversor: boolean
          id: string
          legado_id: number | null
          nome: string
          oculta_microinversor: boolean
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          exige_microinversor?: boolean
          id?: string
          legado_id?: number | null
          nome: string
          oculta_microinversor?: boolean
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          exige_microinversor?: boolean
          id?: string
          legado_id?: number | null
          nome?: string
          oculta_microinversor?: boolean
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      solar_modulos: {
        Row: {
          altura: number | null
          ativo: boolean
          created_at: string
          espessura: number | null
          id: string
          largura: number | null
          nome: string
          ordem: number
          personalizado: boolean
          updated_at: string
        }
        Insert: {
          altura?: number | null
          ativo?: boolean
          created_at?: string
          espessura?: number | null
          id?: string
          largura?: number | null
          nome: string
          ordem?: number
          personalizado?: boolean
          updated_at?: string
        }
        Update: {
          altura?: number | null
          ativo?: boolean
          created_at?: string
          espessura?: number | null
          id?: string
          largura?: number | null
          nome?: string
          ordem?: number
          personalizado?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      solar_suportes: {
        Row: {
          ativo: boolean
          codigo_sap: string | null
          created_at: string
          id: string
          legado_id: number | null
          multiplo: number
          nome: string
          ordem: number
          updated_at: string
          usa_barra: boolean
        }
        Insert: {
          ativo?: boolean
          codigo_sap?: string | null
          created_at?: string
          id?: string
          legado_id?: number | null
          multiplo?: number
          nome: string
          ordem?: number
          updated_at?: string
          usa_barra?: boolean
        }
        Update: {
          ativo?: boolean
          codigo_sap?: string | null
          created_at?: string
          id?: string
          legado_id?: number | null
          multiplo?: number
          nome?: string
          ordem?: number
          updated_at?: string
          usa_barra?: boolean
        }
        Relationships: []
      }
      solar_trilho_suportes: {
        Row: {
          created_at: string
          suporte_id: string
          trilho_id: string
        }
        Insert: {
          created_at?: string
          suporte_id: string
          trilho_id: string
        }
        Update: {
          created_at?: string
          suporte_id?: string
          trilho_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_trilho_suportes_suporte_id_fkey"
            columns: ["suporte_id"]
            isOneToOne: false
            referencedRelation: "solar_suportes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_trilho_suportes_trilho_id_fkey"
            columns: ["trilho_id"]
            isOneToOne: false
            referencedRelation: "solar_trilhos"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_trilhos: {
        Row: {
          ativo: boolean
          codigo_sap: string | null
          created_at: string
          familia: string
          id: string
          laje: boolean
          legado_id: number | null
          nome: string
          ordem: number
          orientacao_fixa: string | null
          suporte_fixo_legado: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_sap?: string | null
          created_at?: string
          familia?: string
          id?: string
          laje?: boolean
          legado_id?: number | null
          nome: string
          ordem?: number
          orientacao_fixa?: string | null
          suporte_fixo_legado?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_sap?: string | null
          created_at?: string
          familia?: string
          id?: string
          laje?: boolean
          legado_id?: number | null
          nome?: string
          ordem?: number
          orientacao_fixa?: string | null
          suporte_fixo_legado?: number | null
          updated_at?: string
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
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email?: string | null
          event: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string | null
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_activity_log_archive: {
        Row: {
          archived_at: string
          created_at: string
          detail: string | null
          email: string | null
          event: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          archived_at?: string
          created_at: string
          detail?: string | null
          email?: string | null
          event: string
          id: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          archived_at?: string
          created_at?: string
          detail?: string | null
          email?: string | null
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          numero_sap: string | null
          organizacao: string
          profile_id: string | null
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
          numero_sap?: string | null
          organizacao?: string
          profile_id?: string | null
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
          numero_sap?: string | null
          organizacao?: string
          profile_id?: string | null
          regime_contratacao?: string
          role?: Database["public"]["Enums"]["app_role"]
          sf_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_profiles: {
        Row: {
          created_at: string
          profile_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      apply_log_retention: {
        Args: never
        Returns: {
          archived: number
          purged: number
        }[]
      }
      check_disponibilidade: {
        Args: { p_material: string; p_qtd: number }
        Returns: Json
      }
      check_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
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
      sync_user_role_from_profiles: {
        Args: { _user_id: string }
        Returns: undefined
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
