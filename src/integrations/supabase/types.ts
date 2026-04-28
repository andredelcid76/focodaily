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
          scheduled_date?: string
          source?: string
          starts_at?: string
          title?: string
          updated_at?: string
          user_id?: string
          web_link?: string | null
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
          id: string
          original_date: string
          position: number
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
          id?: string
          original_date?: string
          position?: number
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
          id?: string
          original_date?: string
          position?: number
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
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      task_category: "urgent" | "important" | "circumstantial"
      task_recurrence:
        | "none"
        | "daily"
        | "weekly"
        | "monthly"
        | "custom"
        | "weekdays"
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
      task_category: ["urgent", "important", "circumstantial"],
      task_recurrence: [
        "none",
        "daily",
        "weekly",
        "monthly",
        "custom",
        "weekdays",
      ],
      task_status: ["todo", "doing", "done"],
    },
  },
} as const
