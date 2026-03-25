import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Language {
  code: string;
  name: string;
}

export interface HotelLanguage {
  id: string;
  hotel_id: string;
  language_code: string;
  is_default: boolean;
}

export function useLanguages() {
  return useQuery<Language[]>({
    queryKey: ["languages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("languages" as any).select("*").order("name");
      if (error) throw error;
      return data as Language[];
    },
  });
}

export function useHotelLanguages(hotelId: string | undefined | null) {
  return useQuery<HotelLanguage[]>({
    queryKey: ["hotel_languages", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_languages" as any)
        .select("*")
        .eq("hotel_id", hotelId!);
      if (error) throw error;
      return data as HotelLanguage[];
    },
    enabled: !!hotelId,
  });
}
