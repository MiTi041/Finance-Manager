import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductIdTab } from "./tabs/product-id-tab";
import { DbExportImportTab } from "./tabs/db-export-import-tab";
import { BankAccessTab } from "./tabs/bank/bank-access-tab";
import { ZahlungspartnerTab } from "./tabs/zahlungspartner/zahlungspartner-tab";
import { RecipientAccountsTab } from "./tabs/recipient-accounts/recipient-accounts-tab";
import { CategoriesTab } from "./tabs/categories/categories-tab";
import { SyncTab } from "./tabs/sync-tab";

const SETTINGS_TAB_VALUES = [
  "banking",
  "zahlungspartner",
  "recipients",
  "categories",
  "sync",
  "productId",
  "database",
] as const;
type SettingsTabValue = (typeof SETTINGS_TAB_VALUES)[number];

function isSettingsTabValue(value: string | null): value is SettingsTabValue {
  return Boolean(value && SETTINGS_TAB_VALUES.includes(value as SettingsTabValue));
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<SettingsTabValue>(() => {
    const tab = searchParams.get("tab");
    return isSettingsTabValue(tab) ? tab : "banking";
  }, [searchParams]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Einstellungen</h1>
        </div>
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
          <TabsTrigger value="zahlungspartner">Zahlungspartner</TabsTrigger>
          <TabsTrigger value="recipients">Empfängerkonten</TabsTrigger>
          <TabsTrigger value="categories">Kategorien</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="productId">Produkt-ID</TabsTrigger>
          <TabsTrigger value="database">Datenbank</TabsTrigger>
        </TabsList>

        <TabsContent value="banking" className="pt-4">
          <BankAccessTab />
        </TabsContent>

        <TabsContent value="zahlungspartner" className="pt-4">
          <ZahlungspartnerTab />
        </TabsContent>

        <TabsContent value="recipients" className="pt-4">
          <RecipientAccountsTab />
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <CategoriesTab />
        </TabsContent>

        <TabsContent value="sync" className="pt-4">
          <SyncTab />
        </TabsContent>

        <TabsContent value="productId" className="pt-4">
          <ProductIdTab />
        </TabsContent>

        <TabsContent value="database" className="pt-4">
          <DbExportImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
