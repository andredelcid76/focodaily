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
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      tasks: {
        Row: {
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
          original_date: string
          planner_etag: string | null
          planner_task_id: string | null
          position: number
          project_id: string | null
          recurrence: Database["public"]["Enums"]["task_recurrence"]
          recurrence_interval: number | null
          recurrence_monthly_pattern: Json | null
          recurrence_parent_id: string | null
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
          original_date?: string
          planner_etag?: string | null
          planner_task_id?: string | null
          position?: number
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          recurrence_interval?: number | null
          recurrence_monthly_pattern?: Json | null
          recurrence_parent_id?: string | null
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
          original_date?: string
          planner_etag?: string | null
          planner_task_id?: string | null
          position?: number
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          recurrence_interval?: number | null
          recurrence_monthly_pattern?: Json | null
          recurrence_parent_id?: string | null
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
      [_ in never]: never
    }
    Enums: {
      milestone_status: "pending" | "in_progress" | "done"
      project_status: "draft" | "active" | "paused" | "done" | "archived"
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
      project_status: ["draft", "active", "paused", "done", "archived"],
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
