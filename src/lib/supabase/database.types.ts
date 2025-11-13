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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      fill_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          form_mappings_count: number
          id: string
          session_id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          form_mappings_count?: number
          id?: string
          session_id: string
          started_at: string
          status: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          form_mappings_count?: number
          id?: string
          session_id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      form_mappings: {
        Row: {
          confidence: number
          created_at: string
          fields_snapshot: Json
          form_id: string | null
          id: string
          timestamp: string
          url: string
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          fields_snapshot: Json
          form_id?: string | null
          id?: string
          timestamp?: string
          url: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          fields_snapshot?: Json
          form_id?: string | null
          id?: string
          timestamp?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      login_tokens: {
        Row: {
          access_token: string
          code: string
          code_challenge: string
          code_challenge_method: string
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          refresh_token: string
          state: string
          used: boolean
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          code: string
          code_challenge: string
          code_challenge_method?: string
          created_at?: string
          expires_at: string
          id?: string
          redirect_uri: string
          refresh_token: string
          state: string
          used?: boolean
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          code?: string
          code_challenge?: string
          code_challenge_method?: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          refresh_token?: string
          state?: string
          used?: boolean
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      memories: {
        Row: {
          answer: string
          category: string
          confidence: number
          created_at: string
          deleted_at: string | null
          embedding: string | null
          id: string
          is_deleted: boolean
          last_used: string | null
          local_id: string
          question: string | null
          source: string
          tags: string[] | null
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          answer: string
          category: string
          confidence: number
          created_at?: string
          deleted_at?: string | null
          embedding?: string | null
          id?: string
          is_deleted?: boolean
          last_used?: string | null
          local_id: string
          question?: string | null
          source: string
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          answer?: string
          category?: string
          confidence?: number
          created_at?: string
          deleted_at?: string | null
          embedding?: string | null
          id?: string
          is_deleted?: boolean
          last_used?: string | null
          local_id?: string
          question?: string | null
          source?: string
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          conflict_resolution_strategy: string | null
          conflicts_resolved: number | null
          created_at: string
          error_message: string | null
          id: string
          item_count: number
          operation: string
          status: string
          timestamp: string
          user_id: string
        }
        Insert: {
          conflict_resolution_strategy?: string | null
          conflicts_resolved?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          item_count?: number
          operation: string
          status: string
          timestamp?: string
          user_id: string
        }
        Update: {
          conflict_resolution_strategy?: string | null
          conflicts_resolved?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          item_count?: number
          operation?: string
          status?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          plan: string
          settings: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          last_synced_at?: string | null
          plan?: string
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          plan?: string
          settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_login_tokens: { Args: never; Returns: undefined }
      cleanup_expired_pkce_codes: { Args: never; Returns: undefined }
      cleanup_old_sync_logs: { Args: never; Returns: undefined }
      get_memories_since: {
        Args: { since_timestamp?: string }
        Returns: {
          answer: string
          category: string
          confidence: number
          created_at: string
          deleted_at: string
          embedding: string
          id: string
          is_deleted: boolean
          last_used: string
          local_id: string
          question: string
          source: string
          tags: string[]
          updated_at: string
          usage_count: number
        }[]
      }
      upsert_memory: {
        Args: {
          p_answer: string
          p_category: string
          p_confidence: number
          p_created_at: string
          p_deleted_at?: string
          p_embedding: string
          p_is_deleted?: boolean
          p_last_used: string
          p_local_id: string
          p_question: string
          p_source: string
          p_tags: string[]
          p_updated_at: string
          p_usage_count: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
