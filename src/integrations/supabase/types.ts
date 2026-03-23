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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      booking_accommodations: {
        Row: {
          adults: number | null
          children: number | null
          created_at: string
          id: string
          notes: string | null
          request_id: string
          room_type: string | null
          treatment: string | null
        }
        Insert: {
          adults?: number | null
          children?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          request_id: string
          room_type?: string | null
          treatment?: string | null
        }
        Update: {
          adults?: number | null
          children?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          request_id?: string
          room_type?: string | null
          treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_accommodations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          email_message_id: string | null
          id: string
          request_id: string
          sent_at: string
          subject: string | null
          x_hotel_request_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          email_message_id?: string | null
          id?: string
          request_id: string
          sent_at?: string
          subject?: string | null
          x_hotel_request_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          email_message_id?: string | null
          id?: string
          request_id?: string
          sent_at?: string
          subject?: string | null
          x_hotel_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          address: string | null
          alternative_dates: string | null
          assigned_to: string | null
          check_in: string | null
          check_out: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string | null
          gender: string | null
          hotel_id: string
          id: string
          language: string | null
          last_name: string | null
          notes: string | null
          offer_id: string | null
          phone: string | null
          source_email_id: string | null
          status: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          alternative_dates?: string | null
          assigned_to?: string | null
          check_in?: string | null
          check_out?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          gender?: string | null
          hotel_id: string
          id?: string
          language?: string | null
          last_name?: string | null
          notes?: string | null
          offer_id?: string | null
          phone?: string | null
          source_email_id?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          alternative_dates?: string | null
          assigned_to?: string | null
          check_in?: string | null
          check_out?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          gender?: string | null
          hotel_id?: string
          id?: string
          language?: string | null
          last_name?: string | null
          notes?: string | null
          offer_id?: string | null
          phone?: string | null
          source_email_id?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_email_settings: {
        Row: {
          created_at: string
          filter_sender_email: string | null
          hotel_id: string
          id: string
          imap_host: string | null
          imap_password: string | null
          imap_port: number | null
          imap_use_ssl: boolean | null
          imap_user: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_use_ssl: boolean | null
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          filter_sender_email?: string | null
          hotel_id: string
          id?: string
          imap_host?: string | null
          imap_password?: string | null
          imap_port?: number | null
          imap_use_ssl?: boolean | null
          imap_user?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_use_ssl?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          filter_sender_email?: string | null
          hotel_id?: string
          id?: string
          imap_host?: string | null
          imap_password?: string | null
          imap_port?: number | null
          imap_use_ssl?: boolean | null
          imap_user?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_use_ssl?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_email_settings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      offer_templates: {
        Row: {
          body_template: string
          created_at: string
          hotel_id: string
          id: string
          name: string
          subject_template: string | null
          updated_at: string
        }
        Insert: {
          body_template: string
          created_at?: string
          hotel_id: string
          id?: string
          name: string
          subject_template?: string | null
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          hotel_id?: string
          id?: string
          name?: string
          subject_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_templates_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      price_periods: {
        Row: {
          created_at: string
          end_date: string
          hotel_id: string
          id: string
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          hotel_id: string
          id?: string
          name: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          hotel_id?: string
          id?: string
          name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_periods_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          hotel_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          hotel_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          hotel_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      room_prices: {
        Row: {
          id: string
          period_id: string
          price_per_night: number
          room_id: string
        }
        Insert: {
          id?: string
          period_id: string
          price_per_night?: number
          room_id: string
        }
        Update: {
          id?: string
          period_id?: string
          price_per_night?: number
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_prices_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "price_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_prices_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          beds: string | null
          created_at: string
          hotel_id: string
          id: string
          max_occupancy: number
          min_occupancy: number
          name: string
          photo_url_1: string | null
          photo_url_2: string | null
          photo_url_3: string | null
          photo_url_4: string | null
          site_url: string | null
          updated_at: string
        }
        Insert: {
          beds?: string | null
          created_at?: string
          hotel_id: string
          id?: string
          max_occupancy?: number
          min_occupancy?: number
          name: string
          photo_url_1?: string | null
          photo_url_2?: string | null
          photo_url_3?: string | null
          photo_url_4?: string | null
          site_url?: string | null
          updated_at?: string
        }
        Update: {
          beds?: string | null
          created_at?: string
          hotel_id?: string
          id?: string
          max_occupancy?: number
          min_occupancy?: number
          name?: string
          photo_url_1?: string | null
          photo_url_2?: string | null
          photo_url_3?: string | null
          photo_url_4?: string | null
          site_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_hotel_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
