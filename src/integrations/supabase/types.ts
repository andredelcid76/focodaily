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
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_data: Json | null
          tool_name: string | null
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_data?: Json | null
          tool_name?: string | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_data?: Json | null
          tool_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefings: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          reference_date: string
          scope: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_date: string
          scope?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_date?: string
          scope?: string
          user_id?: string
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
      fireflies_connections: {
        Row: {
          api_key: string
          created_at: string
          id: string
          last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_processed_sources: {
        Row: {
          id: string
          processed_at: string
          source: string
          source_id: string
          user_id: string
        }
        Insert: {
          id?: string
          processed_at?: string
          source: string
          source_id: string
          user_id: string
        }
        Update: {
          id?: string
          processed_at?: string
          source?: string
          source_id?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_scan_state: {
        Row: {
          last_error: string | null
          last_scan_at: string | null
          last_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_error?: string | null
          last_scan_at?: string | null
          last_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_error?: string | null
          last_scan_at?: string | null
          last_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_suggestions: {
        Row: {
          accepted_task_id: string | null
          acted_at: string | null
          created_at: string
          description: string | null
          id: string
          reasoning: string | null
          source: string
          source_date: string | null
          source_id: string
          source_label: string | null
          source_url: string | null
          status: string
          suggested_category: string
          suggested_date: string | null
          suggested_duration_minutes: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_task_id?: string | null
          acted_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reasoning?: string | null
          source: string
          source_date?: string | null
          source_id: string
          source_label?: string | null
          source_url?: string | null
          status?: string
          suggested_category?: string
          suggested_date?: string | null
          suggested_duration_minutes?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_task_id?: string | null
          acted_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reasoning?: string | null
          source?: string
          source_date?: string | null
          source_id?: string
          source_label?: string | null
          source_url?: string | null
          status?: string
          suggested_category?: string
          suggested_date?: string | null
          suggested_duration_minutes?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          color: string
          created_at: string
          description: string | null
          ends_at: string
          external_id: string | null
          id: string
          is_all_day: boolean
          location: string | null
          project_id: string | null
          scheduled_date: string
          source: string
          starts_at: string
          title: string
          updated_at: string
          user_id: string
          web_link: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          ends_at: string
          external_id?: string | null
          id?: string
          is_all_day?: boolean
          location?: string | null
          project_id?: string | null
          scheduled_date: string
          source?: string
          starts_at: string
          title: string
          updated_at?: string
          user_id: string
          web_link?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          external_id?: string | null
          id?: string
          is_all_day?: boolean
          location?: string | null
          project_id?: string | null
          scheduled_date?: string
          source?: string
          starts_at?: string
          title?: string
          updated_at?: string
          user_id?: string
          web_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          link: string | null
          project_id: string | null
          read_at: string | null
          task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          project_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          project_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_access_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          refresh_expires_at: string | null
          refresh_token_hash: string | null
          revoked_at: string | null
          scope: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          scope?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          scope?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_access_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_auth_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string
          code_challenge_method: string
          created_at: string
          expires_at: string
          redirect_uri: string
          scope: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          code: string
          code_challenge: string
          code_challenge_method?: string
          created_at?: string
          expires_at?: string
          redirect_uri: string
          scope?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string
          code_challenge_method?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scope?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_auth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_clients: {
        Row: {
          client_name: string
          created_at: string
          grant_types: string[]
          id: string
          redirect_uris: string[]
          response_types: string[]
          software_id: string | null
          software_version: string | null
          token_endpoint_auth_method: string
        }
        Insert: {
          client_name: string
          created_at?: string
          grant_types?: string[]
          id: string
          redirect_uris: string[]
          response_types?: string[]
          software_id?: string | null
          software_version?: string | null
          token_endpoint_auth_method?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          grant_types?: string[]
          id?: string
          redirect_uris?: string[]
          response_types?: string[]
          software_id?: string | null
          software_version?: string | null
          token_endpoint_auth_method?: string
        }
        Relationships: []
      }
      oauth_pending_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          state_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider?: string
          state_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          state_token?: string
          user_id?: string
        }
        Relationships: []
      }
      outlook_connections: {
        Row: {
          access_token: string
          created_at: string
          display_name: string | null
          email: string | null
          expires_at: string
          id: string
          last_sync_at: string | null
          ms_user_id: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          expires_at: string
          id?: string
          last_sync_at?: string | null
          ms_user_id?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          last_sync_at?: string | null
          ms_user_id?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pipedrive_connections: {
        Row: {
          api_token: string
          created_at: string
          domain: string
          id: string
          last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_token: string
          created_at?: string
          domain: string
          id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_token?: string
          created_at?: string
          domain?: string
          id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          locale: string
          onboarded_at: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          locale?: string
          onboarded_at?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          locale?: string
          onboarded_at?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_comments: {
        Row: {
          content: string
          created_at: string
          edited_at: string | null
          id: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          project_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          project_id: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          token?: string
        }
        Relationships: []
      }
      project_links: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          position: number
          project_id: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label: string
          position?: number
          project_id: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          position?: number
          project_id?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      project_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          position: number
          project_id: string
          status: Database["public"]["Enums"]["milestone_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          project_id: string
          status?: Database["public"]["Enums"]["milestone_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          project_id?: string
          status?: Database["public"]["Enums"]["milestone_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_status_history: {
        Row: {
          created_at: string
          from_status: Database["public"]["Enums"]["project_status"] | null
          id: string
          note: string | null
          project_id: string
          to_status: Database["public"]["Enums"]["project_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          note?: string | null
          project_id: string
          to_status: Database["public"]["Enums"]["project_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          note?: string | null
          project_id?: string
          to_status?: Database["public"]["Enums"]["project_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string
          created_at: string
          deadline: string | null
          description: string | null
          icon: string
          id: string
          name: string
          planner_plan_id: string | null
          planner_synced_at: string | null
          position: number
          role_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["project_status"]
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          icon?: string
          id?: string
          name: string
          planner_plan_id?: string | null
          planner_synced_at?: string | null
          position?: number
          role_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          icon?: string
          id?: string
          name?: string
          planner_plan_id?: string | null
          planner_synced_at?: string | null
          position?: number
          role_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
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
      task_dependencies: {
        Row: {
          created_at: string
          dep_type: string
          id: string
          lag_days: number
          predecessor_id: string
          successor_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dep_type?: string
          id?: string
          lag_days?: number
          predecessor_id: string
          successor_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dep_type?: string
          id?: string
          lag_days?: number
          predecessor_id?: string
          successor_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrence_exceptions: {
        Row: {
          created_at: string
          exception_date: string
          id: string
          kind: string
          parent_task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exception_date: string
          id?: string
          kind?: string
          parent_task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exception_date?: string
          id?: string
          kind?: string
          parent_task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_reorder_logs: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          ordered_task_ids: string[]
          reasoning: string | null
          reference_date: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          ordered_task_ids: string[]
          reasoning?: string | null
          reference_date: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          ordered_task_ids?: string[]
          reasoning?: string | null
          reference_date?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      task_subtasks: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          position: number
          task_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          category: Database["public"]["Enums"]["task_category"]
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          followup_chain_id: string | null
          followup_count: number
          id: string
          non_negotiable: boolean
          origin_source: string | null
          origin_source_label: string | null
          origin_source_url: string | null
          original_date: string
          planned_date: string
          planner_etag: string | null
          planner_task_id: string | null
          position: number
          postpone_count: number
          project_id: string | null
          recurrence: Database["public"]["Enums"]["task_recurrence"]
          recurrence_interval: number | null
          recurrence_monthly_pattern: Json | null
          recurrence_parent_id: string | null
          recurrence_until: string | null
          recurrence_week_interval: number | null
          recurrence_weekdays: number[] | null
          role_id: string | null
          scheduled_date: string
          status: Database["public"]["Enums"]["task_status"]
          time_spent_seconds: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          followup_chain_id?: string | null
          followup_count?: number
          id?: string
          non_negotiable?: boolean
          origin_source?: string | null
          origin_source_label?: string | null
          origin_source_url?: string | null
          original_date?: string
          planned_date?: string
          planner_etag?: string | null
          planner_task_id?: string | null
          position?: number
          postpone_count?: number
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          recurrence_interval?: number | null
          recurrence_monthly_pattern?: Json | null
          recurrence_parent_id?: string | null
          recurrence_until?: string | null
          recurrence_week_interval?: number | null
          recurrence_weekdays?: number[] | null
          role_id?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["task_status"]
          time_spent_seconds?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          followup_chain_id?: string | null
          followup_count?: number
          id?: string
          non_negotiable?: boolean
          origin_source?: string | null
          origin_source_label?: string | null
          origin_source_url?: string | null
          original_date?: string
          planned_date?: string
          planner_etag?: string | null
          planner_task_id?: string | null
          position?: number
          postpone_count?: number
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          recurrence_interval?: number | null
          recurrence_monthly_pattern?: Json | null
          recurrence_parent_id?: string | null
          recurrence_until?: string | null
          recurrence_week_interval?: number | null
          recurrence_weekdays?: number[] | null
          role_id?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["task_status"]
          time_spent_seconds?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          team_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_organize_use_ai: boolean
          created_at: string
          daily_capacity_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_organize_use_ai?: boolean
          created_at?: string
          daily_capacity_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_organize_use_ai?: boolean
          created_at?: string
          daily_capacity_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      outlook_connections_safe: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          last_sync_at: string | null
          ms_user_id: string | null
          scope: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          last_sync_at?: string | null
          ms_user_id?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          last_sync_at?: string | null
          ms_user_id?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_project_invite: { Args: { _token: string }; Returns: string }
      accept_team_invite: { Args: { _token: string }; Returns: string }
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
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
      is_project_admin: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_manager_or_above: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_owner: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
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
      reorder_projects: {
        Args: { p_ordered_ids: string[] }
        Returns: undefined
      }
      reorder_tasks: { Args: { p_ordered_ids: string[] }; Returns: undefined }
    }
    Enums: {
      milestone_status: "pending" | "in_progress" | "done"
      project_status:
        | "in_progress"
        | "active"
        | "paused"
        | "not_started"
        | "finished"
      task_category: "urgent" | "important" | "circumstantial"
      task_recurrence:
        | "none"
        | "daily"
        | "weekly"
        | "monthly"
        | "custom"
        | "weekdays"
        | "yearly"
      task_status: "todo" | "doing" | "done"
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
      milestone_status: ["pending", "in_progress", "done"],
      project_status: [
        "in_progress",
        "active",
        "paused",
        "not_started",
        "finished",
      ],
      task_category: ["urgent", "important", "circumstantial"],
      task_recurrence: [
        "none",
        "daily",
        "weekly",
        "monthly",
        "custom",
        "weekdays",
        "yearly",
      ],
      task_status: ["todo", "doing", "done"],
    },
  },
} as const
