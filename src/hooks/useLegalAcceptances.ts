import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface LegalAcceptance {
  id: string;
  doc_type: string;
  version: number;
  accepted_at: string;
}

/** The signed-in user's own acceptance receipts (most recent per document). */
export function useAcceptedLegalVersions() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LegalAcceptance[]>([]);

  useEffect(() => {
    if (!user) {
      setRows([]);
      return;
    }
    let active = true;
    supabase
      .from("legal_acceptances")
      .select("id,doc_type,version,accepted_at")
      .order("accepted_at", { ascending: false })
      .then(({ data }) => {
        if (active && data) setRows(data as LegalAcceptance[]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return rows;
}
