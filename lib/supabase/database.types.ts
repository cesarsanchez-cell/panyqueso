export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          payload: Json | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          payload?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          payload?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      player_change_requests: {
        Row: {
          action_type: Database["public"]["Enums"]["change_request_action"];
          created_at: string;
          created_player_id: string | null;
          fields_changed: string[] | null;
          id: string;
          old_values: Json | null;
          player_id: string | null;
          proposed_values: Json;
          reason: string;
          requested_by: string;
          review_comment: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["change_request_status"];
        };
        Insert: {
          action_type: Database["public"]["Enums"]["change_request_action"];
          created_at?: string;
          created_player_id?: string | null;
          fields_changed?: string[] | null;
          id?: string;
          old_values?: Json | null;
          player_id?: string | null;
          proposed_values: Json;
          reason: string;
          requested_by: string;
          review_comment?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["change_request_status"];
        };
        Update: {
          action_type?: Database["public"]["Enums"]["change_request_action"];
          created_at?: string;
          created_player_id?: string | null;
          fields_changed?: string[] | null;
          id?: string;
          old_values?: Json | null;
          player_id?: string | null;
          proposed_values?: Json;
          reason?: string;
          requested_by?: string;
          review_comment?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["change_request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "player_change_requests_created_player_id_fkey";
            columns: ["created_player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_change_requests_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_change_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_change_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      players: {
        Row: {
          created_at: string;
          created_by: string | null;
          edad: number;
          id: string;
          internal_score: number;
          mental: number;
          nombre: string;
          physical: number;
          position_pref: Database["public"]["Enums"]["position_pref"];
          positions_possible: Database["public"]["Enums"]["position_pref"][];
          private_notes: string | null;
          rating_confidence: Database["public"]["Enums"]["rating_confidence"];
          role_field: Database["public"]["Enums"]["player_role_field"];
          status: Database["public"]["Enums"]["player_status"];
          technical: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          edad: number;
          id?: string;
          internal_score?: number;
          mental: number;
          nombre: string;
          physical: number;
          position_pref: Database["public"]["Enums"]["position_pref"];
          positions_possible?: Database["public"]["Enums"]["position_pref"][];
          private_notes?: string | null;
          rating_confidence?: Database["public"]["Enums"]["rating_confidence"];
          role_field: Database["public"]["Enums"]["player_role_field"];
          status?: Database["public"]["Enums"]["player_status"];
          technical: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          edad?: number;
          id?: string;
          internal_score?: number;
          mental?: number;
          nombre?: string;
          physical?: number;
          position_pref?: Database["public"]["Enums"]["position_pref"];
          positions_possible?: Database["public"]["Enums"]["position_pref"][];
          private_notes?: string | null;
          rating_confidence?: Database["public"]["Enums"]["rating_confidence"];
          role_field?: Database["public"]["Enums"]["player_role_field"];
          status?: Database["public"]["Enums"]["player_status"];
          technical?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          nombre: string | null;
          role: Database["public"]["Enums"]["user_role"] | null;
        };
        Insert: {
          created_at?: string;
          id: string;
          nombre?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          nombre?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_player_change_request: {
        Args: { p_comment?: string; p_request_id: string };
        Returns: undefined;
      };
      compute_internal_score: {
        Args: {
          p_edad: number;
          p_mental: number;
          p_physical: number;
          p_technical: number;
        };
        Returns: number;
      };
      current_user_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["user_role"];
      };
    };
    Enums: {
      change_request_action:
        | "create_player"
        | "update_sensitive_fields"
        | "deactivate_player"
        | "reactivate_player";
      change_request_status: "pending" | "approved" | "rejected" | "flagged";
      player_role_field: "arquero" | "jugador_campo" | "mixto";
      player_status: "pending" | "approved" | "inactive";
      position_pref: "defensor" | "mediocampista" | "delantero";
      rating_confidence: "baja" | "media" | "alta";
      user_role: "admin" | "veedor";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      change_request_action: [
        "create_player",
        "update_sensitive_fields",
        "deactivate_player",
        "reactivate_player",
      ],
      change_request_status: ["pending", "approved", "rejected", "flagged"],
      player_role_field: ["arquero", "jugador_campo", "mixto"],
      player_status: ["pending", "approved", "inactive"],
      position_pref: ["defensor", "mediocampista", "delantero"],
      rating_confidence: ["baja", "media", "alta"],
      user_role: ["admin", "veedor"],
    },
  },
} as const;
