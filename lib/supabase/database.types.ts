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
      convocatoria_players: {
        Row: {
          added_at: string;
          attendance_status: Database["public"]["Enums"]["attendance_status"];
          convocatoria_id: string;
          id: string;
          nombre_libre: string | null;
          orden_suplente: number | null;
          player_id: string | null;
          rol_en_convocatoria: Database["public"]["Enums"]["membresia_tipo"];
          updated_at: string;
          waitlist_order: number | null;
        };
        Insert: {
          added_at?: string;
          attendance_status?: Database["public"]["Enums"]["attendance_status"];
          convocatoria_id: string;
          id?: string;
          nombre_libre?: string | null;
          orden_suplente?: number | null;
          player_id?: string | null;
          rol_en_convocatoria: Database["public"]["Enums"]["membresia_tipo"];
          updated_at?: string;
          waitlist_order?: number | null;
        };
        Update: {
          added_at?: string;
          attendance_status?: Database["public"]["Enums"]["attendance_status"];
          convocatoria_id?: string;
          id?: string;
          nombre_libre?: string | null;
          orden_suplente?: number | null;
          player_id?: string | null;
          rol_en_convocatoria?: Database["public"]["Enums"]["membresia_tipo"];
          updated_at?: string;
          waitlist_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "convocatoria_players_convocatoria_id_fkey";
            columns: ["convocatoria_id"];
            isOneToOne: false;
            referencedRelation: "convocatorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "convocatoria_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "convocatoria_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
            referencedColumns: ["id"];
          },
        ];
      };
      convocatorias: {
        Row: {
          cierre_at: string | null;
          created_at: string;
          created_by: string;
          cupo_max: number | null;
          cupo_maximo: number;
          fecha: string;
          grupo_id: string | null;
          hora: string;
          id: string;
          lugar_id: string | null;
          modo: Database["public"]["Enums"]["convocatoria_modo"];
          notas: string | null;
          status: Database["public"]["Enums"]["convocatoria_status"];
          team_draft: Json | null;
          updated_at: string;
        };
        Insert: {
          cierre_at?: string | null;
          created_at?: string;
          created_by: string;
          cupo_max?: number | null;
          cupo_maximo?: number;
          fecha: string;
          grupo_id?: string | null;
          hora?: string;
          id?: string;
          lugar_id?: string | null;
          modo?: Database["public"]["Enums"]["convocatoria_modo"];
          notas?: string | null;
          status?: Database["public"]["Enums"]["convocatoria_status"];
          team_draft?: Json | null;
          updated_at?: string;
        };
        Update: {
          cierre_at?: string | null;
          created_at?: string;
          created_by?: string;
          cupo_max?: number | null;
          cupo_maximo?: number;
          fecha?: string;
          grupo_id?: string | null;
          hora?: string;
          id?: string;
          lugar_id?: string | null;
          modo?: Database["public"]["Enums"]["convocatoria_modo"];
          notas?: string | null;
          status?: Database["public"]["Enums"]["convocatoria_status"];
          team_draft?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "convocatorias_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "convocatorias_grupo_id_fkey";
            columns: ["grupo_id"];
            isOneToOne: false;
            referencedRelation: "grupos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "convocatorias_lugar_id_fkey";
            columns: ["lugar_id"];
            isOneToOne: false;
            referencedRelation: "lugares";
            referencedColumns: ["id"];
          },
        ];
      };
      grupo_membresias: {
        Row: {
          created_at: string;
          grupo_id: string;
          id: string;
          inactivated_at: string | null;
          inactivated_by: string | null;
          joined_at: string;
          orden: number | null;
          player_id: string;
          status: Database["public"]["Enums"]["membresia_status"];
          tipo: Database["public"]["Enums"]["membresia_tipo"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          grupo_id: string;
          id?: string;
          inactivated_at?: string | null;
          inactivated_by?: string | null;
          joined_at?: string;
          orden?: number | null;
          player_id: string;
          status?: Database["public"]["Enums"]["membresia_status"];
          tipo: Database["public"]["Enums"]["membresia_tipo"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          grupo_id?: string;
          id?: string;
          inactivated_at?: string | null;
          inactivated_by?: string | null;
          joined_at?: string;
          orden?: number | null;
          player_id?: string;
          status?: Database["public"]["Enums"]["membresia_status"];
          tipo?: Database["public"]["Enums"]["membresia_tipo"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grupo_membresias_grupo_id_fkey";
            columns: ["grupo_id"];
            isOneToOne: false;
            referencedRelation: "grupos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grupo_membresias_inactivated_by_fkey";
            columns: ["inactivated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grupo_membresias_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grupo_membresias_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
            referencedColumns: ["id"];
          },
        ];
      };
      grupos: {
        Row: {
          auto_renovar: boolean;
          cierre_minutes_after_start: number;
          created_at: string;
          cupo_titulares: number;
          dia_semana: number;
          hora: string;
          id: string;
          join_token: string | null;
          lugar_id: string;
          nombre: string;
          owner_id: string;
          status: Database["public"]["Enums"]["grupo_status"];
          updated_at: string;
        };
        Insert: {
          auto_renovar?: boolean;
          cierre_minutes_after_start?: number;
          created_at?: string;
          cupo_titulares?: number;
          dia_semana: number;
          hora?: string;
          id?: string;
          join_token?: string | null;
          lugar_id: string;
          nombre: string;
          owner_id: string;
          status?: Database["public"]["Enums"]["grupo_status"];
          updated_at?: string;
        };
        Update: {
          auto_renovar?: boolean;
          cierre_minutes_after_start?: number;
          created_at?: string;
          cupo_titulares?: number;
          dia_semana?: number;
          hora?: string;
          id?: string;
          join_token?: string | null;
          lugar_id?: string;
          nombre?: string;
          owner_id?: string;
          status?: Database["public"]["Enums"]["grupo_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grupos_lugar_id_fkey";
            columns: ["lugar_id"];
            isOneToOne: false;
            referencedRelation: "lugares";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grupos_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lugares: {
        Row: {
          created_at: string;
          created_by: string;
          google_maps_url: string | null;
          id: string;
          nombre: string;
          ubicacion_maps_url: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          google_maps_url?: string | null;
          id?: string;
          nombre: string;
          ubicacion_maps_url?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          google_maps_url?: string | null;
          id?: string;
          nombre?: string;
          ubicacion_maps_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lugares_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      match_player_stats: {
        Row: {
          asistencias: number;
          created_at: string;
          goals: number;
          id: string;
          match_id: string;
          notas: string | null;
          player_id: string;
          updated_at: string;
        };
        Insert: {
          asistencias?: number;
          created_at?: string;
          goals?: number;
          id?: string;
          match_id: string;
          notas?: string | null;
          player_id: string;
          updated_at?: string;
        };
        Update: {
          asistencias?: number;
          created_at?: string;
          goals?: number;
          id?: string;
          match_id?: string;
          notas?: string | null;
          player_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_player_stats_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_player_stats_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_player_stats_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
            referencedColumns: ["id"];
          },
        ];
      };
      match_team_players: {
        Row: {
          assigned_position: Database["public"]["Enums"]["position_pref"] | null;
          created_at: string;
          id: string;
          is_goalkeeper: boolean;
          match_team_id: string;
          player_id: string;
        };
        Insert: {
          assigned_position?: Database["public"]["Enums"]["position_pref"] | null;
          created_at?: string;
          id?: string;
          is_goalkeeper?: boolean;
          match_team_id: string;
          player_id: string;
        };
        Update: {
          assigned_position?: Database["public"]["Enums"]["position_pref"] | null;
          created_at?: string;
          id?: string;
          is_goalkeeper?: boolean;
          match_team_id?: string;
          player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_team_players_match_team_id_fkey";
            columns: ["match_team_id"];
            isOneToOne: false;
            referencedRelation: "match_teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_team_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_team_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
            referencedColumns: ["id"];
          },
        ];
      };
      match_teams: {
        Row: {
          balance_meta: Json | null;
          created_at: string;
          id: string;
          match_id: string;
          team_label: Database["public"]["Enums"]["match_team_label"];
          total_score: number | null;
        };
        Insert: {
          balance_meta?: Json | null;
          created_at?: string;
          id?: string;
          match_id: string;
          team_label: Database["public"]["Enums"]["match_team_label"];
          total_score?: number | null;
        };
        Update: {
          balance_meta?: Json | null;
          created_at?: string;
          id?: string;
          match_id?: string;
          team_label?: Database["public"]["Enums"]["match_team_label"];
          total_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_teams_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          algorithm_version: string;
          balance_snapshot: Json | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          confirmed_with_warning: boolean;
          convocatoria_id: string;
          created_at: string;
          fecha: string;
          figura_player_id: string | null;
          id: string;
          notas: string | null;
          score_team_a: number | null;
          score_team_b: number | null;
          updated_at: string;
          video_resumen_url: string | null;
          winner: Database["public"]["Enums"]["match_winner"] | null;
        };
        Insert: {
          algorithm_version?: string;
          balance_snapshot?: Json | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          confirmed_with_warning?: boolean;
          convocatoria_id: string;
          created_at?: string;
          fecha: string;
          figura_player_id?: string | null;
          id?: string;
          notas?: string | null;
          score_team_a?: number | null;
          score_team_b?: number | null;
          updated_at?: string;
          video_resumen_url?: string | null;
          winner?: Database["public"]["Enums"]["match_winner"] | null;
        };
        Update: {
          algorithm_version?: string;
          balance_snapshot?: Json | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          confirmed_with_warning?: boolean;
          convocatoria_id?: string;
          created_at?: string;
          fecha?: string;
          figura_player_id?: string | null;
          id?: string;
          notas?: string | null;
          score_team_a?: number | null;
          score_team_b?: number | null;
          updated_at?: string;
          video_resumen_url?: string | null;
          winner?: Database["public"]["Enums"]["match_winner"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_convocatoria_id_fkey";
            columns: ["convocatoria_id"];
            isOneToOne: true;
            referencedRelation: "convocatorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_figura_player_id_fkey";
            columns: ["figura_player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_figura_player_id_fkey";
            columns: ["figura_player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
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
            foreignKeyName: "player_change_requests_created_player_id_fkey";
            columns: ["created_player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
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
            foreignKeyName: "player_change_requests_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
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
      player_invitations: {
        Row: {
          convocatoria_id: string | null;
          created_at: string;
          created_by: string;
          declined_at: string | null;
          expires_at: string;
          grupo_id: string;
          id: string;
          nombre_tentativo: string | null;
          phone: string;
          token: string;
          used_at: string | null;
          used_by_player_id: string | null;
        };
        Insert: {
          convocatoria_id?: string | null;
          created_at?: string;
          created_by: string;
          declined_at?: string | null;
          expires_at: string;
          grupo_id: string;
          id?: string;
          nombre_tentativo?: string | null;
          phone: string;
          token: string;
          used_at?: string | null;
          used_by_player_id?: string | null;
        };
        Update: {
          convocatoria_id?: string | null;
          created_at?: string;
          created_by?: string;
          declined_at?: string | null;
          expires_at?: string;
          grupo_id?: string;
          id?: string;
          nombre_tentativo?: string | null;
          phone?: string;
          token?: string;
          used_at?: string | null;
          used_by_player_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_invitations_convocatoria_id_fkey";
            columns: ["convocatoria_id"];
            isOneToOne: false;
            referencedRelation: "convocatorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_invitations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_invitations_grupo_id_fkey";
            columns: ["grupo_id"];
            isOneToOne: false;
            referencedRelation: "grupos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_invitations_used_by_player_id_fkey";
            columns: ["used_by_player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_invitations_used_by_player_id_fkey";
            columns: ["used_by_player_id"];
            isOneToOne: false;
            referencedRelation: "players_public";
            referencedColumns: ["id"];
          },
        ];
      };
      players: {
        Row: {
          apodo: string | null;
          auth_user_id: string | null;
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          edad: number;
          email: string | null;
          fecha_nacimiento: string | null;
          id: string;
          internal_score: number;
          ment_attitude: number | null;
          ment_resilience: number | null;
          ment_tactical: number | null;
          mental: number;
          nombre: string;
          phone: string | null;
          phys_power: number | null;
          phys_speed: number | null;
          phys_stamina: number | null;
          physical: number;
          pierna_habil: Database["public"]["Enums"]["pierna_habil_enum"] | null;
          position_pref: Database["public"]["Enums"]["position_pref"];
          positions_possible: Database["public"]["Enums"]["position_pref"][];
          private_notes: string | null;
          rating_confidence: Database["public"]["Enums"]["rating_confidence"];
          role_field: Database["public"]["Enums"]["player_role_field"];
          status: Database["public"]["Enums"]["player_status"];
          tech_finishing: number | null;
          tech_linkup: number | null;
          tech_passing: number | null;
          technical: number;
          ubicacion_maps_url: string | null;
          updated_at: string;
        };
        Insert: {
          apodo?: string | null;
          auth_user_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          edad: number;
          email?: string | null;
          fecha_nacimiento?: string | null;
          id?: string;
          internal_score?: number;
          ment_attitude?: number | null;
          ment_resilience?: number | null;
          ment_tactical?: number | null;
          mental: number;
          nombre: string;
          phone?: string | null;
          phys_power?: number | null;
          phys_speed?: number | null;
          phys_stamina?: number | null;
          physical: number;
          pierna_habil?: Database["public"]["Enums"]["pierna_habil_enum"] | null;
          position_pref: Database["public"]["Enums"]["position_pref"];
          positions_possible?: Database["public"]["Enums"]["position_pref"][];
          private_notes?: string | null;
          rating_confidence?: Database["public"]["Enums"]["rating_confidence"];
          role_field: Database["public"]["Enums"]["player_role_field"];
          status?: Database["public"]["Enums"]["player_status"];
          tech_finishing?: number | null;
          tech_linkup?: number | null;
          tech_passing?: number | null;
          technical: number;
          ubicacion_maps_url?: string | null;
          updated_at?: string;
        };
        Update: {
          apodo?: string | null;
          auth_user_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          edad?: number;
          email?: string | null;
          fecha_nacimiento?: string | null;
          id?: string;
          internal_score?: number;
          ment_attitude?: number | null;
          ment_resilience?: number | null;
          ment_tactical?: number | null;
          mental?: number;
          nombre?: string;
          phone?: string | null;
          phys_power?: number | null;
          phys_speed?: number | null;
          phys_stamina?: number | null;
          physical?: number;
          pierna_habil?: Database["public"]["Enums"]["pierna_habil_enum"] | null;
          position_pref?: Database["public"]["Enums"]["position_pref"];
          positions_possible?: Database["public"]["Enums"]["position_pref"][];
          private_notes?: string | null;
          rating_confidence?: Database["public"]["Enums"]["rating_confidence"];
          role_field?: Database["public"]["Enums"]["player_role_field"];
          status?: Database["public"]["Enums"]["player_status"];
          tech_finishing?: number | null;
          tech_linkup?: number | null;
          tech_passing?: number | null;
          technical?: number;
          ubicacion_maps_url?: string | null;
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
      players_public: {
        Row: {
          apodo: string | null;
          avatar_url: string | null;
          fecha_nacimiento: string | null;
          id: string | null;
          nombre: string | null;
          pierna_habil: Database["public"]["Enums"]["pierna_habil_enum"] | null;
          position_pref: Database["public"]["Enums"]["position_pref"] | null;
          positions_possible: Database["public"]["Enums"]["position_pref"][] | null;
          role_field: Database["public"]["Enums"]["player_role_field"] | null;
          status: Database["public"]["Enums"]["player_status"] | null;
          ubicacion_maps_url: string | null;
        };
        Insert: {
          apodo?: string | null;
          avatar_url?: string | null;
          fecha_nacimiento?: string | null;
          id?: string | null;
          nombre?: string | null;
          pierna_habil?: Database["public"]["Enums"]["pierna_habil_enum"] | null;
          position_pref?: Database["public"]["Enums"]["position_pref"] | null;
          positions_possible?: Database["public"]["Enums"]["position_pref"][] | null;
          role_field?: Database["public"]["Enums"]["player_role_field"] | null;
          status?: Database["public"]["Enums"]["player_status"] | null;
          ubicacion_maps_url?: string | null;
        };
        Update: {
          apodo?: string | null;
          avatar_url?: string | null;
          fecha_nacimiento?: string | null;
          id?: string | null;
          nombre?: string | null;
          pierna_habil?: Database["public"]["Enums"]["pierna_habil_enum"] | null;
          position_pref?: Database["public"]["Enums"]["position_pref"] | null;
          positions_possible?: Database["public"]["Enums"]["position_pref"][] | null;
          role_field?: Database["public"]["Enums"]["player_role_field"] | null;
          status?: Database["public"]["Enums"]["player_status"] | null;
          ubicacion_maps_url?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _conv_compactar_cola: {
        Args: { p_convocatoria_id: string; p_from_orden: number };
        Returns: undefined;
      };
      _next_partido_at: {
        Args: { p_dia_semana: number; p_hora: string };
        Returns: string;
      };
      admin_remove_from_convocatoria: {
        Args: { p_convocatoria_player_id: string };
        Returns: undefined;
      };
      age_physical_factor: { Args: { p_edad: number }; Returns: number };
      approve_player_change_request: {
        Args: { p_comment?: string; p_request_id: string };
        Returns: undefined;
      };
      claim_group_join: {
        Args: {
          p_auth_user_id: string;
          p_edad: number;
          p_fecha_nacimiento: string;
          p_nombre: string;
          p_phone: string;
          p_position_pref: Database["public"]["Enums"]["position_pref"];
          p_role_field: Database["public"]["Enums"]["player_role_field"];
          p_token: string;
        };
        Returns: string;
      };
      claim_invite: {
        Args: {
          p_auth_user_id: string;
          p_edad: number;
          p_fecha_nacimiento: string;
          p_nombre: string;
          p_position_pref: Database["public"]["Enums"]["position_pref"];
          p_role_field: Database["public"]["Enums"]["player_role_field"];
          p_token: string;
        };
        Returns: string;
      };
      close_and_create_next_convocatoria: {
        Args: { p_convocatoria_id: string };
        Returns: string;
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
      compute_internal_score_v2: {
        Args: {
          p_edad: number;
          p_mental: number;
          p_physical: number;
          p_technical: number;
        };
        Returns: number;
      };
      confirm_match_cleanup: {
        Args: { p_match_id: string };
        Returns: undefined;
      };
      create_convocatoria_from_grupo: {
        Args: { p_fecha?: string; p_grupo_id: string };
        Returns: string;
      };
      create_next_convocatoria: {
        Args: { p_source_conv_id: string };
        Returns: string;
      };
      current_player_id: { Args: never; Returns: string };
      current_user_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      decline_invite_by_token: { Args: { p_token: string }; Returns: boolean };
      flag_player_change_request: {
        Args: { p_comment?: string; p_request_id: string };
        Returns: undefined;
      };
      get_group_by_join_token: {
        Args: { p_token: string };
        Returns: {
          grupo_cupo_titulares: number;
          grupo_dia_semana: number;
          grupo_hora: string;
          grupo_id: string;
          grupo_nombre: string;
          lugar_google_maps_url: string;
          lugar_nombre: string;
        }[];
      };
      get_invite_by_token: {
        Args: { p_token: string };
        Returns: {
          convocatoria_fecha: string;
          convocatoria_hora: string;
          convocatoria_id: string;
          grupo_cupo_titulares: number;
          grupo_dia_semana: number;
          grupo_hora: string;
          grupo_id: string;
          grupo_nombre: string;
          invite_declined_at: string;
          invite_expires_at: string;
          invite_id: string;
          invite_nombre_tentativo: string;
          invite_phone: string;
          invite_used_at: string;
          lugar_google_maps_url: string;
          lugar_nombre: string;
        }[];
      };
      get_my_confirmed_match_teams: {
        Args: never;
        Returns: {
          apodo: string;
          fecha: string;
          grupo_id: string;
          is_goalkeeper: boolean;
          nombre: string;
          player_id: string;
          team_label: string;
        }[];
      };
      get_my_match_history: {
        Args: never;
        Returns: {
          asistencias: number;
          fecha: string;
          figura_es_mia: boolean;
          figura_nombre: string;
          goles: number;
          grupo_id: string;
          grupo_nombre: string;
          match_id: string;
          resultado: string;
          team_label: string;
          video_resumen_url: string;
        }[];
      };
      get_my_player_full: {
        Args: never;
        Returns: {
          apodo: string;
          email: string;
          fecha_nacimiento: string;
          id: string;
          nombre: string;
          phone: string;
          pierna_habil: Database["public"]["Enums"]["pierna_habil_enum"];
          position_pref: Database["public"]["Enums"]["position_pref"];
          positions_possible: Database["public"]["Enums"]["position_pref"][];
          role_field: Database["public"]["Enums"]["player_role_field"];
          status: Database["public"]["Enums"]["player_status"];
          ubicacion_maps_url: string;
        }[];
      };
      get_my_player_summary: {
        Args: never;
        Returns: {
          apodo: string;
          avatar_url: string;
          id: string;
          nombre: string;
          status: Database["public"]["Enums"]["player_status"];
        }[];
      };
      has_any_membership_in_grupo: {
        Args: { p_grupo_id: string };
        Returns: boolean;
      };
      is_active_member_of_grupo: {
        Args: { p_grupo_id: string };
        Returns: boolean;
      };
      is_member_of_conv_grupo: {
        Args: { p_convocatoria_id: string };
        Returns: boolean;
      };
      player_decline_convocatoria: {
        Args: { p_convocatoria_id: string };
        Returns: undefined;
      };
      player_join_open_convocatoria: {
        Args: { p_convocatoria_id: string };
        Returns: string;
      };
      player_join_suplente_queue: {
        Args: { p_grupo_id: string };
        Returns: string;
      };
      player_undo_decline_convocatoria: {
        Args: { p_convocatoria_id: string };
        Returns: string;
      };
      reject_player_change_request: {
        Args: { p_comment?: string; p_request_id: string };
        Returns: undefined;
      };
      set_convocatoria_cupo: {
        Args: { p_convocatoria_id: string; p_nuevo_cupo: number };
        Returns: undefined;
      };
      update_my_player_data: {
        Args: {
          p_apodo: string;
          p_email: string;
          p_fecha_nacimiento: string;
          p_nombre: string;
          p_pierna_habil: Database["public"]["Enums"]["pierna_habil_enum"];
          p_position_pref: Database["public"]["Enums"]["position_pref"];
          p_positions_possible: Database["public"]["Enums"]["position_pref"][];
          p_role_field: Database["public"]["Enums"]["player_role_field"];
          p_ubicacion_maps_url: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      attendance_status:
        | "pendiente"
        | "confirmado"
        | "declinado"
        | "ausente_sin_aviso"
        | "lista_espera";
      change_request_action:
        | "create_player"
        | "update_sensitive_fields"
        | "deactivate_player"
        | "reactivate_player"
        | "assign_initial_ratings";
      change_request_status: "pending" | "approved" | "rejected" | "flagged";
      convocatoria_modo: "cerrada" | "abierta";
      convocatoria_status: "abierta" | "cerrada" | "jugada" | "cancelada";
      grupo_status: "activo" | "archivado";
      match_team_label: "A" | "B";
      match_winner: "a" | "b" | "empate";
      membresia_status: "activo" | "inactivo";
      membresia_tipo: "titular" | "suplente";
      pierna_habil_enum: "derecha" | "izquierda" | "ambas";
      player_role_field: "arquero" | "jugador_campo" | "mixto";
      player_status: "pending" | "approved" | "inactive";
      position_pref: "defensor" | "mediocampista" | "delantero" | "arquero";
      rating_confidence: "baja" | "media" | "alta";
      user_role: "admin" | "veedor" | "player";
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
      attendance_status: [
        "pendiente",
        "confirmado",
        "declinado",
        "ausente_sin_aviso",
        "lista_espera",
      ],
      change_request_action: [
        "create_player",
        "update_sensitive_fields",
        "deactivate_player",
        "reactivate_player",
        "assign_initial_ratings",
      ],
      change_request_status: ["pending", "approved", "rejected", "flagged"],
      convocatoria_modo: ["cerrada", "abierta"],
      convocatoria_status: ["abierta", "cerrada", "jugada", "cancelada"],
      grupo_status: ["activo", "archivado"],
      match_team_label: ["A", "B"],
      match_winner: ["a", "b", "empate"],
      membresia_status: ["activo", "inactivo"],
      membresia_tipo: ["titular", "suplente"],
      pierna_habil_enum: ["derecha", "izquierda", "ambas"],
      player_role_field: ["arquero", "jugador_campo", "mixto"],
      player_status: ["pending", "approved", "inactive"],
      position_pref: ["defensor", "mediocampista", "delantero", "arquero"],
      rating_confidence: ["baja", "media", "alta"],
      user_role: ["admin", "veedor", "player"],
    },
  },
} as const;
