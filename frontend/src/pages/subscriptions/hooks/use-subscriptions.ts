import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl, parseJsonResponse } from "@/lib/api";

export type SubscriptionFrequency = "MONTHLY" | "SEMI_ANNUAL" | "ANNUAL";

export interface SubscriptionTransaction {
  id: number;
  amount: number;
  date: string;
  purpose: string;
  applicantName: string;
  recipientName: string;
  note: string | null;
}

export interface Subscription {
  name: string;
  _counterpartyName?: string;
  recipientLogo?: string;
  recipientName: string;
  recipientId: number;
  datenbankName?: string;
  logoWhiteBackground?: boolean;
  logoPadding?: boolean;
  isCompany?: boolean;
  amount: number;
  refundAmount: number;
  effectiveAmount: number;
  frequency: SubscriptionFrequency;
  frequencyLabel: string;
  firstDate: string;
  lastDate: string;
  nextDate: string;
  transactionCount: number;
  transactionIds: number[];
  transactions: SubscriptionTransaction[];
  sequenztyp: string;
}

export interface SubscriptionIdentity {
  id: number;
  counterpartyName: string;
  amount: number;
  displayName: string | null;
  zahlungspartnerId: number | null;
  dismissed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function createSubscriptionIdentity(payload: {
  counterpartyName: string;
  amount: number;
  displayName?: string | null;
  zahlungspartnerId?: number | null;
  dismissed?: boolean;
}): Promise<SubscriptionIdentity> {
  const response = await fetch(`${getApiBaseUrl()}/db/subscriptions/identities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function updateSubscriptionIdentity(
  identityId: number,
  payload: Partial<{
    displayName: string;
    zahlungspartnerId: number | null;
  }>,
): Promise<SubscriptionIdentity> {
  const response = await fetch(`${getApiBaseUrl()}/db/subscriptions/identities/${identityId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function deleteSubscriptionIdentity(identityId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/subscriptions/identities/${identityId}`, {
    method: "DELETE",
  });
  await parseJsonResponse(response);
}

export async function listSubscriptionIdentities(): Promise<{
  count: number;
  identities: SubscriptionIdentity[];
}> {
  const response = await fetch(`${getApiBaseUrl()}/db/subscriptions/identities`);
  return parseJsonResponse(response);
}

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/db/subscriptions`);

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Abonnements konnten nicht geladen werden");
      }
      setSubscriptions(payload.subscriptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const groups: Record<SubscriptionFrequency, Subscription[]> = {
      MONTHLY: [],
      SEMI_ANNUAL: [],
      ANNUAL: [],
    };
    for (const sub of subscriptions) {
      groups[sub.frequency].push(sub);
    }
    return groups;
  }, [subscriptions]);

  const removeSubscription = useCallback(
    (counterpartyName: string, amount: number) => {
      setSubscriptions((prev) =>
        prev.filter(
          (s) => s._counterpartyName !== counterpartyName || s.amount !== amount,
        ),
      );
    },
    [],
  );

  return {
    loading,
    error,
    subscriptions,
    grouped,
    reload: load,
    removeSubscription,
  };
}
