import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
// refresh icon removed — manual refresh button replaced by cache-based auto-refresh
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccessTab } from "./components/bank-access-tab";
import { CategoriesTab } from "./components/categories-tab";
import { KontoinhaberTab } from "./components/kontoinhaber-tab";
import { RecipientAccountsTab } from "./components/recipient-accounts-tab";
import type { SettingsFormState } from "./types";
import type {
  BankDefinition,
  StoredBankCredentials,
} from "@/lib/bank-credentials";
import {
  deleteBankCredentials,
  fetchAvailableBanks,
  fetchBankCredentials,
  fetchBankAccounts,
  saveBankCredentials,
} from "@/lib/bank-credentials";
import { hasFreshCache } from "@/lib/fetch-cache";

const INITIAL_FORM_STATE: SettingsFormState = {
  bank_key: "",
  username: "",
  pin: "",
};

const SETTINGS_TAB_VALUES = [
  "banking",
  "kontoinhaber",
  "categories",
  "recipients",
] as const;
type SettingsTabValue = (typeof SETTINGS_TAB_VALUES)[number];

function isSettingsTabValue(value: string | null): value is SettingsTabValue {
  return Boolean(
    value && SETTINGS_TAB_VALUES.includes(value as SettingsTabValue),
  );
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<SettingsFormState>(INITIAL_FORM_STATE);
  const [linkedAccounts, setLinkedAccounts] = useState<StoredBankCredentials[]>(
    [],
  );
  const [availableBanks, setAvailableBanks] = useState<BankDefinition[]>([]);
  const [deletingScope, setDeletingScope] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [checkError, setCheckError] = useState<string | null>(null);
  const activeTab = useMemo<SettingsTabValue>(() => {
    const tab = searchParams.get("tab");
    return isSettingsTabValue(tab) ? tab : "banking";
  }, [searchParams]);

  const loadData = async (options?: { forceRefresh?: boolean }) => {
    const shouldShowLoading =
      options?.forceRefresh ||
      !(hasFreshCache("available-banks") && hasFreshCache("bank-credentials"));

    if (shouldShowLoading) {
      setAvailableBanks([]);
      setLinkedAccounts([]);
    }

    const [banks, credentials] = await Promise.all([
      fetchAvailableBanks({ forceRefresh: options?.forceRefresh }).catch(
        () => [],
      ),
      fetchBankCredentials({ forceRefresh: options?.forceRefresh }).catch(
        () => [],
      ),
    ]);

    setAvailableBanks(banks);
    setLinkedAccounts(credentials);
  };

  useEffect(() => {
    void loadData();

    const onCredentialsChanged = () => {
      void loadData({ forceRefresh: true });
    };

    window.addEventListener(
      "finance-bank-credentials-changed",
      onCredentialsChanged,
    );

    return () => {
      window.removeEventListener(
        "finance-bank-credentials-changed",
        onCredentialsChanged,
      );
    };
  }, []);

  const handleChange = <K extends keyof SettingsFormState>(
    field: K,
    value: SettingsFormState[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hasDuplicateCredentials = linkedAccounts.some(
      (credential) =>
        credential.bank_key === form.bank_key &&
        credential.username === form.username,
    );

    if (hasDuplicateCredentials) {
      setCheckError("Diese Anmeldedaten sind bereits hinterlegt.");
      setCheckDialogOpen(true);
      return;
    }

    setIsChecking(true);
    setCheckDialogOpen(true);
    setCheckError(null);
    setCheckMessage("Bankzugang wird gerade überprüft ...");

    try {
      const discoveredAccounts = await fetchBankAccounts({
        bank_key: form.bank_key,
        username: form.username,
        pin: form.pin,
      });

      setCheckMessage("Bankzugang ist gültig. Speichere jetzt ...");

      await saveBankCredentials({
        bank_key: form.bank_key,
        username: form.username,
        pin: form.pin,
        accounts: discoveredAccounts.accounts.map((account) => ({
          iban: account.iban,
          account_name: account.account_name ?? account.iban,
        })),
      });

      setForm(INITIAL_FORM_STATE);
      setCheckMessage("");
      setCheckDialogOpen(false);
      await loadData({ forceRefresh: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Bankzugang konnte nicht geprüft werden.";
      setCheckError(message);
      setCheckMessage("");
    } finally {
      setIsChecking(false);
    }
  };

  const handleDeleteOne = async (scope: string) => {
    setDeletingScope(scope);
    try {
      await deleteBankCredentials(scope);
      await loadData({ forceRefresh: true });
    } finally {
      setDeletingScope(null);
    }
  };

  // manual refresh removed: tabs auto-refresh on mount or on reference-change events

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Einstellungen</h1>
        </div>

        {/* manual refresh button removed — cache TTL and per-tab refresh handle reloading */}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (!isSettingsTabValue(value)) return;
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("tab", value);
            return next;
          });
        }}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="banking">Bankzugang</TabsTrigger>
          <TabsTrigger value="kontoinhaber">Kontoinhaber</TabsTrigger>
          <TabsTrigger value="recipients">Empfängerkonten</TabsTrigger>
          <TabsTrigger value="categories">Kategorien</TabsTrigger>
        </TabsList>

        <TabsContent value="banking" className="pt-4">
          <BankAccessTab
            form={form}
            linkedAccounts={linkedAccounts}
            availableBanks={availableBanks}
            deletingScope={deletingScope}
            isChecking={isChecking}
            checkDialogOpen={checkDialogOpen}
            checkMessage={checkMessage}
            checkError={checkError}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onCloseCheckDialog={() => {
              setCheckDialogOpen(false);
              setCheckError(null);
              setCheckMessage("");
            }}
            onDeleteOne={handleDeleteOne}
          />
        </TabsContent>

        <TabsContent value="kontoinhaber" className="pt-4">
          <KontoinhaberTab />
        </TabsContent>

        <TabsContent value="recipients" className="pt-4">
          <RecipientAccountsTab />
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <CategoriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
