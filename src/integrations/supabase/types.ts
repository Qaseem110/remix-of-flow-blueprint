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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          data: Json
          doctor_id: string
          id: string
          patient_id: string
        }
        Insert: {
          data?: Json
          doctor_id: string
          id: string
          patient_id: string
        }
        Update: {
          data?: Json
          doctor_id?: string
          id?: string
          patient_id?: string
        }
        Relationships: []
      }
      availability: {
        Row: {
          data: Json
          id: string
        }
        Insert: {
          data?: Json
          id: string
        }
        Update: {
          data?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          path: string
          role: string
          started_at: string
          uploader_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          path: string
          role?: string
          started_at?: string
          uploader_id?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          path?: string
          role?: string
          started_at?: string
          uploader_id?: string
        }
        Relationships: []
      }
      consultations: {
        Row: {
          data: Json
          doctor_id: string
          id: string
          patient_id: string
        }
        Insert: {
          data?: Json
          doctor_id: string
          id: string
          patient_id: string
        }
        Update: {
          data?: Json
          doctor_id?: string
          id?: string
          patient_id?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          data: Json
          id: string
        }
        Insert: {
          data?: Json
          id: string
        }
        Update: {
          data?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          data: Json
          id: string
          pharmacy_id: string
        }
        Insert: {
          data?: Json
          id: string
          pharmacy_id: string
        }
        Update: {
          data?: Json
          id?: string
          pharmacy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_outbox: {
        Row: {
          appointment_id: string | null
          body: string
          created_at: string
          error: string | null
          id: string
          phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          appointment_id?: string | null
          body: string
          created_at?: string
          error?: string | null
          id?: string
          phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string | null
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          data: Json
          id: string
          user_id: string
        }
        Insert: {
          data?: Json
          id: string
          user_id: string
        }
        Update: {
          data?: Json
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          data: Json
          id: string
        }
        Insert: {
          data?: Json
          id: string
        }
        Update: {
          data?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacies: {
        Row: {
          data: Json
          id: string
        }
        Insert: {
          data?: Json
          id: string
        }
        Update: {
          data?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacies_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      private_notes: {
        Row: {
          doctor_id: string
          id: string
          notes: string
        }
        Insert: {
          doctor_id: string
          id: string
          notes?: string
        }
        Update: {
          doctor_id?: string
          id?: string
          notes?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          data: Json
          id: string
          role: string
        }
        Insert: {
          data?: Json
          id: string
          role?: string
        }
        Update: {
          data?: Json
          id?: string
          role?: string
        }
        Relationships: []
      }
      receptionists: {
        Row: {
          created_at: string
          data: Json
          doctor_id: string
          id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          doctor_id: string
          id: string
        }
        Update: {
          created_at?: string
          data?: Json
          doctor_id?: string
          id?: string
        }
        Relationships: []
      }
      report_access: {
        Row: {
          doctor_id: string
          expires_at: string
          patient_id: string
        }
        Insert: {
          doctor_id: string
          expires_at: string
          patient_id: string
        }
        Update: {
          doctor_id?: string
          expires_at?: string
          patient_id?: string
        }
        Relationships: []
      }
      report_pins: {
        Row: {
          patient_id: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          patient_id: string
          pin_hash: string
          updated_at?: string
        }
        Update: {
          patient_id?: string
          pin_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          data: Json
          doctor_id: string
          id: string
          patient_id: string
        }
        Insert: {
          data?: Json
          doctor_id: string
          id: string
          patient_id: string
        }
        Update: {
          data?: Json
          doctor_id?: string
          id?: string
          patient_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          data: Json
          id: string
        }
        Insert: {
          data?: Json
          id: string
        }
        Update: {
          data?: Json
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_report_access: { Args: { patient: string }; Returns: boolean }
      has_report_pin: { Args: { patient: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      kiosk_check_in: {
        Args: { method: string; value: string }
        Returns: string
      }
      reception_can: { Args: { _perm: string }; Returns: boolean }
      reception_doctor: { Args: never; Returns: string }
      schedule_shifts: { Args: { av: Json; day: string }; Returns: Json }
      set_report_pin: { Args: { pin: string }; Returns: undefined }
      shift_queue_times: {
        Args: { _date: string; _doctor: string; _minutes: number }
        Returns: undefined
      }
      unlock_patient_reports: {
        Args: { patient: string; pin: string }
        Returns: boolean
      }
      verify_report_pin: {
        Args: { patient: string; pin: string }
        Returns: boolean
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
